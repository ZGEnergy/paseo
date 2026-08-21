import { execFile, spawn } from "node:child_process";
import {
  access,
  mkdir,
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
  }): Promise<{ pid: number | null; logPath: string | null }>;
  probe(input: { home: string; timeoutMs: number }): Promise<UpgradeAttestation | null>;
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
  access,
  writeFile,
};

const defaultNix: UpgradeNixDependencies = {
  async ensureAvailable() {
    await execFileAsync("nix", ["--version"]);
  },
  async build({ checkout }) {
    const result = await execFileAsync("nix", [
      "build",
      `${checkout}#paseo`,
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

function descriptorArgs(descriptor: CliLaunchDescriptor): string[] {
  const args = ["daemon", "start", "--listen", descriptor.listen];
  args.push(descriptor.relayEnabled ? "--relay" : "--no-relay");
  if (descriptor.relayUseTls) args.push("--relay-use-tls");
  args.push(descriptor.mcpEnabled ? "--mcp" : "--no-mcp");
  args.push(descriptor.mcpInjectIntoAgents ? "--inject-mcp" : "--no-inject-mcp");
  args.push(descriptor.webUiEnabled ? "--web-ui" : "--no-web-ui");
  if (descriptor.hostnames !== null) {
    args.push(
      "--hostnames",
      descriptor.hostnames === true ? "true" : descriptor.hostnames.join(","),
    );
  }
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
      child.unref();
      return {
        pid: child.pid ?? null,
        logPath: path.join(input.home, "daemon.log"),
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
          !status.serverId ||
          lifecycle.serverId !== status.serverId ||
          !status.listen
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
  } catch {
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

async function acquireUpgradeLock(
  fs: UpgradeFilesystemDependencies,
  lockPath: string,
  now: () => number,
): Promise<() => Promise<void>> {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  try {
    await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid, startedAt: now() }), {
      flag: "wx",
    });
  } catch {
    throw new Error("Another local daemon upgrade is already running");
  }
  return async () => {
    await fs.unlink(lockPath).catch(() => undefined);
  };
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
  while (deps.now() < deadline) {
    const observed = await deps.daemon.probe({ home, timeoutMs: Math.min(1000, timeoutMs) });
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
  throw new Error("new daemon failed health attestation before timeout");
}

async function waitForRelease(
  deps: ResolvedUpgradeDependencies,
  home: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = deps.now() + timeoutMs;
  while (deps.now() < deadline) {
    const lock = await deps.daemon.readPidLock(home);
    if (!lock || !deps.daemon.isPidRunning(lock.pid)) return;
    await deps.sleep(HEALTH_POLL_MS);
  }
  throw new Error("new daemon PID lock did not release after stop");
}

async function startFromRoot(
  deps: ResolvedUpgradeDependencies,
  home: string,
  closureRoot: string,
  descriptor: CliLaunchDescriptor,
  sourceRevision: string,
): Promise<{ pid: number | null; logPath: string | null }> {
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
  pid: number;
  current: string | null;
  previous: string | null;
}

async function inspectExistingDaemon(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  action: "upgrade" | "bootstrap",
  releaseDir: string,
): Promise<ExistingDaemonState> {
  const lock = await deps.daemon.readPidLock(options.home);
  if (action === "bootstrap") {
    if (lock && deps.daemon.isPidRunning(lock.pid)) {
      throw new Error("bootstrap requires the legacy daemon to be stopped first");
    }
    return { lifecycle: undefined, pid: 0, current: null, previous: null };
  }
  if (!lock || !deps.daemon.isPidRunning(lock.pid) || !isAttestedCliLifecycle(lock.lifecycle)) {
    throw new Error("local upgrade requires a live, attested manager=cli lifecycle record");
  }
  const current = await readLinkOrNull(deps.fs, path.join(releaseDir, CURRENT_LINK));
  if (!current) throw new Error("active rooted closure is missing");
  return {
    lifecycle: lock.lifecycle,
    pid: lock.pid,
    current,
    previous: await readLinkOrNull(deps.fs, path.join(releaseDir, PREVIOUS_LINK)),
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
  const builtRoot =
    options.stagedRoot ??
    (await deps.nix.build({ checkout: options.checkout, revision })).closureRoot;
  if (!path.isAbsolute(builtRoot))
    throw new Error("Nix build returned a non-absolute closure root");
  await deps.fs.mkdir(rootsDir, { recursive: true });
  const rootLink = path.join(rootsDir, revision);
  await deps.nix.addIndirectRoot({ rootPath: rootLink, closureRoot: builtRoot });
  if (action === "upgrade") {
    if (!existing.current) throw new Error("active rooted closure is missing");
    await replaceLink(deps.fs, path.join(releaseDir, PREVIOUS_LINK), existing.current, deps.now);
  }
  await replaceLink(deps.fs, path.join(releaseDir, CURRENT_LINK), rootLink, deps.now);
  return { closureRoot: builtRoot, switched: true };
}

async function stopExistingDaemon(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  action: "upgrade" | "bootstrap",
  timeoutMs: number,
): Promise<void> {
  if (action !== "upgrade") return;
  await deps.daemon.stop(options.home, { timeoutMs, force: false });
  await waitForRelease(deps, options.home, timeoutMs);
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
): Promise<{ observed: UpgradeAttestation; logPath: string | null }> {
  const expected: Omit<UpgradeAttestation, "pid"> = {
    serverId: action === "upgrade" ? (existing.lifecycle?.serverId ?? "") : "",
    listen: descriptor.listen,
    sourceRevision: revision,
    closureRoot,
  };
  const started = await startFromRoot(deps, options.home, closureRoot, descriptor, revision);
  const observed = await waitForHealth(deps, options.home, expected, existing.pid, timeoutMs);
  if (action === "bootstrap" && !observed.serverId) {
    throw new Error("bootstrap health attestation missing server identity");
  }
  if (action === "upgrade") {
    const retained = new Set([revision, existing.current ? path.basename(existing.current) : ""]);
    retained.delete("");
    await pruneReleaseRoots(deps, rootsDir, retained);
  }
  return { observed, logPath: started.logPath };
}

async function rollbackUpgrade(
  deps: ResolvedUpgradeDependencies,
  options: LocalUpgradeOptions,
  existing: ExistingDaemonState,
  releaseDir: string,
  timeoutMs: number,
): Promise<void> {
  const latest = await deps.daemon.readPidLock(options.home);
  if (latest && latest.pid !== existing.pid && deps.daemon.isPidRunning(latest.pid)) {
    await deps.daemon.stop(options.home, { timeoutMs, force: true });
    await waitForRelease(deps, options.home, timeoutMs);
  }
  if (existing.current) {
    await replaceLink(deps.fs, path.join(releaseDir, CURRENT_LINK), existing.current, deps.now);
  }
  if (existing.previous) {
    await replaceLink(deps.fs, path.join(releaseDir, PREVIOUS_LINK), existing.previous, deps.now);
  } else {
    await deps.fs.unlink(path.join(releaseDir, PREVIOUS_LINK)).catch(() => undefined);
  }
  const lifecycle = existing.lifecycle;
  if (!lifecycle?.descriptor || !lifecycle.sourceRevision || !lifecycle.closureRoot) return;
  await startFromRoot(
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
  const unlock = await acquireUpgradeLock(deps.fs, path.join(releaseDir, LOCK_FILENAME), deps.now);
  let rollback: LocalUpgradeResult["rollback"] = "not_needed";
  let logPath: string | null = null;
  let switched = false;
  let existing: ExistingDaemonState;
  try {
    existing = await inspectExistingDaemon(deps, options, action, releaseDir);
  } catch (error) {
    await unlock();
    throw error;
  }
  try {
    const staged = await stageAndSwitch(
      deps,
      options,
      action,
      revision,
      releaseDir,
      rootsDir,
      existing,
    );
    switched = staged.switched;
    await stopExistingDaemon(deps, options, action, timeoutMs);
    const descriptor = action === "upgrade" ? existing.lifecycle?.descriptor : bootstrapDescriptor;
    if (!descriptor) throw new Error("CLI lifecycle descriptor is missing");
    const attested = await startAndAttest(
      deps,
      options,
      action,
      revision,
      staged.closureRoot,
      descriptor,
      existing,
      rootsDir,
      timeoutMs,
    );
    logPath = attested.logPath;
    return {
      action,
      revision,
      currentRoot: staged.closureRoot,
      previousRoot: existing.current,
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
      logPath,
    };
  } catch (error) {
    if (switched && action === "upgrade") {
      rollback = "failed";
      try {
        await rollbackUpgrade(deps, options, existing, releaseDir, timeoutMs);
        rollback = "succeeded";
      } catch {
        rollback = "failed";
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new LocalUpgradeError(message, { logPath, rollback, cause: error });
  } finally {
    await unlock();
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
