-- Migration 0104: Native E-Signatures, Cryptographic Audit Certificates, & Dunning Reminders

-- Table for tracking recipient/issuer digital signatures on documents
CREATE TABLE IF NOT EXISTS document_signatures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  signer_name       VARCHAR(255) NOT NULL,
  signer_email      VARCHAR(255),
  signer_role       VARCHAR(50) NOT NULL DEFAULT 'client', -- 'client', 'issuer', 'witness'
  signature_type    VARCHAR(20) NOT NULL CHECK (signature_type IN ('draw', 'type', 'upload')),
  signature_data    TEXT NOT NULL,                         -- base64 data URI or typed text
  ip_address        VARCHAR(100),
  user_agent        TEXT,
  verification_code VARCHAR(50) NOT NULL UNIQUE,          -- e.g. VER-8F92A1
  document_hash     VARCHAR(100) NOT NULL,                 -- SHA-256 hash of document structured_data + totals
  signed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_signatures_doc ON document_signatures(document_id, signed_at DESC);

-- Table for tracking automated WhatsApp dunning / payment reminder dispatches
CREATE TABLE IF NOT EXISTS document_dunning_schedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id     UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  reminder_stage VARCHAR(30) NOT NULL CHECK (reminder_stage IN ('upcoming_3d', 'due_today', 'overdue_7d', 'overdue_14d')),
  status         VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  scheduled_at   TIMESTAMPTZ NOT NULL,
  sent_at        TIMESTAMPTZ,
  wa_message_id  VARCHAR(255),
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dunning_schedules_due ON document_dunning_schedules(scheduled_at, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_dunning_schedules_doc ON document_dunning_schedules(document_id);
