"""
CareerPilot — Redis Cache Service
====================================
Thin synchronous Redis wrapper with graceful degradation.
If Redis is unavailable, all operations silently return None/no-op
so the application falls back to direct DB/vector-store queries.

All cache keys use a structured naming convention:
  fit:{user_id}:{hash}       — fit score results
  cv_status:{user_id}        — CV upload status
  dash_stats:{user_id}       — dashboard aggregate stats
  cv_chunk:{user_id}:{id}    — individual CV text chunks (doc store)
  cv_fulltext:{user_id}      — reconstructed full CV text
  sem_search:{user_id}:{hash} — semantic search results
"""

import hashlib
import json
import logging
from typing import Any

import redis

from app.config import settings

logger = logging.getLogger(__name__)

_client: redis.Redis | None = None


# ============================
#  Connection
# ============================

def get_redis() -> redis.Redis | None:
    """
    Lazy-initialise a Redis client from settings.REDIS_URL.
    Returns None if Redis is not configured or unreachable.
    """
    global _client
    if _client is not None:
        return _client

    if not settings.REDIS_URL:
        logger.warning("REDIS_URL not configured — caching disabled")
        return None

    try:
        _client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=2,
        )
        _client.ping()
        logger.info(f"✅ Redis connected: {settings.REDIS_URL}")
        return _client
    except Exception as e:
        logger.warning(f"⚠️ Redis unavailable ({e}) — caching disabled")
        _client = None
        return None


# ============================
#  Core Operations
# ============================

def cache_get(key: str) -> Any | None:
    """
    JSON-deserialise a cached value.
    Returns None on miss, error, or if Redis is unavailable.
    """
    client = get_redis()
    if client is None:
        return None
    try:
        raw = client.get(key)
        if raw is None:
            return None
        logger.debug(f"CACHE HIT: {key}")
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"cache_get failed for {key}: {e}")
        return None


def cache_set(key: str, value: Any, ttl: int | None = None) -> None:
    """
    JSON-serialise and SET with TTL.
    Defaults to settings.REDIS_TTL_SECONDS if ttl is not provided.
    """
    client = get_redis()
    if client is None:
        return
    try:
        ttl = ttl if ttl is not None else settings.REDIS_TTL_SECONDS
        client.setex(key, ttl, json.dumps(value))
        logger.debug(f"CACHE SET: {key} (TTL={ttl}s)")
    except Exception as e:
        logger.warning(f"cache_set failed for {key}: {e}")


def cache_delete_exact(key: str) -> None:
    """Delete a single exact key."""
    client = get_redis()
    if client is None:
        return
    try:
        client.delete(key)
        logger.debug(f"CACHE DEL: {key}")
    except Exception as e:
        logger.warning(f"cache_delete_exact failed for {key}: {e}")


def cache_delete(pattern: str) -> None:
    """
    Delete all keys matching a glob pattern (e.g. 'fit:5:*').
    Uses SCAN to avoid blocking the server on large key-spaces.
    """
    client = get_redis()
    if client is None:
        return
    try:
        cursor = 0
        deleted = 0
        while True:
            cursor, keys = client.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                client.delete(*keys)
                deleted += len(keys)
            if cursor == 0:
                break
        if deleted:
            logger.debug(f"CACHE DEL pattern '{pattern}': {deleted} key(s)")
    except Exception as e:
        logger.warning(f"cache_delete failed for pattern {pattern}: {e}")


# ============================
#  Batch Operations (Doc Store)
# ============================

def cache_mget(keys: list[str]) -> list[str | None]:
    """
    Multi-key GET for batch chunk retrieval.
    Returns a list of values (or None for misses), in the same order as keys.
    """
    client = get_redis()
    if client is None:
        return [None] * len(keys)
    try:
        return client.mget(keys)
    except Exception as e:
        logger.warning(f"cache_mget failed: {e}")
        return [None] * len(keys)


def cache_mset(mapping: dict[str, str], ttl: int | None = None) -> None:
    """
    Multi-key SET with per-key TTL using a pipeline.
    Used for bulk-loading CV chunks into the doc store.
    """
    client = get_redis()
    if client is None:
        return
    try:
        ttl = ttl if ttl is not None else settings.REDIS_CHUNK_TTL_SECONDS
        pipe = client.pipeline()
        for key, value in mapping.items():
            pipe.setex(key, ttl, value)
        pipe.execute()
        logger.debug(f"CACHE MSET: {len(mapping)} key(s) (TTL={ttl}s)")
    except Exception as e:
        logger.warning(f"cache_mset failed: {e}")


# ============================
#  Utilities
# ============================

def make_hash(text: str) -> str:
    """MD5 hex digest of text, used for cache key generation."""
    return hashlib.md5(text.encode()).hexdigest()


def invalidate_user_cache(user_id: int) -> None:
    """
    Invalidate ALL cache entries for a user.
    Called on CV upload/clear to ensure consistency.
    """
    cache_delete(f"fit:{user_id}:*")
    cache_delete_exact(f"cv_status:{user_id}")
    cache_delete_exact(f"cv_fulltext:{user_id}")
    cache_delete(f"cv_chunk:{user_id}:*")
    cache_delete(f"sem_search:{user_id}:*")
    logger.info(f"Cache invalidated for user {user_id}")
