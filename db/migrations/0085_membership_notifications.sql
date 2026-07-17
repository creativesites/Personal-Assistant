-- Membership Platform Phase 4 (see docs/MEMBERSHIP_PLATFORM_PLAN.md) — the
-- subscription-lifecycle-worker's expiry reminders/grace-period/read-only
-- transitions become the first-ever writer to the notifications table
-- (migration 0009), which has sat with a serving-route gap since day one
-- (the frontend's /notifications page already calls GET /api/notifications
-- and 404s). 'billing' is a genuinely new signal source, not a fit for any
-- existing notification_type value.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'billing';
