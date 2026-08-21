import { constants as fsConstants } from "node:fs";
import { execFile, spawn } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  readlink,
  readdir,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  cliLaunchDescriptorSchema,
  getPidLockInfo,
  isAttestedCliLifecycle,
  loadConfig,
  type CliLaunchDescriptor,
  type PidLifecycle,
  type PidLockInfo,
} from "@getpaseo/server";
import { tryConnectToDaemon } from "../../utils/client.js";
import {
  resolveLocalDaemonState,
  stopLocalDaemon,
  type StopLocalDaemonResult,
} from "./local-daemon.js";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 100;
const LOCK_FILENAME = "upgrade.lock";
const CURRENT_LINK = "current";
const PREVIOUS_LINK = "previous";

export interface LocalUpgradeResult {
  action: "upgrade" | "bootstrap";
  revision: string;
  currentRoot: string;
  previousRoot: string | null;
  home: string;
  launchOwner: "cli";
  expected: UpgradeAttestation;
  observed: UpgradeAttestation;
  rollback: "not_needed" | "succeeded" | "failed";
  logPath: string | null;
}

export interface UpgradeAttestation {
  pid: number;
  serverId: string;
  listen: string;
  sourceRevision: string;
  closureRoot: string;
}

export interface UpgradeNixDependencies {
  ensureAvailable(): Promise<void>;
  build(input: { checkout: string; revision: string }): Promise<{ closureRoot: string }>;
  addIndirectRoot(input: { rootPath: string; closureRoot: string }): Promise<void>;
}

export interface UpgradeDaemonStartResult {
  pid: number | null;
  logPath: string | null;
  cleanup?: () => Promise<void>;
}

export interface UpgradeDaemonDependencies {
  readPidLock(home: string): Promise<PidLockInfo | null>;
  stop(
    home: string,
    options: { timeoutMs: number; force: boolean },
  ): Promise<StopLocalDaemonResult>;
  start(input: {
    home: string;
    executable: string;
    descriptor: CliLaunchDescriptor;
    sourceRevision: string;
    closureRoot: string;
  }): Promise<UpgradeDaemonStartResult>;
  probe(input: { home: string; timeoutMs: number }): Promise<UpgradeAttestation | null>;
  endpointReachable(input: { home: string; timeoutMs: number }): Promise<boolean>;
  isPidRunning(pid: number): boolean;
}

export interface UpgradeFilesystemDependencies {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readlink(path: string): Promise<string>;
  rename(oldPath: string, newPath: string): Promise<void>;
  symlink(target: string, path: string): Promise<void>;
  unlink(path: string): Promise<void>;
  rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  access(path: string): Promise<void>;
  readFile?(path: string): Promise<string>;
  writeFile(path: string, data: string, options?: { flag?: string }): Promise<void>;
}

export interface LocalUpgradeDependencies {
  nix?: UpgradeNixDependencies;
  daemon?: UpgradeDaemonDependencies;
  fs?: UpgradeFilesystemDependencies;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  checkoutRevision?: (checkout: string) => Promise<string>;
  checkoutClean?: (checkout: string) => Promise<boolean>;
  checkoutBranch?: (checkout: string) => Promise<string>;
}

export interface LocalUpgradeOptions {
  home: string;
  checkout: string;
  revision?: string;
  stagedRoot?: string;
  timeoutMs?: number;
  descriptor?: CliLaunchDescriptor;
}

export class LocalUpgradeError extends Error {
  constructor(
    message: string,
    public readonly details: {
      logPath: string | null;
      rollback: "not_needed" | "succeeded" | "failed";
      cause?: unknown;
    },
  ) {
    super(message, { cause: details.cause });
    this.name = "LocalUpgradeError";
  }
}

export interface ResolvedUpgradeDependencies {
  nix: UpgradeNixDependencies;
  daemon: UpgradeDaemonDependencies;
  fs: UpgradeFilesystemDependencies;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  checkoutRevision: (checkout: string) => Promise<string>;
  checkoutClean: (checkout: string) => Promise<boolean>;
  checkoutBranch: (checkout: string) => Promise<string>;
}

const defaultFs: UpgradeFilesystemDependencies = {
  mkdir: async (value, options) => {
    await mkdir(value, options);
  },
  readlink,
  rename,
  symlink,
  unlink,
  rm,
  readdir: async (value) => (await readdir(value)).map(String),
  access: async (value) => access(value, fsConstants.X_OK),
  readFile: async (value) => readFile(value, "utf8"),
  writeFile,
};

const defaultNix: UpgradeNixDependencies = {
  async ensureAvailable() {
    await execFileAsync("nix", ["--version"]);
  },
  async build({ checkout, revision }) {
    const result = await execFileAsync("nix", [
      "build",
      `git+file://${checkout}?rev=${revision}#paseo`,
      "--no-link",
      "--print-out-paths",
    ]);
    const closureRoot = result.stdout.trim().split(/\s+/).toReversed().find(Boolean);
    if (!closureRoot || !path.isAbsolute(closureRoot)) {
      throw new Error("nix build did not report an absolute closure root");
    }
    return { closureRoot };
  },
  async addIndirectRoot({ rootPath, closureRoot }) {
    await execFileAsync("nix-store", [
      "--add-root",
      rootPath,
      "--indirect",
      "--realise",
      closureRoot,
    ]);
  },
};

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM";
  }
}

