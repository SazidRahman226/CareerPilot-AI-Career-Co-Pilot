"""
CareerPilot — Vector Store Service
=====================================
ChromaDB wrapper for embedding, storing, and retrieving CV chunks.
Uses sentence-transformers for local, free embeddings.

This is the retrieval layer of the RAG pipeline.
"""

import chromadb
from chromadb.utils import embedding_functions
from app.config import settings
import logging

logger = logging.getLogger(__name__)

# ============================
#  Global Vector Store State
# ============================
# We use module-level state so the vector store is shared across requests.

from typing import Any
_client: Any = None
_collection: Any = None
_embedding_fn = None
_cv_metadata: dict = {}  # Track upload status


def initialize():
    """
    Initialize the ChromaDB client and collection.
    Uses sentence-transformers for local embeddings (no API key needed).
    Called once on application startup.
    """
    global _client, _collection, _embedding_fn

    logger.info(f"Initializing ChromaDB at: {settings.CHROMA_PERSIST_DIR}")

    # Create embedding function using sentence-transformers
    _embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=settings.EMBEDDING_MODEL
    )

    # Create persistent ChromaDB client
    _client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)

    # Get or create the CV collection
    _collection = _client.get_or_create_collection(
        name="cv_collection",
        embedding_function=_embedding_fn,
        metadata={"hnsw:space": "cosine"}  # Use cosine similarity
    )

    # Check if there are existing documents (from a previous session)
    count = _collection.count()
    if count > 0:
        logger.info(f"Loaded existing CV collection with {count} chunks")
        _cv_metadata["uploaded"] = True
        _cv_metadata["chunk_count"] = count

    logger.info("ChromaDB initialized successfully")


def add_documents(chunks: list[dict], filename: str = "", sections: list[str] = []):
    """
    Embed and store CV chunks in ChromaDB.

    Args:
        chunks: List of {text: str, metadata: {section, chunk_index, source}}
        filename: Original filename for tracking
        sections: Detected sections for status tracking
    """
    global _cv_metadata

    if not _collection:
        raise RuntimeError("Vector store not initialized. Call initialize() first.")

    # Prepare data for ChromaDB
    documents = [chunk["text"] for chunk in chunks]
    metadatas = [chunk["metadata"] for chunk in chunks]
    ids = [f"cv_chunk_{i}" for i in range(len(chunks))]

    # Add to collection (ChromaDB handles embedding automatically)
    _collection.add(
        documents=documents,
        metadatas=metadatas,
        ids=ids,
    )

    # Update tracking metadata
    _cv_metadata = {
        "uploaded": True,
        "filename": filename,
        "chunk_count": len(chunks),
        "sections_detected": sections,
    }

    logger.info(f"Added {len(chunks)} chunks to vector store from '{filename}'")


def query(text: str, n_results: int = 5) -> list[dict]:
    """
    Query the vector store for chunks most relevant to the given text.
    Uses cosine similarity on the embedded representations.

    Args:
        text: The query text (e.g., user question or job description)
        n_results: Number of results to return

    Returns:
        List of {text, metadata, distance} dicts, sorted by relevance
    """
    if not _collection:
        raise RuntimeError("Vector store not initialized.")

    if _collection.count() == 0:
        return []

    # Clamp n_results to actual collection size
    actual_n = min(n_results, _collection.count())

    results = _collection.query(
        query_texts=[text],
        n_results=actual_n,
        include=["documents", "metadatas", "distances"],
    )

    # Format results into a clean list
    formatted = []
    if results and results["documents"] and results["documents"][0]:
        for i in range(len(results["documents"][0])):
            formatted.append({
                "text": results["documents"][0][i],
                "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                "distance": results["distances"][0][i] if results["distances"] else 0,
            })

    return formatted


def get_full_text() -> str:
    """
    Retrieve all stored CV text. Used for comprehensive analysis
    like fit score computation where we need the full context.
    """
    if not _collection or _collection.count() == 0:
        return ""

    all_docs = _collection.get(include=["documents", "metadatas"])

    if not all_docs or not all_docs["documents"]:
        return ""

    # Sort by chunk_index to maintain order
    paired = list(zip(all_docs["documents"], all_docs["metadatas"] or [{}] * len(all_docs["documents"])))
    paired.sort(key=lambda x: x[1].get("chunk_index", 0))

    return "\n\n".join(doc for doc, _ in paired)


def get_status() -> dict:
    """Return current upload status and metadata."""
    return {
        "uploaded": _cv_metadata.get("uploaded", False),
        "filename": _cv_metadata.get("filename", ""),
        "chunk_count": _cv_metadata.get("chunk_count", 0),
        "sections_detected": _cv_metadata.get("sections_detected", []),
    }


def clear():
    """
    Clear all documents from the vector store.
    Used when the user wants to re-upload their CV.
    """
    global _cv_metadata, _collection

    if not _client or not _collection:
        return

    # Delete and recreate the collection
    _client.delete_collection("cv_collection")
    _collection = _client.get_or_create_collection(
        name="cv_collection",
        embedding_function=_embedding_fn,
        metadata={"hnsw:space": "cosine"},
    )

    _cv_metadata = {}
    logger.info("Vector store cleared")


def is_cv_uploaded() -> bool:
    """Quick check if a CV has been uploaded."""
    return _cv_metadata.get("uploaded", False)
