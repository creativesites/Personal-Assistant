-- Pricing & Mobile Money Payments (see docs/PRICING_PAYMENTS_PLAN.md for the
-- full design). Replaces three previously-inconsistent, hardcoded pricing
-- schemes (the static /pricing marketing page, the non-functional /billing
-- dashboard page, and subscriptions.plan's bare 'free'/'pro'/'business'
-- strings) with one DB-backed catalog, and extends the existing
-- subscriptions table (migration 0002, altered by 0016/0022) with the daily
-- credit counters and payment-request tracking needed for a manual mobile
-- money approval flow.

CREATE TABLE IF NOT EXISTS subscription_plans (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                       VARCHAR(30) NOT NULL UNIQUE,
  name                      VARCHAR(100) NOT NULL,
  price_ngwee               BIGINT NOT NULL DEFAULT 0,
  duration_days             INT NOT NULL,
  messages_per_day          INT NOT NULL,
  ai_replies_per_day        INT NOT NULL,
  proactive_nudges_per_day  INT NOT NULL,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order                INT NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_plans (key, name, price_ngwee, duration_days, messages_per_day, ai_replies_per_day, proactive_nudges_per_day, sort_order) VALUES
  ('free',               'Free',               0,      30, 15,     5,      2,      0),
  ('daily_pass',         'Daily Pass',         2000,   1,  50,     20,     5,      1),
  ('weekly_pass',        'Weekly Pass',        8000,   7,  100,    50,     10,     2),
  ('monthly_personal',   'Monthly Personal',   20000,  30, 150,    75,     20,     3),
  ('monthly_business',   'Monthly Business',   40000,  30, 300,    150,    50,     4),
  ('monthly_enterprise', 'Monthly Enterprise', 180000, 30, 999999, 999999, 999999, 5)
ON CONFLICT (key) DO NOTHING;

-- subscriptions.plan/status stay exactly as they are — every existing query
-- (admin.ts's stats/joins, auth.ts's trial insert) keeps working unmodified.
-- New code reads plan_id and joins to subscription_plans instead of
-- pattern-matching the plan string.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan_id                   UUID REFERENCES subscription_plans(id),
  ADD COLUMN IF NOT EXISTS messages_remaining_today   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_replies_remaining_today INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nudges_remaining_today     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_reset_at           TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill every existing subscriber onto the new catalog and give them a
-- full day's credits immediately, so nobody is retroactively locked out the
-- moment this migration runs. The 30-day 'pro' trial keeps its existing
-- duration/behavior — it's just retargeted at monthly_personal's limits.
UPDATE subscriptions s SET plan_id = p.id FROM subscription_plans p WHERE p.key = 'monthly_personal' AND s.plan = 'pro' AND s.plan_id IS NULL;
UPDATE subscriptions s SET plan_id = p.id FROM subscription_plans p WHERE p.key = 'monthly_business' AND s.plan = 'business' AND s.plan_id IS NULL;
UPDATE subscriptions s SET plan_id = p.id FROM subscription_plans p WHERE p.key = 'free' AND s.plan_id IS NULL;

UPDATE subscriptions s SET
  messages_remaining_today = p.messages_per_day,
  ai_replies_remaining_today = p.ai_replies_per_day,
  nudges_remaining_today = p.proactive_nudges_per_day,
  credits_reset_at = NOW() + INTERVAL '24 hours'
FROM subscription_plans p
WHERE s.plan_id = p.id;

-- One row per attempted payment — kept separate from subscriptions itself
-- since a subscription's current state and the history of attempts to pay
-- for it (including rejected/duplicate ones) are different lifecycles; the
-- admin approval queue and audit trail both depend on that history existing.
CREATE TABLE IF NOT EXISTS payment_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id  UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  plan_id          UUID NOT NULL REFERENCES subscription_plans(id),
  reference_code   VARCHAR(20) NOT NULL UNIQUE,
  amount_ngwee     BIGINT NOT NULL,
  payment_method   VARCHAR(30) NOT NULL DEFAULT 'mobile_money_manual' CHECK (payment_method IN (
                      'mobile_money_manual', 'mobile_money_airtel', 'mobile_money_mtn', 'stripe', 'flutterwave'
                    )),
  status           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejected_reason  TEXT,
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_status_created ON payment_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_user ON payment_requests(user_id);
