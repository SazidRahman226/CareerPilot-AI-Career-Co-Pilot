# ===== Hugging Face Space Metadata =====
# Tell Hugging Face to route traffic to port 8000 instead of 7860
# machine_args: app_port=8000

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

# Create data directories and ensure permissions
RUN mkdir -p data/uploads data/chroma_db && chown -R user:user data

# Disable ChromaDB telemetry to avoid posthog errors
ENV ANONYMIZED_TELEMETRY=false

# Switch to the required non-root user
USER user

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "run.py"]