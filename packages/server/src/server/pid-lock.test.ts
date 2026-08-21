import { mkdtemp, open, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  acquirePidLock,
  getPidLockInfo,
  isAttestedCliLifecycle,
  isLocked,
  parsePidLifecycleEnvironment,
  PidLockError,
  refreshPidLock,
  releasePidLock,
  updatePidLock,
} from "./pid-lock.js";

describe("pid-lock ownership", () => {
  test("writes and releases lock for explicit owner pid", async () => {
    const paseoHome = await mkdtemp(join(tmpdir(), "paseo-pid-lock-owner-"));
    const ownerPid = process.pid + 10_000;

    try {
      await (
        acquirePidLock as unknown as (
          home: string,
          sockPath: string | null,
          options: { ownerPid: number },
        ) => Promise<void>
      )(paseoHome, null, { ownerPid });

      const lock = await getPidLockInfo(paseoHome);
      expect(lock?.pid).toBe(ownerPid);
      expect(lock?.listen).toBeNull();
      expect(lock?.heartbeat).toBe(true);

      await (
        updatePidLock as unknown as (
          home: string,
          patch: { listen: string },
          options: { ownerPid: number },
        ) => Promise<void>
      )(paseoHome, { listen: "127.0.0.1:6767" }, { ownerPid });

      const updatedLock = await getPidLockInfo(paseoHome);
      expect(updatedLock?.listen).toBe("127.0.0.1:6767");

      await (
        releasePidLock as unknown as (home: string, options: { ownerPid: number }) => Promise<void>
      )(paseoHome, { ownerPid: ownerPid + 1 });
      const lockAfterWrongOwnerRelease = await getPidLockInfo(paseoHome);
      expect(lockAfterWrongOwnerRelease?.pid).toBe(ownerPid);

      await (
        releasePidLock as unknown as (home: string, options: { ownerPid: number }) => Promise<void>
      )(paseoHome, { ownerPid });
      const lockAfterOwnerRelease = await getPidLockInfo(paseoHome);
      expect(lockAfterOwnerRelease).toBeNull();
    } finally {
      await rm(paseoHome, { recursive: true, force: true });
    }
  });

  test("keeps a stale heartbeat lock when the recorded pid is alive without a reachability check", async () => {
    const paseoHome = await mkdtemp(join(tmpdir(), "paseo-pid-lock-stale-heartbeat-"));
    const replacementOwnerPid = process.pid + 10_000;

    try {
      const pidPath = join(paseoHome, "paseo.pid");
      await writeFile(
        pidPath,
        JSON.stringify({
          pid: process.pid,
          startedAt: "2026-01-01T00:00:00.000Z",
          hostname: "old-host",
          uid: process.getuid?.() ?? 0,
          listen: "127.0.0.1:6767",
          desktopManaged: true,
          heartbeat: true,
        }),
      );
      const staleTime = new Date(Date.now() - 10 * 60_000);
      await utimes(pidPath, staleTime, staleTime);

      await expect(isLocked(paseoHome)).resolves.toMatchObject({ locked: true });
      await expect(
        acquirePidLock(paseoHome, null, { ownerPid: replacementOwnerPid }),
      ).rejects.toThrow("Another Paseo daemon is already running");

      const lock = await getPidLockInfo(paseoHome);
      expect(lock?.pid).toBe(process.pid);
    } finally {
      await rm(paseoHome, { recursive: true, force: true });
    }
  });

  test("reclaims a stale desktop heartbeat lock after desktop confirms the daemon is unreachable", async () => {
    const paseoHome = await mkdtemp(join(tmpdir(), "paseo-pid-lock-stale-desktop-heartbeat-"));
    const replacementOwnerPid = process.pid + 10_000;

    try {
      const pidPath = join(paseoHome, "paseo.pid");
      await writeFile(
        pidPath,
        JSON.stringify({
          pid: process.pid,
          startedAt: "2026-01-01T00:00:00.000Z",
          hostname: "old-host",
          uid: process.getuid?.() ?? 0,
          listen: "127.0.0.1:6767",
          desktopManaged: true,
          heartbeat: true,
        }),
      );
      const staleTime = new Date(Date.now() - 10 * 60_000);
      await utimes(pidPath, staleTime, staleTime);

      await acquirePidLock(paseoHome, null, {
        ownerPid: replacementOwnerPid,
        reclaimStaleDesktopLock: true,
      });

      const lock = await getPidLockInfo(paseoHome);
      expect(lock?.pid).toBe(replacementOwnerPid);
      expect(lock?.listen).toBeNull();
    } finally {
      await rm(paseoHome, { recursive: true, force: true });
    }
  });

  test("keeps a stale live lock written by a pre-heartbeat daemon", async () => {
    const paseoHome = await mkdtemp(join(tmpdir(), "paseo-pid-lock-legacy-live-"));
    const pidPath = join(paseoHome, "paseo.pid");

    try {
      await writeFile(
        pidPath,
        JSON.stringify({
          pid: process.pid,
          startedAt: "2026-01-01T00:00:00.000Z",
          hostname: "old-host",
          uid: process.getuid?.() ?? 0,
          listen: "127.0.0.1:6767",
          desktopManaged: true,
        }),
      );
      const staleTime = new Date(Date.now() - 10 * 60_000);
      await utimes(pidPath, staleTime, staleTime);

      await expect(
        acquirePidLock(paseoHome, null, { ownerPid: process.pid + 10_000 }),
      ).rejects.toThrow("Another Paseo daemon is already running");

      const lock = await getPidLockInfo(paseoHome);
      expect(lock?.pid).toBe(process.pid);
    } finally {
      await rm(paseoHome, { recursive: true, force: true });
    }
  });

  test("reclaims a stale legacy desktop lock after desktop confirms the daemon is unreachable", async () => {
    const paseoHome = await mkdtemp(join(tmpdir(), "paseo-pid-lock-legacy-desktop-"));
    const replacementOwnerPid = process.pid + 10_000;
    const pidPath = join(paseoHome, "paseo.pid");

    try {
      await writeFile(
        pidPath,
        JSON.stringify({
          pid: process.pid,
          startedAt: "2026-01-01T00:00:00.000Z",
          hostname: "old-host",
          uid: process.getuid?.() ?? 0,
          listen: "127.0.0.1:6767",
          desktopManaged: true,
        }),
      );
      const staleTime = new Date(Date.now() - 10 * 60_000);
      await utimes(pidPath, staleTime, staleTime);

      await acquirePidLock(paseoHome, null, {
        ownerPid: replacementOwnerPid,
        reclaimStaleDesktopLock: true,
      });

      const lock = await getPidLockInfo(paseoHome);
      expect(lock?.pid).toBe(replacementOwnerPid);
      expect(lock?.heartbeat).toBe(true);
    } finally {
      await rm(paseoHome, { recursive: true, force: true });
    }
  });

  test("rejects a heartbeat refresh after another supervisor takes ownership", async () => {
    const paseoHome = await mkdtemp(join(tmpdir(), "paseo-pid-lock-refresh-owner-"));

    try {
      await acquirePidLock(paseoHome, null, { ownerPid: process.pid + 10_000 });

      await expect(refreshPidLock(paseoHome, { ownerPid: process.pid })).rejects.toBeInstanceOf(
        PidLockError,
      );
    } finally {
      await rm(paseoHome, { recursive: true, force: true });
    }
  });

  test("retries a heartbeat refresh while its owner is rewriting the lock", async () => {
    const paseoHome = await mkdtemp(join(tmpdir(), "paseo-pid-lock-refresh-rewrite-"));
    const pidPath = join(paseoHome, "paseo.pid");

    try {
      await acquirePidLock(paseoHome, null, { ownerPid: process.pid });
      const lock = await getPidLockInfo(paseoHome);
      expect(lock).not.toBeNull();

      const rewriteHandle = await open(pidPath, "r+");
      await rewriteHandle.truncate(0);

      const refresh = refreshPidLock(paseoHome, { ownerPid: process.pid });
      await new Promise((resolve) => setTimeout(resolve, 250));
      await rewriteHandle.writeFile(JSON.stringify(lock));
      await rewriteHandle.close();

      await expect(refresh).resolves.toBeUndefined();
    } finally {
      await rm(paseoHome, { recursive: true, force: true });
    }
  });

  test("keeps a fresh lock when the recorded pid is alive", async () => {
    const paseoHome = await mkdtemp(join(tmpdir(), "paseo-pid-lock-fresh-heartbeat-"));

    try {
      await writeFile(
        join(paseoHome, "paseo.pid"),
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
          hostname: "current-host",
          uid: process.getuid?.() ?? 0,
          listen: "127.0.0.1:6767",
          desktopManaged: true,
          heartbeat: true,
        }),
      );

      await expect(
        acquirePidLock(paseoHome, null, { ownerPid: process.pid + 10_000 }),
      ).rejects.toThrow("Another Paseo daemon is already running");

      const lock = await getPidLockInfo(paseoHome);
      expect(lock?.pid).toBe(process.pid);
      expect(lock?.listen).toBe("127.0.0.1:6767");
    } finally {
      await rm(paseoHome, { recursive: true, force: true });
    }
  });

  test("writes a versioned CLI lifecycle record and binds server identity at readiness", async () => {
    const paseoHome = await mkdtemp(join(tmpdir(), "paseo-pid-lock-lifecycle-"));
    const lifecycle = {
      version: 1 as const,
      manager: "cli" as const,
      descriptor: {
        listen: "127.0.0.1:6767",
        relayEnabled: false,
        relayUseTls: false,
        mcpEnabled: true,
        mcpInjectIntoAgents: false,
        webUiEnabled: false,
        hostnames: null,
      },
      sourceRevision: "rev-a",
      closureRoot: "/nix/store/paseo-a",
    };
    try {
      await acquirePidLock(paseoHome, null, { ownerPid: process.pid, lifecycle });
      expect(isAttestedCliLifecycle((await getPidLockInfo(paseoHome))?.lifecycle)).toBe(false);
      await updatePidLock(
        paseoHome,
        { listen: lifecycle.descriptor.listen, lifecycle: { ...lifecycle, serverId: "srv-a" } },
        { ownerPid: process.pid },
      );
      const lock = await getPidLockInfo(paseoHome);
      expect(lock?.pid).toBe(process.pid);
      expect(lock?.lifecycle?.serverId).toBe("srv-a");
      expect(isAttestedCliLifecycle(lock?.lifecycle)).toBe(true);
    } finally {
      await rm(paseoHome, { recursive: true, force: true });
    }
  });

  test("rejects malformed or mismatched lifecycle environment values", () => {
    expect(parsePidLifecycleEnvironment({ PASEO_LIFECYCLE_MANAGER: "desktop" })).toEqual({
      version: 1,
      manager: "desktop",
    });
    expect(
      parsePidLifecycleEnvironment({
        PASEO_LIFECYCLE_MANAGER: "cli",
        PASEO_LIFECYCLE_DESCRIPTOR: "{not-json}",
      }),
    ).toEqual({ version: 1, manager: "unknown" });
    expect(
      parsePidLifecycleEnvironment({
        PASEO_LIFECYCLE_MANAGER: "cli",
        PASEO_LIFECYCLE_DESCRIPTOR: JSON.stringify({ listen: "127.0.0.1:6767" }),
        PASEO_LIFECYCLE_SOURCE_REVISION: "rev-a",
        PASEO_LIFECYCLE_CLOSURE_ROOT: "/nix/store/paseo-a",
      }),
    ).toEqual({ version: 1, manager: "unknown" });
  });
});
