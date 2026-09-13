import json
import logging
import time
from functools import lru_cache
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from fastapi import HTTPException
from pydantic import ValidationError
from backend.ai import prompts
from backend.core.config import settings

logger = logging.getLogger(__name__)

# Gemini's free tier limits requests per MINUTE as well as per day, and a
# single study round spends several calls: one to extract objectives on
# upload, two on every recall submission (assess, then write the lesson),
# and one per tutor question. Bursting through a per-minute cap mid-demo is
# easy, and it clears on its own within a minute -- so a short retry turns
# a dead session into a pause. A per-DAY cap does not clear, which is why
# this gives up quickly rather than blocking the request for minutes.
RETRY_DELAYS_SEC = (2, 8)
RETRYABLE_CODES = {429, 500, 502, 503, 504}


def retryable(exc) -> bool:
    """Only transient failures. A bad key or an unknown model never becomes
    valid by asking again, and retrying those just makes the UI hang before
    showing the same error."""
    return isinstance(exc, genai_errors.APIError) and exc.code in RETRYABLE_CODES


def diagnose(exc) -> str:
    """Turn a provider failure into something the operator can act on.

    Uses the error's CODE and STATUS only, never its message body. The body
    can echo the request back -- which here means the student's recall
    answer or the text of their document -- and that must not reach the
    browser. A status code is a classification, not content.

    The previous message named all four possible causes at once ("check the
    key, model, quota, and connection"), which told whoever hit it nothing
    and sent them to the server log to find out which.
    """
    if isinstance(exc, genai_errors.APIError):
        code, status = exc.code, (exc.status or "").upper()
        if code in (401, 403) or status in {"UNAUTHENTICATED", "PERMISSION_DENIED"}:
            return "Gemini rejected the API key. Check GOOGLE_API_KEY in backend/.env."
        if code == 404 or status == "NOT_FOUND":
            return (f"Gemini has no model called '{settings.GEMINI_MODEL}' on this key. "
                    "Run ./scripts/models.sh to list the ones it can use, then set GEMINI_MODEL.")
        if code == 429 or status == "RESOURCE_EXHAUSTED":
            return ("Gemini quota is used up. Wait for it to reset, or use a key with more headroom. "
                    "A 'flash' model has a far higher free-tier limit than a 'pro' one.")
        if code == 400 or status == "INVALID_ARGUMENT":
            return (f"Gemini rejected the request for model '{settings.GEMINI_MODEL}'. "
                    "That model may not support structured JSON output -- "
                    "run ./scripts/models.sh and try a different one.")
        if code and code >= 500:
            return "Gemini had a server error on its end. Wait a moment and retry."
        return f"Gemini returned {code} {status or 'an error'}. See the backend log for detail."
    # Not an API error at all: DNS, TLS, proxy, timeout, or a bug here.
    return ("Could not reach Gemini. Check the machine's internet connection, "
            "then see the backend log (.backend.log) for the exact error.")


class GeminiClient:
    """Transport only: tutor decisions live in services and prompts."""
    def __init__(self):
        if not settings.GOOGLE_API_KEY or not settings.GEMINI_MODEL:
            raise HTTPException(503, "Set GOOGLE_API_KEY and GEMINI_MODEL in backend/.env")
        self.client = genai.Client(api_key=settings.GOOGLE_API_KEY, http_options=types.HttpOptions(timeout=60000))

    def structured(self, instruction, payload, schema):
        for delay in (*RETRY_DELAYS_SEC, None):
            try:
                return self._once(instruction, payload, schema)
            except HTTPException:
                raise
            except Exception as exc:
                if delay is None or not retryable(exc):
                    self._fail(exc)
                logger.warning(
                    "Gemini returned %s; retrying in %ss",
                    getattr(exc, "code", type(exc).__name__), delay,
                )
                time.sleep(delay)

    def _fail(self, exc):
        # The full provider error goes to the log, where it can include
        # request data safely. Only the classification reaches the browser.
        logger.warning(
            "AI request failed (%s): %s",
            type(exc).__name__,
            str(exc).replace(settings.GOOGLE_API_KEY, "[REDACTED]") if settings.GOOGLE_API_KEY else str(exc),
        )
        raise HTTPException(502, diagnose(exc))

    def _once(self, instruction, payload, schema):
        try:
            response = self.client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=json.dumps(payload, ensure_ascii=False),
                config=types.GenerateContentConfig(
                    system_instruction=prompts.BASE + "\n" + instruction,
                    response_mime_type="application/json",
                    response_json_schema=schema.model_json_schema(),
                    temperature=0.2,
                ),
            )
            return schema.model_validate_json(response.text or "")
        except ValidationError:
            raise HTTPException(502, "AI returned an invalid response; retry without changing your submission")

@lru_cache
def get_ai():
    return GeminiClient()
