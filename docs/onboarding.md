# Onboarding onto the fork

How a teammate gets a fork-built daemon running on their dev box, reaches it from a
phone or browser, and builds the desktop app on their own Mac.

## Where each piece comes from

| Piece                | Source                                   |
| -------------------- | ---------------------------------------- |
| Daemon + CLI         | Built from this fork on your dev box     |
| Browser web UI       | Served by that daemon                    |
| iOS / Android app    | Upstream App Store / Play build          |
| Desktop app          | Built from this fork on your own machine |
| Relay                | Upstream default endpoint, unchanged     |

This fork publishes no releases, so `paseo.sh/download` and `npm i -g @getpaseo/cli`
only ever give you upstream code. Install neither on the box that runs your daemon:
`upgrade-local` accepts only a daemon it started itself (`manager=cli`), so an
upstream-installed daemon has to be stopped and re-bootstrapped before it can take
fork changes.

Upstream client apps are fine and expected. The protocol stays backward compatible
(see [protocol-compatibility.md](protocol-compatibility.md)), so an upstream app pairs
with a fork daemon normally. It just won't carry fork-only app changes — the browser
web UI is the client that does.

## Bootstrap the daemon

You need Nix (the upgrade refuses to install it), Node from `.tool-versions`, and a
clean checkout on exactly `internal/main`:

```bash
git clone https://github.com/ZGEnergy/paseo
cd paseo
git checkout internal/main
```

Run the bootstrap from a host shell — SSH or tmux, not a Paseo agent or workspace
terminal, which die with the daemon. Stop any daemon already running against this
`$PASEO_HOME` first; bootstrap refuses while one is live.

```bash
npm run upgrade:local -- --bootstrap \
  --listen 127.0.0.1:6767 \
  --relay true --relay-use-tls true \
  --mcp true --inject-mcp false --web-ui true \
  --hostnames false
```

Every launch value is explicit — bootstrap infers nothing from the environment or from
a previous process. `--relay true` is what lets phones and laptops reach the box;
prefer `--relay false` with a `--hostnames` allowlist if you reach it over Tailscale or
another VPN instead. Put `${XDG_BIN_HOME:-~/.local/bin}` first on `PATH` so the
launcher this installs is the `paseo` you get.

Existing `$PASEO_HOME` state survives — pairing, agents, worktrees, and config are
untouched.

Upgrades after that are a pull and one command, with no flags:

```bash
git pull
npm run upgrade:local
```

[development.md](development.md#local-daemon-upgrades) covers what the transaction
does: staged closures, activation links, the rollback window, and the systemd case.

## Connect a client

**Phone or laptop app:** Settings → your host → Pair Device.

**Browser:** the daemon serves the web app from its own address, so with a loopback
listen you want a tunnel:

```bash
ssh -L 6767:127.0.0.1:6767 <box>
```

Then open `http://localhost:6767/`. [public-docs/web-ui.md](../public-docs/web-ui.md)
covers exposing it properly behind a reverse proxy or TLS.

## Build the desktop app on your Mac

Build it from a fork checkout. Don't install the download from `paseo.sh`: the fork
disables desktop auto-update precisely because `electron-builder.yml` still names
upstream as its publish target, so a packaged fork build would otherwise replace
itself with an upstream one. See
[fork-governance.md](fork-governance.md#release-and-relay-isolation).

```bash
npm ci
npm run build:desktop
```

Artifacts land in `packages/desktop/release/`. The build is ad-hoc signed: it runs on
the machine that produced it and is not distributable. Clear the quarantine attribute
after installing:

```bash
xattr -dr com.apple.quarantine /Applications/Paseo.app
```

[development.md](development.md#building-the-desktop-app-locally) explains the signing
and hardened-runtime behavior, including the launch crash you get from re-signing an
ad-hoc bundle in place.

The packaged app manages its own daemon on that Mac, separate from your dev box.
Add the dev box as a host and work there; the local one is just what the app starts.
