import json
import logging
from functools import lru_cache
from google import genai
from google.genai import types
from fastapi import HTTPException
from pydantic import ValidationError
from backend.ai import prompts
from backend.core.config import settings

logger = logging.getLogger(__name__)

class GeminiClient:
    """Transport only: tutor decisions live in services and prompts."""
    def __init__(self):
        if not settings.GOOGLE_API_KEY or not settings.GEMINI_MODEL:
            raise HTTPException(503, "Set GOOGLE_API_KEY and GEMINI_MODEL in backend/.env")
        self.client = genai.Client(api_key=settings.GOOGLE_API_KEY, http_options=types.HttpOptions(timeout=60000))

    def structured(self, instruction, payload, schema):
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
        except Exception as exc:
            # Never send provider errors (which can include request data) to the browser.
            logger.warning(
    "AI request failed (%s): %s",
    type(exc).__name__,
    str(exc).replace(settings.GOOGLE_API_KEY, "[REDACTED]"),
)
            raise HTTPException(502, "AI request failed. Check the key, model, quota, and connection; then retry")

@lru_cache
def get_ai():
    return GeminiClient()
