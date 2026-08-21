import { describe, expect, test, vi } from "vitest";
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
  const links = new Map<string, string>([["current", "roots/old-revision"]]);
  const linkKey = (value: string): string => (value.endsWith("/current") ? "current" : value);
  let lock: PidLockInfo | null = {
    pid: 101,
    startedAt: "2026-08-21T00:00:00.000Z",
    hostname: "test",
    uid: 1,
    listen: descriptor.listen,
    lifecycle,
  };
  let runningPid = 101;
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
      addIndirectRoot: async () => events.push("root"),
    },
    daemon: {
      readPidLock: async () => lock,
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
      start: async ({ sourceRevision }) => {
        events.push(`start:${sourceRevision}`);
        runningPid = 202;
        lock = {
          pid: 202,
          startedAt: "2026-08-21T00:01:00.000Z",
          hostname: "test",
          uid: 1,
          listen: descriptor.listen,
          lifecycle: { ...lifecycle, sourceRevision, closureRoot: "/nix/store/new-paseo" },
        };
        return { pid: 202, logPath: "/tmp/paseo/daemon.log" };
      },
      probe: async () =>
        probe ?? {
          pid: 202,
          serverId: "server-1",
          listen: descriptor.listen,
          sourceRevision: "new-revision",
          closureRoot: "/nix/store/new-paseo",
        },
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
});
