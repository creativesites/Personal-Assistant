-- Pre-launch testing phase: Zuri Marketing should be fully accessible to
-- every account, not gated behind manual admin/waitlist promotion — see
-- docs/ZURI_MARKETING_EXPANSION.md. Re-tighten this (default back to
-- 'none', drop the backfill) before onboarding real end users.
ALTER TABLE users ALTER COLUMN marketing_access SET DEFAULT 'enabled';

UPDATE users SET marketing_access = 'enabled', updated_at = NOW()
WHERE marketing_access IS DISTINCT FROM 'enabled';
