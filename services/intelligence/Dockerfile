FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY services/intelligence/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Chromium + system libs for the document rendering pipeline (see
# docs/BUSINESS_WORKSPACE_PLAN.md §4) — Playwright never touches a user's
# browser, this is purely headless HTML-to-PDF rendering server-side.
RUN playwright install --with-deps chromium

# Copy service code
COPY services/intelligence/ ./

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
