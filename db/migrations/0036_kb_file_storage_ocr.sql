-- Knowledge base file storage + OCR metadata.
-- Uploaded KB files are stored on the shared app volume for now; storage_path
-- keeps the worker independent from the API process that accepted the upload.

ALTER TABLE kb_documents
  ADD COLUMN IF NOT EXISTS storage_path VARCHAR(2000),
  ADD COLUMN IF NOT EXISTS mime_type    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;

