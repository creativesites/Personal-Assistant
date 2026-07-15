# Pricing & Mobile Money Payments Plan

## 0. Why This Doc Exists

Zuri needs to start earning revenue before launch, in a market where Airtel Money/MTN MoMo are the default rails and third-party gateway integration (Stripe, Flutterwave) is a later-stage concern, not a launch blocker. This doc designs a tiered daily/weekly/monthly plan catalog and a manual-approval mobile-money payment flow that behaves like a real checkout to the user while requiring nothing more than an admin clicking "Approve" against a bank notification.

Nothing here is a rewrite of unrelated systems — it replaces three pricing schemes that already exist in this codebase and don't agree with each other, and it extends the one real subscriptions table that already exists rather than introducing a competing one.

---

## 1. Current State (confirmed by reading the code, not assumed)

Three pricing schemes currently coexist, and none of them are wired together:

- **`subscriptions`** (migration `0002_core.sql`, altered by `0016_pro_trial.sql` and `0022_subscriptions_unique.sql`) is the one real table: `id, user_id (UNIQUE), plan VARCHAR DEFAULT 'free', status VARCHAR DEFAULT 'active', stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, trial_ends_at, created_at, updated_at`. Every signup gets a row inserted with `plan = 'pro', status = 'trialing', trial_ends_at = NOW() + 30 days` (`services/api/src/routes/auth.ts:93-97` for Clerk-sync, `:170-173` for legacy register). `plan`/`status` are free-text strings, not FKs to anything — `'free'`/`'pro'`/`'business'` are the only values any code actually writes.
- **`apps/web/src/app/(marketing)/pricing/page.tsx`** is fully static — a hardcoded `PLANS` array with **Personal K200/mo, Business K400/mo, Enterprise K1800/mo** (Kwacha, matching the tiers this doc's spec proposes) — but every "Subscribe" CTA is a plain `<Link>` to `/register` or `/contact`. Nothing here calls an API, checks out, or creates anything.
- **`apps/web/src/app/(dashboard)/billing/page.tsx`** is a fully-built UI shell (plan card, usage bars, plan-comparison table, invoices list) wired to `useApi('/api/billing', token)` — **`GET /api/billing` does not exist anywhere in `services/api`**. This page has always rendered as an empty/loading shell in production. Its hardcoded comparison table uses yet a third scheme: **free/pro/business at $0/$29/$79**.
- **Stripe is declared, not implemented.** `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are env-var placeholders in `CLAUDE.md`; `subscriptions.stripe_customer_id`/`stripe_subscription_id` are unused columns. No Stripe SDK import exists anywhere in the repo.
- **No credit/quota table exists.** `token_usage_logs` (migration `0072`) is a cost-accounting log of every AI call platform-wide — useful for the diagnostics dashboard, not a per-user daily quota ledger.
- **Admin panel conventions** (`services/api/src/routes/admin.ts`, `services/api/src/plugins/authenticateAdmin.ts`): `authenticateAdmin` preHandler checks the JWT's `isAdmin` claim (`users.is_admin`, migration `0015`) with no extra DB round-trip; every mutating route inserts an `admin_audit_log` row (`admin_user_id, action ('noun.verb'), target_type, target_id, details jsonb`); the existing `GET /api/admin/billing` (`admin.ts:593-649`) is the closest template for a new pending-payments view — one aggregate-stats query plus one `LIMIT`-capped list query, consumed by a plain client component matching `apps/web/src/app/(admin)/admin/billing/page.tsx`'s dark-theme structure.
- **AI-call chokepoints relevant to quota gating** — `services/intelligence/app/workers/message_worker.py` is the single entrypoint for both message analysis (`_analyser.analyse()`, line 71-76, gated behind an existing `is_group` check at lines 60-69) and reply generation (`_reply_gen.generate()`, line 204-211, only on the `generate_suggestion` routing branch). Proactive nudges are **not** one call site — they're inserted across `proactive_queue` (six separate services: `proactive.py`, `clock_engine.py`, `interest_matcher.py`, `document_followups.py` ×2, `document_packs.py`, `agent_engine.py`) plus two more tables entirely (`gossip_worthy_events` via `gossip_detector.py`, and `proactive_interest_chats` via `motivational_detector.py`/`interest_companion.py`/`spiritual_companion.py`).
- **No calendar-triggered cron exists on the Node side.** Every wall-clock-scheduled job in this codebase lives in Python's `daily_worker.py` as an `asyncio.sleep`-until-target-hour loop — an explicit workaround (`daily_worker.py:411-422`) for a BullMQ-Python bug where repeatable jobs never reschedule. Node's only periodic mechanisms are two `setInterval`-every-60s poll workers (`recurring-documents-worker.ts`, `social-publish-worker.ts`) that check a per-row due-date column each tick, not a "run for everyone at midnight" job.

---

## 2. Single Source Of Truth: `subscription_plans`

All three existing pricing schemes get replaced by one DB-backed catalog. The marketing `/pricing` page, the dashboard billing page, and the admin billing view all read the same table — no more hardcoded price arrays anywhere in the frontend.

```sql
CREATE TABLE subscription_plans (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                       VARCHAR(30) NOT NULL UNIQUE,   -- 'free' | 'daily_pass' | 'weekly_pass' | 'monthly_personal' | 'monthly_business' | 'monthly_enterprise'
  name                      VARCHAR(100) NOT NULL,
  price_ngwee               BIGINT NOT NULL DEFAULT 0,     -- Kwacha stored as integer ngwee (K20.00 = 2000), same convention as documents.*_cents
  duration_days             INT NOT NULL,                  -- 1 | 7 | 30; free plan uses 30 as a nominal rolling window, see §7
  messages_per_day          INT NOT NULL,                  -- AI message analysis quota
  ai_replies_per_day        INT NOT NULL,                  -- AI reply-generation quota
  proactive_nudges_per_day  INT NOT NULL,                  -- proactive_queue / gossip_worthy_events / proactive_interest_chats combined quota
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE, -- lets a plan be retired without deleting history that references it
  sort_order                INT NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_plans (key, name, price_ngwee, duration_days, messages_per_day, ai_replies_per_day, proactive_nudges_per_day, sort_order) VALUES
  ('free',              'Free',               0,       30, 15,  5,   2,   0),
  ('daily_pass',        'Daily Pass',         2000,    1,  50,  20,  5,   1),
  ('weekly_pass',       'Weekly Pass',        8000,    7,  100, 50,  10,  2),
  ('monthly_personal',  'Monthly Personal',   20000,   30, 150, 75,  20,  3),
  ('monthly_business',  'Monthly Business',   40000,   30, 300, 150, 50,  4),
  ('monthly_enterprise','Monthly Enterprise', 180000,  30, 999999, 999999, 999999, 5);
```

Unlimited plans get the literal `999999`-per-day technical cap the original spec calls for, rather than a `NULL`-means-unlimited sentinel — one fewer null-check at every gating call site, and no realistic business exhausts it. `is_active`/`sort_order` exist because a plan lineup will change over time (promotional tiers, retiring the Daily Pass if nobody buys it) without ever needing to delete a row that a historical `subscriptions.plan_id` or `payment_requests.plan_id` still points to.

**Reconciling the spec's two credit models**: the original brief describes both three *separate* per-day limits (§1's table: messages / AI replies / proactive nudges) and a single unified "credits_remaining" pool (§3). This doc keeps the three-counter model — it's what the table in the brief actually specifies, it matches that analysis/generation/nudges are different-cost operations worth metering separately, and "credit" in the rest of this doc means "whichever of the three counters applies to the action being gated," not one shared bucket.

---

## 3. `subscriptions` — Extended, Not Replaced

The existing table gains the columns needed for daily quotas and payment tracking. Its current `plan`/`status` string columns stay exactly as they are — every existing admin.ts query keeps working — but new code reads `plan_id` and joins to `subscription_plans` instead of pattern-matching the string.

```sql
ALTER TABLE subscriptions
  ADD COLUMN plan_id                    UUID REFERENCES subscription_plans(id),
  ADD COLUMN messages_remaining_today    INT NOT NULL DEFAULT 0,
  ADD COLUMN ai_replies_remaining_today  INT NOT NULL DEFAULT 0,
  ADD COLUMN nudges_remaining_today      INT NOT NULL DEFAULT 0,
  ADD COLUMN credits_reset_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(); -- next time this row's daily counters roll over

UPDATE subscriptions s SET plan_id = p.id FROM subscription_plans p WHERE p.key = 'monthly_personal' AND s.plan = 'pro';
UPDATE subscriptions s SET plan_id = p.id FROM subscription_plans p WHERE p.key = 'monthly_business' AND s.plan = 'business';
UPDATE subscriptions s SET plan_id = p.id FROM subscription_plans p WHERE p.key = 'free' AND s.plan_id IS NULL;
UPDATE subscriptions SET
  messages_remaining_today = (SELECT messages_per_day FROM subscription_plans WHERE id = subscriptions.plan_id),
  ai_replies_remaining_today = (SELECT ai_replies_per_day FROM subscription_plans WHERE id = subscriptions.plan_id),
  nudges_remaining_today = (SELECT proactive_nudges_per_day FROM subscription_plans WHERE id = subscriptions.plan_id);
```

Every existing subscriber is backfilled onto the new catalog (`pro` → `monthly_personal`, `business` → `monthly_business`, anything unrecognized → `free`) and given a full day's credits so nobody is retroactively locked out the moment this migration runs.

`status` gains two new values used by the payment flow, on top of the existing `active`/`trialing`: `pending_payment` (a plan was selected and a payment reference was issued, nothing charged yet) and `payment_rejected` (an admin rejected the most recent attempt — distinct from `expired` so the UI can show "try again" rather than "renew"). `cancelled` already existed conceptually via `cancel_at_period_end`; no new column needed there.

---

## 4. `payment_requests` — One Row Per Payment Attempt

Payment attempts are not folded into `subscriptions` itself, because a subscription's current state (active plan, credits, period end) and the history of attempts to pay for it (including rejected/duplicate ones) are different lifecycles — cramming both onto one row loses the audit trail the admin approval flow depends on.

```sql
CREATE TABLE payment_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id    UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  plan_id            UUID NOT NULL REFERENCES subscription_plans(id),
  reference_code     VARCHAR(20) NOT NULL UNIQUE,   -- e.g. 'ZURI-A3F8'
  amount_ngwee       BIGINT NOT NULL,                -- snapshot of the plan price at request time
  payment_method     VARCHAR(30) NOT NULL DEFAULT 'mobile_money_manual' CHECK (payment_method IN (
                        'mobile_money_manual', 'mobile_money_airtel', 'mobile_money_mtn', 'stripe', 'flutterwave'
                      )),
  status             VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejected_reason    TEXT,
  reviewed_by         UUID REFERENCES users(id),      -- admin who approved/rejected
  reviewed_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_requests_status_created ON payment_requests(status, created_at DESC);
```

`payment_method`'s CHECK constraint already lists `stripe`/`flutterwave` as valid future values — per the original spec, adding a real gateway later is a new `payment_method` value and a webhook handler that calls the exact same "approve this payment request" code path an admin's click calls today, not a schema change.

---

## 5. Payment Flow — User Side

1. `GET /api/subscription-plans` (public, no auth) — powers both the marketing `/pricing` page and the in-app upgrade view. Returns the `is_active = TRUE` catalog ordered by `sort_order`, prices formatted the same way `documents`' `formatMoney` already does elsewhere.
2. User picks a plan and clicks Subscribe. If signed out, the existing Clerk sign-in/register flow runs first (no change needed — `/register` already exists as the marketing page's CTA target).
3. `POST /api/subscriptions/checkout { planId }` (authenticated) — looks up the user's current `subscriptions` row (always exists, created at signup per §1), generates a `reference_code` (`ZURI-` + 4 random uppercase base36 chars, retried on the unique-constraint collision case, which is astronomically rare but handled rather than assumed away), inserts a `payment_requests` row (`status = 'pending'`), and sets `subscriptions.status = 'pending_payment'` (the *existing* active plan, if any, keeps working until this new payment is approved or the user cancels the request — upgrading never mid-air revokes what they already paid for). Returns `{ referenceCode, amountNgwee, planName, mobileMoneyNumbers }` where the phone numbers are a small hardcoded settings value (Airtel + MTN), not a new DB table — there's exactly one merchant number pair for the whole platform, unlike the per-user `business_profiles.mobile_money` field that's for *Zuri's customers'* own invoicing.
4. The frontend shows the reference code, exact amount, and both mobile money numbers with a "Send this exact reference and amount, then tap 'I've Paid'" instruction. Tapping "I've Paid" is purely a UX affordance — it doesn't call any endpoint that changes state, since the actual state stays `pending_payment` until an admin acts; it just re-fetches `GET /api/subscriptions/me` so the badge visibly says "Pending Payment · usually approved within an hour" instead of the initial checkout screen.
5. `GET /api/subscriptions/me` (authenticated) — the customer-facing status the `/billing` page polls: current plan, status, credits remaining (all three counters), `current_period_end`, and — if `status = 'pending_payment'` — the latest `payment_requests` row's reference code and amount, so a user who navigates away and comes back still sees what they're waiting on.
6. Once approved (§6), the subscription flips to `active`, `current_period_start`/`current_period_end` are set from `NOW()`/`NOW() + plan.duration_days`, and all three credit counters are set to the plan's daily limits immediately — the spec's "credits are immediately available" promise.

---

## 6. Payment Flow — Admin Side

`GET /api/admin/payments?status=pending` (mirrors `GET /api/admin/billing`'s shape exactly) returns the pending queue: user email/name, plan name, amount, reference code, requested-at timestamp. `apps/web/src/app/(admin)/admin/payments/page.tsx` renders it as a table, same dark-theme/`useApi` pattern as the existing `(admin)/admin/billing/page.tsx`.

- `POST /api/admin/payments/:id/approve` — loads the `payment_requests` row (404 if not `pending`), updates it to `approved` + `reviewed_by`/`reviewed_at`, and atomically activates the linked subscription (`plan_id`, `status = 'active'`, fresh `current_period_start`/`current_period_end`, all three credit counters reset to the plan's limits, `credits_reset_at` set to `NOW() + 24h`). Inserts an `admin_audit_log` row (`action = 'payment.approve'`) exactly like every other mutating admin route.
- `POST /api/admin/payments/:id/reject { reason }` — updates the request to `rejected` + `rejected_reason`, sets the subscription back to `payment_rejected` (not touching whatever plan/credits it had before, if any — a rejected upgrade attempt never downgrades an already-active plan). Same audit-log convention (`action = 'payment.reject'`).

No new admin-permission concept is introduced — this reuses `authenticateAdmin` exactly as every other admin route does, including the pre-launch caveat already flagged in `admin.ts` that anyone can currently self-claim admin via `/admin-setup`. That caveat isn't new risk introduced by this feature, but it does mean the payment-approval surface inherits it; tightening `/admin-setup` before real money moves through this flow is a prerequisite this doc surfaces but doesn't fix (out of scope — see §10).

---

## 7. Credit Consumption & Gating

A single Python module, `services/intelligence/app/services/credits.py`, owns the atomic check-and-decrement:

```python
async def try_consume_credit(user_id: str, credit_type: Literal['message', 'ai_reply', 'nudge']) -> bool:
    column = {'message': 'messages_remaining_today', 'ai_reply': 'ai_replies_remaining_today', 'nudge': 'nudges_remaining_today'}[credit_type]
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""UPDATE subscriptions SET {column} = {column} - 1
                WHERE user_id = $1 AND status IN ('active', 'trialing') AND {column} > 0
                RETURNING id""",
            user_id,
        )
    return row is not None
```

One `UPDATE ... WHERE ... > 0 RETURNING` is the atomic primitive — no read-then-write race between two concurrent messages for the same user. `status IN ('active', 'trialing')` means a `pending_payment`/`payment_rejected`/`expired` subscription consumes nothing and every call returns `False`, which is the gate.

**Call sites, exactly matching the existing structure rather than inventing a new one:**
- **Message analysis** — `message_worker.py`, immediately after the existing `is_group` early-return (before line 71's `_analyser.analyse()` call): `if not await try_consume_credit(user_id, 'message'): return {'ok': True, 'skipped': 'no_credits'}`. Historical/backfill messages (the `is_historical` flag already threaded through this worker) are exempted from this check — re-analysing a user's own message history on first connect shouldn't burn their day's quota before they've sent a single live message.
- **Reply generation** — same file, inside the existing `elif` branch that leads to `_reply_gen.generate()` (line 204), guarded the same way. A message that fails the reply-credit check still keeps its analysis (already paid for above) — it just doesn't get an AI-drafted reply; the raw message still shows up in the Inbox for the user to answer manually.
- **Proactive nudges** — the same one-line guard wraps each of the eight discovered insertion sites: `proactive.py`, `clock_engine.py`, `interest_matcher.py`, `document_followups.py` (both of its two inserts), `document_packs.py`, `agent_engine.py`'s `agent_followup` insert, `gossip_detector.py`, and the shared `companion_delivery.py` helper that `motivational_detector.py`/`interest_companion.py`/`spiritual_companion.py` all funnel through (one gate here covers all three, since they already converge on one function). Each site calls `try_consume_credit(user_id, 'nudge')` immediately before its own `INSERT`, skipping the insert (and logging, matching each file's existing skip-logging convention) on `False`.

Advisor and Studio chat are **not** gated by this system — the original spec scopes billed actions to message analysis, reply generation, and proactive nudges, and extending metering to interactive chat is a separate, larger product decision (Advisor/Studio already have no usage limits today; this doc doesn't change that).

When a user's `ai_reply` credit is exhausted, `reply_gen.py` (or wherever the eventual "no reply available" state surfaces to the Inbox) shows the spec's friendly copy: *"You've used all your AI credits for today. Your credits will reset at midnight. Upgrade to a higher plan to continue using Zuri immediately."* — surfaced as a normal Inbox/notification message, not an HTTP 402, since there is no synchronous caller waiting on a response in any of these worker-driven call sites (this deviates from the original spec's literal "return 402" language — see §10).

---

## 8. Subscription Lifecycle Worker

Both "reset today's credits" and "expire a subscription whose period has ended" are pure Postgres operations on `subscriptions`, with no AI/Python involvement — they belong on the Node side, next to the table they operate on, as a new `services/api/src/workers/subscription-lifecycle-worker.ts` mirroring the exact `setInterval`-every-60-seconds house style `recurring-documents-worker.ts` already established (deliberately not a Python `daily_worker.py` addition — see §10 for why).

Each tick:
```sql
-- Roll over any subscription whose 24h window has elapsed, wherever that
-- happens to land for that user — a lazy per-row reset, not a single
-- "everyone at midnight server time" job. Avoids both the multi-replica
-- double-fire risk daily_worker.py's own comments flag for this exact
-- category of job, and the BullMQ-Python repeatable-job bug that motivated
-- that file's asyncio-sleep-loop workaround in the first place.
UPDATE subscriptions s SET
  messages_remaining_today = p.messages_per_day,
  ai_replies_remaining_today = p.ai_replies_per_day,
  nudges_remaining_today = p.proactive_nudges_per_day,
  credits_reset_at = NOW() + INTERVAL '24 hours'
FROM subscription_plans p
WHERE s.plan_id = p.id AND s.credits_reset_at <= NOW() AND s.status IN ('active', 'trialing');

-- Expire anything past its period end.
UPDATE subscriptions SET status = 'expired'
WHERE status IN ('active', 'trialing') AND current_period_end IS NOT NULL AND current_period_end < NOW();
```

This is an intentional, documented deviation from "reset at midnight" (§10) — the practical guarantee (credits refill roughly every 24 hours) is identical, and it's the only approach with real prior art in this codebase for a job of this shape.

---

## 9. Frontend Surfaces

- **`/pricing`** (marketing, currently static) becomes a thin fetch-and-render over `GET /api/subscription-plans` — same visual design, real data. The Subscribe CTA becomes a real button that (signed in) hits checkout directly or (signed out) sends the chosen `planId` through `/register`'s redirect so checkout can resume immediately after signup, instead of dropping the user back at a generic dashboard with no memory of what they picked.
- **`/billing`** (dashboard, currently non-functional) gets its first real backing endpoint (`GET /api/subscriptions/me`) instead of the never-built `/api/billing`. Same page structure (plan card, usage — now three real credit bars instead of the old contacts/messages/AI-suggestions placeholders, since those aren't the metered quantities anymore) plus a new pending-payment state: reference code, amount, mobile money numbers, "usually approved within an hour" messaging, matching §5 step 4.
- **`/admin/payments`** (new) — pending-queue table with Approve/Reject actions, matching `(admin)/admin/billing/page.tsx`'s existing dark theme and `useApi` pattern exactly, per §6.

---

## 10. Deviations From The Original Spec (called out explicitly)

1. **Reused `subscriptions`, not a new `user_subscriptions` table** — avoids a second source of truth colliding with the trial-signup and admin code that already write to `subscriptions` today.
2. **Three separate daily counters, not one shared credit pool** — reconciles the spec's own internally-inconsistent §1 (three limits) vs. §3 (one balance) language; §1's table is what's kept.
3. **Credit checks live in Python via direct Postgres access, not a Node HTTP round-trip** — consistent with every other piece of state both services already share directly (contacts, documents, business_profiles); no new cross-service call pattern needed.
4. **Proactive-nudge gating covers eight call sites across three tables**, not the one function the spec named — the real insertion points, discovered by reading every service that writes a nudge.
5. **No HTTP 402 anywhere** — every metered action happens inside a background worker with no synchronous caller to hand a status code to; the friendly "out of credits" message surfaces through the Inbox/notification channel that already exists for exactly this kind of user-facing state, instead.
6. **Credit reset is a lazy per-row 24-hour rollover on a Node poll worker, not a Python midnight cron** — sidesteps a known BullMQ-Python bug and a documented multi-replica double-fire risk, while delivering the same practical "credits refill about once a day" guarantee.
7. **The existing 30-day trial is retargeted at `monthly_personal`'s limits instead of being removed** — new signups keep getting the same 30 days of real access they get today (unchanged duration), just now expressed through the plan catalog instead of a bare `'pro'` string; falling back to the `free` plan's tighter limits only happens once that trial actually expires.
8. **`/admin-setup`'s pre-launch self-claim-admin caveat is surfaced, not fixed** — this feature makes admin access more consequential (it now gates real payment approvals), but tightening that endpoint is a separate, already-flagged piece of work this doc doesn't take on.

---

## 11. Rollout Phasing

1. Migration `0073_subscription_plans_and_payments.sql` — `subscription_plans` (seeded), `subscriptions` ALTER + backfill, `payment_requests`.
2. `services/intelligence/app/services/credits.py` + wire into all message/reply/nudge call sites (§7). Verify via a user with `messages_remaining_today = 0` producing a silent skip, not an error.
3. `services/api` — `GET /api/subscription-plans`, `POST /api/subscriptions/checkout`, `GET /api/subscriptions/me`, admin payments routes (§6), `subscription-lifecycle-worker.ts` started alongside the existing poll workers.
4. Frontend — live `/pricing`, live `/billing`, new `/admin/payments`.
5. End-to-end: sign up → subscribe → see reference code → admin approves → credits populate → message analysis/reply/nudge consume credits → exhausted quota degrades gracefully → lifecycle worker resets the next day.

## 12. Deliberately Out Of Scope

Real Stripe/Flutterwave integration (schema is ready per §4's `payment_method` CHECK list, no code written); per-seat/team billing; prorated upgrades mid-period; refunds; metering Advisor/Studio chat (§7).
