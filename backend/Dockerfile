# ===== CareerPilot Backend Dockerfile =====
FROM python:3.11-slim

# Create the non-root user that Hugging Face requires (UID 1000)
RUN useradd -m -u 1000 user

# Set working directory
WORKDIR /app

# Install system dependencies required by sentence-transformers, psycopg2, and other packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (Docker layer caching)
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download embedding model
RUN python -c "from chromadb.utils import embedding_functions; \
    embedding_functions.SentenceTransformerEmbeddingFunction(\
        model_name='all-MiniLM-L6-v2')" || true

# Copy application code and ensure the Hugging Face user owns it
COPY --chown=user:user . .

# Create data directories (including HF cache and ONNX cache) and ensure permissions
RUN mkdir -p data/uploads data/chroma_db data/huggingface data/chroma_onnx \
    && chown -R user:user data

# Disable ChromaDB telemetry to avoid posthog errors
# Redirect all caches to known, writable locations inside /app/data
ENV ANONYMIZED_TELEMETRY=false
ENV HF_HOME=/app/data/huggingface
ENV CHROMA_ONNX_MODEL_PATH=/app/data/chroma_onnx

# Copy and set the entrypoint script (ensures dirs exist at runtime)
COPY --chown=user:user entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Switch to the required non-root user
USER user

# Expose port
EXPOSE 8000

# Use entrypoint to ensure writable dirs, then run the app
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["python", "run.py"]