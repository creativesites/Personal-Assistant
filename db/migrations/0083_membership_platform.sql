-- Zuri Membership & Payments Platform, Phase 1 (see
-- docs/MEMBERSHIP_PLATFORM_PLAN.md). Redesigns the plan catalog from
-- migration 0073's 6-tier, single-cadence scheme into 5 feature-based
-- families (free/personal/professional/business/enterprise) each sellable
-- across up to 4 billing cadences (daily/weekly/monthly/yearly), plus a
-- BYOK discount price. Existing subscribers are threaded through by
-- renaming their plan row's `key`/pricing/family *in place* rather than
-- creating new rows and repointing subscriptions.plan_id — the existing
-- FK just follows automatically, no backfill UPDATE needed for that part.

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS plan_family        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS billing_period      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS price_ngwee_byok    BIGINT,
  ADD COLUMN IF NOT EXISTS is_custom_pricing   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trial_days          INT,
  ADD COLUMN IF NOT EXISTS grace_period_days   INT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS included_seats      INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS included_features   TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS documents_per_day   INT NOT NULL DEFAULT 999999;

ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_family_check;
ALTER TABLE subscription_plans
  ADD CONSTRAINT subscription_plans_family_check
    CHECK (plan_family IS NULL OR plan_family IN ('free', 'personal', 'professional', 'business', 'enterprise'));

ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_period_check;
ALTER TABLE subscription_plans
  ADD CONSTRAINT subscription_plans_period_check
    CHECK (billing_period IS NULL OR billing_period IN ('trial', 'daily', 'weekly', 'monthly', 'yearly'));

-- Rename the three still-relevant existing monthly rows in place (same
-- row id, so subscriptions.plan_id already pointing at them keeps working
-- with no repoint needed) and apply the newly agreed pricing.
UPDATE subscription_plans SET
  key = 'personal_monthly', name = 'Personal', plan_family = 'personal', billing_period = 'monthly',
  price_ngwee = 14900, price_ngwee_byok = 10430,
  messages_per_day = 999999, ai_replies_per_day = 999999, proactive_nudges_per_day = 999999, documents_per_day = 999999,
  included_seats = 1,
  included_features = '{career_os,cv_studio,job_search,interview_coach,advisor_companion}'
WHERE key = 'monthly_personal';

UPDATE subscription_plans SET
  key = 'business_monthly', name = 'Business', plan_family = 'business', billing_period = 'monthly',
  price_ngwee = 49900, price_ngwee_byok = 34930,
  messages_per_day = 999999, ai_replies_per_day = 999999, proactive_nudges_per_day = 999999, documents_per_day = 999999,
  included_seats = 5,
  included_features = '{career_os,cv_studio,job_search,interview_coach,advisor_companion,business_os,teams,analytics,automation}'
WHERE key = 'monthly_business';

UPDATE subscription_plans SET
  key = 'enterprise_monthly', name = 'Enterprise', plan_family = 'enterprise', billing_period = 'monthly',
  price_ngwee = 0, price_ngwee_byok = NULL, is_custom_pricing = TRUE,
  messages_per_day = 999999, ai_replies_per_day = 999999, proactive_nudges_per_day = 999999, documents_per_day = 999999,
  included_seats = 999,
  included_features = '{career_os,cv_studio,job_search,interview_coach,advisor_companion,business_os,teams,analytics,automation,enterprise_api}'
WHERE key = 'monthly_enterprise';

