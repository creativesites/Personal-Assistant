-- Zuri Career & Growth Engine, Phase 8 — Localisation Depth (see
-- docs/CAREER_GROWTH_ENGINE_PLAN.md §13/§16). The schema-level groundwork
-- (career_profiles.country, career_opportunities.country) already shipped
-- in Phase 1 (migration 0078) — this phase is purely about seeding and
-- refining Zambia/Southern-Africa-specific reference data, not new
-- architecture. A small static reference table, not a scraped directory —
-- explicitly deferred per the plan's own §17 (multi-source job discovery
-- is a real data-sourcing project of its own).

CREATE TABLE IF NOT EXISTS career_employer_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_name VARCHAR(255) NOT NULL UNIQUE,
  aliases       TEXT[] NOT NULL DEFAULT '{}',
  category      VARCHAR(50) NOT NULL, -- bank | telecom | mining | ngo | government | university | startup | other
  country       VARCHAR(50) NOT NULL DEFAULT 'Zambia',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_career_employer_categories_name ON career_employer_categories(employer_name);
CREATE INDEX IF NOT EXISTS idx_career_employer_categories_category ON career_employer_categories(category);

-- Seed: a small, honest starting list per the plan's own worked examples
-- (Zanaco, MTN Zambia, Barrick, ZRA) plus enough peers per category to be
-- genuinely useful on day one. Not exhaustive — refine as real usage
-- surfaces gaps, per the plan's own phasing note.
INSERT INTO career_employer_categories (employer_name, aliases, category, country) VALUES
  ('Zanaco', ARRAY['Zambia National Commercial Bank'], 'bank', 'Zambia'),
  ('Stanbic Bank Zambia', ARRAY['Stanbic'], 'bank', 'Zambia'),
  ('Standard Chartered Bank Zambia', ARRAY['Standard Chartered', 'StanChart'], 'bank', 'Zambia'),
  ('Absa Bank Zambia', ARRAY['Absa', 'Barclays Zambia'], 'bank', 'Zambia'),
  ('First National Bank Zambia', ARRAY['FNB Zambia', 'FNB'], 'bank', 'Zambia'),
  ('Indo Zambia Bank', ARRAY[]::text[], 'bank', 'Zambia'),
  ('MTN Zambia', ARRAY['MTN'], 'telecom', 'Zambia'),
  ('Airtel Zambia', ARRAY['Airtel'], 'telecom', 'Zambia'),
  ('Zamtel', ARRAY['Zambia Telecommunications Company'], 'telecom', 'Zambia'),
  ('Barrick Gold', ARRAY['Barrick', 'Lumwana Mining'], 'mining', 'Zambia'),
  ('First Quantum Minerals', ARRAY['FQM', 'Kansanshi Mining'], 'mining', 'Zambia'),
  ('Konkola Copper Mines', ARRAY['KCM'], 'mining', 'Zambia'),
  ('Mopani Copper Mines', ARRAY['Mopani'], 'mining', 'Zambia'),
  ('Zambia Revenue Authority', ARRAY['ZRA'], 'government', 'Zambia'),
  ('Ministry of Finance', ARRAY[]::text[], 'government', 'Zambia'),
  ('Bank of Zambia', ARRAY['BoZ'], 'government', 'Zambia'),
  ('Zambia Police Service', ARRAY['ZPS'], 'government', 'Zambia'),
  ('United Nations Zambia', ARRAY['UN Zambia', 'UNDP Zambia', 'UNICEF Zambia'], 'ngo', 'Zambia'),
  ('World Vision Zambia', ARRAY[]::text[], 'ngo', 'Zambia'),
  ('USAID Zambia', ARRAY[]::text[], 'ngo', 'Zambia'),
  ('University of Zambia', ARRAY['UNZA'], 'university', 'Zambia'),
  ('Copperbelt University', ARRAY['CBU'], 'university', 'Zambia'),
  ('Mulungushi University', ARRAY[]::text[], 'university', 'Zambia')
ON CONFLICT (employer_name) DO NOTHING;
