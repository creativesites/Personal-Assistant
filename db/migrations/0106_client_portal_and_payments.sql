-- Migration 0106: Client Portal Comments & Embedded Payments

-- Create document_comments table for line item feedback
CREATE TABLE IF NOT EXISTS document_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  item_index     INTEGER, -- NULL for general document comments, 0+ for line items
  commenter_name VARCHAR(255) NOT NULL,
  comment_text   TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_comments_doc ON document_comments(document_id, item_index);

-- Extend documents with payment tracking fields
ALTER TABLE documents ADD COLUMN IF NOT EXISTS payment_method    VARCHAR(50);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMPTZ;
