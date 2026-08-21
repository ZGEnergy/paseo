import { open, readFile, stat, unlink, mkdir, utimes } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import { z } from "zod";

export const cliLaunchDescriptorSchema = z.object({
  listen: z.string().min(1),
  relayEnabled: z.boolean(),
  relayUseTls: z.boolean(),
  mcpEnabled: z.boolean(),
  mcpInjectIntoAgents: z.boolean(),
  webUiEnabled: z.boolean(),
  hostnames: z.union([z.literal(true), z.array(z.string()), z.null()]),
});

export type CliLaunchDescriptor = z.infer<typeof cliLaunchDescriptorSchema>;

export const pidLifecycleSchema = z.object({
  version: z.literal(1),
  manager: z.enum(["cli", "desktop", "system", "unknown"]),
  descriptor: cliLaunchDescriptorSchema.optional(),
  sourceRevision: z.string().min(1).optional(),
  closureRoot: z.string().min(1).optional(),
  serverId: z.string().min(1).optional(),
});

export type PidLifecycle = z.infer<typeof pidLifecycleSchema>;

export const pidLockInfoSchema = z.object({
  pid: z.number(),
  startedAt: z.string(),
  hostname: z.string(),
  uid: z.number(),
  listen: z.string().nullable(),
  desktopManaged: z.boolean().optional(),
  heartbeat: z.literal(true).optional(),
  lifecycle: pidLifecycleSchema.optional(),
});

export interface PidLockInfo extends z.infer<typeof pidLockInfoSchema> {}

export interface AcquirePidLockOptions {
  ownerPid?: number;
  reclaimStaleDesktopLock?: boolean;
  lifecycle?: PidLifecycle;
}

export interface UpdatePidLockPatch {
  listen?: string;
  lifecycle?: PidLifecycle;
}

function parsePidLockInfo(raw: unknown): PidLockInfo | null {
  const result = pidLockInfoSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parsePidLifecycleEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): PidLifecycle | undefined {
  let manager = env.PASEO_LIFECYCLE_MANAGER;
  if (env.PASEO_DESKTOP_MANAGED === "1") {
    manager = "desktop";
  } else if (env.PASEO_SYSTEM_MANAGED === "1") {
    manager = "system";
  }
  if (manager === undefined) {
    return undefined;
  }
  if (manager !== "cli" && manager !== "desktop" && manager !== "system") {
    return { version: 1, manager: "unknown" };
  }
  if (manager !== "cli") {
    return { version: 1, manager };
  }

  let descriptor: unknown;
  try {
    descriptor = JSON.parse(env.PASEO_LIFECYCLE_DESCRIPTOR ?? "");
  } catch {
    return { version: 1, manager: "unknown" };
  }
  const parsed = pidLifecycleSchema.safeParse({
    version: 1,
    manager: "cli",
    descriptor,
    sourceRevision: env.PASEO_LIFECYCLE_SOURCE_REVISION ?? env.PASEO_SOURCE_REVISION,
    closureRoot: env.PASEO_LIFECYCLE_CLOSURE_ROOT ?? env.PASEO_CLOSURE_ROOT,
  });
  return parsed.success ? parsed.data : { version: 1, manager: "unknown" };
}

