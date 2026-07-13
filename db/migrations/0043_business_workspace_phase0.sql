-- Zuri Business Workspace Phase 0 — Foundation.
-- See docs/BUSINESS_WORKSPACE_PLAN.md §3/§15.
--
-- documents ships from day one with agent_id/requested_by/ai_reasoning/
-- document_category and the full expanded document_type list (§11) even
-- though most of it goes unused until later phases — cheap to include now,
-- avoids a churny type-widening migration later. deal_stage_history ships
-- now too since Phase 1's Business Timeline needs history that has to have
-- started accumulating already.
--
-- contact_documents (migration 0024) stays as-is for human-uploaded files;
-- documents is strictly for AI/template-generated structured business
-- documents (see plan §2). generated_document_id is the cross-link for
-- "customer sent back the signed version."

-- Brand Kit — one row per user, same 1:1 convention as auto_response_settings.
CREATE TABLE IF NOT EXISTS business_profiles (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name           VARCHAR(255),
  logo_storage_path      VARCHAR(2000),
  address                TEXT,
  phone                  VARCHAR(50),
  email                  VARCHAR(255),
  website                VARCHAR(255),
  tax_id                 VARCHAR(100),
  registration_number    VARCHAR(100),
  bank_details           JSONB NOT NULL DEFAULT '{}',
  mobile_money           JSONB NOT NULL DEFAULT '{}',
  signature_storage_path VARCHAR(2000),
  stamp_storage_path     VARCHAR(2000),
  theme_color            VARCHAR(20) NOT NULL DEFAULT '#4F46E5',
  accent_color           VARCHAR(20) NOT NULL DEFAULT '#818CF8',
  default_template_id    UUID,   -- FK added below, after document_templates exists
  footer_text            TEXT,
  default_terms          TEXT,
  payment_instructions   TEXT,
  default_currency       VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  default_tax_rate       DECIMAL(5,2) NOT NULL DEFAULT 0,
  numbering              JSONB NOT NULL DEFAULT
    '{"quotation":{"prefix":"QT-","next":1},"invoice":{"prefix":"INV-","next":1},
      "receipt":{"prefix":"RC-","next":1},"purchase_order":{"prefix":"PO-","next":1},
      "delivery_note":{"prefix":"DN-","next":1},"credit_note":{"prefix":"CN-","next":1},
      "contract":{"prefix":"CT-","next":1},"proposal":{"prefix":"PR-","next":1},
      "statement_of_work":{"prefix":"SOW-","next":1},"inspection_report":{"prefix":"IR-","next":1},
      "visit_report":{"prefix":"VR-","next":1},"timesheet":{"prefix":"TS-","next":1},
      "expense_claim":{"prefix":"EX-","next":1},"purchase_request":{"prefix":"PRQ-","next":1},
      "project_plan":{"prefix":"PP-","next":1},"meeting_minutes":{"prefix":"MM-","next":1},
      "service_agreement":{"prefix":"SA-","next":1},"maintenance_contract":{"prefix":"MC-","next":1},
      "nda":{"prefix":"NDA-","next":1},"rental_agreement":{"prefix":"RA-","next":1},
      "employment_letter":{"prefix":"EL-","next":1},"offer_letter":{"prefix":"OL-","next":1},
      "certificate":{"prefix":"CERT-","next":1},"letter":{"prefix":"LT-","next":1},
      "custom":{"prefix":"DOC-","next":1}}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Layouts. System templates ship with user_id NULL. layout_key maps to an
-- HTML template file the renderer loads (services/intelligence/app/templates/
-- documents/) — the DB never stores markup, same "constants/files over
-- DB-editable content" precedent already used for prompts.py.
CREATE TABLE IF NOT EXISTS document_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  layout_key    VARCHAR(100) NOT NULL,
  category      VARCHAR(50),
  applicable_to JSONB NOT NULL DEFAULT '[]',
  is_system     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE business_profiles
  ADD CONSTRAINT fk_business_profiles_default_template
  FOREIGN KEY (default_template_id) REFERENCES document_templates(id) ON DELETE SET NULL;

