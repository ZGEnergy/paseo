import { describe, expect, test, vi } from "vitest";
import path from "node:path";
import {
  bootstrapLocalDaemon,
  upgradeLocalDaemon,
  type LocalUpgradeDependencies,
  type UpgradeAttestation,
} from "./local-upgrade.js";
import type { CliLaunchDescriptor, PidLockInfo } from "@getpaseo/server";

const descriptor: CliLaunchDescriptor = {
  listen: "127.0.0.1:6767",
  relayEnabled: false,
  relayUseTls: false,
  mcpEnabled: true,
  mcpInjectIntoAgents: false,
  webUiEnabled: false,
  hostnames: null,
};

const lifecycle = {
  version: 1 as const,
  manager: "cli" as const,
  descriptor,
  sourceRevision: "old-revision",
  closureRoot: "/nix/store/old-paseo",
  serverId: "server-1",
};

function createDependencies(
  events: string[],
  probe: UpgradeAttestation | null = null,
): LocalUpgradeDependencies {
  const links = new Map<string, string>([
    ["current", "roots/old-revision"],
    ["roots/old-revision", "/nix/store/old-paseo"],
  ]);
  const linkKey = (value: string): string => {
    if (value.endsWith("/current")) return "current";
    if (value.endsWith("/previous")) return "previous";
    if (value.endsWith("/roots/old-revision")) return "roots/old-revision";
    if (value.endsWith("/roots/new-revision")) return "roots/new-revision";
    return value;
  };
  let lock: PidLockInfo | null = {
    pid: 101,
    startedAt: "2026-08-21T00:00:00.000Z",
    hostname: "test",
    uid: 1,
    listen: descriptor.listen,
    lifecycle,
  };
  let runningPid = 101;
  let started = false;
  const fs = {
    mkdir: vi.fn(async () => undefined),
    readlink: vi.fn(async (value: string) => {
      const target = links.get(linkKey(value));
      if (!target) throw new Error("missing link");
      return target;
    }),
    rename: vi.fn(async (from: string, to: string) => {
      const target = links.get(linkKey(from));
      if (!target) throw new Error("missing temporary link");
      links.delete(linkKey(from));
      links.set(linkKey(to), target);
    }),
    symlink: vi.fn(async (target: string, value: string) => links.set(linkKey(value), target)),
    unlink: vi.fn(async (value: string) => links.delete(linkKey(value))),
    rm: vi.fn(async () => undefined),
    readdir: vi.fn(async () => ["old-revision", "new-revision"]),
    access: vi.fn(async () => undefined),
    readFile: vi.fn(async () => ""),
    writeFile: vi.fn(async () => undefined),
  };
  return {
    fs,
    now: () => 1,
    sleep: async () => undefined,
    checkoutClean: async () => true,
    checkoutBranch: async () => "internal/main",
    checkoutRevision: async () => "new-revision",
    nix: {
      ensureAvailable: async () => events.push("nix:available"),
      build: async () => {
        events.push("build");
        return { closureRoot: "/nix/store/new-paseo" };
      },
      addIndirectRoot: async ({ rootPath, closureRoot }) => {
        events.push("root");
        links.set(linkKey(rootPath), closureRoot);
      },
    },
    daemon: {
      readPidLock: async () => lock,
      endpointReachable: async () => false,
      isPidRunning: (pid: number) => pid === runningPid,
      stop: async () => {
        events.push("stop");
        runningPid = 0;
        lock = null;
        return {
          action: "stopped",
          home: "/tmp/paseo",
          pid: 101,
          forced: false,
          usedLifecycleRpc: true,
          reason: "lifecycle_shutdown_rpc",
          message: "stopped",
        };
      },
      start: async ({ sourceRevision, closureRoot }) => {
        events.push(`start:${sourceRevision}`);
        started = true;
        runningPid = 202;
        lock = {
          pid: 202,
          startedAt: "2026-08-21T00:01:00.000Z",
          hostname: "test",
          uid: 1,
          listen: descriptor.listen,
          lifecycle: { ...lifecycle, sourceRevision, closureRoot },
        };
        return { pid: 202, logPath: "/tmp/paseo/daemon.log" };
      },
      probe: async () =>
        probe ??
        (started
          ? {
              pid: 202,
              serverId: "server-1",
              listen: descriptor.listen,
              sourceRevision: "new-revision",
              closureRoot: "/nix/store/new-paseo",
            }
          : {
              pid: 101,
              serverId: "server-1",
              listen: descriptor.listen,
              sourceRevision: "old-revision",
              closureRoot: "/nix/store/old-paseo",
            }),
    },
  };
}