export function isAttestedCliLifecycle(lifecycle: PidLifecycle | undefined): boolean {
  return (
    lifecycle?.version === 1 &&
    lifecycle.manager === "cli" &&
    lifecycle.descriptor !== undefined &&
    lifecycle.sourceRevision !== undefined &&
    lifecycle.closureRoot !== undefined &&
    lifecycle.serverId !== undefined
  );
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

export class PidLockError extends Error {
  constructor(
    message: string,
    public readonly existingLock?: PidLockInfo,
  ) {
    super(message);
    this.name = "PidLockError";
  }
}

// Stale recovery is for abandoned locks, so keep this well above ordinary event-loop stalls.
const PID_LOCK_STALE_MS = 5 * 60_000;
const PID_LOCK_HEARTBEAT_INTERVAL_MS = 30_000;
const PID_LOCK_READ_RETRY_ATTEMPTS = 10;
const PID_LOCK_READ_RETRY_DELAY_MS = 50;

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getPidFilePath(paseoHome: string): string {
  return join(paseoHome, "paseo.pid");
}

async function isPidLockFresh(pidPath: string): Promise<boolean> {
  try {
    const lockStat = await stat(pidPath);
    return lockStat.mtimeMs >= Date.now() - PID_LOCK_STALE_MS;
  } catch {
    return false;
  }
}

async function touchPidLockFile(pidPath: string): Promise<void> {
  const now = new Date();
  await utimes(pidPath, now, now);
}

async function readPidLock(pidPath: string): Promise<PidLockInfo | null> {
  try {
    const content = await readFile(pidPath, "utf-8");
    return parsePidLockInfo(JSON.parse(content));
  } catch {
    return null;
  }
}

function resolveOwnerPid(ownerPid?: number): number {
  if (typeof ownerPid === "number" && Number.isInteger(ownerPid) && ownerPid > 0) {
    return ownerPid;
  }
  return process.pid;
}

function canReclaimLiveLock(
  lock: PidLockInfo,
  options: AcquirePidLockOptions | undefined,
): boolean {
  return (
    options?.reclaimStaleDesktopLock === true &&
    (lock.desktopManaged === true || lock.lifecycle?.manager === "desktop")
  );
}

function isSamePidLock(left: PidLockInfo, right: PidLockInfo): boolean {
  return left.pid === right.pid && left.startedAt === right.startedAt;
}

function createLockHeldError(lock: PidLockInfo): PidLockError {
  return new PidLockError(
    `Another Paseo daemon is already running (PID ${lock.pid}, started ${lock.startedAt})`,
    lock,
  );
}

async function clearExistingPidLock(
  pidPath: string,
  existingLock: PidLockInfo,
  lockOwnerPid: number,
  options: AcquirePidLockOptions | undefined,
): Promise<"already_owned" | "cleared"> {
  const lockOwnerRunning = isPidRunning(existingLock.pid);
  if (existingLock.pid === lockOwnerPid && lockOwnerRunning) {
    await touchPidLockFile(pidPath);
    return "already_owned";
  }

  if (lockOwnerRunning) {
    const reclaimable = canReclaimLiveLock(existingLock, options);
    if (!reclaimable || (await isPidLockFresh(pidPath))) {
      throw createLockHeldError(existingLock);
    }

    // Re-read immediately before unlinking so a heartbeat at the stale boundary wins.
    const confirmedLock = await readPidLock(pidPath);
    if (
      !confirmedLock ||
      !isSamePidLock(existingLock, confirmedLock) ||
      (await isPidLockFresh(pidPath))
    ) {
      throw new PidLockError("PID lock changed while checking whether it was abandoned");
    }
  }

  await unlink(pidPath).catch(() => {});
  return "cleared";
}

async function writeNewPidLock(pidPath: string, lockInfo: PidLockInfo): Promise<void> {
  let fd;
  try {
    fd = await open(pidPath, "wx");
    await fd.write(JSON.stringify(lockInfo));
  } catch (error) {
    if (!isErrnoException(error) || error.code !== "EEXIST") {
      throw error;
    }

    const raceLock = await readPidLock(pidPath);
    if (raceLock) {
      throw new PidLockError(
        `Another Paseo daemon is already running (PID ${raceLock.pid})`,
        raceLock,
      );
    }
    throw new PidLockError("Failed to acquire PID lock due to race condition");
  } finally {
    await fd?.close();
  }
}

export async function acquirePidLock(
  paseoHome: string,
  listen: string | null,
  options?: AcquirePidLockOptions,
): Promise<void> {
  const pidPath = getPidFilePath(paseoHome);

  // Ensure paseoHome directory exists
  if (!existsSync(paseoHome)) {
    await mkdir(paseoHome, { recursive: true });
  }

  // Try to read existing lock
  const existingLock = await readPidLock(pidPath);

  // Check if existing lock is stale
  const lockOwnerPid = resolveOwnerPid(options?.ownerPid);
  if (existingLock) {
    const result = await clearExistingPidLock(pidPath, existingLock, lockOwnerPid, options);
    if (result === "already_owned") {
      return;
    }
  }

  const lockInfo: PidLockInfo = {
    pid: lockOwnerPid,
    startedAt: new Date().toISOString(),
    hostname: hostname(),
    uid: process.getuid?.() ?? 0,
    listen,
    heartbeat: true,
    ...(process.env.PASEO_DESKTOP_MANAGED === "1" ? { desktopManaged: true } : {}),
    ...(options?.lifecycle ? { lifecycle: options.lifecycle } : {}),
  };

  await writeNewPidLock(pidPath, lockInfo);
}

export async function refreshPidLock(
  paseoHome: string,
  options?: { ownerPid?: number },
): Promise<void> {
  const pidPath = getPidFilePath(paseoHome);
  const lockOwnerPid = resolveOwnerPid(options?.ownerPid);
  let fd;
  try {
    fd = await open(pidPath, "r+");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new PidLockError("Cannot refresh PID lock: lock file is missing");
    }
    throw error;
  }

  try {
    const lock = await readPidLockFromHandleWithRetry(fd);
    if (!lock) {
      throw new PidLockError("Cannot refresh PID lock: invalid lock file");
    }
    if (lock.pid !== lockOwnerPid) {
      throw new PidLockError(`Cannot refresh PID lock owned by PID ${lock.pid}`, lock);
    }
    const now = new Date();
    await fd.utimes(now, now);
  } finally {
    await fd.close();
  }
}

