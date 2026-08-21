# Local daemon upgrade implementation plan

> Design: `docs/superpowers/specs/2026-08-21-local-daemon-upgrade-design.md`

## 1. Persist CLI lifecycle metadata

**Files**

- Modify `packages/server/src/server/pid-lock.ts`
- Modify `packages/server/src/server/pid-lock.test.ts`
- Modify `packages/cli/src/commands/daemon/local-daemon.ts`
- Modify `packages/cli/src/commands/daemon/local-daemon.test.ts`

**Changes**

- Extend the PID-lock record with a versioned lifecycle section: manager, effective non-secret launch descriptor, source revision, closure root, and server identity.
- Bind lifecycle data to the actual process PID and reject stale, malformed, or mismatched records.
- Make every CLI start pass `manager=cli` and a complete effective descriptor. Preserve existing desktop/system starts as non-CLI owners; they must never be upgradable by this feature.
- Keep auth material and other secrets out of the record. Record only the concrete values needed to reproduce CLI-owned launch behavior.
- Add an explicit bootstrap path for legacy daemons. It requires every effective launch option, never derives them from process state, and writes the first valid CLI lifecycle record.

**Tests**

- CLI starts write lifecycle metadata with the actual PID and server identity.
- Stale, corrupt, PID-mismatched, and identity-mismatched records are rejected.
- Desktop and system-service launches do not identify as CLI-managed.
- Bootstrap rejects omitted launch values and emits a valid record only with explicit inputs.

## 2. Add an attested upgrade transaction

**Files**

- Add `packages/cli/src/commands/daemon/local-upgrade.ts`
- Add `packages/cli/src/commands/daemon/local-upgrade.test.ts`

**Changes**

- Define a dependency-injected transaction owning Nix invocation, indirect GC roots, release links, lock lifetime, daemon lifecycle, status polling, and time.
- Resolve release storage to `${XDG_DATA_HOME:-$HOME/.local/share}/paseo/releases`. Build each closure under an immutable `roots/<revision>` indirect GC-root path; retain the active and immediately previous roots.
- Accept only an attested live `manager=cli` lifecycle record. Reject legacy, desktop, system, unknown, unsafe, or mismatched records before touching roots or stopping a daemon.
- Build before stopping the old daemon. Atomically move `current` and `previous` release links only after the root is complete.
- Start the new closure with the captured descriptor plus expected revision/root. Treat health as successful only when a new PID, unchanged server identity/listen target, and matching lifecycle record attest to that exact revision/root.
- On any new-daemon startup or health failure, stop the new supervisor using the existing graceful/force sequence; wait for its PID lock and endpoint to release; restore links; restart and attest the prior root. Preserve the original error and daemon log path even when rollback also fails.
- Release the process lock in every exit path and prune only roots older than the retained rollback generation after a successful transaction.

**Tests**

- Build completes before old-daemon stop.
- Successful upgrade retains the expected root and requires all attestation fields.
- A live-but-unhealthy new supervisor is stopped before links are restored and the old daemon starts.
- Startup failure, health timeout, rollback failure, concurrent invocation, and GC-root retention have deterministic outcomes.

## 3. Expose safe CLI commands

**Files**

- Modify `packages/cli/src/commands/daemon/index.ts`
- Add `packages/cli/src/commands/daemon/upgrade.ts`
- Add `packages/cli/src/commands/daemon/upgrade.test.ts`
- Modify `packages/cli/src/cli-surface.test.ts`

**Changes**

- Add `paseo daemon upgrade-local` with source checkout, revision, `--home`, and bounded timeout options.
- Add `paseo daemon bootstrap-upgrade` for the explicit legacy transition. Require every launch setting and reject when the caller attempts to infer one.
- Verify Nix before inspecting or changing roots. Emit structured results containing the revision, roots, launch owner, expected/observed attestation, rollback result, and log path.

**Tests**

- Command registration, help, JSON output, and timeout validation.
- Missing Nix, invalid lifecycle owner, first-run bootstrap, health-attestation mismatch, and rollback errors.

## 4. Provide the `internal/main` entry point and stable launcher

**Files**

- Add `scripts/upgrade-local-daemon.sh`
- Modify `package.json`
- Add an isolated script test under `scripts/`

**Changes**

- Add `npm run upgrade:local`.
- Validate Nix, a clean checkout, and exact `internal/main` before any daemon action. Build a staged closure and invoke its absolute `bin/paseo` path, so the initial rollout does not depend on an existing upgraded CLI or `current` link.
- On successful upgrade or bootstrap, atomically install `${XDG_BIN_HOME:-$HOME/.local/bin}/paseo` as a stable launcher through `releases/current/bin/paseo`. Report when that directory loses PATH precedence to an existing npm launcher; never edit PATH or npm globals.
- Keep shell limited to validation, staging, and absolute-CLI invocation. Keep transaction logic in TypeScript.

**Tests**

- Reject dirty/wrong source before Nix or lifecycle actions.
- First run uses the staged closure without `current`/`previous`.
- Stable launcher points through `current`; subsequent upgrades and rollback resolve the expected CLI.

## 5. Document and validate

**Files**

- Modify `docs/development.md`

**Changes**

- Document Nix prerequisite, CLI-only ownership/legacy refusal, bootstrap command, release root and retention policy, launcher/PATH behavior, state preservation, rollback, and reconnect window.

**Verification**

1. Run each changed test file with `npx vitest run <file> --bail=1`.
2. Run `npm run typecheck`, `npm run lint`, and `npm run format`.
3. On a Nix-equipped isolated home, first bootstrap a legacy CLI daemon with explicit values, then run a normal upgrade and confirm the same home, listen target, and server identity after reconnect.
4. Inject a live-but-unhealthy new daemon and confirm it terminates before the prior root restarts.
5. Run Nix garbage collection during the retained rollback window and verify active and prior roots still start.
