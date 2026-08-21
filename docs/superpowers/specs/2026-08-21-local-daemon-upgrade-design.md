# Local daemon upgrade

## Goal

Provide one operator command from `internal/main` that upgrades a CLI-managed Paseo daemon and CLI without resetting `PASEO_HOME`. Paired clients keep their saved host and reconnect after the bounded daemon restart.

## Scope

The command upgrades only a daemon launched by the Paseo CLI. It refuses a desktop-managed daemon because Electron owns that lifecycle and needs a desktop-package upgrade path.

The command requires Nix. It does not install Nix, mutate the global npm installation, or modify `~/.paseo` data.

## Command

Add `npm run upgrade:local`, which runs `scripts/upgrade-local-daemon.sh` from a clean `internal/main` checkout.

The script accepts the standard `PASEO_HOME` override and otherwise uses `~/.paseo`.

## Upgrade transaction

1. Verify Nix is available, the checkout is clean, and its branch is `internal/main`. Record the resolved commit.
2. Inspect the local daemon. Reject a desktop-managed daemon. Preserve its listen address from daemon state and settings persisted in `PASEO_HOME/config.json`. Refuse a daemon launched with unpersisted, unsupported launch overrides rather than silently changing them.
3. Build the existing `.#paseo` Nix package while the old daemon stays online.
4. Stage the new Nix closure and atomically switch `${XDG_DATA_HOME:-$HOME/.local/share}/paseo/releases/current`. Keep the prior target in `${XDG_DATA_HOME:-$HOME/.local/share}/paseo/releases/previous` as the rollback target.
5. Stop the CLI-managed daemon gracefully and start it through the new closure with the preserved home and endpoint.
6. Poll daemon status/health until the configured deadline.
7. If startup or health verification fails, restore the prior link, restart the prior closure with the same launch settings, and fail with the original error and log path.

A process lock prevents concurrent upgrades. The script must release it on every exit path.

## State and compatibility

The transaction preserves the existing `PASEO_HOME`, including pairing records, host auth material, agents, worktrees, and configuration. Clients disconnect briefly during the restart and automatically reconnect to the existing host; no client must be added again.

The script must not copy files into `/home/joe/.nvm/versions/node/v22.22.2/lib/node_modules`. Nix closures and `${XDG_DATA_HOME:-$HOME/.local/share}/paseo/releases/current` provide an atomic switch and a rollback target.

The script must not rely on `paseo daemon restart` alone, because that command does not preserve every possible launch option. The upgrade implementation reconstructs the new launch command from the inspected listen address and persisted configuration, and refuses unsupported ephemeral overrides.

## Verification

Cover the command through isolated tests around its runner boundary:

- build completes before the old daemon is stopped;
- successful status verification retains the new release link;
- failed startup or health verification restores the prior link and restarts it;
- a desktop-managed daemon is rejected before any release link changes;
- concurrent invocation is rejected by the lock.

Document the command, prerequisites, state-preservation guarantee, and brief reconnect window in the development documentation.