async function readPidLockFromHandle(fd: FileHandle): Promise<PidLockInfo | null> {
  try {
    const { size } = await fd.stat();
    if (size === 0) {
      return null;
    }
    const content = Buffer.alloc(size);
    const { bytesRead } = await fd.read(content, 0, size, 0);
    return parsePidLockInfo(JSON.parse(content.subarray(0, bytesRead).toString("utf-8")));
  } catch {
    return null;
  }
}

async function readPidLockFromHandleWithRetry(fd: FileHandle): Promise<PidLockInfo | null> {
  for (let attempt = 0; attempt < PID_LOCK_READ_RETRY_ATTEMPTS; attempt += 1) {
    const lock = await readPidLockFromHandle(fd);
    if (lock) {
      return lock;
    }
    if (attempt < PID_LOCK_READ_RETRY_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, PID_LOCK_READ_RETRY_DELAY_MS));
    }
  }
  return null;
}

export function startPidLockHeartbeat(
  paseoHome: string,
  options?: {
    ownerPid?: number;
    intervalMs?: number;
    onError?: (error: unknown) => void;
  },
): () => void {
  const intervalMs = options?.intervalMs ?? PID_LOCK_HEARTBEAT_INTERVAL_MS;
  let refreshing = false;

  const timer = setInterval(() => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    refreshPidLock(paseoHome, { ownerPid: options?.ownerPid })
      .catch((error) => {
        if (options?.onError) {
          options.onError(error);
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`PID lock heartbeat failed: ${message}\n`);
      })
      .finally(() => {
        refreshing = false;
      });
  }, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}

export async function updatePidLock(
  paseoHome: string,
  patch: UpdatePidLockPatch,
  options?: { ownerPid?: number },
): Promise<void> {
  const pidPath = getPidFilePath(paseoHome);
  const lockOwnerPid = resolveOwnerPid(options?.ownerPid);
  const fd = await open(pidPath, "r+");
  try {
    const existingLock = await readPidLockFromHandleWithRetry(fd);
    if (!existingLock) {
      throw new PidLockError("Cannot update PID lock: invalid lock file");
    }
    if (existingLock.pid !== lockOwnerPid) {
      throw new PidLockError(
        `Cannot update PID lock owned by PID ${existingLock.pid}`,
        existingLock,
      );
    }

    const updatedLock: PidLockInfo = {
      ...existingLock,
      ...patch,
    };
    await fd.truncate(0);
    await fd.writeFile(JSON.stringify(updatedLock));
  } finally {
    await fd.close();
  }
}

export async function releasePidLock(
  paseoHome: string,
  options?: { ownerPid?: number },
): Promise<void> {
  const pidPath = getPidFilePath(paseoHome);
  const lockOwnerPid = resolveOwnerPid(options?.ownerPid);
  try {
    // Only remove if it's our lock
    const content = await readFile(pidPath, "utf-8");
    const lock = parsePidLockInfo(JSON.parse(content));
    if (lock?.pid === lockOwnerPid) {
      await unlink(pidPath);
    }
  } catch {
    // Ignore errors - lock may already be gone
  }
}

export async function getPidLockInfo(paseoHome: string): Promise<PidLockInfo | null> {
  const pidPath = getPidFilePath(paseoHome);
  return readPidLock(pidPath);
}

export async function isLocked(
  paseoHome: string,
): Promise<{ locked: boolean; info?: PidLockInfo }> {
  const info = await getPidLockInfo(paseoHome);
  if (!info) {
    return { locked: false };
  }
  if (!isPidRunning(info.pid)) {
    return { locked: false, info };
  }
  return { locked: true, info };
}
