#!/usr/bin/env bash
#
# Starts everything: the backend, then the desktop app.
#
# One command rather than two terminals. The backend runs in the
# background and is shut down again when the app closes, so there's no
# stray server left listening on port 8000 afterwards.
#
# Rebuilds the interface first, because the app serves the BUILT copy in
# frontend/casino_theme/out -- not your source files. Editing a component
# and seeing no change is otherwise the most confusing failure in this
# repo, since nothing errors: you just get the previous build.
#
#   ./scripts/start.sh              # normal: locked down from launch
#   ./scripts/start.sh --no-kiosk   # never lock down (useful while poking at it)
#   ./scripts/start.sh --no-build   # skip the rebuild (a few seconds faster)

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
LOG="$ROOT/.backend.log"

bold() { printf "\n\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
die()  { printf "\n\033[31m✗ %s\033[0m\n\n" "$1" >&2; exit 1; }

# --- Preflight -------------------------------------------------------------
[[ -x .venv/bin/python ]] || die "Backend isn't set up yet. Run ./scripts/setup.sh first."
[[ -f backend/.env     ]] || die "backend/.env is missing. Run ./scripts/setup.sh first."

# Strip our own flags before they reach Electron, which doesn't know them.
ELECTRON_ARGS=()
SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --no-build) SKIP_BUILD=true ;;
    *) ELECTRON_ARGS+=("$arg") ;;
  esac
done

if grep -q '^GOOGLE_API_KEY=$' backend/.env; then
  die "No Gemini key yet.

  Open  $ROOT/backend/.env
  Paste your key after GOOGLE_API_KEY=  (get one at https://aistudio.google.com)
  Then run  ./scripts/models.sh  to pick a GEMINI_MODEL."
fi

if grep -q '^GEMINI_MODEL=$' backend/.env; then
  die "No Gemini model chosen yet.

  Run  ./scripts/models.sh  to list the ones your key can use,
  then paste one after GEMINI_MODEL= in $ROOT/backend/.env"
fi

# Port 8000 being busy is usually a backend left over from a previous run.
# Saying so beats a confusing bind error from uvicorn.
if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  die "Something is already listening on port 8000.

  If it's an old copy of this backend:  pkill -f 'uvicorn backend.main'"
fi

# --- Interface -------------------------------------------------------------
# The app serves frontend/casino_theme/out, so a source edit is invisible
# until this runs. Rebuilding every launch costs a few seconds and removes
# a whole category of "why isn't my change showing up".
if $SKIP_BUILD; then
  [[ -d frontend/casino_theme/out ]] || die "No UI build to skip to. Run without --no-build."
  ok "using the existing interface build"
else
  bold "Building the interface"
  if ! npm --prefix frontend run build:ui --silent > .build.log 2>&1; then
    tail -30 .build.log
    die "The interface failed to build. Output above."
  fi
  rm -f .build.log
  ok "interface up to date"
fi

# --- Backend ---------------------------------------------------------------
bold "Starting the backend"
.venv/bin/python -m uvicorn backend.main:app --port 8000 > "$LOG" 2>&1 &
BACKEND_PID=$!

# Always take the backend down with the app, however this script exits.
cleanup() {
  if kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  printf "\n  backend stopped\n\n"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -sf -m 2 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    ok "backend running on http://127.0.0.1:8000"
    break
  fi
  # If it died on startup, show why rather than timing out silently.
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    printf "\n--- backend log ---\n"; tail -20 "$LOG"; printf -- "-------------------\n"
    die "The backend stopped while starting up. The log above says why."
  fi
  sleep 0.5
done

curl -sf -m 2 http://127.0.0.1:8000/api/health >/dev/null 2>&1 \
  || { tail -20 "$LOG"; die "Backend didn't come up in 20s. Log above."; }

# --- Desktop app -----------------------------------------------------------
bold "Opening Facedown"
printf "  Close the app window to stop everything.\n"
printf "  Stuck in lockdown? Press Cmd/Ctrl + Option/Alt + Shift + X.\n\n"

npm --prefix frontend start --silent -- "${ELECTRON_ARGS[@]+"${ELECTRON_ARGS[@]}"}"
