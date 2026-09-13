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

print("\nModels your key can use. Paste one into GEMINI_MODEL in backend/.env:\n")
for m in usable:
    name = (m.name or "").removeprefix("models/")
    print(f"  {name}")
print(
    "\nA 'flash' model is the fastest and cheapest, and is plenty for this app.\n"
)
