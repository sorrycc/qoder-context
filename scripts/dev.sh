#!/usr/bin/env bash
# Builds the plugin and starts a Qoder that loads it from this repo through
# QODER_APP_PLUGIN_DEV_DIRS, so ~/.qoder/app/dev-extensions stays untouched.
# By default that's the dev Desktop from a Qoder checkout (under Node 22, as
# its engines pin); --packaged starts /Applications/Qoder.app instead.
# Usage: scripts/dev.sh [--packaged] [--cdp [port]]
#   --cdp opens the Chrome DevTools Protocol on port (default 9333).
# QODER_DIR picks the Qoder checkout (default: ~/Projects/qoder).
# QODER_APP picks the packaged app (default: /Applications/Qoder.app).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QODER_DIR="${QODER_DIR:-$HOME/Projects/qoder}"
QODER_APP="${QODER_APP:-/Applications/Qoder.app}"

packaged=false
cdp_port=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --packaged) packaged=true ;;
    --cdp)
      cdp_port=9333
      if [[ "${2:-}" =~ ^[0-9]+$ ]]; then cdp_port="$2"; shift; fi
      ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

echo "==> build"
cd "$ROOT"
npm run build --silent

export QODER_APP_PLUGIN_DEV_DIRS="$ROOT"

if $packaged; then
  if pgrep -f "$QODER_APP/Contents/MacOS/" >/dev/null; then
    echo "Qoder is already running; quit it first so this one loads the plugin." >&2
    exit 1
  fi
  export QODER_APP_PLUGIN_ALLOW_UNVERIFIED=true
  args=()
  [[ -n "$cdp_port" ]] && args+=("--remote-debugging-port=$cdp_port")
  echo "==> $QODER_APP (plugin from $ROOT)"
  exec "$QODER_APP/Contents/MacOS/Qoder" ${args[@]+"${args[@]}"}
fi

if [[ ! -d "$QODER_DIR" ]]; then
  echo "No Qoder checkout at $QODER_DIR (set QODER_DIR, or pass --packaged)." >&2
  exit 1
fi

# The checkout pins Node 22; the default Node here may be newer.
n22=()
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != 22 ]]; then
  if command -v volta >/dev/null; then
    n22=(volta run --node 22)
  else
    echo "Qoder needs Node 22; found $(node -v)." >&2
    exit 1
  fi
fi

if pgrep -f "$QODER_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" >/dev/null; then
  echo "A dev Qoder from $QODER_DIR is already running; quit it first so this one loads the plugin." >&2
  exit 1
fi

cd "$QODER_DIR"
if [[ ! -d node_modules ]]; then
  echo "==> npm ci in $QODER_DIR"
  ${n22[@]+"${n22[@]}"} npm ci
fi

if [[ -n "$cdp_port" ]]; then
  echo "==> dev Desktop with CDP on $cdp_port (plugin from $ROOT)"
  exec ${n22[@]+"${n22[@]}"} npm run dev -w @qoder-space/desktop -- -- "--remote-debugging-port=$cdp_port"
fi

echo "==> dev Desktop (plugin from $ROOT)"
exec ${n22[@]+"${n22[@]}"} npm run dev
