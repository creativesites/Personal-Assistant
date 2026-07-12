-- Relationship OS Phase 0 — Foundation & Conflict Resolution.
-- See docs/RELATIONSHIP_OS_PLAN.md §3/§5.9/§12.
--
-- Before this migration, three vocabularies existed for "where is this
-- relationship in the pipeline": relationships.relationship_type (free
-- text), contacts.customer_status/pipeline_stage, and
-- conversation_funnel_stages.stage — each written by different code paths.
-- `deals` becomes the one canonical pipeline entity. contacts.pipeline_stage
-- is demoted to a denormalized cache of the most-recent-open-deal's stage
-- (kept in sync by the API layer, not a trigger — this codebase doesn't use
-- DB triggers elsewhere). conversation_funnel_stages stops receiving new
-- writes but is kept, unaltered, for historical reads.
CREATE TABLE IF NOT EXISTS deals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title               VARCHAR(255) NOT NULL,
  stage               VARCHAR(20) NOT NULL DEFAULT 'discovery'
                        CHECK (stage IN ('discovery', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost')),
  value_cents         BIGINT NOT NULL DEFAULT 0,
  currency            VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  probability         SMALLINT NOT NULL DEFAULT 50 CHECK (probability BETWEEN 0 AND 100),
  expected_close_date DATE,
  product_ids         JSONB NOT NULL DEFAULT '[]',
  source              VARCHAR(20) NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('manual', 'funnel_migration', 'opportunity')),
  entered_stage_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- for stall detection ("14 days in Proposal")
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_user_open ON deals(user_id, stage) WHERE stage NOT IN ('closed_won', 'closed_lost');

-- Backfill: one deal per contact, from that contact's most recent
-- conversation_funnel_stages row (avoids exploding one deal per historical
-- stage transition — a contact's funnel history collapses to their current
-- position, which is what pipeline_stage already showed anyway).
INSERT INTO deals (user_id, contact_id, title, stage, entered_stage_at, source, created_at, updated_at)
SELECT
  cfs.user_id,
  cfs.contact_id,
  'Deal with ' || COALESCE(c.custom_name, c.display_name, c.phone_number, 'contact'),
  CASE cfs.stage
    WHEN 'lead'        THEN 'discovery'
    WHEN 'qualified'   THEN 'qualified'
    WHEN 'opportunity' THEN 'qualified'
    WHEN 'proposal'    THEN 'proposal'
    WHEN 'closed_won'  THEN 'closed_won'
    WHEN 'closed_lost' THEN 'closed_lost'
    WHEN 'churned'     THEN 'closed_lost'
    ELSE 'discovery'
  END,
  cfs.entered_at,
  'funnel_migration',
  cfs.entered_at,
  NOW()
FROM (
  SELECT DISTINCT ON (contact_id) *
  FROM conversation_funnel_stages
  WHERE contact_id IS NOT NULL
  ORDER BY contact_id, entered_at DESC
) cfs
JOIN contacts c ON c.id = cfs.contact_id;
