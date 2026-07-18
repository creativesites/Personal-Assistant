-- 8 business-document templates (see plan doc / CLAUDE.md's Business
-- Workspace section) — the original migration 0043 seeded only Minimal and
-- Modern; 6 more system templates, all rendered by their matching
-- layout_key in services/api/src/lib/pdf/render.ts's TEMPLATES map.
INSERT INTO document_templates (name, layout_key, category, applicable_to, is_system)
SELECT * FROM (VALUES
  ('Classic',    'classic',    'general', '["quotation","invoice"]'::jsonb, TRUE),
  ('Corporate',  'corporate',  'general', '["quotation","invoice"]'::jsonb, TRUE),
  ('Elegant',    'elegant',    'general', '["quotation","invoice"]'::jsonb, TRUE),
  ('Compact',    'compact',    'general', '["quotation","invoice"]'::jsonb, TRUE),
  ('Creative',   'creative',   'general', '["quotation","invoice"]'::jsonb, TRUE),
  ('Executive',  'executive',  'general', '["quotation","invoice"]'::jsonb, TRUE)
) AS v(name, layout_key, category, applicable_to, is_system)
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates dt WHERE dt.layout_key = v.layout_key AND dt.is_system = TRUE
);
