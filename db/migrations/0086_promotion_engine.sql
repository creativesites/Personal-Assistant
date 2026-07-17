-- Membership Platform Phase 7 — Promotion Engine (see
-- docs/MEMBERSHIP_PLATFORM_PLAN.md §Phase 7): referrals, gift memberships,
-- promo codes, and student verification. All four are net-new — nothing
-- like this existed before this phase.

-- ── Referrals ────────────────────────────────────────────────────────────
-- One code per user, lazy-created on first /billing visit. Reward (+14
-- days on current_period_end for both parties) is applied once the
-- *referred* user's first payment is approved, not at signup — see
-- admin-payments.ts's approve handler.
CREATE TABLE IF NOT EXISTS referral_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code       VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_redemptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded')),
  rewarded_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Promo codes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                   VARCHAR(30) NOT NULL UNIQUE,
  discount_type          VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value         INT NOT NULL, -- percent (1-100) or a fixed ngwee amount
  applicable_plan_family VARCHAR(20),  -- NULL = any family
  max_redemptions        INT,          -- NULL = unlimited
  times_redeemed         INT NOT NULL DEFAULT 0,
  valid_from             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until            TIMESTAMPTZ,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_code_redemptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id          UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_request_id     UUID REFERENCES payment_requests(id) ON DELETE SET NULL,
  discount_ngwee_applied BIGINT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Gift memberships ─────────────────────────────────────────────────────
-- Reuses the guided payment flow's plan/network/pay-to/confirm steps
-- (payment_request_id), but ends by collecting a recipient instead of
-- activating the gifter's own subscription. Admin approval activates the
-- gift (status -> ready, redemption_code already generated at creation so
-- the gifter can share it immediately) rather than a subscription directly.
CREATE TABLE IF NOT EXISTS gift_memberships (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gifter_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_name     VARCHAR(255) NOT NULL,
  recipient_contact  VARCHAR(255) NOT NULL,
  plan_id            UUID NOT NULL REFERENCES subscription_plans(id),
  payment_request_id UUID REFERENCES payment_requests(id) ON DELETE SET NULL,
  redemption_code    VARCHAR(20) NOT NULL UNIQUE,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending_payment'
                        CHECK (status IN ('pending_payment', 'ready', 'redeemed', 'rejected')),
  redeemed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Student verification ─────────────────────────────────────────────────
-- Mirrors payment_requests' approve/reject shape exactly (admin review
-- fields, same convention). Approval sets users.is_verified_student, which
-- gates checkout eligibility for the student-discounted plan variant below.
CREATE TABLE IF NOT EXISTS student_verifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_name    VARCHAR(255) NOT NULL,
  student_id_number   VARCHAR(100) NOT NULL,
  proof_document_path TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  rejected_reason     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified_student BOOLEAN NOT NULL DEFAULT FALSE;

-- Student-discounted Personal variant (50% off monthly) — deliberately
-- is_active=FALSE so it never appears in the public GET /api/subscription-plans
-- catalog; only a verified student's checkout call is allowed to target it
-- (services/api/src/routes/subscription-plans.ts enforces the is_verified_student
-- check server-side, not just via obscurity).
INSERT INTO subscription_plans
  (key, name, plan_family, billing_period, price_ngwee, duration_days,
   messages_per_day, ai_replies_per_day, proactive_nudges_per_day, documents_per_day,
   included_seats, included_features, sort_order, is_active)
VALUES
  ('personal_monthly_student', 'Personal (Student)', 'personal', 'monthly', 7450, 30,
   999999, 999999, 999999, 999999, 1,
   '{career_os,cv_studio,job_search,interview_coach,advisor_companion}', 12, FALSE)
ON CONFLICT (key) DO NOTHING;

-- Seed a handful of the product brief's own named example codes — real,
-- usable rows from day one, not placeholders.
INSERT INTO promo_codes (code, discount_type, discount_value, applicable_plan_family, max_redemptions, valid_until)
VALUES
  ('WELCOME50', 'percent', 50, NULL, NULL, NULL),
  ('STUDENT', 'percent', 50, 'personal', NULL, NULL),
  ('BLACKFRIDAY', 'percent', 30, NULL, 500, NULL),
  ('EMPLOYEE', 'percent', 100, NULL, NULL, NULL)
ON CONFLICT (code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_user ON promo_code_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_gift_memberships_gifter ON gift_memberships(gifter_user_id);
CREATE INDEX IF NOT EXISTS idx_student_verifications_status ON student_verifications(status);
