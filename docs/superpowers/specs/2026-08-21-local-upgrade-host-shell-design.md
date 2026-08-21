# Local upgrade host-shell refuse

## Goal

Refuse `upgrade:local` and `bootstrap-upgrade` when they run inside a Paseo agent or workspace terminal. Stopping the daemon kills that process tree and can leave production with nothing listening.

## Scope

In:

- `scripts/upgrade-local-daemon.sh` refuses before Nix or any daemon stop
- `paseo daemon upgrade-local` and `paseo daemon bootstrap-upgrade` refuse the same way
- One short rule in `docs/development.md` under Local daemon upgrades

Out:

- Nix PATH discovery, flakes flags, inherited provider PATH, systemd unit rewrite
- Detecting process ancestry of the target daemon PID

Those stayed out after the 2026-08-21 production bootstrap. They still bite operators; they are not this change.

## Detection

Refuse when either env var is set and non-empty after trim:

- `PASEO_AGENT_ID` — injected into managed agents
- `PASEO_WORKSPACE_ID` — injected into workspace terminals

A host SSH or tmux shell does not set these. Unset both, proceed.

## Behavior

Print exactly this line to stderr and exit 1:

```
upgrade must run from a host shell, not a Paseo agent or workspace terminal
```

Do not inspect lifecycle, stop a daemon, or start Nix after that.

## Tests

- Script source lists the env check before `nix build`
- CLI unit tests: each of the two env vars set → throw that message before inspect/stop; both unset → no refuse from this guard

## Observed gaps not in this change

From the first production bootstrap on lightning:

- `command -v nix` fails when Nix lives only under `/nix/var/nix/profiles/default/bin`
- `nix build .#paseo` needs `nix-command` and `flakes`
- Bootstrap inherits the caller's PATH; a minimal systemd PATH drops `~/.local/bin` and Claude goes missing
- An enabled user systemd unit still pointed at npm 0.4.0 will come back on reboot unless the operator updates or disables it
