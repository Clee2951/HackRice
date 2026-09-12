import asyncio
from ai.backboard_client import create_assistant_for_user, upload_document, ask


async def main():
    # Step 1: create (or simulate) one assistant for a test user
    user_id = "test-user-1"
    assistant_id = await create_assistant_for_user(user_id)
    print("Created assistant:", assistant_id)

    # Step 2: upload a real PDF from your computer
    # Change this path to point at an actual PDF file you have
    file_path = "test_document.pdf"
    upload_result = await upload_document(assistant_id, file_path)
    print("Upload result:", upload_result)

    # Step 3: ask a question that should now use the uploaded document
    reply = await ask("Based on the document I just uploaded, what is it about?")
    print("AI reply:", reply)


if __name__ == "__main__":
    asyncio.run(main())