-- The core object.
CREATE TABLE IF NOT EXISTS documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id         UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id            UUID REFERENCES deals(id) ON DELETE SET NULL,
  opportunity_id     UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  conversation_id    UUID REFERENCES conversations(id) ON DELETE SET NULL,
  agent_id           UUID REFERENCES agents(id) ON DELETE SET NULL,
  template_id        UUID REFERENCES document_templates(id) ON DELETE SET NULL,
  document_type      VARCHAR(30) NOT NULL CHECK (document_type IN (
                        'quotation','invoice','receipt','purchase_order','delivery_note',
                        'credit_note','contract','proposal','certificate','letter','custom',
                        'statement_of_work','inspection_report','visit_report','timesheet',
                        'expense_claim','purchase_request','project_plan','meeting_minutes',
                        'service_agreement','maintenance_contract','nda','rental_agreement',
                        'employment_letter','offer_letter'
                      )),
  document_category VARCHAR(20) NOT NULL DEFAULT 'sales'
                        CHECK (document_category IN ('sales', 'operations', 'legal', 'hr')),
  document_number    VARCHAR(50) NOT NULL,
  title              VARCHAR(255) NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
                        'draft','generated','sent','viewed','downloaded',
                        'accepted','rejected','expired','paid','archived'
                      )),
  structured_data    JSONB NOT NULL DEFAULT '{}',
  currency           VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  subtotal_cents     BIGINT NOT NULL DEFAULT 0,
  discount_cents     BIGINT NOT NULL DEFAULT 0,
  tax_cents          BIGINT NOT NULL DEFAULT 0,
  total_cents        BIGINT NOT NULL DEFAULT 0,
  storage_path       VARCHAR(2000),
  version            INT NOT NULL DEFAULT 1,
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  requested_by       VARCHAR(20) NOT NULL DEFAULT 'user'
                        CHECK (requested_by IN ('user', 'customer', 'agent', 'schedule')),
  ai_generated       BOOLEAN NOT NULL DEFAULT FALSE,
  ai_reasoning       TEXT,
  ai_summary         TEXT,
  source_message_ids JSONB NOT NULL DEFAULT '[]',
  embedding          vector(1536),
  expires_at         TIMESTAMPTZ,
  sent_at            TIMESTAMPTZ,
  viewed_at          TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_type ON documents(user_id, document_type);
CREATE INDEX IF NOT EXISTS idx_documents_contact ON documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_number ON documents(user_id, document_number);

-- Append-only timeline, same pattern as relationship_health_logs.
CREATE TABLE IF NOT EXISTS document_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  event_type  VARCHAR(30) NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_document_events_document ON document_events(document_id, occurred_at DESC);

-- Deal stage history — deals only stores current stage + entered_stage_at
-- today, no history. Same append-only pattern, needed now so Phase 1's
-- Business Timeline isn't missing history from day one.
CREATE TABLE IF NOT EXISTS deal_stage_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage VARCHAR(20),
  to_stage   VARCHAR(20) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal ON deal_stage_history(deal_id, changed_at);

-- Backfill one history row per existing open/closed deal so the timeline
-- isn't empty for deals that predate this migration.
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, changed_at)
SELECT id, NULL, stage, entered_stage_at FROM deals;

-- Cross-link described in plan §2 — stays nullable, only set when a human
-- uploads a file that corresponds to a document Zuri generated.
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS generated_document_id UUID REFERENCES documents(id) ON DELETE SET NULL;

-- Seed system templates — 2 layouts x the 2 document types Phase 0's
-- renderer actually supports (quotation, invoice). More layouts/types are
-- added as later phases' templates ship, per plan §11.
INSERT INTO document_templates (name, layout_key, category, applicable_to, is_system)
VALUES
  ('Minimal', 'minimal', 'general', '["quotation","invoice"]', TRUE),
  ('Modern',  'modern',  'general', '["quotation","invoice"]', TRUE);
