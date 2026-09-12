import os
from pathlib import Path
from dotenv import load_dotenv
from backboard import BackboardClient as BackboardSDK

# Explicitly point to backend/.env, regardless of where this script is run from
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

API_KEY = os.environ.get("BACKBOARD_API_KEY")

if not API_KEY:
    raise ValueError(
        f"BACKBOARD_API_KEY not found. Looked for .env at: {env_path}. "
        "Make sure backend/.env exists and contains a line like: "
        "BACKBOARD_API_KEY=your_key_here"
    )

client = BackboardSDK(api_key=API_KEY)


def ask(prompt: str) -> str:
    """Simple standalone test function: sends a message, returns the reply."""
    import asyncio
    return asyncio.run(_ask_async(prompt))


async def _ask_async(prompt: str) -> str:
    response = await client.send_message(prompt, stream=False)
    return response


async def create_assistant_for_user(user_id: str):
    """
    Creates one dedicated Backboard assistant for a given user.
    Everything this user uploads or discusses will be remembered
    under this one assistant_id going forward.
    """
    assistant = await client.create_assistant(
        name=f"user-{user_id}-research-assistant",
        system_prompt=(
            "You are a hyper-focused research assistant. Pay close "
            "attention to the documents this user uploads, and use them "
            "to keep every response tightly relevant to their research topic."
        ),
    )
    return assistant.assistant_id


async def upload_document(assistant_id: str, file_path: str):
    """
    Uploads a document (e.g. a research PDF) to a specific user's assistant.
    Scoped at the assistant level, so it's remembered across every future
    conversation with this user, not just the current session.
    """
    result = await client.upload_document_to_assistant(
        assistant_id,
        file_path,
    )
    return result


async def ask_for_related_topics(assistant_id: str, user_message: str):
    """
    Sends a message scoped to a specific user's assistant, using their
    uploaded documents and memory to generate a tightly relevant response.
    """
    response = await client.send_message(
        user_message,
        assistant_id=assistant_id,
        memory="Auto",
        stream=False,
    )
    return response