describe("local daemon upgrade transaction", () => {
  test("builds and roots the new closure before stopping the old daemon", async () => {
    const events: string[] = [];
    const result = await upgradeLocalDaemon(
      { home: "/tmp/paseo", checkout: "/checkout" },
      createDependencies(events),
    );
    expect(events.indexOf("build")).toBeLessThan(events.indexOf("stop"));
    expect(events.indexOf("root")).toBeLessThan(events.indexOf("stop"));
    expect(events.indexOf("stop")).toBeLessThan(events.indexOf("start:new-revision"));
    expect(result.observed).toMatchObject({ pid: 202, serverId: "server-1" });
  });

  test("rejects non-CLI lifecycle before build or stop", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    const originalReadPidLock = dependencies.daemon?.readPidLock;
    dependencies.daemon = {
      ...dependencies.daemon,
      readPidLock: async () => ({
        ...(await originalReadPidLock?.("/tmp/paseo"))!,
        lifecycle: { version: 1, manager: "desktop" },
      }),
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).rejects.toThrow("manager=cli");
    expect(events).toEqual(["nix:available"]);
  });

  test("bootstrap requires explicit descriptor values and still attests a new PID", async () => {
    const events: string[] = [];
    await expect(
      bootstrapLocalDaemon(
        { home: "/tmp/paseo", checkout: "/checkout" },
        createDependencies(events),
      ),
    ).rejects.toThrow("explicit effective launch values");
    const bootstrapDependencies = createDependencies(events);
    bootstrapDependencies.daemon = {
      ...bootstrapDependencies.daemon,
      readPidLock: async () => null,
    };
    const result = await bootstrapLocalDaemon(
      { home: "/tmp/paseo", checkout: "/checkout", descriptor },
      bootstrapDependencies,
    );
    expect(result.observed.pid).toBe(202);
  });
  test("rejects stale PID/server identity before building or stopping", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    dependencies.daemon = {
      ...dependencies.daemon,
      probe: async () => ({
        pid: 101,
        serverId: "reused-server",
        listen: descriptor.listen,
        sourceRevision: "old-revision",
        closureRoot: "/nix/store/old-paseo",
      }),
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).rejects.toThrow("endpoint does not match");
    expect(events).toEqual(["nix:available"]);
  });

  test("seeds the first rooted release when activation links are absent", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    const originalReadlink = dependencies.fs!.readlink;
    dependencies.fs = {
      ...dependencies.fs,
      readlink: async (value: string) => {
        if (value.endsWith("/current") || value.endsWith("/roots/old-revision")) {
          throw new Error("missing link");
        }
        return originalReadlink(value);
      },
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).resolves.toMatchObject({ previousRoot: "roots/old-revision" });
    expect(events.filter((event) => event === "root")).toHaveLength(2);
  });

  test("rejects an active root that names the wrong closure", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    const originalReadlink = dependencies.fs!.readlink;
    dependencies.fs = {
      ...dependencies.fs,
      readlink: async (value: string) => {
        if (value.endsWith("/roots/old-revision")) return "/nix/store/wrong-paseo";
        return originalReadlink(value);
      },
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).rejects.toThrow("does not match the daemon lifecycle closure");
    expect(events).toEqual(["nix:available"]);
  });

  test("requires staged roots to equal the pinned checkout build", async () => {
    const events: string[] = [];
    await expect(
      upgradeLocalDaemon(
        { home: "/tmp/paseo", checkout: "/checkout", stagedRoot: "/nix/store/untrusted" },
        createDependencies(events),
      ),
    ).rejects.toThrow("does not match the pinned checkout build");
    expect(events).not.toContain("stop");
  });

  test("rejects checkout mutation detected after the build", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    let revisionCalls = 0;
    dependencies.checkoutRevision = async () => {
      revisionCalls += 1;
      return revisionCalls === 1 ? "new-revision" : "changed-revision";
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).rejects.toThrow("checkout revision mismatch");
    expect(events).not.toContain("stop");
  });

  test("restores both links when current replacement fails", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    const originalRename = dependencies.fs!.rename;
    let failCurrent = true;
    dependencies.fs = {
      ...dependencies.fs,
      rename: async (from: string, to: string) => {
        if (failCurrent && to.endsWith("/current")) {
          failCurrent = false;
          throw new Error("current rename failed");
        }
        return originalRename(from, to);
      },
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).rejects.toThrow("current rename failed");
    expect(events).not.toContain("stop");
  });

  test("retries transient health probe errors until success", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    let probeCalls = 0;
    dependencies.daemon = {
      ...dependencies.daemon,
      probe: async () => {
        probeCalls += 1;
        if (probeCalls === 3) throw new Error("temporary connection reset");
        if (probeCalls < 3) {
          return {
            pid: 101,
            serverId: "server-1",
            listen: descriptor.listen,
            sourceRevision: "old-revision",
            closureRoot: "/nix/store/old-paseo",
          };
        }
        return {
          pid: 202,
          serverId: "server-1",
          listen: descriptor.listen,
          sourceRevision: "new-revision",
          closureRoot: "/nix/store/new-paseo",
        };
      },
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).resolves.toMatchObject({ observed: { pid: 202 } });
  });

  test("cleans a delayed-lock launch and preserves its log path", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    let now = 0;
    const cleanup = vi.fn(async () => undefined);
    const originalStart = dependencies.daemon!.start;
    dependencies.now = () => now;
    dependencies.sleep = async (ms) => {
      now += ms;
    };
    let probeCalls = 0;
    dependencies.daemon = {
      ...dependencies.daemon,
      start: async (input) => ({ ...(await originalStart(input)), cleanup }),
      probe: async () => {
        probeCalls += 1;
        if (probeCalls <= 2) {
          return {
            pid: 101,
            serverId: "server-1",
            listen: descriptor.listen,
            sourceRevision: "old-revision",
            closureRoot: "/nix/store/old-paseo",
          };
        }
        return null;
      },
    };
    const error = await upgradeLocalDaemon(
      { home: "/tmp/paseo", checkout: "/checkout", timeoutMs: 1 },
      dependencies,
    ).catch((value) => value);
    expect(cleanup).toHaveBeenCalled();
    expect(error.details.logPath).toBe("/tmp/paseo/daemon.log");
  });

  test("does not stop a concurrent replacement after preflight ownership changes", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    let reads = 0;
    const replacement: PidLockInfo = {
      pid: 303,
      startedAt: "2026-08-21T00:02:00.000Z",
      hostname: "test",
      uid: 1,
      listen: descriptor.listen,
      lifecycle: { ...lifecycle, serverId: "replacement" },
    };
    dependencies.daemon = {
      ...dependencies.daemon,
      readPidLock: async () => {
        reads += 1;
        return reads === 1
          ? await createDependencies([]).daemon!.readPidLock("/tmp/paseo")
          : replacement;
      },
      isPidRunning: (pid) => pid === 101 || pid === 303,
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).rejects.toThrow("daemon lifecycle lock changed before stop");
    expect(events).not.toContain("stop");
  });

  test("waits for endpoint release after the PID lock disappears", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    let endpointCalls = 0;
    let now = 0;
    dependencies.now = () => now;
    dependencies.sleep = async (ms) => {
      now += ms;
    };
    dependencies.daemon = {
      ...dependencies.daemon,
      endpointReachable: async () => {
        endpointCalls += 1;
        return endpointCalls === 1;
      },
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).resolves.toMatchObject({ observed: { pid: 202 } });
    expect(endpointCalls).toBeGreaterThanOrEqual(2);
  });

  test("fails closed for a missing staged executable before stopping", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    dependencies.fs = {
      ...dependencies.fs,
      access: async () => {
        throw new Error("missing staged executable");
      },
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).rejects.toThrow("missing staged executable");
    expect(events).not.toContain("stop");
  });

  test("reclaims a dead upgrade lock after an identity reread", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    const originalWriteFile = dependencies.fs!.writeFile;
    let firstWrite = true;
    dependencies.fs = {
      ...dependencies.fs,
      writeFile: async (file, data, options) => {
        if (firstWrite) {
          firstWrite = false;
          const error = new Error("exists") as Error & { code?: string };
          error.code = "EEXIST";
          throw error;
        }
        return originalWriteFile(file, data, options);
      },
      readFile: async () => JSON.stringify({ pid: 2_000_000_000 }),
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).resolves.toMatchObject({ observed: { pid: 202 } });
  });

  test("restores links from a stale activation journal before a new upgrade", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    const releaseDir = path.join(
      process.env.XDG_DATA_HOME ?? path.join(process.env.HOME ?? "/tmp", ".local", "share"),
      "paseo",
      "releases",
    );
    const stalePayload = JSON.stringify({
      pid: 2_000_000_000,
      startedAt: 1,
      phase: "switched",
      releaseDir,
      home: "/tmp/paseo",
      currentBefore: "roots/old-revision",
      previousBefore: null,
      oldPid: 101,
      oldServerId: "server-1",
    });
    let lockReads = 0;
    const originalSymlink = dependencies.fs!.symlink;
    dependencies.fs = {
      ...dependencies.fs,
      writeFile: vi.fn(async (_file, _data, options) => {
        if (options?.flag === "wx" && lockReads === 0) {
          const error = new Error("exists") as Error & { code?: string };
          error.code = "EEXIST";
          throw error;
        }
      }),
      readFile: vi.fn(async () => {
        lockReads += 1;
        return lockReads <= 2 ? stalePayload : "";
      }),
      symlink: vi.fn(async (target, value) => {
        events.push(`link:${target}`);
        return originalSymlink(target, value);
      }),
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).resolves.toMatchObject({ observed: { pid: 202 } });
    expect(events).toContain("link:roots/old-revision");
  });

  test("keeps an upgrade lock owned by a live process", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    let firstWrite = true;
    dependencies.fs = {
      ...dependencies.fs,
      writeFile: async () => {
        if (firstWrite) {
          firstWrite = false;
          const error = new Error("exists") as Error & { code?: string };
          error.code = "EEXIST";
          throw error;
        }
      },
      readFile: async () => JSON.stringify({ pid: process.pid }),
    };
    await expect(
      upgradeLocalDaemon({ home: "/tmp/paseo", checkout: "/checkout" }, dependencies),
    ).rejects.toThrow("Another local daemon upgrade is already running");
  });

  test("cleans an unhealthy bootstrap daemon and restores activation links", async () => {
    const events: string[] = [];
    const dependencies = createDependencies(events);
    let now = 0;
    const cleanup = vi.fn(async () => undefined);
    const originalStart = dependencies.daemon!.start;
    dependencies.now = () => now;
    dependencies.sleep = async (ms) => {
      now += ms;
    };
    dependencies.daemon = {
      ...dependencies.daemon,
      readPidLock: async () => null,
      start: async (input) => ({ ...(await originalStart(input)), cleanup }),
      probe: async () => null,
    };
    const error = await bootstrapLocalDaemon(
      { home: "/tmp/paseo", checkout: "/checkout", descriptor, timeoutMs: 1 },
      dependencies,
    ).catch((value) => value);
    expect(cleanup).toHaveBeenCalled();
    expect(error.details.logPath).toBe("/tmp/paseo/daemon.log");
  });
});
