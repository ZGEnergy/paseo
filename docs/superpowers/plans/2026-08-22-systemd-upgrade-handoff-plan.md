# Systemd-owned local upgrade handoff

> Design: `docs/superpowers/specs/2026-08-21-local-daemon-upgrade-design.md`

Fork-only. Touch `packages/cli/src/commands/daemon/local-upgrade.ts` and `local-upgrade.test.ts`. Do not change `local-daemon.ts` or pid-lock manager values.

## 1. Parse the live daemon's user unit

**Files**

- Modify `packages/cli/src/commands/daemon/local-upgrade.ts`
- Modify `packages/cli/src/commands/daemon/local-upgrade.test.ts`

**Changes**

- Export `parseUserSystemdUnitFromCgroup(cgroup: string): string | null`.
- Return the last `*.service` component after `user@<uid>.service`. Return null for `user@.service` itself, a missing/empty cgroup, or a path with no user slice.

**Tests**

- Live-shaped unified cgroup → `paseo.service`.
- `user@1004.service` only → null.
- Empty string → null.

## 2. Inject inspect + restart

**Changes**

- Add `inspectUserUnit(pid: number): string | null` and `restartUserUnit(unit: string): Promise<void>` to `UpgradeDaemonDependencies`.
- Default inspect reads `/proc/<pid>/cgroup`. Default restart runs `systemctl --user restart <unit>`.
- `createDependencies` in the test file must stub inspect to `null` so existing cases stay on the unmanaged path.

**Tests**

- Unmanaged (`inspectUserUnit` → null) still records `stop` then `start:new-revision`.

## 3. Hand a owned PID to systemctl

**Changes**

- Store `userUnit` on `ExistingDaemonState` from `inspectUserUnit(existing.pid)` after the `manager=cli` check.
- If `userUnit` is set: skip `stopExistingDaemon`, call `restartUserUnit` instead of `daemon.start`, then poll health as today.
- Never fall back to detached start when a unit is present, including restart failure.

**Tests**

- Owned unit records `restart:paseo.service` and never `stop` or `start:`.
- Health still requires a new PID and matching revision/closure.

## 4. Roll back through the same unit

**Changes**

- On systemd-owned failure: restore `current`/`previous`, then `restartUserUnit` again.
- Do not `cleanupReplacementDaemon` CLI-stop a systemd-started PID.

**Tests**

- `restartUserUnit` throw → links restored, second restart recorded, never `start:`.
