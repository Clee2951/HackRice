#!/usr/bin/env bash
#
# One-time setup for running Facedown on your own machine.
#
# Installs everything, generates the signing secret, and creates
# backend/.env for you. The only thing you fill in by hand afterwards is a
# Gemini API key -- scripts/start.sh tells you if it's missing.
#
#   ./scripts/setup.sh                 # everything except the camera
#   ./scripts/setup.sh --with-camera   # also install the SmartSpectra SDK
#
# The camera is opt-in because its native runtime is roughly 390 MB and
# nothing else needs it. The app runs fine without it and reports the
# camera as unavailable.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

WITH_CAMERA=false
[[ "${1:-}" == "--with-camera" ]] && WITH_CAMERA=true

bold() { printf "\n\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; }
die()  { printf "\n\033[31m✗ %s\033[0m\n\n" "$1" >&2; exit 1; }

# --- Prerequisites ---------------------------------------------------------
bold "Checking what's installed"

command -v python3 >/dev/null || die "python3 not found. Install it from python.org, then re-run this."
command -v node    >/dev/null || die "node not found. Install Node.js 20+ from nodejs.org, then re-run this."

PY_OK=$(python3 -c 'import sys; print(1 if sys.version_info >= (3,10) else 0)')
[[ "$PY_OK" == "1" ]] || die "Python $(python3 -V | cut -d' ' -f2) is too old. This needs 3.10 or newer."
ok "python3 $(python3 -V | cut -d' ' -f2)"

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
(( NODE_MAJOR >= 20 )) || die "Node $(node -v) is too old. This needs 20 or newer."
ok "node $(node -v)"

# --- Python ----------------------------------------------------------------
bold "Installing the backend"

if [[ ! -x .venv/bin/python ]]; then
  # A .venv directory can exist and still be unusable -- one built on
  # another machine has that machine's absolute paths baked into it.
  [[ -d .venv ]] && { warn "existing .venv can't run; rebuilding it"; rm -rf .venv; }
  python3 -m venv .venv
fi
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r backend/requirements.txt
ok "backend dependencies installed"

# --- Configuration ---------------------------------------------------------
bold "Setting up configuration"

if [[ -f backend/.env ]]; then
  ok "backend/.env already exists, leaving it alone"
else
  SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  cat > backend/.env <<EOF
# Signs your login tokens. Generated for you -- no need to change it.
SECRET_KEY=$SECRET

# ---- FILL THESE TWO IN ----------------------------------------------------
# Get a key at https://aistudio.google.com  ->  "Get API key"
GOOGLE_API_KEY=
# Then run  ./scripts/models.sh  to list the models your key can use,
# and paste one of them here.
GEMINI_MODEL=
# ---------------------------------------------------------------------------

# Everything below is optional. Left blank, the app stores uploaded
# documents in a local database file and works exactly the same.
EOF
  ok "created backend/.env with a generated SECRET_KEY"
fi

# --- JavaScript ------------------------------------------------------------
bold "Installing the interface"
npm --prefix frontend/casino_theme install --silent
ok "UI dependencies installed"

npm --prefix frontend install --silent
ok "desktop shell installed"

if $WITH_CAMERA; then
  bold "Installing the camera SDK (this one is large)"
  npm --prefix presage install --silent
  ok "SmartSpectra installed"
  if [[ ! -f .env ]]; then
    echo "SMARTSPECTRA_API_KEY=" > .env
    warn "add your key to .env -- get one at https://physiology.presagetech.com"
  fi
fi

# --- Build -----------------------------------------------------------------
bold "Building the interface"
# Quiet unless it fails -- the build prints a page of routing tables that
# looks alarming and means nothing to someone just trying to run the app.
if ! npm --prefix frontend run build:ui --silent > .build.log 2>&1; then
  tail -30 .build.log
  die "The interface failed to build. Output above."
fi
rm -f .build.log
ok "UI built"

# --- What's left -----------------------------------------------------------
bold "Almost there"

if grep -q '^GOOGLE_API_KEY=$' backend/.env 2>/dev/null; then
  cat <<EOF

  One thing left. Open this file:

      $ROOT/backend/.env

  Paste your Gemini key after GOOGLE_API_KEY= , save, then run:

      ./scripts/models.sh     # lists the models your key can use
      ./scripts/start.sh      # starts everything

EOF
else
  cat <<EOF

  Everything's ready. Start it with:

      ./scripts/start.sh

EOF
fi