function descriptorHostnames(hostnames: CliLaunchDescriptor["hostnames"]): string {
  if (hostnames === null) return "false";
  if (hostnames === true) return "true";
  return hostnames.join(",");
}

function descriptorArgs(descriptor: CliLaunchDescriptor): string[] {
  const args = ["daemon", "start", "--listen", descriptor.listen];
  args.push(descriptor.relayEnabled ? "--relay" : "--no-relay");
  args.push(descriptor.relayUseTls ? "--relay-use-tls" : "--no-relay-use-tls");
  args.push(descriptor.mcpEnabled ? "--mcp" : "--no-mcp");
  args.push(descriptor.mcpInjectIntoAgents ? "--inject-mcp" : "--no-inject-mcp");
  args.push(descriptor.webUiEnabled ? "--web-ui" : "--no-web-ui");
  args.push("--hostnames", descriptorHostnames(descriptor.hostnames));
  return args;
}

function createDefaultDaemonDependencies(): UpgradeDaemonDependencies {
  return {
    readPidLock: getPidLockInfo,
    stop: async (home, options) => stopLocalDaemon({ home, ...options }),
    async start(input) {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PASEO_HOME: input.home,
        PASEO_LIFECYCLE_MANAGER: "cli",
        PASEO_LIFECYCLE_DESCRIPTOR: JSON.stringify(input.descriptor),
        PASEO_LIFECYCLE_SOURCE_REVISION: input.sourceRevision,
        PASEO_LIFECYCLE_CLOSURE_ROOT: input.closureRoot,
      };
      const child = spawn(input.executable, descriptorArgs(input.descriptor), {
        detached: true,
        env,
        stdio: ["ignore", "ignore", "ignore"],
      });
      await new Promise<void>((resolve, reject) => {
        const onSpawn = () => resolve();
        const onError = (error: Error) => reject(error);
        child.once("spawn", onSpawn);
        child.once("error", onError);
      });
      child.unref();
      const cleanup = async (): Promise<void> => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill("SIGTERM");
        await Promise.race([
          new Promise<void>((resolve) => child.once("exit", () => resolve())),
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 1000);
            timer.unref();
          }),
        ]);
      };
      return {
        pid: child.pid ?? null,
        logPath: path.join(input.home, "daemon.log"),
        cleanup,
      };
    },
    async probe({ home, timeoutMs }) {
      const state = resolveLocalDaemonState({ home });
      const client = await tryConnectToDaemon({ host: state.listen, timeout: timeoutMs });
      if (!client) return null;
      try {
        const status = await client.getDaemonStatus({ timeout: timeoutMs });
        const lock = await getPidLockInfo(home);
        const lifecycle = lock?.lifecycle;
        if (
          !lock ||
          !lifecycle ||
          lifecycle.manager !== "cli" ||
          !lifecycle.descriptor ||
          !status.serverId ||
          lifecycle.serverId !== status.serverId ||
          !status.listen ||
          status.listen !== lifecycle.descriptor.listen ||
          (lock.listen !== null && lock.listen !== status.listen)
        )
          return null;
        return {
          pid: lock.pid,
          serverId: status.serverId,
          listen: status.listen,
          sourceRevision: lifecycle.sourceRevision ?? "",
          closureRoot: lifecycle.closureRoot ?? "",
        };
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async endpointReachable({ home, timeoutMs }) {
      const state = resolveLocalDaemonState({ home });
      const client = await tryConnectToDaemon({ host: state.listen, timeout: timeoutMs });
      if (!client) return false;
      await client.close().catch(() => undefined);
      return true;
    },
    isPidRunning,
  };
}

function createDefaultDependencies(): Required<
  Pick<
    LocalUpgradeDependencies,
    | "nix"
    | "daemon"
    | "fs"
    | "now"
    | "sleep"
    | "checkoutRevision"
    | "checkoutClean"
    | "checkoutBranch"
  >
> {
  const fs = defaultFs;
  return {
    fs,
    nix: defaultNix,
    daemon: createDefaultDaemonDependencies(),
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    checkoutRevision: async (checkout) =>
      (await execFileAsync("git", ["-C", checkout, "rev-parse", "HEAD"])).stdout.trim(),
    checkoutClean: async (checkout) => {
      const result = await execFileAsync("git", ["-C", checkout, "status", "--porcelain"]);
      return result.stdout.trim().length === 0;
    },
    checkoutBranch: async (checkout) =>
      (await execFileAsync("git", ["-C", checkout, "branch", "--show-current"])).stdout.trim(),
  };
}

function mergeDependencies(input?: LocalUpgradeDependencies): ResolvedUpgradeDependencies {
  const defaults = createDefaultDependencies();
  return {
    ...defaults,
    ...input,
    nix: { ...defaults.nix, ...input?.nix },
    daemon: { ...defaults.daemon, ...input?.daemon },
    fs: { ...defaults.fs, ...input?.fs },
  };
}

