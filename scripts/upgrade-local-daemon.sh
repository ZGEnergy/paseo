#!/usr/bin/env bash
set -euo pipefail

agent_id=${PASEO_AGENT_ID-}
workspace_id=${PASEO_WORKSPACE_ID-}
if [[ -n "${agent_id//[[:space:]]}" || -n "${workspace_id//[[:space:]]}" ]]; then
  echo "upgrade must run from a host shell, not a Paseo agent or workspace terminal" >&2
  exit 1
fi

checkout=${PASEO_SOURCE_CHECKOUT_PATH:-$(git rev-parse --show-toplevel)}
if [[ "$(git -C "$checkout" branch --show-current)" != "internal/main" ]]; then
  echo "upgrade requires a checkout on internal/main" >&2
  exit 1
fi
if [[ -n "$(git -C "$checkout" status --porcelain)" ]]; then
  echo "upgrade requires a clean internal/main checkout" >&2
  exit 1
fi
if ! command -v nix >/dev/null 2>&1; then
  echo "upgrade requires Nix; refusing to install it" >&2
  exit 1
fi

revision=$(git -C "$checkout" rev-parse HEAD)
stage_dir=$(mktemp -d "${TMPDIR:-/tmp}/paseo-upgrade.XXXXXX")
cleanup() {
  rm -rf "$stage_dir"
}
trap cleanup EXIT

closure_root=$(nix build "$checkout#paseo" --no-link --print-out-paths | awk 'NF { value=$NF } END { print value }')
if [[ -z "$closure_root" || "$closure_root" != /* || ! -x "$closure_root/bin/paseo" ]]; then
  echo "Nix build did not produce an executable Paseo closure" >&2
  exit 1
fi

subcommand=upgrade-local
if [[ "${1:-}" == "--bootstrap" ]]; then
  subcommand=bootstrap-upgrade
  shift
fi

PASEO_SOURCE_REVISION="$revision" \
PASEO_CLOSURE_ROOT="$closure_root" \
"$closure_root/bin/paseo" daemon "$subcommand" \
  --checkout "$checkout" \
  --revision "$revision" \
  --staged-root "$closure_root" \
  "$@"

launcher_dir=${XDG_BIN_HOME:-${HOME:?HOME is required}/.local/bin}
first_path=${PATH%%:*}
if [[ "$first_path" != "$launcher_dir" ]]; then
  echo "warning: $launcher_dir is not first on PATH; stable paseo launcher may not be selected" >&2
fi
