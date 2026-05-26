"""
CareerPilot — CV Processor Service
=====================================
Handles PDF/DOCX parsing, intelligent semantic chunking, and text extraction.
This is the first step in the RAG pipeline: raw document → structured chunks.

Flow: Upload File → Extract Text → Detect Sections → Chunk → Return
"""

import re
from pathlib import Path
from pypdf import PdfReader
from docx import Document as DocxDocument
from langchain.text_splitter import RecursiveCharacterTextSplitter


# ============================
#  Section Detection Patterns
# ============================
# These regex patterns detect common CV section headers.
# Order matters — we try to categorize each section.

SECTION_PATTERNS = {
    "summary": r"(?i)(summary|objective|about\s*me|profile|personal\s*statement)",
    "experience": r"(?i)(experience|work\s*history|employment|professional\s*experience|work\s*experience)",
    "education": r"(?i)(education|academic|qualification|degree|university|school)",
    "skills": r"(?i)(skills|technical\s*skills|core\s*competenc|technologies|tools|proficienc)",
    "projects": r"(?i)(projects|portfolio|personal\s*projects|academic\s*projects)",
    "certifications": r"(?i)(certifications?|licenses?|accreditations?|courses?|training)",
    "awards": r"(?i)(awards?|honors?|achievements?|recognition)",
    "publications": r"(?i)(publications?|papers?|research)",
    "languages": r"(?i)(languages?|linguistic)",
    "references": r"(?i)(references?|referees?)",
    "contact": r"(?i)(contact|email|phone|address|linkedin|github)",
}


def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract all text from a PDF file.
    Uses pypdf to read each page and concatenate text.
    """
    reader = PdfReader(file_path)
    text_parts = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text_parts.append(page_text.strip())
    return "\n\n".join(text_parts)


def extract_text_from_docx(file_path: str) -> str:
    """
    Extract all text from a DOCX file.
    Reads paragraphs and table cells.
    """
    doc = DocxDocument(file_path)
    text_parts = []

    # Extract paragraphs
    for para in doc.paragraphs:
        if para.text.strip():
            text_parts.append(para.text.strip())

    # Extract table content
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
            if row_text:
                text_parts.append(row_text)

    return "\n".join(text_parts)


def extract_text(file_path: str) -> str:
    """
    Route to the correct parser based on file extension.
    Supports PDF and DOCX formats.
    """
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext in (".docx", ".doc"):
        return extract_text_from_docx(file_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}. Please upload a PDF or DOCX file.")


def detect_section(text: str) -> str:
    """
    Determine which CV section a chunk of text belongs to.
    Returns the section name or 'general' if no pattern matches.
    """
    # Check first 2 lines for section headers
    first_lines = "\n".join(text.strip().split("\n")[:2])
    for section_name, pattern in SECTION_PATTERNS.items():
        if re.search(pattern, first_lines):
            return section_name
    return "general"


def detect_all_sections(full_text: str) -> list[str]:
    """
    Scan the full CV text and return a list of all detected sections.
    Useful for showing the user which parts of their CV were recognized.
    """
    found_sections = []
    for section_name, pattern in SECTION_PATTERNS.items():
        if re.search(pattern, full_text):
            found_sections.append(section_name)
    return found_sections


def chunk_cv_text(full_text: str) -> list[dict]:
    """
    Split CV text into semantically meaningful chunks with metadata.

    Strategy:
    1. First, try to split by section headers (large semantic blocks).
    2. Then, use RecursiveCharacterTextSplitter on each block for size limits.
    3. Tag each chunk with section metadata.

    Returns a list of dicts: {text, metadata: {section, chunk_index, source}}
    """
    # --- Step 1: Split by section headers ---
    # Find lines that look like section headers
    lines = full_text.split("\n")
    sections = []
    current_section = {"name": "general", "lines": []}

    for line in lines:
        stripped = line.strip()
        if not stripped:
            current_section["lines"].append(line)
            continue

        # Check if this line is a section header
        detected = None
        for section_name, pattern in SECTION_PATTERNS.items():
            if re.search(pattern, stripped) and len(stripped) < 80:
                detected = section_name
                break

        if detected and current_section["lines"]:
            # Save current section and start new one
            sections.append(current_section)
            current_section = {"name": detected, "lines": [line]}
        else:
            current_section["lines"].append(line)

    # Don't forget the last section
    if current_section["lines"]:
        sections.append(current_section)

    # --- Step 2: Chunk each section ---
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
        separators=["\n\n", "\n", ". ", " ", ""],
        length_function=len,
    )

    chunks = []
    chunk_index = 0

    for section in sections:
        section_text = "\n".join(section["lines"]).strip()
        if not section_text:
            continue

        # Split the section text into smaller chunks
        sub_chunks = text_splitter.split_text(section_text)

        for sub_chunk in sub_chunks:
            if sub_chunk.strip():
                chunks.append({
                    "text": sub_chunk.strip(),
                    "metadata": {
                        "section": section["name"],
                        "chunk_index": chunk_index,
                        "source": "cv",
                    }
                })
                chunk_index += 1

    return chunks


def process_cv(file_path: str) -> dict:
    """
    Full CV processing pipeline:
    1. Extract raw text from PDF/DOCX
    2. Detect sections present in the CV
    3. Chunk text with metadata

    Returns: {
        full_text: str,
        sections_detected: list[str],
        chunks: list[{text, metadata}]
    }
    """
    # Extract raw text
    full_text = extract_text(file_path)

    if not full_text.strip():
        raise ValueError("Could not extract any text from the uploaded file. Please check the file format.")

    # Detect sections
    sections_detected = detect_all_sections(full_text)

    # Chunk with metadata
    chunks = chunk_cv_text(full_text)

    return {
        "full_text": full_text,
        "sections_detected": sections_detected,
        "chunks": chunks,
    }
