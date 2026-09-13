"""Print the Gemini models this key can use for text generation.

Reads GOOGLE_API_KEY from backend/.env so there is nothing to export.
"""
import pathlib
import sys


def read_env(path: pathlib.Path) -> dict[str, str]:
    values = {}
    if not path.exists():
        return values
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


env = read_env(pathlib.Path("backend/.env"))
key = env.get("GOOGLE_API_KEY", "")
if not key:
    sys.exit(
        "No GOOGLE_API_KEY in backend/.env yet.\n"
        "Get one at https://aistudio.google.com -> 'Get API key', paste it in, then re-run this."
    )

from google import genai  # noqa: E402  (imported after the key check so a missing key is the first thing reported)

try:
    models = list(genai.Client(api_key=key).models.list())
except Exception as exc:  # noqa: BLE001 -- surface the provider's own wording
    sys.exit(f"Could not reach Google with that key:\n  {type(exc).__name__}: {exc}")

# generateContent is the call backend/ai/gemini_client.py makes; anything
# that doesn't support it would fail at upload time rather than here.
usable = [
    m for m in models
    if "generateContent" in (getattr(m, "supported_actions", None) or [])
]
if not usable:
    sys.exit("That key works, but no models on it support text generation.")

names = [(m.name or "").removeprefix("models/") for m in usable]

print("\nModels your key can use:\n")
configured = env.get("GEMINI_MODEL", "")
for name in names:
    print(f"  {name}{'   <- currently set' if name == configured else ''}")

# Listing a model is not the same as being able to generate with it. The app
# asks for structured JSON output, which some models refuse, and quota is
# only charged on a real call -- so the failures people actually hit
# (wrong model, exhausted quota, no JSON support) are invisible to a list.
# Make the real request instead of implying the config is fine.
print()
if not configured:
    print("GEMINI_MODEL is not set yet. Paste one of the above into backend/.env.")
    print("A 'flash' model is fastest and has the most generous free-tier limit.\n")
    raise SystemExit(0)

if configured not in names:
    raise SystemExit(
        f"GEMINI_MODEL is set to '{configured}', which your key cannot use.\n"
        "Replace it in backend/.env with one of the models listed above."
    )

print(f"Testing '{configured}' with a real request...")
from pydantic import BaseModel  # noqa: E402


class Probe(BaseModel):
    ok: bool


try:
    from google.genai import types

    reply = genai.Client(api_key=key).models.generate_content(
        model=configured,
        contents='Reply with {"ok": true}',
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_json_schema=Probe.model_json_schema(),
        ),
    )
    Probe.model_validate_json(reply.text or "")
except Exception as exc:  # noqa: BLE001
    import sys as _sys

    _sys.path.insert(0, ".")
    from backend.ai.gemini_client import diagnose

    raise SystemExit(f"\n  FAILED: {diagnose(exc)}\n\n  (raw: {type(exc).__name__}: {str(exc)[:200]})")

print("\n  Works. The app's AI features are ready.\n")
