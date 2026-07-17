-- Platform Polish Phase 2 — Invisible Intelligence confidence tiers (see
-- docs/PLATFORM_POLISH_PLAN.md §4). Widens action_bundles.status to allow
-- a bundle whose actions were all safe (high-confidence, cheap-to-reverse)
-- enough to execute immediately without a manual approval click — still
-- logged, still visible in the "Zuri Noticed" feed, just not blocking.

ALTER TABLE action_bundles DROP CONSTRAINT IF EXISTS action_bundles_status_check;
ALTER TABLE action_bundles
  ADD CONSTRAINT action_bundles_status_check
    CHECK (status IN ('pending', 'approved', 'partially_approved', 'dismissed', 'expired', 'auto_approved'));
