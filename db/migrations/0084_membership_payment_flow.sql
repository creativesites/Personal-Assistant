-- Membership Platform Phase 3 (see docs/MEMBERSHIP_PLATFORM_PLAN.md §Phase
-- 3) — the guided 4-step manual mobile-money payment flow's self-reported
-- step 4 (phone number used, optional time paid, optional screenshot) plus
-- an audit marker for whether the BYOK discount price was applied.

ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS payer_phone_number     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS payer_paid_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_screenshot_path TEXT,
  ADD COLUMN IF NOT EXISTS uses_own_api_key        BOOLEAN NOT NULL DEFAULT FALSE;
