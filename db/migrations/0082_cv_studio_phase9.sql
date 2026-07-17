-- Zuri CV Studio Phase 9 — Cover Letter Studio + Supporting Documents
-- (docs/CV_STUDIO_PLAN.md §12, §13, §18 Phase 9). One profile, many
-- documents — application_letter/expression_of_interest/personal_statement/
-- motivation_letter/reference_sheet/portfolio_pdf join the existing
-- document_type vocabulary, the same widen precedent
-- resume/cover_letter/portfolio_page already used (migration 0079).
-- document_category's existing 'hr' bucket (migration 0043) already fits
-- all six — no category widen needed.

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_document_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_document_type_check
  CHECK (document_type IN (
    'quotation','invoice','receipt','purchase_order','delivery_note',
    'credit_note','contract','proposal','certificate','letter','custom',
    'statement_of_work','inspection_report','visit_report','timesheet',
    'expense_claim','purchase_request','project_plan','meeting_minutes',
    'service_agreement','maintenance_contract','nda','rental_agreement',
    'employment_letter','offer_letter','resume','cover_letter','portfolio_page',
    'application_letter','expression_of_interest','personal_statement',
    'motivation_letter','reference_sheet','portfolio_pdf'
  ));
