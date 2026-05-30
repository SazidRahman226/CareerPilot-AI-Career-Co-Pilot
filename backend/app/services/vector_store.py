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
import json
import os

logger = logging.getLogger(__name__)

# ============================
#  Global Vector Store State
# ============================
# We use module-level state so the vector store is shared across requests.

from typing import Any
_client: Any = None
_collection: Any = None
_embedding_fn = None
_cv_metadata: dict = {}  # Track upload status per user
_metadata_file: str = ""


def _load_metadata():
    """Load CV metadata from disk if it exists."""
    global _cv_metadata, _metadata_file
    if os.path.exists(_metadata_file):
        try:
            with open(_metadata_file, 'r') as f:
                _cv_metadata = json.load(f)
            logger.info(f"Loaded CV metadata for {len(_cv_metadata)} users from disk")
        except Exception as e:
            logger.warning(f"Failed to load CV metadata: {e}")
            _cv_metadata = {}


def _save_metadata():
    """Persist CV metadata to disk."""
    global _cv_metadata, _metadata_file
    try:
        with open(_metadata_file, 'w') as f:
            json.dump(_cv_metadata, f)
    except Exception as e:
        logger.warning(f"Failed to save CV metadata: {e}")


def _get_user_collection(user_id: int):
    """Get or create a user-specific ChromaDB collection."""
    if not _client:
        raise RuntimeError("Vector store not initialized.")
    
    collection_name = f"cv_collection_user_{user_id}"
    
    # Check if collection exists first
    try:
        existing = _client.get_collection(collection_name)
        return existing
    except Exception:
        # Collection doesn't exist, create it
        pass
    
    collection = _client.get_or_create_collection(
        name=collection_name,
        embedding_function=_embedding_fn,
        metadata={"hnsw:space": "cosine"}
    )
    return collection


def initialize():
    """
    Initialize the ChromaDB client and collection.
    Uses sentence-transformers for local embeddings (no API key needed).
    Called once on application startup.
    """
    global _client, _collection, _embedding_fn, _metadata_file

    logger.info(f"Initializing ChromaDB at: {settings.CHROMA_PERSIST_DIR}")

    # Create embedding function using sentence-transformers
    _embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=settings.EMBEDDING_MODEL
    )

    # Create persistent ChromaDB client
    _client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)

    # Set up metadata persistence
    _metadata_file = os.path.join(settings.CHROMA_PERSIST_DIR, "cv_metadata.json")
    _load_metadata()

    logger.info("ChromaDB initialized successfully")


def add_documents(user_id: int, chunks: list[dict], filename: str = "", sections: list[str] = []):
    """
    Embed and store CV chunks in ChromaDB for a specific user.

    Args:
        user_id: The user's ID for user-specific storage
        chunks: List of {text: str, metadata: {section, chunk_index, source}}
        filename: Original filename for tracking
        sections: Detected sections for status tracking
    """
    global _cv_metadata

    collection = _get_user_collection(user_id)

    # Prepare data for ChromaDB
    documents = [chunk["text"] for chunk in chunks]
    metadatas = [chunk["metadata"] for chunk in chunks]
    ids = [f"cv_chunk_{i}" for i in range(len(chunks))]

    # Add to collection (ChromaDB handles embedding automatically)
    collection.add(
        documents=documents,
        metadatas=metadatas,
        ids=ids,
    )

    # Update tracking metadata (per user)
    _cv_metadata[user_id] = {
        "uploaded": True,
        "filename": filename,
        "chunk_count": len(chunks),
        "sections_detected": sections,
    }
    _save_metadata()

    logger.info(f"Added {len(chunks)} chunks to vector store from '{filename}' for user {user_id}")


def query(user_id: int, text: str, n_results: int = 5) -> list[dict]:
    """
    Query the vector store for chunks most relevant to the given text.
    Uses cosine similarity on the embedded representations.

    Args:
        user_id: The user's ID for user-specific retrieval
        text: The query text (e.g., user question or job description)
        n_results: Number of results to return

    Returns:
        List of {text, metadata, distance} dicts, sorted by relevance
    """
    if not _client:
        raise RuntimeError("Vector store not initialized.")

    collection = _get_user_collection(user_id)
    
    if collection.count() == 0:
        return []

    # Clamp n_results to actual collection size
    actual_n = min(n_results, collection.count())

    results = collection.query(
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


def get_full_text(user_id: int) -> str:
    """
    Retrieve all stored CV text for a specific user.
    Used for comprehensive analysis like fit score computation.
    """
    if not _client:
        return ""

    collection = _get_user_collection(user_id)
    
    if collection.count() == 0:
        return ""

    all_docs = collection.get(include=["documents", "metadatas"])

    if not all_docs or not all_docs["documents"]:
        return ""

    # Sort by chunk_index to maintain order
    paired = list(zip(all_docs["documents"], all_docs["metadatas"] or [{}] * len(all_docs["documents"])))
    paired.sort(key=lambda x: x[1].get("chunk_index", 0))

    return "\n\n".join(doc for doc, _ in paired)


def get_status(user_id: int) -> dict:
    """Return current upload status and metadata for a specific user."""
    user_meta = _cv_metadata.get(user_id, {})
    return {
        "uploaded": user_meta.get("uploaded", False),
        "filename": user_meta.get("filename", ""),
        "chunk_count": user_meta.get("chunk_count", 0),
        "sections_detected": user_meta.get("sections_detected", []),
    }


def clear(user_id: int):
    """
    Clear all documents from a user's vector store.
    Used when the user wants to re-upload their CV.
    """
    global _cv_metadata

    if not _client:
        return

    collection_name = f"cv_collection_user_{user_id}"
    try:
        _client.delete_collection(collection_name)
    except Exception:
        # Collection doesn't exist, that's fine
        pass
    
    # Clear metadata for this user
    if user_id in _cv_metadata:
        del _cv_metadata[user_id]
        _save_metadata()
    
    logger.info(f"Vector store cleared for user {user_id}")


def is_cv_uploaded(user_id: int) -> bool:
    """Quick check if a CV has been uploaded for a specific user."""
    return _cv_metadata.get(user_id, {}).get("uploaded", False)