-- The original short-lived passes have no equivalent in the new 5-tier
-- catalog — retire them from future purchase (is_active=false, still
-- filtered out by GET /api/subscription-plans' existing WHERE clause) but
-- leave the rows in place so any current holder's plan_id FK still resolves
-- until their existing period naturally ends.
UPDATE subscription_plans SET
  plan_family = 'personal', billing_period = 'daily', is_active = FALSE,
  included_features = '{career_os,cv_studio,job_search,interview_coach,advisor_companion}'
WHERE key = 'daily_pass';
UPDATE subscription_plans SET
  plan_family = 'personal', billing_period = 'weekly', is_active = FALSE,
  included_features = '{career_os,cv_studio,job_search,interview_coach,advisor_companion}'
WHERE key = 'weekly_pass';

-- Free stays a single trial-shaped row: 7-day trial (was informally 30 via
-- auth.ts's trial_ends_at; this is the first time the plan row itself
-- states 7), real small daily caps (the "Limited AI/replies/documents"
-- Free-tier bullet), no feature-area unlocks — Personal CRM/Advisor/
-- Documents/basic Career+Business tools stay ungated app-wide regardless
-- of plan (see entitlements.ts, Phase 2).
UPDATE subscription_plans SET
  plan_family = 'free', billing_period = 'trial', trial_days = 7,
  messages_per_day = 15, ai_replies_per_day = 5, proactive_nudges_per_day = 2, documents_per_day = 5,
  included_features = '{}'
WHERE key = 'free';

-- New sellable rows completing the multi-cadence catalog. Weekly ~= mo/4 x
-- 1.15, daily ~= weekly/7 x 1.3 (short commitment costs more per unit
-- time), yearly = 10x monthly (2 months free) -- plain seed data, tunable
-- later via an admin plan editor (Phase 8) without a migration.
INSERT INTO subscription_plans
  (key, name, plan_family, billing_period, price_ngwee, price_ngwee_byok, duration_days,
   messages_per_day, ai_replies_per_day, proactive_nudges_per_day, documents_per_day,
   included_seats, included_features, sort_order)
VALUES
  ('personal_daily',       'Personal',     'personal',     'daily',   800,    560,    1,   999999, 999999, 999999, 999999, 1, '{career_os,cv_studio,job_search,interview_coach,advisor_companion}', 10),
  ('personal_weekly',      'Personal',     'personal',     'weekly',  4500,   3150,   7,   999999, 999999, 999999, 999999, 1, '{career_os,cv_studio,job_search,interview_coach,advisor_companion}', 11),
  ('personal_yearly',      'Personal',     'personal',     'yearly',  149000, 104300, 365, 999999, 999999, 999999, 999999, 1, '{career_os,cv_studio,job_search,interview_coach,advisor_companion}', 13),

  ('professional_daily',   'Professional', 'professional', 'daily',   1400,   980,    1,   999999, 999999, 999999, 999999, 1, '{career_os,cv_studio,job_search,interview_coach,advisor_companion,business_os}', 20),
  ('professional_weekly',  'Professional', 'professional', 'weekly',  7500,   5250,   7,   999999, 999999, 999999, 999999, 1, '{career_os,cv_studio,job_search,interview_coach,advisor_companion,business_os}', 21),
  ('professional_monthly', 'Professional', 'professional', 'monthly', 24900,  17430,  30,  999999, 999999, 999999, 999999, 1, '{career_os,cv_studio,job_search,interview_coach,advisor_companion,business_os}', 22),
  ('professional_yearly',  'Professional', 'professional', 'yearly',  249000, 174300, 365, 999999, 999999, 999999, 999999, 1, '{career_os,cv_studio,job_search,interview_coach,advisor_companion,business_os}', 23),

  ('business_daily',       'Business',     'business',     'daily',   2800,   1960,   1,   999999, 999999, 999999, 999999, 5, '{career_os,cv_studio,job_search,interview_coach,advisor_companion,business_os,teams,analytics,automation}', 30),
  ('business_weekly',      'Business',     'business',     'weekly',  15000,  10500,  7,   999999, 999999, 999999, 999999, 5, '{career_os,cv_studio,job_search,interview_coach,advisor_companion,business_os,teams,analytics,automation}', 31),
  ('business_yearly',      'Business',     'business',     'yearly',  499000, 349300, 365, 999999, 999999, 999999, 999999, 5, '{career_os,cv_studio,job_search,interview_coach,advisor_companion,business_os,teams,analytics,automation}', 33)
ON CONFLICT (key) DO NOTHING;

-- ── subscriptions: lifecycle + BYOK + 4th (document) daily counter ─────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_period            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS uses_own_api_key           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_only_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS documents_remaining_today  INT NOT NULL DEFAULT 0;

UPDATE subscriptions s SET
  billing_period = p.billing_period,
  documents_remaining_today = p.documents_per_day
FROM subscription_plans p
WHERE s.plan_id = p.id AND s.billing_period IS NULL;

-- ── subscription_events: append-only billing timeline / audit log ─────────
-- Same "one append-only table per domain" convention as business_events/
-- document_events/goal_events. Powers the Billing Timeline (Phase 5) and
-- Revenue Intelligence (Phase 8) — never edited or deleted, only inserted.
CREATE TABLE IF NOT EXISTS subscription_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  VARCHAR(40) NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_created ON subscription_events(user_id, created_at DESC);
