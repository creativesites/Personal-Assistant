-- Zuri Career & Growth Engine, Phases 3-4 — see docs/CAREER_GROWTH_ENGINE_PLAN.md
-- §8 (AI Resume Studio) and §9/§10 (Applications as Projects + Interview
-- Memory). Reuses the existing documents/projects/calendar_events tables as
-- designed rather than new parallel schema — only a CHECK widen and two
-- nullable FKs are genuinely new.

-- §8 — resume/cover_letter/portfolio_page join the existing document_type
-- vocabulary (same widen precedent as products.status in migration 0076).
-- document_category's existing 'hr' bucket (migration 0043) already fits
-- all three — no category widen needed.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_document_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_document_type_check
  CHECK (document_type IN (
    'quotation','invoice','receipt','purchase_order','delivery_note',
    'credit_note','contract','proposal','certificate','letter','custom',
    'statement_of_work','inspection_report','visit_report','timesheet',
    'expense_claim','purchase_request','project_plan','meeting_minutes',
    'service_agreement','maintenance_contract','nda','rental_agreement',
    'employment_letter','offer_letter','resume','cover_letter','portfolio_page'
  ));

-- §9 — an application is a project. career_opportunities.project_id
-- (migration 0078) already links opportunity -> project; this is the
-- reverse lookup, the same both-directions-FK convention documents.project_id/
-- projects.deal_id already established for Business OS Phase B.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS career_opportunity_id UUID
  REFERENCES career_opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_career_opportunity ON projects(career_opportunity_id)
  WHERE career_opportunity_id IS NOT NULL;

-- §10 — Interview Memory. calendar_event_id already exists on
-- career_interviews (migration 0078); nothing further needed there.
