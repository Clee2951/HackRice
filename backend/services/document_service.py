from io import BytesIO
from pathlib import Path
from fastapi import HTTPException
from pypdf import PdfReader
from docx import Document
from backend.core.config import settings
from backend.ai import prompts
from backend.schemas.study import ObjectiveSet


def extract_pages(filename, data):
    suffix = Path(filename).suffix.lower()
    if not data or len(data) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Upload must contain data and be at most 10 MB")
    try:
        if suffix == ".pdf":
            if not data.startswith(b"%PDF-"):
                raise ValueError("Invalid PDF")
            reader = PdfReader(BytesIO(data))
            if reader.is_encrypted:
                raise HTTPException(422, "Upload an unencrypted PDF")
            if len(reader.pages) > settings.MAX_PDF_PAGES:
                raise HTTPException(413, "Split the PDF into sections of at most 50 pages")
            pages = [{"page": i + 1, "text": p.extract_text() or ""} for i, p in enumerate(reader.pages)]
            # Reject scans rather than silently generating objectives from incomplete text.
            if any(len(p["text"].strip()) < 20 for p in pages):
                raise HTTPException(422, "Some pages have little extractable text. Use a text PDF or a transcript")
            media = "application/pdf"
        elif suffix in {".txt", ".md"}:
            pages = [{"page": 1, "text": data.decode("utf-8-sig")}]
            media = "text/plain"
        elif suffix == ".docx":
            doc = Document(BytesIO(data))
            full_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            pages = [{"page": 1, "text": full_text}]
            media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        else:
            raise HTTPException(415, "Supported formats: .docx, text-based PDF, UTF-8 .txt, .md")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(422, "Cannot read this file. Export a text PDF or UTF-8 text file")
    chars = sum(len(p["text"]) for p in pages)
    if chars < 40:
        raise HTTPException(422, "Not enough text to study")
    if chars > settings.MAX_DOCUMENT_CHARS:
        raise HTTPException(413, "Split the document into sections under 60,000 characters")
    return pages, media


def check_pages(numbers, pages):
    valid = {p["page"] for p in pages}
    if not set(numbers).issubset(valid):
        raise HTTPException(502, "AI cited an unknown page; please retry")


def build_objectives(pages, ai):
    result = ai.structured(prompts.EXTRACT, {"source": pages}, ObjectiveSet)
    objectives = []
    for index, obj in enumerate(result.objectives, 1):
        check_pages(obj.source_pages, pages)
        objectives.append({"id": f"c{index}", **obj.model_dump()})
    return objectives
