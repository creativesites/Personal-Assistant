-- Platform Polish Phase 5 (§7.1) — wire the already-stubbed monthly cadence
-- (reflection.py::_period_bounds already branched on it; nothing ever
-- called it) plus a new quarterly bucket.
ALTER TABLE reflection_summaries DROP CONSTRAINT IF EXISTS reflection_summaries_period_type_check;
ALTER TABLE reflection_summaries ADD CONSTRAINT reflection_summaries_period_type_check
  CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly'));