function releasesPath(home: string): string {
  const dataHome =
    process.env.XDG_DATA_HOME?.trim() || path.join(process.env.HOME || home, ".local", "share");
  return path.join(dataHome, "paseo", "releases");
}

async function readLinkOrNull(
  fs: UpgradeFilesystemDependencies,
  link: string,
): Promise<string | null> {
  try {
    return await fs.readlink(link);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code !== undefined && code !== "ENOENT") throw error;
    return null;
  }
}

async function replaceLink(
  fs: UpgradeFilesystemDependencies,
  link: string,
  target: string,
  now: () => number,
): Promise<void> {
  const temporary = `${link}.tmp-${process.pid}-${now()}`;
  await fs.symlink(target, temporary);
  try {
    await fs.rename(temporary, link);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
}

interface UpgradeLockJournal {
  pid: number;
  startedAt: number;
  phase:
    | "acquiring"
    | "prepared"
    | "switching"
    | "switched"
    | "stopping"
    | "started"
    | "rollback"
    | "committed";
  releaseDir?: string;
  home?: string;
  currentBefore?: string | null;
  previousBefore?: string | null;
  oldPid?: number;
  oldServerId?: string;
  oldSourceRevision?: string;
  oldClosureRoot?: string;
}

interface AcquiredUpgradeLock {
  stale: UpgradeLockJournal | null;
  update(patch: Partial<Omit<UpgradeLockJournal, "pid" | "startedAt">>): Promise<void>;
  release(): Promise<void>;
}

function parseUpgradeLock(content: string): UpgradeLockJournal | null {
  try {
    const parsed = JSON.parse(content) as Partial<UpgradeLockJournal>;
    if (
      typeof parsed.pid !== "number" ||
      !Number.isInteger(parsed.pid) ||
      typeof parsed.startedAt !== "number" ||
      !Number.isFinite(parsed.startedAt)
    ) {
      return null;
    }
    return {
      pid: parsed.pid,
      startedAt: parsed.startedAt,
      phase: parsed.phase ?? "acquiring",
      releaseDir: parsed.releaseDir,
      home: parsed.home,
      currentBefore: parsed.currentBefore,
      previousBefore: parsed.previousBefore,
      oldPid: parsed.oldPid,
      oldServerId: parsed.oldServerId,
      oldSourceRevision: parsed.oldSourceRevision,
      oldClosureRoot: parsed.oldClosureRoot,
    };
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw new Error("Unable to inspect existing local daemon upgrade lock", { cause: error });
    }
    return null;
  }
}

function parseUpgradeLockOwnerPid(content: string): number | null {
  try {
    const parsed = JSON.parse(content) as { pid?: unknown };
    return typeof parsed.pid === "number" && Number.isInteger(parsed.pid) ? parsed.pid : null;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
}

async function acquireUpgradeLock(
  fs: UpgradeFilesystemDependencies,
  lockPath: string,
  now: () => number,
): Promise<AcquiredUpgradeLock> {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  let stale: UpgradeLockJournal | null = null;
  let journal: UpgradeLockJournal = {
    pid: process.pid,
    startedAt: now(),
    phase: "acquiring",
  };
  let payload = JSON.stringify(journal);
  const readLock = async (): Promise<string | null> => {
    if (!fs.readFile) return null;
    return fs.readFile(lockPath).catch(() => null);
  };
  while (true) {
    try {
      await fs.writeFile(lockPath, payload, { flag: "wx" });
      const update = async (
        patch: Partial<Omit<UpgradeLockJournal, "pid" | "startedAt">>,
      ): Promise<void> => {
        Object.assign(journal, patch);
        payload = JSON.stringify(journal);
      };
      return {
        stale,
        update,
        release: async () => {
          const owned = await readLock();
          if (owned === payload) await fs.unlink(lockPath).catch(() => undefined);
        },
      };
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: unknown }).code
          : undefined;
      if (code !== "EEXIST") throw error;
      const first = await readLock();
      if (first === null) {
        throw new Error("Another local daemon upgrade is already running", { cause: error });
      }
      const owner = parseUpgradeLock(first);
      const ownerPid = parseUpgradeLockOwnerPid(first);
      if (ownerPid !== null && isPidRunning(ownerPid)) {
        throw new Error("Another local daemon upgrade is already running", { cause: error });
      }
      const second = await readLock();
      if (second !== first) continue;
      stale = owner;
      await fs.unlink(lockPath).catch(() => undefined);
    }
  }
}

async function validateCheckout(
  deps: ResolvedUpgradeDependencies,
  checkout: string,
  expectedRevision?: string,
): Promise<string> {
  if (!(await deps.checkoutClean(checkout)))
    throw new Error("internal/main checkout must be clean");
  const branch = await deps.checkoutBranch(checkout);
  if (branch !== "internal/main")
    throw new Error(`checkout must be on internal/main (found ${branch || "detached"})`);
  const revision = await deps.checkoutRevision(checkout);
  if (expectedRevision && expectedRevision !== revision)
    throw new Error(`checkout revision mismatch: expected ${expectedRevision}, got ${revision}`);
  return revision;
}

