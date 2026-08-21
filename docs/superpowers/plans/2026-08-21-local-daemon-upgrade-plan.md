# Local daemon upgrade implementation plan

> Design: `docs/superpowers/specs/2026-08-21-local-daemon-upgrade-design.md`

## 1. Extract restart-safe daemon launch support

**Files**

- Modify `packages/cli/src/commands/daemon/local-daemon.ts`
- Modify `packages/cli/src/commands/daemon/local-daemon.test.ts`

**Changes**

- Expose a narrow typed operation that starts a detached daemon from an explicit executable/runner and a complete, inspected launch descriptor.
- Keep the existing public CLI behavior unchanged.
- Add a descriptor derived from the local PID/status state. It must carry the persisted home, listen target, and values sourced from `config.json`; it must identify a desktop-managed daemon and unsupported ephemeral overrides.
- Make the descriptor builder reject unsafe restart cases instead of silently applying defaults.
- Keep stop behavior graceful and retain the existing timeout/force semantics for recovery.

**Tests**

- Verify a descriptor retains home and listen address.
- Verify desktop-managed and unsupported launch cases fail before a stop is requested.
- Verify the detached process receives the reconstructed runner arguments and environment.

## 2. Add an upgrade transaction module

**Files**

- Add `packages/cli/src/commands/daemon/local-upgrade.ts`
- Add `packages/cli/src/commands/daemon/local-upgrade.test.ts`

**Changes**

- Define a dependency-injected upgrade transaction. Dependencies own command execution, filesystem links, locking, status polling, timing, and daemon lifecycle actions.
- Resolve release storage to `${XDG_DATA_HOME:-$HOME/.local/share}/paseo/releases`.
- Build `.#paseo` into a staged Nix output link without stopping the daemon.
- Save the previous `current` target, atomically switch `current`, start the new runner, and poll daemon status until a bounded deadline.
- On startup or health failure, atomically restore `current`, restart the old runner using the captured descriptor, preserve the original upgrade error, and surface the daemon log path.
- Guarantee lock cleanup in `finally`, including failed build, failed switch, and failed rollback paths.

**Tests**

- Build completes before stopping the old daemon.
- Successful health status retains the new `current` target.
- Failed startup restores the prior target and restarts it.
- Health timeout restores the prior target and restarts it.
- Concurrent transactions fail before any build or lifecycle operation.

## 3. Expose the operator command

**Files**

- Modify `packages/cli/src/commands/daemon/index.ts`
- Add `packages/cli/src/commands/daemon/upgrade.ts`
- Add `packages/cli/src/commands/daemon/upgrade.test.ts`
- Modify `packages/cli/src/cli-surface.test.ts`

**Changes**

- Add `paseo daemon upgrade-local` with `--home` and bounded timeout options.
- Verify Nix is available before inspecting or changing release links; report a concise prerequisite error otherwise.
- Emit structured and human-readable results including resolved source commit, previous/new release targets, effective home/listen target, and rollback outcome.
- Register command help and JSON output according to existing daemon command conventions.

**Tests**

- Command registration and help output.
- Invalid timeout validation.
- Missing Nix, desktop-managed daemon, and rollback error results are stable in JSON and terminal output.

## 4. Provide the `internal/main` entry point

**Files**

- Add `scripts/upgrade-local-daemon.sh`
- Modify `package.json`
- Add an isolated script test under `scripts/`

**Changes**

- Add `npm run upgrade:local` as the supported checkout command.
- The shell entry point validates that the checkout is clean and currently on `internal/main`, records the exact commit, and delegates lifecycle work to `paseo daemon upgrade-local` from the built/current closure.
- Keep shell limited to source checkout validation and invocation. Keep transaction behavior in TypeScript so it is unit-testable.
- Do not install Nix, mutate global npm package directories, or touch any data outside the release-link directory and configured `PASEO_HOME` lifecycle files.

**Tests**

- Reject a dirty checkout and wrong branch before invoking Nix or daemon lifecycle actions.
- Verify the exact `internal/main` commit is passed through to the CLI transaction.

## 5. Document and validate

**Files**

- Modify `docs/development.md`

**Changes**

- Add the operator command, Nix prerequisite, CLI-managed-daemon restriction, release-link location, rollback behavior, preserved state, and reconnect window.
- Link to this behavior from the existing `PASEO_HOME`/daemon lifecycle guidance rather than duplicating state semantics.

**Verification**

1. Run each changed test file with `npx vitest run <file> --bail=1`.
2. Run `npm run typecheck` and `npm run lint`.
3. Run `npm run format`.
4. On a Nix-equipped isolated home, launch a CLI-managed daemon, pair a client, run `npm run upgrade:local`, and confirm the same `PASEO_HOME`, listen target, and server identity after reconnect.
5. Inject a post-switch health failure and confirm the old release link and daemon version are restored.
