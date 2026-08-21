# Local daemon upgrade

## Goal

Provide one operator command from `internal/main` that upgrades a CLI-managed Paseo daemon and CLI without resetting `PASEO_HOME`. Paired clients keep their saved host and reconnect after the bounded daemon restart.

## Scope

The command upgrades only a daemon with current, CLI-authored lifecycle metadata. It refuses desktop-managed, system-service, legacy, unknown, and unsafe daemon owners. Electron owns desktop-managed daemon lifecycle and needs a desktop-package update path.

The command requires Nix. It does not install Nix, mutate the global npm installation, or modify `~/.paseo` data.

## Lifecycle metadata

Every daemon started by the CLI writes an authenticated-to-the-PID lifecycle record with its manager (`cli`), effective non-secret launch descriptor, source revision, and closure path. The record is valid only while it names the live PID and its server identity.

Upgrade accepts only a valid `manager=cli` record. It reads the saved descriptor rather than reconstructing launch behavior from partial status data. A daemon without the record is a legacy daemon and fails closed. The bootstrap command requires explicit launch options and creates the first record; it never guesses inherited environment or omitted flags.

## Command

Add `npm run upgrade:local`, which runs `scripts/upgrade-local-daemon.sh` from a clean `internal/main` checkout. The script accepts the standard `PASEO_HOME` override and otherwise uses `~/.paseo`.

The script builds the staged Nix closure itself and invokes that closure's `paseo daemon upgrade-local` directly. It does not require an already-upgraded global CLI. On success it installs `${XDG_BIN_HOME:-$HOME/.local/bin}/paseo` as a stable launcher through the current release link and reports when the directory is not first on `PATH`.

## Upgrade transaction

1. Verify Nix is available, the checkout is clean, and its branch is `internal/main`. Record the resolved commit.
2. Inspect lifecycle metadata. Reject every non-CLI, invalid, legacy, desktop-managed, system-managed, or unsupported launch state before creating release roots or stopping the daemon.
3. Build `.#paseo` while the old daemon stays online. Register the resulting closure under an immutable indirect GC root in `${XDG_DATA_HOME:-$HOME/.local/share}/paseo/releases/roots/<revision>`.
4. Preserve the existing immutable root as `previous`, then atomically switch `${XDG_DATA_HOME:-$HOME/.local/share}/paseo/releases/current` to the new root. Retain both roots until a later successful upgrade prunes generations beyond the rollback window.
5. Stop the old CLI-managed daemon gracefully and start the new closure with the recorded descriptor plus its expected revision and closure root.
6. Poll health until the configured deadline. Success requires a new live PID, the unchanged server identity and listen target, and lifecycle metadata matching the expected CLI manager, source revision, and closure root.
7. On failure, stop the new supervisor with the same graceful/force sequence and wait for its PID lock and endpoint to release. Restore `current`, restart the prior rooted closure with the recorded descriptor, verify its identity, then fail with the original upgrade error and log path.

A process lock prevents concurrent upgrades. The script releases it on every exit path.

## State and compatibility

The transaction preserves the existing `PASEO_HOME`, including pairing records, host auth material, agents, worktrees, and configuration. Clients disconnect briefly during the restart and automatically reconnect to the existing host; no client must be added again.

The script must not copy files into `/home/joe/.nvm/versions/node/v22.22.2/lib/node_modules`. Nix GC roots, release links, and the stable launcher provide atomic activation and a rollback target.

## Verification

Cover lifecycle metadata and the upgrade transaction through isolated tests:

- manager/descriptor metadata is written by CLI starts, bound to the PID and server identity, and rejected when invalid;
- build completes before the old daemon is stopped;
- successful verification requires expected revision, closure root, server identity, listen target, and a new PID;
- failed startup and live-but-unhealthy health timeout stop the new supervisor before restoring and verifying the prior closure;
- old and new rooted closures survive garbage collection during the rollback window;
- bootstrap requires explicit launch values and creates the first stable launcher;
- desktop-managed, system-managed, legacy, and concurrent upgrades are rejected before state changes.

Document the command, Nix prerequisite, CLI-managed restriction, bootstrap procedure, `PATH` activation, retained GC roots, state-preservation guarantee, and brief reconnect window in the development documentation.
