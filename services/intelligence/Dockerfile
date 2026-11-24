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
# Single process on purpose: main.py's lifespan starts every BullMQ worker
# and all in-process asyncio schedulers. With --workers N each scheduler
# runs N times, so every daily job (nudges, job discovery, reflections…)
# was enqueued N times — duplicate messages and N× AI spend. Scale by
# adding BullMQ concurrency, not uvicorn workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
