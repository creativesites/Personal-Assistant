-- Migration 0107: Expand document_type check constraint and business_profiles numbering defaults
-- Supports Commercial, Legal, and Finance document types:
-- purchase_order, credit_note, debit_note, delivery_note, catalog, price_sheet,
-- nda, msa, account_statement, expense_report

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_document_type_check;

ALTER TABLE documents ADD CONSTRAINT documents_document_type_check CHECK (document_type IN (
  'quotation','invoice','receipt','purchase_order','delivery_note',
  'credit_note','debit_note','contract','proposal','certificate','letter','custom',
  'statement_of_work','inspection_report','visit_report','timesheet',
  'expense_claim','expense_report','purchase_request','project_plan','meeting_minutes',
  'service_agreement','maintenance_contract','nda','msa','rental_agreement',
  'employment_letter','offer_letter','catalog','price_sheet','account_statement'
));
