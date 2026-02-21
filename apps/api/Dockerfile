FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for camelot + pdfplumber
RUN apt-get update && apt-get install -y \
    ghostscript \
    libpoppler-cpp-dev \
    poppler-utils \
    libffi-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY apps/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY apps/api/ .

# Set Python path so imports work from project root
ENV PYTHONPATH=/app

EXPOSE 8000

RUN chmod +x /app/entrypoint.sh
CMD ["/app/entrypoint.sh"]