async function waitForHealth(
  deps: ResolvedUpgradeDependencies,
  home: string,
  expected: Omit<UpgradeAttestation, "pid">,
  oldPid: number,
  timeoutMs: number,
): Promise<UpgradeAttestation> {
  const deadline = deps.now() + timeoutMs;
  let lastError: unknown;
  while (deps.now() < deadline) {
    let observed: UpgradeAttestation | null = null;
    try {
      observed = await deps.daemon.probe({ home, timeoutMs: Math.min(1000, timeoutMs) });
    } catch (error) {
      lastError = error;
    }
    if (
      observed &&
      observed.pid !== oldPid &&
      observed.pid > 0 &&
      deps.daemon.isPidRunning(observed.pid) &&
      (!expected.serverId || observed.serverId === expected.serverId) &&
      observed.listen === expected.listen &&
      observed.sourceRevision === expected.sourceRevision &&
      observed.closureRoot === expected.closureRoot
    ) {
      return observed;
    }
    await deps.sleep(HEALTH_POLL_MS);
  }
  const suffix = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`new daemon failed health attestation before timeout${suffix}`);
}

async function waitForRelease(
  deps: ResolvedUpgradeDependencies,
  home: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = deps.now() + timeoutMs;
  while (deps.now() < deadline) {
    const lock = await deps.daemon.readPidLock(home);
    const lockReleased = !lock || !deps.daemon.isPidRunning(lock.pid);
    let endpointReachable = false;
    try {
      endpointReachable = await deps.daemon.endpointReachable({
        home,
        timeoutMs: Math.min(1000, timeoutMs),
      });
    } catch {
      endpointReachable = true;
    }
    if (lockReleased && !endpointReachable) return;
    await deps.sleep(HEALTH_POLL_MS);
  }
  throw new Error("new daemon PID lock and endpoint did not release after stop");
}

async function startFromRoot(
  deps: ResolvedUpgradeDependencies,
  home: string,
  closureRoot: string,
  descriptor: CliLaunchDescriptor,
  sourceRevision: string,
): Promise<UpgradeDaemonStartResult> {
  return deps.daemon.start({
    home,
    executable: path.join(closureRoot, "bin", "paseo"),
    descriptor,
    sourceRevision,
    closureRoot,
  });
}
async function pruneReleaseRoots(
  deps: ResolvedUpgradeDependencies,
  rootsDir: string,
  retain: Set<string>,
): Promise<void> {
  for (const entry of await deps.fs.readdir(rootsDir)) {
    if (retain.has(entry)) continue;
    await deps.fs.rm(path.join(rootsDir, entry), { force: true, recursive: true });
  }
}

function validateDescriptor(descriptor: CliLaunchDescriptor | undefined): CliLaunchDescriptor {
  const parsed = cliLaunchDescriptorSchema.safeParse(descriptor);
  if (!parsed.success) {
    throw new Error("bootstrap requires explicit effective launch values");
  }
  return parsed.data;
}
interface ExistingDaemonState {
  lifecycle: PidLifecycle | undefined;
  lock: PidLockInfo | null;
  attested: UpgradeAttestation | null;
  pid: number;
  current: string | null;
  previous: string | null;
}

function isValidClosureRoot(value: string | undefined): value is string {
  return Boolean(value && path.isAbsolute(value) && value.startsWith("/nix/store/"));
}

function replayValue<T>(owned: boolean | undefined, configured: T | undefined, fallback: T): T {
  if (owned) return fallback;
  return configured ?? fallback;
}

function refreshReplayDescriptor(
  home: string,
  descriptor: CliLaunchDescriptor,
): CliLaunchDescriptor {
  try {
    const config = loadConfig(home, { env: {} });
    const owned = descriptor.launchOwned;
    return {
      ...descriptor,
      relayEnabled: replayValue(owned?.relayEnabled, config.relayEnabled, descriptor.relayEnabled),
      relayUseTls: replayValue(owned?.relayUseTls, config.relayUseTls, descriptor.relayUseTls),
      mcpEnabled: replayValue(owned?.mcpEnabled, config.mcpEnabled, descriptor.mcpEnabled),
      mcpInjectIntoAgents: replayValue(
        owned?.mcpInjectIntoAgents,
        config.mcpInjectIntoAgents,
        descriptor.mcpInjectIntoAgents,
      ),
      webUiEnabled: replayValue(
        owned?.webUiEnabled,
        config.webUi?.enabled,
        descriptor.webUiEnabled,
      ),
      hostnames: replayValue(owned?.hostnames, config.hostnames, descriptor.hostnames),
    };
  } catch {
    return descriptor;
  }
}
function resolveLaunchDescriptor(
  action: "upgrade" | "bootstrap",
  home: string,
  existing: ExistingDaemonState,
  bootstrapDescriptor: CliLaunchDescriptor | undefined,
): CliLaunchDescriptor | undefined {
  if (action === "bootstrap") return bootstrapDescriptor;
  const descriptor = existing.lifecycle?.descriptor;
  return descriptor ? refreshReplayDescriptor(home, descriptor) : undefined;
}

