# ===== CareerPilot Backend Dockerfile =====
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies required by sentence-transformers, psycopg2, and other packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (Docker layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt


RUN python -c "from chromadb.utils import embedding_functions; \
    embedding_functions.SentenceTransformerEmbeddingFunction(\
        model_name='all-MiniLM-L6-v2')" || true

# Copy application code
COPY . .

# Create data directories
RUN mkdir -p data/uploads data/chroma_db

# Disable ChromaDB telemetry to avoid posthog errors
ENV ANONYMIZED_TELEMETRY=false

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "run.py"]
