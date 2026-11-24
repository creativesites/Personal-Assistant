-- 0130 moved the history importer onto importing -> analysing -> complete
-- (and 'cancelled' when the user skips) but left 0096's sync_phase CHECK in
-- place, so every new job insert failed and history batches were dropped.
ALTER TABLE sync_jobs DROP CONSTRAINT IF EXISTS sync_jobs_sync_phase_check;
ALTER TABLE sync_jobs ADD CONSTRAINT sync_jobs_sync_phase_check
  CHECK (sync_phase IN ('indexing', 'downloading', 'importing', 'analysing', 'complete', 'cancelled'));
