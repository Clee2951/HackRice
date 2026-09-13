#!/usr/bin/env bash
# Lists the Gemini models your API key can actually use.
#
# Exists because GEMINI_MODEL is the one value in backend/.env that can't
# be guessed or generated: which models a key can reach depends on the key,
# and a wrong name fails at upload time with a generic 502 rather than
# anything that points at the real problem.
set -euo pipefail
cd "$(dirname "$0")/.."
exec .venv/bin/python scripts/models.py "$@"