function matchesExistingLock(expected: PidLockInfo, actual: PidLockInfo | null): boolean {
  return Boolean(
    actual &&
    actual.pid === expected.pid &&
    actual.startedAt === expected.startedAt &&
    actual.hostname === expected.hostname &&
    actual.uid === expected.uid,
  );
}

async function attestExistingDaemon(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  lock: PidLockInfo,
  lifecycle: PidLifecycle,
): Promise<UpgradeAttestation> {
  const observed = await deps.daemon.probe({
    home: options.home,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  if (
    !observed ||
    observed.pid !== lock.pid ||
    observed.serverId !== lifecycle.serverId ||
    observed.listen !== lifecycle.descriptor?.listen ||
    (lock.listen !== null && observed.listen !== lock.listen) ||
    observed.sourceRevision !== lifecycle.sourceRevision ||
    observed.closureRoot !== lifecycle.closureRoot
  ) {
    throw new Error("live daemon endpoint does not match its attested lifecycle record");
  }
  return observed;
}

async function resolveExistingActivation(
  deps: ResolvedUpgradeDependencies,
  releaseDir: string,
  rootsDir: string,
  lifecycle: PidLifecycle,
): Promise<{ current: string; previous: string | null }> {
  if (!isValidClosureRoot(lifecycle.closureRoot)) {
    throw new Error("attested lifecycle closure root is not a valid Nix store path");
  }
  const currentPath = path.join(releaseDir, CURRENT_LINK);
  let current = await readLinkOrNull(deps.fs, currentPath);
  const previous = await readLinkOrNull(deps.fs, path.join(releaseDir, PREVIOUS_LINK));
  if (!current) {
    if (previous) throw new Error("active rooted closure is missing");
    const sourceRevision = lifecycle.sourceRevision;
    if (!sourceRevision || path.basename(sourceRevision) !== sourceRevision) {
      throw new Error("attested lifecycle source revision cannot seed a release root");
    }
    const seedRoot = path.join(rootsDir, sourceRevision);
    const rootedClosure = await readLinkOrNull(deps.fs, seedRoot);
    if (rootedClosure && rootedClosure !== lifecycle.closureRoot) {
      throw new Error("seed release root does not match the daemon lifecycle closure");
    }
    if (!rootedClosure) {
      await deps.fs.mkdir(rootsDir, { recursive: true });
      await deps.nix.addIndirectRoot({ rootPath: seedRoot, closureRoot: lifecycle.closureRoot });
    }
    current = path.relative(releaseDir, seedRoot);
    return { current, previous };
  }
  const rootName = path.basename(current);
  if (rootName !== lifecycle.sourceRevision) {
    throw new Error("active rooted closure source revision does not match the daemon lifecycle");
  }
  const expectedRootLink = path.join(rootsDir, rootName);
  if (path.resolve(releaseDir, current) !== path.resolve(expectedRootLink)) {
    throw new Error("active release link does not point into the rooted closure directory");
  }
  const rootedClosure = await readLinkOrNull(deps.fs, expectedRootLink);
  if (rootedClosure !== lifecycle.closureRoot) {
    throw new Error("active rooted closure does not match the daemon lifecycle closure");
  }
  return { current, previous };
}

async function inspectExistingDaemon(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  action: "upgrade" | "bootstrap",
  releaseDir: string,
  rootsDir: string,
): Promise<ExistingDaemonState> {
  const lock = await deps.daemon.readPidLock(options.home);
  if (action === "bootstrap") {
    if (lock && deps.daemon.isPidRunning(lock.pid)) {
      throw new Error("bootstrap requires the legacy daemon to be stopped first");
    }
    return {
      lifecycle: undefined,
      lock: null,
      attested: null,
      pid: 0,
      current: await readLinkOrNull(deps.fs, path.join(releaseDir, CURRENT_LINK)),
      previous: await readLinkOrNull(deps.fs, path.join(releaseDir, PREVIOUS_LINK)),
    };
  }
  const lifecycle = lock?.lifecycle;
  if (
    !lock ||
    !lifecycle ||
    !deps.daemon.isPidRunning(lock.pid) ||
    !isAttestedCliLifecycle(lifecycle) ||
    !lifecycle.descriptor
  ) {
    throw new Error("local upgrade requires a live, attested manager=cli lifecycle record");
  }
  const observed = await attestExistingDaemon(deps, options, lock, lifecycle);
  const activation = await resolveExistingActivation(deps, releaseDir, rootsDir, lifecycle);
  return {
    lifecycle,
    lock,
    attested: observed,
    pid: lock.pid,
    current: activation.current,
    previous: activation.previous,
  };
}
async function stageAndSwitch(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  action: "upgrade" | "bootstrap",
  revision: string,
  releaseDir: string,
  rootsDir: string,
  existing: ExistingDaemonState,
): Promise<{ closureRoot: string; switched: boolean }> {
  const builtRoot = (await deps.nix.build({ checkout: options.checkout, revision })).closureRoot;
  if (options.stagedRoot && options.stagedRoot !== builtRoot) {
    throw new Error("staged closure does not match the pinned checkout build");
  }
  if (!path.isAbsolute(builtRoot))
    throw new Error("Nix build returned a non-absolute closure root");
  await validateCheckout(deps, options.checkout, revision);
  await deps.fs.access(path.join(builtRoot, "bin", "paseo"));
  await deps.fs.mkdir(rootsDir, { recursive: true });
  const rootLink = path.join(rootsDir, revision);
  await deps.nix.addIndirectRoot({ rootPath: rootLink, closureRoot: builtRoot });
  const previousPath = path.join(releaseDir, PREVIOUS_LINK);
  const currentPath = path.join(releaseDir, CURRENT_LINK);
  const previousBefore = await readLinkOrNull(deps.fs, previousPath);
  const currentBefore = await readLinkOrNull(deps.fs, currentPath);
  const restore = async (link: string, target: string | null): Promise<void> => {
    if (target === null) await deps.fs.unlink(link).catch(() => undefined);
    else await replaceLink(deps.fs, link, target, deps.now);
  };
  try {
    if (action === "upgrade") {
      if (!existing.current) throw new Error("active rooted closure is missing");
      await replaceLink(deps.fs, previousPath, existing.current, deps.now);
    }
    await replaceLink(deps.fs, currentPath, rootLink, deps.now);
  } catch (error) {
    await restore(previousPath, previousBefore).catch(() => undefined);
    await restore(currentPath, currentBefore).catch(() => undefined);
    throw error;
  }
  return { closureRoot: builtRoot, switched: true };
}

async function stopExistingDaemon(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  action: "upgrade" | "bootstrap",
  existing: ExistingDaemonState,
  timeoutMs: number,
): Promise<boolean> {
  if (action !== "upgrade" || !existing.lock || !existing.attested) return false;
  const lock = await deps.daemon.readPidLock(options.home);
  if (!matchesExistingLock(existing.lock, lock)) {
    throw new Error("daemon lifecycle lock changed before stop");
  }
  const observed = await deps.daemon.probe({ home: options.home, timeoutMs });
  if (
    !observed ||
    observed.pid !== existing.attested.pid ||
    observed.serverId !== existing.attested.serverId ||
    observed.listen !== existing.attested.listen ||
    observed.sourceRevision !== existing.attested.sourceRevision ||
    observed.closureRoot !== existing.attested.closureRoot
  ) {
    throw new Error("daemon endpoint changed before destructive stop");
  }
  await deps.daemon.stop(options.home, { timeoutMs, force: false });
  await waitForRelease(deps, options.home, timeoutMs);
  return true;
}

async function startAndAttest(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  action: "upgrade" | "bootstrap",
  revision: string,
  closureRoot: string,
  descriptor: CliLaunchDescriptor,
  existing: ExistingDaemonState,
  rootsDir: string,
  timeoutMs: number,
  onStarted?: (launch: UpgradeDaemonStartResult) => void,
): Promise<{
  observed: UpgradeAttestation;
  logPath: string | null;
  launch: UpgradeDaemonStartResult;
  replacementLock: PidLockInfo | null;
}> {
  const expected: Omit<UpgradeAttestation, "pid"> = {
    serverId: action === "upgrade" ? (existing.lifecycle?.serverId ?? "") : "",
    listen: descriptor.listen,
    sourceRevision: revision,
    closureRoot,
  };
  const launch = await startFromRoot(deps, options.home, closureRoot, descriptor, revision);
  onStarted?.(launch);
  const observed = await waitForHealth(deps, options.home, expected, existing.pid, timeoutMs);
  if (action === "bootstrap" && !observed.serverId) {
    throw new Error("bootstrap health attestation missing server identity");
  }
  if (action === "upgrade") {
    const retained = new Set([revision, existing.current ? path.basename(existing.current) : ""]);
    retained.delete("");
    await pruneReleaseRoots(deps, rootsDir, retained);
  }
  const replacementLock = await deps.daemon.readPidLock(options.home);
  return { observed, logPath: launch.logPath, launch, replacementLock };
}

async function cleanupReplacementDaemon(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  timeoutMs: number,
  started: UpgradeDaemonStartResult | null,
  replacementPid: number | null,
  replacementLock: PidLockInfo | null,
): Promise<PidLockInfo | null> {
  await started?.cleanup?.();
  const latest = await deps.daemon.readPidLock(options.home);
  const ownsReplacement =
    replacementLock !== null &&
    matchesExistingLock(replacementLock, latest) &&
    (replacementPid === null || latest?.pid === replacementPid) &&
    latest !== null &&
    deps.daemon.isPidRunning(latest.pid);
  if (ownsReplacement) {
    await deps.daemon.stop(options.home, { timeoutMs, force: true });
    await waitForRelease(deps, options.home, timeoutMs);
    return latest;
  }
  if (!latest || (replacementPid !== null && latest.pid === replacementPid)) {
    await waitForRelease(deps, options.home, timeoutMs);
  }
  return latest;
}
async function restoreActivationLinksSnapshot(
  deps: ResolvedUpgradeDependencies,
  releaseDir: string,
  current: string | null,
  previous: string | null,
): Promise<void> {
  if (current) {
    await replaceLink(deps.fs, path.join(releaseDir, CURRENT_LINK), current, deps.now);
  } else {
    await deps.fs.unlink(path.join(releaseDir, CURRENT_LINK)).catch(() => undefined);
  }
  if (previous) {
    await replaceLink(deps.fs, path.join(releaseDir, PREVIOUS_LINK), previous, deps.now);
  } else {
    await deps.fs.unlink(path.join(releaseDir, PREVIOUS_LINK)).catch(() => undefined);
  }
}

async function restoreActivationLinks(
  deps: ResolvedUpgradeDependencies,
  existing: ExistingDaemonState,
  releaseDir: string,
): Promise<void> {
  await restoreActivationLinksSnapshot(deps, releaseDir, existing.current, existing.previous);
}

async function restartExistingDaemon(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  existing: ExistingDaemonState,
  timeoutMs: number,
): Promise<void> {
  const lifecycle = existing.lifecycle;
  if (!lifecycle?.descriptor || !lifecycle.sourceRevision || !lifecycle.closureRoot) return;
  let restored: UpgradeDaemonStartResult | null = null;
  try {
    restored = await startFromRoot(
      deps,
      options.home,
      lifecycle.closureRoot,
      lifecycle.descriptor,
      lifecycle.sourceRevision,
    );
    await waitForHealth(
      deps,
      options.home,
      {
        serverId: lifecycle.serverId ?? "",
        listen: lifecycle.descriptor.listen,
        sourceRevision: lifecycle.sourceRevision,
        closureRoot: lifecycle.closureRoot,
      },
      existing.pid,
      timeoutMs,
    );
  } catch (error) {
    await restored?.cleanup?.();
    await waitForRelease(deps, options.home, timeoutMs).catch(() => undefined);
    throw error;
  }
}

async function rollbackUpgrade(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  existing: ExistingDaemonState,
  releaseDir: string,
  timeoutMs: number,
  started: UpgradeDaemonStartResult | null,
  oldStopped: boolean,
  replacementPid: number | null,
  replacementLock: PidLockInfo | null,
): Promise<void> {
  const latest = await cleanupReplacementDaemon(
    deps,
    options,
    timeoutMs,
    started,
    replacementPid,
    replacementLock,
  );
  await restoreActivationLinks(deps, existing, releaseDir);
  if (latest && latest.pid === existing.pid && deps.daemon.isPidRunning(latest.pid)) return;
  if (oldStopped) await restartExistingDaemon(deps, options, existing, timeoutMs);
}

interface UpgradeTransactionState {
  rollback: LocalUpgradeResult["rollback"];
  logPath: string | null;
  switched: boolean;
  oldStopped: boolean;
  replacementPid: number | null;
  replacementLock: PidLockInfo | null;
  activeLaunch: UpgradeDaemonStartResult | null;
  existing: ExistingDaemonState;
}

async function recoverStaleUpgrade(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  lock: AcquiredUpgradeLock,
  releaseDir: string,
): Promise<void> {
  try {
    const stale = lock.stale;
    if (!stale || stale.releaseDir !== releaseDir || stale.home !== options.home) return;
    const oldLock = await deps.daemon.readPidLock(options.home);
    const oldDaemonStillOwns =
      stale.oldPid !== undefined &&
      stale.oldServerId !== undefined &&
      oldLock?.pid === stale.oldPid &&
      deps.daemon.isPidRunning(oldLock.pid) &&
      oldLock.lifecycle?.serverId === stale.oldServerId;
    const switching = ["switching", "switched", "stopping"].includes(stale.phase);
    if (!oldDaemonStillOwns || !switching) return;
    if (stale.currentBefore === undefined || stale.previousBefore === undefined) return;
    await restoreActivationLinksSnapshot(
      deps,
      releaseDir,
      stale.currentBefore,
      stale.previousBefore,
    );
  } catch (error) {
    await lock.release();
    throw error;
  }
}

async function rollbackFailedTransaction(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  lock: AcquiredUpgradeLock,
  state: UpgradeTransactionState,
  releaseDir: string,
  timeoutMs: number,
): Promise<LocalUpgradeResult["rollback"]> {
  if (!state.switched && !state.activeLaunch && !state.oldStopped) return "not_needed";
  try {
    await lock.update({ phase: "rollback" });
    await rollbackUpgrade(
      deps,
      options,
      state.existing,
      releaseDir,
      timeoutMs,
      state.activeLaunch,
      state.oldStopped,
      state.replacementPid,
      state.replacementLock,
    );
    return "succeeded";
  } catch {
    return "failed";
  }
}

async function runTransaction(
  options: LocalUpgradeOptions,
  action: "upgrade" | "bootstrap",
  depsInput?: LocalUpgradeDependencies,
): Promise<LocalUpgradeResult> {
  const deps = mergeDependencies(depsInput);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  await deps.nix.ensureAvailable();
  const revision = await validateCheckout(deps, options.checkout, options.revision);
  const bootstrapDescriptor =
    action === "bootstrap" ? validateDescriptor(options.descriptor) : undefined;
  const releaseDir = releasesPath(options.home);
  const rootsDir = path.join(releaseDir, "roots");
  const lock = await acquireUpgradeLock(deps.fs, path.join(releaseDir, LOCK_FILENAME), deps.now);
  await recoverStaleUpgrade(deps, options, lock, releaseDir);
  const state: UpgradeTransactionState = {
    rollback: "not_needed",
    logPath: null,
    switched: false,
    oldStopped: false,
    replacementPid: null,
    replacementLock: null,
    activeLaunch: null,
    existing: {
      lifecycle: undefined,
      lock: null,
      attested: null,
      pid: 0,
      current: null,
      previous: null,
    },
  };
  try {
    state.existing = await inspectExistingDaemon(deps, options, action, releaseDir, rootsDir);
    await lock.update({
      phase: "prepared",
      releaseDir,
      home: options.home,
      currentBefore: state.existing.current,
      previousBefore: state.existing.previous,
      oldPid: state.existing.lock?.pid,
      oldServerId: state.existing.lifecycle?.serverId,
      oldSourceRevision: state.existing.lifecycle?.sourceRevision,
      oldClosureRoot: state.existing.lifecycle?.closureRoot,
    });
    await lock.update({ phase: "switching" });
    const staged = await stageAndSwitch(
      deps,
      options,
      action,
      revision,
      releaseDir,
      rootsDir,
      state.existing,
    );
    state.switched = staged.switched;
    await lock.update({ phase: "switched" });
    state.oldStopped = await stopExistingDaemon(deps, options, action, state.existing, timeoutMs);
    await lock.update({ phase: state.oldStopped ? "stopping" : "switched" });
    const descriptor = resolveLaunchDescriptor(
      action,
      options.home,
      state.existing,
      bootstrapDescriptor,
    );
    if (!descriptor) throw new Error("CLI lifecycle descriptor is missing");
    const attested = await startAndAttest(
      deps,
      options,
      action,
      revision,
      staged.closureRoot,
      descriptor,
      state.existing,
      rootsDir,
      timeoutMs,
      (launch) => {
        state.activeLaunch = launch;
        state.replacementPid = launch.pid;
        state.logPath = launch.logPath;
      },
    );
    state.activeLaunch = attested.launch;
    state.replacementPid = attested.observed.pid;
    state.replacementLock = attested.replacementLock;
    state.logPath = attested.logPath;
    await lock.update({ phase: "started" });
    const result: LocalUpgradeResult = {
      action,
      revision,
      currentRoot: staged.closureRoot,
      previousRoot: state.existing.current,
      home: options.home,
      launchOwner: "cli",
      expected: {
        pid: attested.observed.pid,
        serverId: attested.observed.serverId,
        listen: attested.observed.listen,
        sourceRevision: revision,
        closureRoot: staged.closureRoot,
      },
      observed: attested.observed,
      rollback: "not_needed",
      logPath: state.logPath,
    };
    await lock.update({ phase: "committed" });
    return result;
  } catch (error) {
    state.rollback = await rollbackFailedTransaction(
      deps,
      options,
      lock,
      state,
      releaseDir,
      timeoutMs,
    );
    const message = error instanceof Error ? error.message : String(error);
    throw new LocalUpgradeError(message, {
      logPath: state.logPath,
      rollback: state.rollback,
      cause: error,
    });
  } finally {
    await lock.release();
  }
}

export function upgradeLocalDaemon(
  options: LocalUpgradeOptions,
  dependencies?: LocalUpgradeDependencies,
): Promise<LocalUpgradeResult> {
  return runTransaction(options, "upgrade", dependencies);
}

export function bootstrapLocalDaemon(
  options: LocalUpgradeOptions,
  dependencies?: LocalUpgradeDependencies,
): Promise<LocalUpgradeResult> {
  return runTransaction(options, "bootstrap", dependencies);
}

export function resolveStableLauncherPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(
    env.XDG_BIN_HOME?.trim() || path.join(env.HOME || ".", ".local", "bin"),
    "paseo",
  );
}

export async function installStableLauncher(
  result: Pick<LocalUpgradeResult, "home">,
  dependencies: Pick<
    UpgradeFilesystemDependencies,
    "mkdir" | "symlink" | "rename" | "unlink"
  > = defaultFs,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const launcher = resolveStableLauncherPath(env);
  await dependencies.mkdir(path.dirname(launcher), { recursive: true });
  const temporary = `${launcher}.tmp-${process.pid}`;
  await dependencies.symlink(
    path.join(releasesPath(result.home), CURRENT_LINK, "bin", "paseo"),
    temporary,
  );
  try {
    await dependencies.rename(temporary, launcher);
  } catch (error) {
    await dependencies.unlink(temporary).catch(() => undefined);
    throw error;
  }
  return launcher;
}
