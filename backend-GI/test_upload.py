import asyncio
from ai.backboard_client import create_assistant_for_user, upload_document, ask_for_related_topics


async def main():
    # Step 1: create one assistant for a test user
    user_id = "test-user-1"
    assistant_id = await create_assistant_for_user(user_id)
    print("Created assistant:", assistant_id)

    # Step 2: upload a real PDF
    file_path = "test_document.pdf"
    upload_result = await upload_document(assistant_id, file_path)
    print("Upload result:", upload_result)

    # Give Backboard a moment to finish processing/indexing the document
    print("Waiting for document processing...")
    await asyncio.sleep(10)

    # Step 3: ask a question scoped to THIS assistant (uses the uploaded doc)
    reply = await ask_for_related_topics(
        assistant_id,
        "Based on the document I just uploaded, what is it about?"
    )
    print("AI reply:", reply)


if __name__ == "__main__":
    asyncio.run(main())