# Zuri Membership & Payments Platform

## 0. Why This Doc Exists

`docs/PRICING_PAYMENTS_PLAN.md` (migration `0073`) shipped a working slice: a 6-tier plan catalog, a manual mobile-money checkout flow, and three daily AI-action credit counters. It works, but it is narrow — there is no plan-based feature gating anywhere in the product (`FeatureGate` is defined but never imported), trial expiry is silently broken (`current_period_end` is never set at signup, so the lifecycle worker's expiry check never fires for a trial), admin payment approval isn't transactional, and there is no referral/gift/promo/student/org-seat/revenue-analytics layer at all.

This doc redesigns the whole system as a **Subscription & Membership Platform** — built for Zambia's mobile-money-first market rather than a card-first Stripe clone — per the user's own design brief: 5 simplified tiers, feature-based marketing copy ("Unlimited AI Replies," not "50 messages"), a 7-day full-access trial, a guided 4-step manual payment flow, a premium billing dashboard, a grace-period/read-only lifecycle that never hard-locks a user out of their own data, contextual upgrade prompts, and a full promotion/growth layer. It supersedes `PRICING_PAYMENTS_PLAN.md` as the source of truth for billing — that doc's §1–§9 ground-truth research is still accurate context for what already existed before this plan, and is not repeated here.

Payments are received on **Airtel Money `0979046745`** and **MTN MoMo `0762368105`**, both registered to Winston Zulu (`services/api/src/config.ts`'s `MOBILE_MONEY_AIRTEL_NUMBER`/`MOBILE_MONEY_MTN_NUMBER`).

---

## 1. Architecture — Six Modules

| Module | Owns | Status |
|---|---|---|
| **Membership Engine** | Plan catalog, trials, subscriptions, renewals, grace period, lifecycle worker | Extends existing `subscription_plans`/`subscriptions` |
| **Payment Engine** | Guided manual mobile-money flow, `payment_requests`, admin approval, payment matching | Extends existing `payment_requests`/`admin-payments.ts` |
| **Entitlement Engine** | Which features a plan family unlocks; the read-only-mode write gate | New |
| **Usage Engine** | Per-period usage aggregation for the billing dashboard + "Zuri helped you" copy | New — one compute-on-read endpoint, same discipline as Studio's insights endpoint |
| **Promotion Engine** | Referrals, gifts, promo codes, student verification | New |
| **Revenue Intelligence** | MRR/DRR/WRR, trial conversion, churn, renewals due, payment matching | New, admin-only |

Keeping these six concerns separate — rather than one growing `subscriptions` god-table — is deliberate: a plan's *price* (Payment Engine), what it *unlocks* (Entitlement Engine), and how much of it a user has *used* (Usage Engine) are three different questions with three different read patterns, and conflating them is exactly what made the pre-existing system hard to extend.

---

## 2. The Plan Catalog

Five families: `free`, `personal`, `professional`, `business`, `enterprise`. `subscription_plans.plan_family` carries this; `subscription_plans.key` stays the unique sellable SKU (e.g. `personal_monthly`), now encoding family + billing period.

**Feature-based marketing, not credit-based.** The product surface a plan unlocks:

| Family | Unlocks |
|---|---|
| Free | Personal CRM, limited AI/replies/documents (real numeric caps), basic Career/Business tools |
| Personal | + unlimited CRM, Career OS, CV Studio, Job Search, Interview Coach, Advisor, AI Companion, unlimited Documents |
| Professional | + Business OS (Products, Services, Projects, Quotations, Invoices, Business Manager, Inventory, Opportunities) |
| Business | + Teams, Analytics, Advanced Automation, shared workspace |
| Enterprise | + Enterprise API (webhooks, API keys, white-label, data retention, CRM connect) — custom pricing, "Contact Sales" |

`subscription_plans.included_features TEXT[]` stores the unlocked feature-area keys (`career_os`, `cv_studio`, `job_search`, `interview_coach`, `advisor_companion`, `business_os`, `teams`, `analytics`, `automation`, `enterprise_api`) — see §4.

**Numeric daily caps still exist, but stop being marketed as "credits."** Free keeps real caps on `messages_per_day`/`ai_replies_per_day`/`proactive_nudges_per_day`/`documents_per_day` (the new 4th counter). Every paid tier sets these to `999999` and the UI renders that as "Unlimited." This is the difference between *marketing* language (outcomes) and the *technical* ceiling that still protects against a single account driving unbounded AI cost.

**Multi-cadence pricing.** Each paid family gets up to 4 period rows (`daily`/`weekly`/`monthly`/`yearly`); Free has one `trial` row. Anchor = monthly:

| Family | Monthly | Weekly (≈mo/4×1.15) | Daily (≈wk/7×1.3) | Yearly (10×mo) |
|---|---|---|---|---|
| Personal | K149 | K45 | K8 | K1,490 |
| Professional | K249 | K75 | K14 | K2,490 |
| Business | K499 | K150 | K28 | K4,990 |
| Enterprise | custom | — | — | — |

**BYOK discount.** `price_ngwee_byok` on every paid row = 30% off the standard price for that same (family, period). Checkout applies it when the caller has a row in `byok_keys` (`services/api/src/routes/enterprise.ts` — this table already exists; BYOK stays available to any paying tier as a discount lever, not an Enterprise exclusive). Seed prices are plain data — an admin plan-editor (Phase 8) lets these be tuned without a migration.

**Migration mapping for existing subscribers:** `monthly_personal`→`personal_monthly`, `monthly_business`→`business_monthly`, `monthly_enterprise`→`enterprise_monthly` (repoint `subscriptions.plan_id`, old rows kept for FK history). `daily_pass`/`weekly_pass` rows flip `is_active=false` (retired from new purchase) but existing holders finish their current period unaffected.

---

## 3. Membership Engine — Trial, Lifecycle, Grace Period

**7-day trial, not 30.** Signup (`auth.ts`, both Clerk-sync and legacy paths) creates a `subscriptions` row on the `free` plan with `status='trialing'`, `trial_ends_at = NOW() + 7 days`, and — the critical fix — **`current_period_end = NOW() + 7 days`** (today only `trial_ends_at` is set, so the lifecycle worker's `WHERE current_period_end < NOW()` clause never actually expires a trial; this has been silently broken since migration `0073`). During `trialing`, the Entitlement Engine treats the effective plan family as **`business`** (a constant, `TRIAL_GRANTS_FAMILY`) — "you've unlocked all Premium features for 7 days," one tier short of Enterprise's custom/unlimited framing.

**Lifecycle states**, in order, none of them a hard lockout:

```
active/trialing → grace_period (current_period_end passed, grace_period_days from the plan, default 7)
                → read_only (grace_period_ends_at passed, no renewal)
```

Full feature access continues through `grace_period` — only entering `read_only` triggers the Entitlement Engine's mutation guard (§4). A `read_only` user can always view, search, export, and read every record they own; they cannot generate AI content or create new projects/invoices/products/documents. **Nothing is ever deleted.** Every transition writes one `subscription_events` row (new append-only table — same "one audit table per domain" convention as `business_events`/`document_events`/`goal_events`), which doubles as the source for the Billing Timeline (§6) and Revenue Intelligence (§8).

`subscription-lifecycle-worker.ts`'s existing 60-second poll loop (`resetDueCredits`/`expireEndedSubscriptions`) gains the two new transitions in place of the single blunt `expired` state.

---

## 4. Entitlement Engine

`services/api/src/lib/entitlements.ts` — mirrors `marketing-access.ts`'s exact shape:

- `FEATURE_AREAS`: `career_os | cv_studio | job_search | interview_coach | advisor_companion | business_os | teams | analytics | automation | enterprise_api`.
- `PLAN_FEATURES: Record<PlanFamily, Set<FeatureArea>>` per §2's table.
- `getEffectivePlanFamily(subscription)` — joins the plan row, applies the trial override.
- `requireFeature(area)` — Fastify preHandler; 402 with `{error, upgradeRequired: {feature, currentFamily, requiredFamily}}` (the exact payload the frontend's contextual-upgrade UI renders, §7).
- A **global** mutation-guard hook registered once in `app.ts` (not per-route): any `POST|PUT|PATCH|DELETE` from a `read_only` account gets a 402 renew-to-continue payload, except an explicit allowlist (`/api/auth/*`, `/api/subscriptions/*`, `/api/webhooks/*` inbound, health checks).

`requireFeature(...)` is wired onto every route file mapped by this session's research: all `career-*.ts` route files → `career_os`/`cv_studio`/`job_search`/`interview_coach`; `studio.ts`, `products.ts`, `services.ts`, `product-families.ts`, `inventory-locations.ts`, `purchase-orders.ts`, `projects.ts`, `suppliers.ts` → `business_os`; `team.ts`, `analytics.ts`, `agents.ts`, `proactive.ts` → `teams`/`analytics`/`automation`; `enterprise.ts`'s webhook/API-key/white-label/data-retention/CRM routes → `enterprise_api`. `documents.ts`, `advisor.ts`, `contacts.ts`, `relationships.ts`, `goals.ts` stay ungated (Free-tier-available per the plan), relying on the numeric daily caps instead.

---

## 5. Payment Engine — Guided Manual Mobile-Money Flow

Four steps, replacing today's single "Subscribe" button:

1. **Choose Plan** — family, billing period, BYOK toggle (if the user has a `byok_keys` row).
2. **Choose Network** — Airtel or MTN (`payment_requests.payment_method` already supports `mobile_money_airtel`/`mobile_money_mtn`).
3. **Pay To** — number, amount, reference code, with Copy Number / Copy Reference / "I Have Paid" buttons.
4. **Confirm** — payer's own phone number, optional time paid, optional screenshot upload (multipart, same pattern `career-documents.ts`'s resume upload already uses, stored under `DOC_STORAGE_DIR/payment-screenshots/`) — then "Waiting for confirmation, estimated 5–30 minutes."

`POST /api/subscriptions/checkout` gains `billingPeriod`, `useOwnApiKey`, `promoCode`, `referralCode`. `payment_requests` gains `payer_phone_number`, `payer_paid_at`, `payment_screenshot_path`. New `POST /api/subscriptions/checkout/:paymentRequestId/confirm` covers step 4.

---

## 6. Usage Engine + Premium Billing Dashboard

One compute-on-read endpoint, `GET /api/billing/usage-summary`, scoped to `current_period_start..now`, feeds two things at once: the Usage cards (documents generated, AI conversations, projects, customers, job searches/opportunities detected, interviews prepared, invoices) and the "This month Zuri helped you..." narrative (a documented, honestly-estimated "hours saved" figure). `GET /api/billing/timeline` merges `subscription_events` + `payment_requests` into one chronological feed (same `UNION ALL` convention `reflection.ts`'s timeline already uses).

`/billing` is rebuilt in the Zuri design system: a large **Membership Card** (plan, status, valid-until, next renewal amount), a **Progress Ring** (days remaining, SVG), the **Usage Cards**, the **Billing Timeline**, and Upgrade/Renew/Manage buttons opening the guided payment flow.

---

## 7. Contextual Upgrade Intelligence

`FeatureGate` (currently dead code — defined, never imported anywhere) is revived with a `requiredFamily` prop and wraps every Entitlement-Engine-gated page with a locked empty-state and exact-copy CTA ("Available on Personal. Upgrade now."), reading `planFamily` off the session (added to the Clerk-sync response). The daily-AI-limit-reached case ("You've already generated 24 AI replies today. Upgrade for unlimited assistance.") surfaces through the existing Inbox/notification conventions rather than a new mechanism — `try_consume_credit` fails silently today; this phase gives that failure a UI.

---

## 8. Promotion Engine

- **Referrals** — one auto-generated `referral_codes` row per user; redemption (`referral_redemptions`) applies **+14 days on `current_period_end` for both parties**, triggered by the *referred* user's first approved payment (not signup, to prevent abuse). One reward mechanism, not a separate "AI bonus pack" path — paid tiers already market unlimited AI, so a bonus-credits reward doesn't differentiate.
- **Gift memberships** — reuses the guided payment flow's plan/period/network/pay-to/confirm steps but collects a recipient instead of activating the gifter's own subscription; admin approval generates a `redemption_code` (`gift_memberships`) the gifter shares manually; a `/redeem/:code` page applies it to the recipient's account.
- **Promo codes** — `promo_codes`/`promo_code_redemptions`, admin CRUD, applied at checkout (percentage/fixed/free-days discount types, optional plan-family restriction, optional max-redemptions).
- **Student verification** — `student_verifications` mirrors `payment_requests`' approve/reject shape exactly (proof-of-status upload, admin review); approval unlocks a 50%-off Personal variant seeded as its own catalog row.

---

## 9. Organizations/Seats + Admin Revenue Intelligence

Seats reuse the **already-fully-built** `teams`/`team_members` tables (migration `0019`) rather than inventing parallel org machinery — `team.ts`'s invite endpoint checks the current member count against the owner's plan's `included_seats`, blocking with an upgrade message once exceeded. Dynamic seat-purchase-at-checkout math (buy 25/100/500 seats) is real added scope, deliberately deferred — documented, not built, matching this codebase's "ship a real slice, document the rest" discipline.

`GET /api/admin/revenue` computes MRR/DRR/WRR (normalizing each active plan's price to a daily rate by `duration_days`), trial conversion rate, churn rate, renewals due today, and failed renewals — all deterministic SQL, no LLM call, same discipline as every other Zuri Insights-style endpoint in this codebase.

`POST /api/admin/payments/match` is "Intelligent Payment Detection," honestly scoped: the admin pastes the raw mobile-money confirmation text they received into a textarea; a plain-code parser extracts amount/phone-fragment/sender name and fuzzy-matches against pending `payment_requests` (reference-code substring, exact amount, phone match), returning a ranked confidence list for one-click approve. This is **not** a live SMS-reading integration — no such infrastructure exists yet. It is a natural future extension of the Kotlin companion app's existing `NotificationListenerService` (already reads Android notifications for WhatsApp relay) to also forward the admin's own mobile-money confirmation texts — documented as a deferred Part-2 enhancement, not built here.

---

## 10. Deliberately Deferred

- Real Stripe/Flutterwave/card payments (schema already reserves the `payment_method` values; no SDK integration).
- Dynamic seat-purchase-at-checkout pricing math.
- A live SMS/notification-reading integration for payment matching (manual paste only, for now).
- Prorated upgrades/downgrades mid-cycle (a plan change today takes effect on next renewal).
- Refund processing.
- An admin plan-editor UI beyond direct seed-data edits (the schema is ready; a full CRUD screen is a later, lower-priority pass).

---

## 11. Build Order

Nine phases, each migration-tested + typechecked + committed + pushed independently:

1. Membership Engine foundation — migration `0083`, catalog redesign, trial/lifecycle fixes, transactional admin approval, 4th `document` credit type.
2. Entitlement Engine — backend feature gating + read-only mutation guard.
3. Guided multi-step payment flow.
4. Grace period, read-only mode, billing notifications (+ the missing `/api/notifications` route the frontend already calls).
5. Premium billing dashboard (Usage Engine + frontend).
6. Contextual upgrade intelligence (revive `FeatureGate`).
7. Promotion Engine — migration `0084`, referrals/gifts/promo codes/student verification.
8. Organizations/seats + admin Revenue Intelligence.
9. Documentation (this doc + CLAUDE.md) + full end-to-end verification.

## 12. Verification (every phase)

- Fresh local Postgres, full migration chain (`0001`→current, skip `0053`), confirm idempotent re-run.
- `python3 -m py_compile`/`compileall` across `services/intelligence/app` for any Python touched.
- `npx tsc --noEmit` in `services/api` and `apps/web`.
- A manual check of that phase's specific new endpoint/UI before moving to the next.
- Commit + push to `main` after each phase (Branch Policy).
