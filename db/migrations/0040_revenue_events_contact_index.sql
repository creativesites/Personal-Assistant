-- Relationship OS Phase 4 — Relationship Feed needs a per-contact revenue
-- sum (docs/RELATIONSHIP_OS_PLAN.md §5.4), which revenue_events had no
-- index for (only user_id, created_at — see 0018_analytics.sql).
CREATE INDEX IF NOT EXISTS idx_revenue_events_contact ON revenue_events(contact_id) WHERE contact_id IS NOT NULL;
