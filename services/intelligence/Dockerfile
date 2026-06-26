FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY services/intelligence/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY services/intelligence/ ./

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
