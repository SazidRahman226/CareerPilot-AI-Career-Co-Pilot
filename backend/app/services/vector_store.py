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
from app.services.cache import cache_mset, cache_get, cache_set, make_hash, cache_delete, cache_delete_exact

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


def _user_key(user_id: int) -> str:
    """Normalize user_id to a string key for consistent dict/JSON lookup."""
    return str(user_id)


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

    # Layer 4: Bulk-cache chunk text in Redis (doc store pattern)
    chunk_mapping = {
        f"cv_chunk:{user_id}:cv_chunk_{i}": chunk["text"]
        for i, chunk in enumerate(chunks)
    }
    cache_mset(chunk_mapping, ttl=settings.REDIS_CHUNK_TTL_SECONDS)

    # Update tracking metadata (per user)
    _cv_metadata[_user_key(user_id)] = {
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

    Layers 4 & 5 optimizations:
    - Layer 5: Check semantic search cache first (exact query match)
    - Layer 4: Fetch text from Redis doc store instead of ChromaDB

    Args:
        user_id: The user's ID for user-specific retrieval
        text: The query text (e.g., user question or job description)
        n_results: Number of results to return

    Returns:
        List of {text, metadata, distance} dicts, sorted by relevance
    """
    if not _client:
        raise RuntimeError("Vector store not initialized.")

    # Layer 5: Semantic search cache (exact-match on query text)
    sem_cache_key = f"sem_search:{user_id}:{make_hash(text)}"
    cached = cache_get(sem_cache_key)
    if cached is not None:
        return cached

    collection = _get_user_collection(user_id)
    
    if collection.count() == 0:
        return []

    # Clamp n_results to actual collection size
    actual_n = min(n_results, collection.count())

    # Layer 4: Query ChromaDB for IDs + metadata + distances only
    results = collection.query(
        query_texts=[text],
        n_results=actual_n,
        include=["metadatas", "distances"],
    )

    if not results or not results.get("ids") or not results["ids"][0]:
        return []

    result_ids = results["ids"][0]
    result_metadatas = results["metadatas"][0] if results.get("metadatas") else [{}] * len(result_ids)
    result_distances = results["distances"][0] if results.get("distances") else [0] * len(result_ids)

    # Layer 4: Fetch text from Redis doc store (MGET)
    chunk_keys = [f"cv_chunk:{user_id}:{rid}" for rid in result_ids]
    cached_texts = cache_mget(chunk_keys)

    # Check for Redis misses — fall back to ChromaDB for those
    texts = list(cached_texts)
    miss_indices = [i for i, t in enumerate(texts) if t is None]
    if miss_indices:
        # Fetch missing texts from ChromaDB
        miss_ids = [result_ids[i] for i in miss_indices]
        fallback = collection.get(ids=miss_ids, include=["documents"])
        if fallback and fallback.get("documents"):
            for idx, doc_text in zip(miss_indices, fallback["documents"]):
                texts[idx] = doc_text

    # Assemble formatted results
    formatted = []
    for i in range(len(result_ids)):
        formatted.append({
            "text": texts[i] or "",
            "metadata": result_metadatas[i] if i < len(result_metadatas) else {},
            "distance": result_distances[i] if i < len(result_distances) else 0,
        })

    # Cache the assembled result (Layer 5)
    cache_set(sem_cache_key, formatted)

    return formatted


def get_full_text(user_id: int) -> str:
    """
    Retrieve all stored CV text for a specific user.
    Used for comprehensive analysis like fit score computation.
    Cached in Redis for fast repeated access.
    """
    # Check Redis cache first
    cache_key = f"cv_fulltext:{user_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

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

    full_text = "\n\n".join(doc for doc, _ in paired)

    # Cache the full text (changes rarely — 24h TTL)
    if full_text:
        cache_set(cache_key, full_text, ttl=settings.REDIS_CHUNK_TTL_SECONDS)

    return full_text


def get_status(user_id: int) -> dict:
    """Return current upload status and metadata for a specific user."""
    user_meta = _cv_metadata.get(_user_key(user_id), {})
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
    Also invalidates all Redis cache entries for this user.
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
    key = _user_key(user_id)
    if key in _cv_metadata:
        del _cv_metadata[key]
        _save_metadata()

    # Invalidate Redis cache (chunks, fulltext, semantic search)
    cache_delete(f"cv_chunk:{user_id}:*")
    cache_delete_exact(f"cv_fulltext:{user_id}")
    cache_delete(f"sem_search:{user_id}:*")
    
    logger.info(f"Vector store cleared for user {user_id}")


def is_cv_uploaded(user_id: int) -> bool:
    """Quick check if a CV has been uploaded for a specific user."""
    return _cv_metadata.get(_user_key(user_id), {}).get("uploaded", False)
