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

# Copy application code
COPY . .

# Create data directories
RUN mkdir -p data/uploads data/chroma_db

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "run.py"]
