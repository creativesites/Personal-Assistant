# Zuri Relationship Operating System (rOS) — Master Plan

**Date**: July 2026
**Status**: Phase 0 (Foundation & Conflict Resolution, §12) shipped: `deals` table + backfill from `conversation_funnel_stages` (migration `0037`), a `deals` CRUD API that keeps `contacts.pipeline_stage` in sync as a cache and records `revenue_events` on close-won, the `customer_status` vocabulary mismatch between `leads.ts` and the Contacts UI is reconciled, and the orphaned `/relationships/[id]` page's Clocks tab is merged into `/contacts/[id]` (old route now redirects). §13's open decisions are resolved. Phase 1 (Health v2 & Always-Tell-Them-Why, §5.1/§12) shipped: `health.py` rewritten around five weighted signals (recency 30%, frequency 20%, sentiment 20%, responsiveness 15%, pipeline velocity 15%, each normalized to -1..+1 and scaled around a base of 70), `pipeline_velocity` stays neutral for relationships with no open `deals` row so personal relationships are never penalized for lacking one, a small proactive-engagement bonus, and a plain-English `change_reason` derived from the top 1-2 moved factors — now actually written to the previously-dead `relationship_health_logs.contributing_factors` column. The frontend surfaces this on `/contacts/[id]`: a "why" caption under the hero health ring (most recent `changeReason`) and a per-factor breakdown of chips under each Health History entry. Phase 2 (Opportunities & Business Graph, §5.7/§5.8/§5.11/§12) shipped: `opportunities` and `relationship_connections` tables (migration `0038`); a detector pass that adds `opportunities_mentioned`/`connections_mentioned` structured fields onto the existing per-message `ANALYSE_MESSAGE` LLM call (same pattern as `business_facts_mentioned`), writing through new `OpportunityService`/`ConnectionService` classes wired into `message_worker.py`; `health.py` also flags `churn_risk` opportunities when a relationship declines for 2 consecutive recalculations with negative sentiment or lengthening recency; `opportunities`/`connections` CRUD routes and a `GET /api/proactive/recommendations` endpoint that ranks `proactive_queue` ∪ `opportunities` ∪ stalling `deals` by one composite score (stall thresholds match `health.py`'s); the frontend's old `OPPORTUNITY_KEYS` substring-matching convention on `/contacts/[id]` is replaced by real `opportunities` data plus a "Connected To" Business Graph list, and `/proactive` gained a Queue/Recommendations view toggle. Phase 3 (Products Integration & Network/Connection Value, §5.1/§5.6/§6.4/§6.6/§12) shipped: `contact_products` (reusing the existing `products` catalog) and `contact_life_events` tables, plus `relationships.network_value` JSONB (migration `0039`); detection extends the same per-message `ANALYSE_MESSAGE` pass with `products_mentioned`/`life_events_mentioned` fields, resolved against the catalog/contact by name match through new `ContactProductService`/`LifeEventService` classes; a new `NetworkValueService` computes a business shape (financial/referral value from `revenue_events`/`relationship_connections`, influence/decision-authority/strategic-value heuristics) or a personal Connection Value shape (closeness/reciprocity/support counts from `message_analyses` direction+sentiment) depending on whether the relationship shows any business signal at all, recomputed alongside health; replacement-date prediction wires into `opportunities` via `clock_engine.py`'s existing 15-minute wall-clock sweep (`check_product_replacements`), the one place in the codebase that already runs independent of message arrival. `/contacts/[id]` now renders a Network/Connection Value card, a Products list (with replacement-due dates), and a Life Events timeline. This plan is grounded in an audit of what already exists (§2) so the build phases (§12) extend and reconcile real code rather than duplicating it.

---

## 1. The Philosophy

> **The CRM should never ask the user "What happened?" It should always tell the user what is happening, why it's happening, and what to do next.**

Every feature in this plan is judged against that bar. A metric without a reason is a number. A number without a next action is trivia. The three questions — *what's happening, why, what do I do* — are the acceptance test for every screen, every notification, every AI-generated line.

This applies identically to a Lusaka shop owner tracking a WhatsApp customer and to someone using Zuri in **Personal mode** to stay close to family and friends. A missed birthday and a missed contract renewal are the same shape of problem: a relationship quietly decaying because no system was watching it. rOS watches all of them, in one place, with one underlying engine — surfaced differently depending on what kind of relationship it is.

---

## 2. What Already Exists Today (Audit)

Zuri is not starting from zero. A relationship intelligence layer already runs in production. This section is the accurate baseline — every feature proposed later in this doc says explicitly whether it *extends*, *reconciles*, or is *net-new* relative to what's below.

### 2.1 Data model today

**`contacts`** (`db/migrations/0003, 0021, 0034`): `id, user_id, whatsapp_jid, phone_number, display_name, custom_name, avatar_url, is_group, is_business, last_message_at, email, company, job_title, industry, website, notes, customer_status, pipeline_stage, lead_score, source, archived_at, source_product_id, source_social_post_id`.

**`relationships`** (`0003_contacts.sql`): `id, user_id, contact_id, relationship_type, relationship_subtype, importance_tier (1-5), health_score (0-100, default 70), health_trend, dormancy_alert_days (default 30), last_interaction_at, notes, is_auto_managed`.

**`relationship_health_logs`**: append-only, `relationship_id, health_score, previous_score, change_reason, contributing_factors (JSONB), logged_at`. **`contributing_factors` is schema-only — never populated.** Every log row today just says `change_reason = 'automated_recalculation'`. This is the single best extension point for the "always tell them why" philosophy — see §5.4.

**`contact_profiles`** (`0005, 0024, 0028`): `personality_summary, communication_style, emotional_patterns (JSONB), known_triggers (JSONB), current_life_context, mood_baseline, preferred_contact_frequency, preferences, goals, pain_points, buying_behaviour, relationship_stage, locked_fields (TEXT[]), user_edited_fields (TEXT[]), structured_attributes (JSONB, merged not replaced)`.

**`contact_insights`** (`0005, 0021`): atomic AI-observed facts — `insight_key, insight_value, confidence, evidence_count, source_message_ids, supporting_text, is_active, superseded_by`. Old insights are marked inactive and replaced wholesale each profiling pass (unlike `structured_attributes`, which merges).

**Memory Engine** (`docs/MEMORY_ENGINE_PLAN.md`, all 6 phases shipped): `relationship_memory` (outstanding_promises, missed_followups_count, conversation_themes, important_dates, shared_history_since), `business_facts` (confidence-merge fact store, 15 categories), `agent_memories` (`fact`/`experience` discriminator, pgvector), Redis-backed conversation memory (3-day TTL). `retrieval_service.py` is the single fetch point every engine below calls through.

**Temporal / proactive layer**: `relationship_clocks` (`0012`) — `clock_type IN ('dormancy_watch','weekly_touchpoint','daily_checkin','post_event_followup')`, and critically, **per-relationship learned cadence**: `avg_days_between_messages`, `std_dev_days`, `peak_hours`, `typical_day_of_week`. `proactive_queue` (`0006`) — `suggestion_type IN ('check_in','birthday_message','follow_up','congratulate','condolence','reconnect','respond_to_event','relationship_maintenance')`, `priority (1-5)`, `status`.

**Business/pipeline layer** (`0018_analytics.sql`): `conversation_funnel_stages` (`stage IN ('lead','qualified','opportunity','proposal','closed_won','closed_lost','churned')`), `revenue_events` (`event_type IN ('deal_closed','upsell','renewal','churn')`, `amount_cents`), `suggestion_outcomes`, `analytics_events`, `analytics_snapshots`.

**Marketing-side additions** (this repo, migrations `0031-0035`): `products`, `content_generations`, `social_accounts`, `social_posts`, plus `contacts.source_product_id`/`source_social_post_id` for manual lead attribution.

### 2.2 Engines today

- **Health score** (`services/intelligence/app/services/health.py`) — base 70, `+recency(-30..+20 based on days_silent vs dormancy_alert_days) + sentiment(-10..+10, avg of last-30-days message_analyses)`. Triggered every 5th live message per contact (every 20th during historical backfill) — message-count-driven, not time-driven. **No frequency, responsiveness, or pipeline-velocity factor exists today** — this is exactly what §5.1's weighted algorithm proposes adding.
- **Temporal engine** (`clock_engine.py`) — evaluates each relationship's clock every 15 minutes; `dormancy_watch` fires based on the contact's *own* learned average gap ± 1.5 standard deviations, not a fixed threshold. **This already solves the "different markets need different cadence expectations" problem the user's market-profile matrix is reaching for** — see §10.
- **Proactive engine** (`proactive.py`) — daily at 07:00 UTC, ranks contacts by `importance_tier ASC, health_score ASC`, generates one LLM-drafted suggestion per contact into `proactive_queue`.
- Both read through `retrieval_service.get_contact_summary()` / `get_relationship_memory()` — never through `context_snapshots` (that table is dead code, confirmed).

### 2.3 Frontend surfaces today

- **`/relationships`** (list) → cards link to **`/contacts/${id}`**.
- **`/relationships/[id]`** — fully built (stat cards, Overview/Insights/History/**Clocks** tabs — the Clocks tab is the only place a user can see/toggle their own relationship clocks) — **but nothing links to it.** It's an orphaned route.
- **`/contacts/[id]`** (1793 lines, the largest page in the app) — tabs are actually `Profile / AI Profile / Activity / Calendar / Docs / Messages` (CLAUDE.md's "Overview/Messages/AI Notes" description is stale). Has an ad-hoc `OPPORTUNITY_KEYS` convention (`buying_signal, purchase_intent, interest, opportunity, upsell, cross_sell, renewal, churn_risk`) that renders insight badges as if they were structured opportunities — they aren't; it's string-matching on `insight_key`.
- **`/leads`** — a fourth, separate surface (hot/warm/cold pipeline view) on top of the same `contacts` rows.

### 2.4 The 5-layer memory model, mapped

The user's proposed Working / Episodic / Semantic / Strategic / Emotional model already has a home in what's built:

| Proposed layer | Already implemented as |
|---|---|
| Working Memory | Redis conversation memory (3-day TTL) |
| Episodic Memory | `agent_memories` (`memory_type='experience'`) + `relationship_memory.conversation_themes`/`important_dates` |
| Semantic Memory | `business_facts` + `contact_insights` |
| Strategic Memory | `agent_memories` (`memory_type='fact'`) + `contact_profiles.structured_attributes` |
| Emotional Memory | `contact_profiles.emotional_patterns`/`mood_baseline` + `message_analyses.sentiment` feeding `health.py` |

No new memory infrastructure is needed for this plan — rOS is a **presentation and detection layer on top of memory that already exists**, not a new memory system.

### 2.5 Tier gating already defined

`docs/PRODUCT_VISION.md` already specifies which engines are Personal-tier-safe: Relationship Intelligence, Temporal Intelligence (basic), Opportunity Detection, and basic Governance are on the **free Personal tier**. Autonomous Agents, Business Intelligence, Automation, Knowledge Engine, and CRM sync are **Business+ only**. §5/§6 below split rOS features along exactly this existing line — nothing here proposes changing the tier matrix, only building within it.

---

## 3. Known Conflicts to Resolve

These are real inconsistencies in the current codebase. Building rOS on top of them without addressing them would make things worse, not better.

1. **Three pipeline vocabularies exist simultaneously**: `relationships.relationship_type` (free text), `contacts.customer_status` + `contacts.pipeline_stage`, and `conversation_funnel_stages.stage` — each with a *different* value set, each written by different code paths. §5.9 proposes a single `deals` entity that supersedes `conversation_funnel_stages` and demotes `contacts.pipeline_stage` to a denormalized cache of "most recent open deal's stage."
2. **`/relationships/[id]` is orphaned.** It has a Clocks tab that doesn't exist anywhere else. §7 proposes merging its unique content into the unified relationship page rather than maintaining two contact-detail routes.
3. **Lead scoring is not automatic.** `contacts.lead_score` is a plain mutable integer, set manually — no scoring model computes it. Nothing in this plan changes that yet; flagged as a real gap, not silently assumed to exist.
4. **`relationship_health_logs.contributing_factors` is dead schema.** §5.4/§5.1 fix this as part of the health algorithm upgrade — it's the cheapest, highest-leverage change available for "always tell them why."
5. **Two Contacts-UI status vocabularies disagree**: `leads.ts`'s PATCH validator allows a narrower `customer_status` set than the Contacts page's `AddContactModal`. Needs reconciling before `deals` (§5.9) reads either.
6. **`auto_response_settings` is a known no-op** (per the Memory Engine plan) — every live message needs manual approval regardless of settings. Not this plan's problem to fix, but rOS's "AI Recommendations" (§5.11) must not imply actions execute automatically when they currently don't.

---

## 4. The Unified Relationship Model

Every contact — customer, supplier, friend, or family member — gets one relationship record with a **universal core** plus a **mode-specific extension**, matching the `mode` (business/personal/hybrid) split that already governs the rest of the dashboard.

```
┌─────────────────────────────────────────────┐
│                UNIVERSAL CORE                │
│  Health score + trend + contributing factors │
│  Last interaction · Relationship clock       │
│  DNA profile (contact_profiles)              │
│  Timeline (all events, one stream)           │
│  Memory (5 layers, already built)            │
│  Connections (who they know — the graph)     │
│  Goals · AI recommendation                   │
└─────────────────────┬─────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌───────────────────┐       ┌───────────────────────┐
│  BUSINESS EXTENSION │       │  PERSONAL EXTENSION   │
│  Network Value      │       │  Connection Value     │
│  Deals & pipeline    │       │  Life events           │
│  Products purchased  │       │  Shared interests      │
│  Churn risk          │       │  Drift risk            │
│  Opportunity (sales)  │       │  Opportunity (life)    │
└───────────────────┘       └───────────────────────┘
```

A **hybrid-mode** user sees both extensions on relationships that warrant it (e.g. a family member who's also a customer) — the core doesn't change, only which extension panel renders. This is the same pattern `mode === 'hybrid'` already uses elsewhere in the dashboard (see `(dashboard)/dashboard/page.tsx`'s split business/personal overview).

---

## 5. Business Tier Features

### 5.1 Health & Network Value Algorithm v2

Today's formula (`health.py`) is `70 + recency(-30..+20) + sentiment(-10..+10)`. Extend it with two more weighted factors, and — critically — **populate the already-existing `contributing_factors` JSONB** so every score change comes with a human-readable reason, satisfying the core philosophy directly:

| Factor | Signal | Weight (business default) |
|---|---|---|
| Recency (R) | days since last contact vs. learned cadence | 30% |
| Frequency (F) | messages/week vs. this relationship's own historical rate | 20% |
| Sentiment (S) | `message_analyses.sentiment` rolling average | 20% |
| Responsiveness (P) | reply-time parity — are they slowing down replying to *you* | 15% |
| Pipeline velocity (V) | time-in-stage on open `deals` (§5.9), stalling vs. progressing | 15% |

```
health = clamp(0, 100, base + Σ(weight_i × signal_i) + proactive_engagement_bonus)
```

Every recalculation writes `contributing_factors: {"recency": -8, "sentiment": +3, "frequency": -5, "note": "3 fewer messages this week than usual"}` into the existing column. The UI (§5.4) renders this directly — never just a bare number.

**Network Value** becomes a new JSONB column on `relationships` (matching the existing `structured_attributes` precedent — flexible AI-computed shape, not a dozen nullable columns):

```sql
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS network_value JSONB NOT NULL DEFAULT '{}';
-- business shape:
-- { "financialValueCents": 7400000, "referralValueCents": 12200000, "influenceScore": 92,
--   "decisionAuthority": "high", "likelihoodToBuyAgain": 89, "referralProbability": 78,
--   "strategicValue": "very_high", "overallScore": 96, "computedAt": "..." }
```

Recomputed alongside health, using `revenue_events` (financial value), `relationship_connections` (§5.7, referral value), and `deals` (§5.9, likelihood/probability from stage + AI confidence).

### 5.2 Relationship Dashboard

The `/dashboard` page already has a stats grid and mode-aware sections (see `(dashboard)/dashboard/page.tsx`). Extend it — don't replace it — with a business-mode block:

- Relationship Health (avg across active relationships, trend vs. last week)
- Network Value (sum of `network_value.overallScore`-weighted financial + referral value — "Potential Pipeline")
- Needs Attention / Critical counts (health < 60 / health < 40, already computable from `relationships`)
- Predicted Revenue next 30 days (sum of open `deals.value_cents × probability`, plus at-risk/dormant/new-opportunity breakdown from `opportunities`, §5.8)

This is additive to the existing stats grid pattern used for the Zuri Marketing KPI section built earlier — same shape, same place.

### 5.3 AI Daily Brief

A new page (`/brief` or the existing `/dashboard` hero, TBD in implementation) that reads `proactive_queue` (already populated daily) and renders it as prose instead of a table:

> Good morning, Winston. Here's what changed overnight.
> — **Grace Jerseys** hasn't replied in 9 days. Health dropped 12%. [contributing_factors renders this] Potential reorder worth ZMW 18,000. [draft ready →]
> — **Peter Motors** mentioned expanding to another branch. Opportunity: fleet servicing. [detected via §5.8]
> — Revenue at risk: ZMW 64,000 across 6 customers. [sum of at-risk deals]
> — **Mary**'s birthday is today. [from `contact_profiles`/`events`, suggestion already drafted by `proactive.py`]

No new detection logic — this is a rendering layer over `proactive_queue` + `opportunities` + `relationships`, grouped and prose-ified. The "addictive" quality comes from consistency (every morning, same place) and specificity (real numbers, real names), not new AI capability.

### 5.4 Relationship Feed

Replace the current `/relationships` card grid (health bar + name only) with richer cards pulling from data that mostly already exists per-contact:

Health (+ **why**, from `contributing_factors`) · Revenue (from `revenue_events`) · Trend arrow · Last message · Next recommendation (from `proactive_queue`) · Predicted reorder window (from §5.6's replacement prediction) · Products (from new `contact_products`, §5.6) · Current deal + confidence (from `deals`, §5.9) · Relationship age (`relationships.created_at`) · Network influence (`network_value.influenceScore`).

### 5.5 Customer DNA

**This already exists** — it's `contact_profiles` (`communication_style`, `buying_behaviour`, `preferences`, `mood_baseline`) + `contact_insights` (frequently-discussed topics, negotiation style, payment behaviour as observed facts). The work here is presentation: a dedicated "DNA" panel on the relationship detail page that renders these fields as a structured profile card instead of scattered across tabs, matching the user's mockup shape (Buying Style / Negotiation / Budget / Payment Behaviour / Preferred Contact Time / Communication Style / Trust Level / Frequently Discusses). No new AI extraction needed beyond what the profiler (`profiler.py`) already does.

### 5.6 Products & Services Integration

Reuses the `products` table (built for Zuri Marketing) rather than creating a parallel catalog. New join table:

```sql
CREATE TABLE contact_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relation_type VARCHAR(20) NOT NULL CHECK (relation_type IN ('purchased','interested','quoted','recommended','mentioned')),
  quantity INT DEFAULT 1,
  warranty_expires_at DATE,
  replacement_predicted_at DATE,  -- AI-estimated consumable/replacement date (e.g. toner in 60 days)
  source_message_ids JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
`replacement_predicted_at` feeds directly into `opportunities` (§5.8) as a `renewal_due` type — "printer purchased, toner reminder created automatically" is one detector reading this column against `NOW()`.

### 5.7 Business Graph

New table — AI-discovered (and manually confirmable) connections between contacts, reusing the confidence/evidence-count pattern already established by `business_facts`:

```sql
CREATE TABLE relationship_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_a_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_b_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  connection_type VARCHAR(50) NOT NULL, -- works_with | introduced_by | owns | refers_to | family_of | friend_of | married_to
  confidence DECIMAL(5,4) NOT NULL DEFAULT 0.5,
  source VARCHAR(20) NOT NULL DEFAULT 'ai_inference' CHECK (source IN ('ai_inference','manual')),
  evidence_count INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_a_id, contact_b_id, connection_type)
);
```
Populated by a new lightweight detector pass over `contact_insights`/messages looking for relationship-between-people language ("my brother Peter", "I work with John at ABC Construction") — same extraction pattern the profiler already uses, applied to a new target. Rendered as a simple force-directed graph or, more cheaply for v1, an expandable list ("John → works with → Peter → owns → ABC Construction").

### 5.8 Opportunity Detection (structured)

Today "opportunity" is just an `insight_key` naming convention read ad-hoc by the frontend (`OPPORTUNITY_KEYS`). Promote it to a real table so opportunities can be listed, prioritized, expired, and linked to deals:

```sql
CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  opportunity_type VARCHAR(30) NOT NULL CHECK (opportunity_type IN
    ('buying_signal','expansion','referral_moment','renewal_due','life_event','reconnect_window','churn_risk','support_needed')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  estimated_value_cents BIGINT,       -- business only; NULL for personal-type opportunities
  confidence DECIMAL(5,4) NOT NULL DEFAULT 0.5,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','acted_on','dismissed','expired')),
  source_message_ids JSONB DEFAULT '[]',
  linked_deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);
```
Detection triggers already exist conceptually (Engine 3 in `PRODUCT_VISION.md`); this table just gives the outputs somewhere durable to live instead of being re-derived from insight-key string matching on every page load. Phrases like *"I'll need more," "we're opening another branch," "we're unhappy"* map to `opportunity_type` via the same LLM classification pass that already tags insights — one more structured output per pass, not a new pipeline.

### 5.9 Churn Prediction & Deals (resolving Known Conflict #1)

**Deals** becomes the one canonical pipeline entity, replacing `conversation_funnel_stages` and demoting `contacts.pipeline_stage` to a cached "current stage of the most recent open deal":

```sql
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  stage VARCHAR(20) NOT NULL DEFAULT 'discovery'
    CHECK (stage IN ('discovery','qualified','proposal','negotiation','closed_won','closed_lost')),
  value_cents BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  probability SMALLINT NOT NULL DEFAULT 50 CHECK (probability BETWEEN 0 AND 100),
  expected_close_date DATE,
  product_ids JSONB DEFAULT '[]',
  linked_opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  entered_stage_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- for stall detection ("14 days in Proposal")
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
A deal closing `won` writes a `revenue_events` row exactly as today (no change there — `revenue_events` remains the source of truth for realized revenue; `deals` is the source of truth for pipeline).

**Churn risk** is a reframing of the health-decline signal already computed, not new math: when `health_trend = 'declining'` for 2+ consecutive recalculations *and* `contributing_factors` shows negative sentiment or lengthening `recency`, surface it as:
```
Churn Risk: Medium
Reason: Response delays increasing, negative sentiment detected
Last purchase: 90 days ago
Recommendation: Offer loyalty discount
```
This is a presentation change over `relationship_health_logs` + `contributing_factors` (§5.1) — no separate churn model needed for v1.

### 5.10 Business Health Rollup

A composite score across categories already computed piecemeal elsewhere in the dashboard (`analytics.ts`'s executive summary, health.py per-relationship scores). New: one aggregation query producing `{sales, relationships, automation, customerSatisfaction, pipeline, knowledge}` sub-scores and an overall weighted average, rendered as one card. Every sub-score already has a natural source table (`deals`/`revenue_events` for Sales & Pipeline, `relationships` for Relationships, `agent_actions`/escalations for Automation, `message_analyses.sentiment` for Customer Satisfaction, `business_facts` approval rate for Knowledge).

### 5.11 AI Recommendations (prioritized action queue)

A ranked view over `proactive_queue` ∪ `opportunities` ∪ stalling `deals`, sorted by estimated revenue impact × confidence × urgency. Not a new detector — a new sort/aggregation over three things that already exist. Must not imply autonomous execution (Known Conflict #6) — every recommendation ends in a draft the user approves, exactly like today's suggestion flow.

### 5.12 Relationship Goals

```sql
CREATE TABLE relationship_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  goal_type VARCHAR(40) NOT NULL,  -- business: become_preferred_supplier | upsell | cross_sell | renew_contract |
                                    --           request_referral | recover_relationship | increase_spend | schedule_meeting
                                    -- personal (§6.7): reconnect | deepen_friendship | repair_rift | be_present |
                                    --           support_through_event | maintain_long_distance
  custom_label VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','abandoned')),
  target_date DATE,
  ai_next_step TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  achieved_at TIMESTAMPTZ
);
```
`ai_next_step` is regenerated by the same proactive-suggestion LLM call, given an explicit goal as context instead of generic "maintain relationship" framing — this changes the *prompt*, not the *pipeline*.

---

## 6. Personal Tier Features

Every business feature above has a personal-relationship mirror. This is the section the plan explicitly required, and it leans hard on the fact that **most of the underlying engine already treats business and personal relationships identically** — `health.py`, `clock_engine.py`, and `contact_profiles` are mode-agnostic today. The gap is presentation and a handful of personal-specific detectors, not new infrastructure.

### 6.1 Personal Relationship Dashboard

Mirrors §5.2, using the personal-mode stats the dashboard already computes (`avgHealth`, `needsAttention` from `(dashboard)/dashboard/page.tsx`'s existing `personalStats`) plus new aggregates:
- Relationship Health (same computation, same table)
- **Connection Value** (§6.4) instead of Network Value — sum framed as "how much this network gives you," not currency
- Needs Attention / people you've drifted from
- Upcoming life events (birthdays, anniversaries — already in `events`/`contact_profiles`)

### 6.2 Personal Daily Brief

Same `proactive_queue`-driven rendering as §5.3, personal framing:

> Good morning. Here's who's on your mind today.
> — **Mary**'s birthday is today. [suggested greeting ready — this already works, `birthday_message` suggestion type exists]
> — You haven't talked to **David** in 3 weeks — longer than usual for you two. [dormancy_watch clock, already computed]
> — **Sarah** mentioned she's going through a rough time last week. Might be worth checking in. [emotional_patterns/sentiment signal]
> — It's been 6 months since you last saw **the Bandas** in person. [shared_history / important_dates from `relationship_memory`]

### 6.3 Personal Relationship Feed

Cards for friends/family, mirroring §5.4's structure but swapping business fields for: Health (+ why) · Trend · Last talked · Next suggestion · **Shared interests** (§6.6) · **Important dates** (from `relationship_memory.important_dates`, already populated) · Relationship age · **Closeness tier** (from `importance_tier`, already exists — 1 = closest).

### 6.4 Connection Value

The Network Value analog, same JSONB-column pattern on `relationships`, personal shape:
```json
{ "closenessScore": 87, "reciprocityScore": 72, "supportGivenCount": 4, "supportReceivedCount": 6,
  "socialInfluenceInYourLife": "high", "overallScore": 91 }
```
`reciprocityScore` and support counts come from a simple heuristic over message direction + sentiment (who initiates more, who shows up during hard times) — same `message_analyses` table §5.1 already reads, no new data collection.

### 6.5 Person DNA

**Already fully built** — `contact_profiles` was designed with personal relationships in mind from the start (`emotional_patterns`, `known_triggers`, `mood_baseline`, `current_life_context`). This is purely a presentation task: render the same DNA card as §5.5 with personal-appropriate field labels (Communication Style, Humor, Personality, Trust Level, Preferred Contact Time, Frequently Discusses — Family/Football/Business, whatever the profiler actually extracted).

### 6.6 Life Events & Shared Interests (the Products analog)

Personal relationships don't have a product catalog — they have **shared history and things to talk about**. New lightweight table, personal counterpart to `contact_products`:

```sql
CREATE TABLE contact_life_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL, -- new_job | moved | had_child | got_married | health_issue | loss | achievement | started_business
  title VARCHAR(255) NOT NULL,
  event_date DATE,
  ai_generated BOOLEAN NOT NULL DEFAULT TRUE,
  source_message_ids JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
This is the same "timeline of important things" `relationship_memory.important_dates`/`conversation_themes` already tracks — this table just gives major life events (as opposed to routine chat themes) their own queryable, taggable home, so the AI daily brief and opportunity detector can key off them specifically. "Shared interests" (favourite topics, hobbies) stay in `contact_insights`/`structured_attributes` — no new table needed there.

### 6.7 Life Event Opportunity Detection

Uses the same `opportunities` table from §5.8, with personal-appropriate types already included in its CHECK constraint (`life_event`, `reconnect_window`, `support_needed`). `estimated_value_cents` is simply NULL for these rows. Detected from the same LLM classification pass over messages — "my mum's not doing well" → `support_needed`; "we just moved to a new house" → `life_event`; "haven't seen you in ages" → `reconnect_window`.

### 6.8 Drift Risk (the Churn analog)

Identical mechanism to §5.9's churn risk — declining health trend + `contributing_factors` — reframed:
```
Drift Risk: Medium
Reason: 3 weeks since last message, longer than your usual pattern with David
Last saw in person: 4 months ago
Recommendation: Suggest a coffee catch-up
```

### 6.9 Personal Health Rollup

Mirrors §5.10 with personal-relevant sub-scores: `closeCircleHealth` (avg health of importance_tier 1-2 contacts), `dormantCount`, `upcomingEventsHandled` (% of birthdays/anniversaries that got a suggested message sent), `reciprocityBalance`.

### 6.10 Personal AI Recommendations

Same ranked queue as §5.11, sorted by relationship importance_tier × health decline × time-since-last-contact instead of revenue impact. "Call David this week" instead of "Call Peter — ZMW 120,000 potential."

### 6.11 Relationship Goals (personal)

Same `relationship_goals` table (§5.12), `goal_type` values: `reconnect`, `deepen_friendship`, `repair_rift`, `be_present`, `support_through_event`, `maintain_long_distance`.

### 6.12 Romantic Relationship Mode

Most personal-mode users will spend most of their time on two relationship types: partners and close friends. Both deserve first-class depth, not a generic "personal contact" treatment. For `relationship_type` values like `partner`/`spouse`/`dating`:

- **Love language detection** — inferred into `contact_profiles.structured_attributes` the same way `buying_behaviour` is inferred for a business contact today: `{"loveLanguage": "acts_of_service", "confidence": 0.7}`, built from what they ask for and what they express appreciation for. No new extraction pipeline — the profiler already does this kind of pattern inference, this is one more field.
- **Relationship milestones** — `contact_life_events.event_type` (§6.6) gains `first_date, anniversary, engagement, moved_in_together, married`, feeding a dedicated "Our Story" timeline distinct from the general one.
- **Date night / quality time cadence** — reuses `relationship_clocks` exactly as-is: a touchpoint clock keyed to explicit "we should do X together" mentions and date-tagged calendar events, not just message frequency. Fires "It's been 3 weeks since your last date night" the same mechanism that already fires `dormancy_watch`.
- **Conflict & repair support** — when `message_analyses.sentiment` shows a sharp dip (already computed per-message), the daily brief surfaces it gently and specifically: *"Things seemed tense with Sarah yesterday. Want help finding the right words to check in?"* — a drafted message the user reviews, never auto-sent. This is §6.8's drift-risk detector with romance-aware copy, not new sentiment infrastructure.
- **Appreciation nudges** — periodic (not just reactive-to-conflict) gratitude-expression suggestions, timed by the same cadence learning so they don't feel scripted or repetitive.
- `relationship_goals.goal_type` gains: `plan_date_night, express_appreciation, resolve_conflict, deepen_intimacy, plan_future_together`.

### 6.13 Friendship Circle Features

For `relationship_type = 'friend'`, personal mode leans on `relationship_connections` (§5.7) to build an actual social layer, not just per-contact management:

- **Friend circles** — connections where `connection_type = 'friend_of'` between two people who both know the user render as a lightweight group ("Your Uni Friends," "Workmates"), inferred from repeated co-mentions rather than manually configured.
- **Group hangout nudges** — *"You haven't organized a get-together with your close friends in 2 months"* — reads `dormancy_watch` across a *cluster* of connected friends rather than one relationship at a time.
- **Milestone celebration relay** — when `contact_life_events` records an achievement for one friend, the brief nudges the user to loop in mutual friends: *"Have you told Grace that Peter got the promotion?"* — this is what actually makes someone feel like the connector in their friend group, and it's just one more read against `relationship_connections`.
- **Reconnection framing with memory, not guilt** — pulls from `relationship_memory.shared_history_since`/`conversation_themes` instead of a flat "it's been a while": *"It's been 3 months since you and David last caught up — you two used to talk football every week."* Specificity over generic nagging is the whole difference between a nice feature and an annoying one.
- `relationship_goals.goal_type` gains: `plan_hangout, introduce_to_friend_group, celebrate_milestone, be_there_during_hard_time, maintain_long_distance_friendship`.

### 6.14 "Best Friend" Behaviors (cross-cutting, all personal relationships)

The qualities that make Personal mode feel like a best friend rather than a CRM with softer copy — these are product principles §6.1–6.13 already implement, made explicit so they're not lost in implementation:

- **Remembers so the user doesn't have to.** Every promise ("I'll ask them about X") surfaces again unprompted — `relationship_memory.outstanding_promises` is already extracted; it just needs a follow-up nudge wired into the Daily Brief that hasn't been built yet.
- **Notices when something's off, not just when it's overdue.** Emotional-dip detection (§6.12) generalizes to every close relationship, not only romantic ones.
- **Celebrates wins as they happen**, same-day, not in a batched weekly digest.
- **Never guilt-trips, always contextualizes.** Every "it's been a while" includes *why it matters* and *an easy opener* — the §1 philosophy applied literally: what's happening, why, what to do next.
- **Discreet by default.** Sentiment-dip and conflict detection is inherently sensitive. Every one of these behaviors must be silenceable per-relationship, reusing the Conversation Privacy Levels already specified for the Governance Engine in `PRODUCT_VISION.md`.

---

## 7. Hybrid Mode & Resolving the Orphaned Page

`mode === 'hybrid'` users see both extension panels on the unified relationship page — a relationship can be tagged as both "customer" (business extension visible) and "family" (personal extension visible) simultaneously, since `relationship_type` is free text today and nothing stops a contact from being both.

This is also where **Known Conflict #2** gets resolved: the orphaned `/relationships/[id]` page's unique content (the Clocks tab, letting a user see/pause their own relationship clocks) gets merged into `/contacts/[id]` as a new tab, and `/relationships/[id]` becomes a redirect to `/contacts/[id]` — following the exact precedent already set by `/agents/page.tsx` redirecting to `/automation` after that consolidation. One contact-detail page, not two.

---

## 8. Memory Architecture

No new memory tables. §2.4's mapping table is the spec: every "memory layer" feature described in the original brief already has a concrete home. The only memory-adjacent additions in this plan are the new *structured outputs* (`opportunities`, `relationship_connections`, `deals`, `contact_products`, `contact_life_events`) that give AI-detected signals a durable, queryable place to live instead of being re-derived from insight-key string matching on every page load — consistent with the Memory Engine's own confidence/evidence-count discipline (`business_facts`, `agent_memories`).

---

## 9. Data Model Summary (net-new only)

| Table / column | Purpose | §  |
|---|---|---|
| `relationships.network_value` (JSONB) | Business value + Personal connection value, mode-shaped | 5.1, 6.4 |
| `relationship_health_logs.contributing_factors` (populate existing column) | "Always tell them why" | 5.1 |
| `deals` | Canonical pipeline entity, replaces `conversation_funnel_stages` | 5.9 |
| `opportunities` | Structured buying-signal / life-event detection, replaces `OPPORTUNITY_KEYS` string convention | 5.8, 6.7 |
| `relationship_connections` | Business/Social graph | 5.7 |
| `relationship_goals` | Business + personal goal tracking | 5.12, 6.11 |
| `contact_products` | Products purchased/interested/quoted per contact | 5.6 |
| `contact_life_events` | Major personal life events, distinct from routine chat themes | 6.6 |
| `users.relationship_pace_profile` | Cold-start cadence preset (see §10) | 10 |

---

## 10. Market/Cadence Profile — Reconciled With What Already Learns This

The original brief proposes a hardcoded Lusaka-vs-London weighting matrix. **`clock_engine.py` already solves the underlying problem better**: `relationship_clocks.avg_days_between_messages`/`std_dev_days` is learned *per relationship*, automatically adapting to whether a specific contact is a high-frequency WhatsApp regular or a slow-cadence corporate contact — no region hardcoding required, and it's more accurate than a market-wide preset because it's personalized to the actual two people, not a demographic guess.

The one real gap this reveals: **cold start.** A brand-new relationship has no message history yet to learn a cadence from. For that narrow case, add one coarse setting:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_pace_profile VARCHAR(20)
  NOT NULL DEFAULT 'balanced' CHECK (relationship_pace_profile IN ('high_velocity','balanced','structured'));
```

Used only to seed `relationships.dormancy_alert_days` and the health algorithm's initial recency-decay steepness for the first ~10 messages of a new relationship, after which the per-relationship learned cadence takes over completely. This is a one-column, one-purpose fix — not a parallel weighting system living alongside the one that already works.

---

## 11. UI/UX Architecture

- **Desktop**: three-pane layout on the relationship detail page — thread list (already exists in Inbox) · message canvas · a new right-hand "Relationship Vault" panel (DNA, Network/Connection Value, active deals/goals, timeline sparkline). This is additive to the existing `/contacts/[id]` tab structure, surfaced as a persistent side panel rather than a seventh tab, since it's meant to be glanceable while replying, not navigated to separately.
- **Mobile**: the existing card-feed pattern (`/relationships`, `/contacts`) gets richer cards (§5.4/§6.3) and swipe actions (swipe to approve a drafted reply, swipe to log a quick note) — consistent with the bottom-tab-bar mobile patterns already established elsewhere in the dashboard.
- **Command palette (Cmd/Ctrl+K)** — net-new. A single global component mounted in `(dashboard)/layout.tsx`, indexing: contact search, "create deal," "add task," "ask advisor" (routes to existing `/advisor`), "export" (§11 below), "run health recalculation." Implementation detail deferred to build phase — this is a frontend-only feature with no new backend beyond existing routes it dispatches to.
- **Export system** — CSV/Excel/PDF/JSON for any filtered view (Relationship Feed, Leads, Deals), plus scheduled digests (weekly relationship digest, monthly health report) reusing the existing `analytics_snapshots` caching pattern from the Business Intelligence Engine.

---

## 12. Phased Build Plan

Sized like the Zuri Marketing phases in `docs/ZURI_MARKETING_EXPANSION.md` — each phase is independently shippable and testable.

**Phase 0 — Foundation & Conflict Resolution**
Reconcile the three pipeline vocabularies (§3.1): ship `deals`, migrate `conversation_funnel_stages` data into it, demote `contacts.pipeline_stage` to a cache. Fix the `customer_status` validator mismatch between `leads.ts` and the Contacts UI. Merge `/relationships/[id]`'s Clocks tab into `/contacts/[id]`; redirect the old route.

**Phase 1 — Health v2 & Always-Tell-Them-Why**
Extend `health.py` with frequency/responsiveness/pipeline-velocity factors; populate `contributing_factors` on every recalculation; surface the "why" in the UI everywhere a health score appears.

**Phase 2 — Opportunities & Business Graph**
Ship `opportunities` and `relationship_connections` tables; build the detector passes (reusing existing insight-extraction LLM calls, adding structured output fields); wire `opportunities` into the AI Recommendations ranking.

**Phase 3 — Products Integration & Network/Connection Value**
Ship `contact_products`, `contact_life_events`; compute `network_value`/personal connection value JSONB; wire replacement-date prediction into `opportunities`.

**Phase 4 — Relationship Feed, Daily Brief, Personal Mirror**
Build the richer feed cards (§5.4/§6.3) and the Daily Brief rendering layer (§5.3/§6.2) — this is the phase where Personal tier parity actually becomes visible to users, since most of its backend groundwork (health, clocks, profiles) already exists.

**Phase 5 — Goals, Business/Personal Health Rollups**
Ship `relationship_goals`; build the composite health rollup aggregation (§5.10/§6.9).

**Phase 6 — Command Center & Export**
Cmd+K palette; CSV/Excel/PDF export; scheduled digest reports.

---

## 13. Open Decisions — Resolved

All four decided per the recommended path; Phase 0 (§12) is built against these:

- **Deals migration** → **backfill.** Existing `conversation_funnel_stages` rows migrate into `deals` on the same contact; the old table stops receiving new writes but isn't dropped (historical read access preserved).
- **Opportunity/Deal linkage** → **both allowed.** A deal can originate from a detected `opportunity` (§5.8) or be created directly via a manual "Add Deal" action — not gating deal creation behind detection.
- **Pricing tier line** → **confirmed.** Connection Value, Life Events, and personal Opportunity Detection (§6.4, §6.6, §6.7) stay on the free Personal tier, unchanged from how §5/§6 already split business-vs-personal along `PRODUCT_VISION.md`'s existing matrix.
- **Command palette v1 scope** → **contact search + top 5-6 actions first**, per §11; broader entity search (deals, products, docs) is a later iteration, not blocking Phase 6.
