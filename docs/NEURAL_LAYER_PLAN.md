# Zuri Neural Layer — Master Architecture Plan

**Status:** Planning — unstarted. This document does not replace `docs/PRODUCT_VISION.md`, `docs/RELATIONSHIP_OS_PLAN.md`, or `docs/MEMORY_ENGINE_PLAN.md` — it **reconciles** them into one named architecture and adds the pieces none of them cover yet (a cross-module Goal Engine, a Reflection Engine + Life Timeline, a Knowledge Graph beyond people, and a platform-wide Emotion Engine). Every section below states explicitly whether it's *already shipped elsewhere* (with a pointer to where), *already planned elsewhere* (ditto), or *genuinely net-new*. Nothing here should be read as "start from zero" — most of the substrate already exists under different names; this document is mostly about naming it correctly, closing real gaps, and stopping future modules from re-inventing it per-feature.

---

## 0. Why This Document Exists

Zuri has been built module-by-module — Advisor, Studio ERP, the Relationship OS, Business Workspace, Auto-Reply Agents — each shipping its own slice of intelligence: `health.py` for relationship scoring, `retrieval_service.py` for memory, `pricing_benchmarks.py`/`inventory_forecast.py` for business predictions, the `[ACTION: ...]` tag system for chat-driven execution, `agent_engine.py`'s tool list for autonomous agents. Individually, each of these is well-built and (per `docs/BUSINESS_OS_PLAN.md`/`docs/RELATIONSHIP_OS_PLAN.md`) mostly shipped. Collectively, they're starting to duplicate a pattern: retrieve some rows → reason about them with an LLM call → surface a suggestion, over and over, once per module, with no shared name for the parts that are identical every time.

**The Neural Layer is not new infrastructure. It's the name for the substrate that already mostly exists, plus the handful of pieces that don't yet:**

- **Already exists, gets a name here:** the shared retrieval point (`retrieval_service.py`), the per-relationship Goal Engine (`relationship_goals`), the people-graph (`relationship_connections`), the confidence/explainability convention (PRODUCT_VISION.md's Governance Engine), the workflow-automation builder (Engine 9), scattered prediction logic (`inventory_forecast.py`, replacement-date prediction, churn-risk flagging).
- **Genuinely new, specified here:** a **Reflection Engine** + Life Timeline, a **cross-module Goal Engine** (goals that span the whole business/life, not just one relationship), a **Knowledge Graph** that extends the existing people-graph to products/suppliers/projects/deals, and a **platform-wide Emotion Engine** (promoted out of the Advisor-only design in `docs/ADVISOR_COMPANION_PLAN.md`'s Phase 0).

The test for whether something belongs in this document: does more than one module need it? Memory, emotion, relationships, goals, knowledge, reasoning, reflection, prediction, and action all qualify — Advisor, Studio, CRM, Inventory, Projects, and Suppliers all need some slice of each. Anything module-specific (Studio's pricing benchmarks, Advisor's gossip tone) stays in that module's own plan doc.

---

## 1. Neural Layer Architecture

```
Applications
  Advisor · Studio · CRM (Contacts/Leads/Deals) · Projects · Inventory
  Suppliers · Calendar · Marketing/Studio Advisor · Analytics · (future modules)

        ↓  all read/write through the same engines, never duplicate logic

Zuri Neural Layer
  Memory Engine        — shared retrieval (already exists: retrieval_service.py)
  Emotion Engine        — affect capture + state-dependent weighting (promoted from Advisor-only)
  Relationship Engine  — health/trust/network value (already exists: rOS, health.py)
  Goal Engine           — now cross-module, not just per-relationship (extends relationship_goals)
  Knowledge Graph       — entity relationships beyond people (extends relationship_connections)
  Reasoning Engine      — retrieve → reason → verify → act (formalizes Conversation Strategy Engine)
  Reflection Engine     — daily/weekly/monthly review + Life Timeline (net-new)
  Prediction Engine     — consolidates existing ad-hoc forecasts into one service
  Action Engine         — action requests as multi-step workflows (reconciles with Automation Engine)
  Automation Engine     — visual workflow builder (already exists: PRODUCT_VISION.md Engine 9, unchanged)

        ↓

Models (LiteLLM — Gemini / DashScope-Qwen pool, per model_router.py)
```

**Advisor is not the intelligence of Zuri. It is one interface to the Neural Layer** — the most conversational one, but not a privileged one. Studio's AI Business Advisor, the Inbox's reply-suggestion pipeline, the autonomous agents, and the AI Daily Brief all already call into pieces of this substrate today (`retrieval_service.py`, `health.py`, `agent_engine.py`); this document's job is to make that calling convention explicit and consistent rather than leaving each module to reach into whichever service it happens to know about.

**Practical implication, not a new deployable service.** This is a set of Python modules/classes inside the existing `services/intelligence` app (an architectural layer, the same way "the Relationship OS" or "the Memory Engine" are architectural layers within that one service today) — not a proposal to split `services/intelligence` into ten microservices. Each "engine" below is a class or module with a defined contract; some already exist as exactly that (`RelationshipHealthService`, `retrieval_service.py`); some are net-new modules under a shared `services/intelligence/app/neural/` namespace.

---

## 2. Reconciliation Table (Read This Before Building Anything)

| This document calls it | What already exists | Status | What's actually new |
|---|---|---|---|
| Memory Engine | `retrieval_service.py`, `relationship_memory`, `business_facts`, `agent_memories`, `context_snapshots` — all shipped (`docs/MEMORY_ENGINE_PLAN.md`, 6/6 phases) | ✅ Shipped | Formalizing the three-category taxonomy (§4.1: Personal / Relationship / Business Memory) as a documented contract every module retrieves through — not new storage |
| Emotion Engine | Advisor-only design in `docs/ADVISOR_COMPANION_PLAN.md` §3.6 (unstarted) | 🔲 Planned, Advisor-scoped | **Promoted to platform-wide here** (§4.2) — same model, generalized entity reference so CRM/Projects/Suppliers can tag emotional state too |
| Relationship Engine | `health.py`, `relationships.health_score`/`.network_value`, `docs/RELATIONSHIP_OS_PLAN.md` (6 phases shipped) | ✅ Shipped | Nothing new structurally — §4.3 documents how the Emotion Engine plugs into it |
| Goal Engine | `relationship_goals` table, PRODUCT_VISION.md §4 (per-relationship only) | ✅ Shipped, narrower scope | **Elevated to cross-module** (§4.4) — a goal like "grow revenue to $20k/mo" spans Studio, CRM, Inventory, Marketing, not one relationship |
| Knowledge Graph | `relationship_connections` (people-to-people only) | ✅ Shipped, narrower scope | **Extended to non-person entities** (§4.5) — products, suppliers, projects, deals as graph nodes too |
| Reasoning Engine | Conversation Strategy Engine (PRODUCT_VISION.md Engine 5, planned, conversation-planning specifically) | 🔲 Planned, narrower scope | **Generalized** (§4.6) to a retrieve→reason→verify→act contract usable by any module's decision, not just "what to say next" |
| Reflection Engine | Nothing | 🔲 **Fully net-new** (§4.7) | Daily/weekly/monthly reflection + Life Timeline |
| Prediction Engine | `inventory_forecast.py` (Phase G, shipped), replacement-date prediction in `opportunities` (rOS Phase 3), churn-risk flagging (`health.py`) — three separate, unconnected implementations | ✅ Shipped in pieces | **Consolidated** (§4.8) into one named service/contract other modules can call instead of writing a fourth bespoke forecaster |
| Action Engine | `advisor_action_requests` (planned), `action_bundles` (Business OS Phase E, shipped) — both single-action-then-approve today | ✅ Shipped, single-step | **Upgraded to multi-step workflows** (§4.9) — reconciles with, does not duplicate, the Automation Engine below |
| Automation Engine | PRODUCT_VISION.md Engine 9 — visual drag-and-drop workflow builder | 🔲 Planned | Unchanged by this document — Action Engine (above) is the *system-detected, single-approval-card* path; Automation Engine is the *user-designed, always-on* path. Different triggers, same underlying action-execution primitives (§4.9 notes the shared bits) |
| Confidence everywhere | PRODUCT_VISION.md Engine 11's "Explainability" (`Confidence: 96%`, reasons, source) | 🔲 Planned, underused | Not a new concept — §8 is a reminder to actually apply it to every new surface this document proposes, since it's currently implemented on Advisor/suggestions but not on CRM/Projects/Suppliers cards |

---

## 3. Advisor as Orchestrator, Not Chatbot

A short but important reframing that `docs/ADVISOR_COMPANION_PLAN.md` should adopt once this document exists: Advisor's job is not to answer a question directly from its own reasoning. It's to **orchestrate the Neural Layer** and synthesize the result.

**"Reply to Grace" should not resolve to "generate a plausible-sounding reply."** It should resolve to:

```
retrieve   → Memory Engine: relationship memory, business facts, prior advice given about Grace
inspect    → Relationship Engine: current health score, trend, network value
inspect    → the actual conversation transcript (existing scoped retrieval)
inspect    → Emotion Engine: Grace's emotional trend, the user's own current emotional state
inspect    → Goal Engine: does any active goal touch this relationship? (e.g. "reconnect with old friends")
inspect    → Calendar/reminders: anything scheduled or overdue involving Grace
inspect    → Reasoning Engine: any tradeoff or conflict to flag before drafting
synthesize → draft, with evidence cited, confidence stated, and an alternative read offered
```

This is not a rewrite of `docs/ADVISOR_COMPANION_PLAN.md`'s existing intent classifier/orchestrator design (§6.1 there already lists "retrieve user profile and advisor memories," "retrieve relevant contacts/conversations," etc.) — it's a naming fix: those retrieval steps are calls into named Neural Layer engines, not ad-hoc lookups the orchestrator happens to do. Once this document ships, `docs/ADVISOR_COMPANION_PLAN.md` §6.1 should read as "calls the Memory/Relationship/Emotion/Goal/Reasoning engines," not as its own bespoke logic.

---

## 4. Core Engines

### 4.1 Memory Engine — Three Categories (Formalizing What Exists)

**Status: shipped storage, new taxonomy.** No new tables. `docs/MEMORY_ENGINE_PLAN.md` already built the storage; this section names the three categories every module should think in when deciding what to retrieve and where to write:

| Category | Covers | Already lives in |
|---|---|---|
| **Personal Memory** | The user themselves — tone, goals, boundaries, communication style, interests, faith, motivational style | `advisor_user_profiles`, `user_communication_profiles` |
| **Relationship Memory** | Everything involving another person — trust, conflict history, communication patterns, promises, shared events, important dates, health, conversation summaries | `relationship_memory`, `contact_profiles`, `contact_insights`, `relationships` |
| **Business Memory** | The company itself — products, services, customers, suppliers, policies, discounts, projects, inventory, brand voice, operating procedures | `business_facts`, `products`, `suppliers`, `documents`, `business_profiles` |

A module retrieving context should be explicit about which category(ies) it needs — Advisor answering "reply to Grace" needs all three (Personal: how the user likes to sound; Relationship: history with Grace; Business: only if Grace is also a customer); Studio's pricing benchmark job needs Business Memory only. This is a documentation/convention change, not a schema change — `retrieval_service.py`'s existing functions already roughly map to these three categories; §5 below is where the calling convention gets formalized.

### 4.2 Emotion Engine — Made Platform-Wide (New)

**Status: promotes the Advisor-only design in `docs/ADVISOR_COMPANION_PLAN.md` §3.6 to a shared engine.** The affect-vector model (valence/arousal/dominant emotion, weighted encoding, state-dependent retrieval, reconsolidation, associative graph) is unchanged in mechanism — what changes is the schema: instead of an Advisor-scoped `interaction_affect` table keyed to `advisor_sessions`/`advisor_messages`, the Neural Layer needs a generic table any module can write to.

```sql
CREATE TABLE emotional_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(30) NOT NULL,   -- 'advisor_turn' | 'whatsapp_message' | 'crm_note' | 'project_update' | 'supplier_interaction' | 'deal_activity'
  entity_id UUID,                      -- polymorphic reference (advisor_messages.id, messages.id, projects.id, suppliers.id, deals.id...) — nullable since some signals are session-level, not row-level
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,   -- set when the signal concerns a specific relationship
  valence DECIMAL(4,3) NOT NULL DEFAULT 0,
  arousal DECIMAL(4,3) NOT NULL DEFAULT 0,
  dominant_emotion VARCHAR(20),
  emotion_vector JSONB NOT NULL DEFAULT '{}',
  behavioral_signals JSONB NOT NULL DEFAULT '{}',  -- response_latency_ms, typing_burstiness, formality_shift, emoji_density_shift — only populated where applicable to entity_type
  memory_weight DECIMAL(4,3) NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_emotional_signals_user ON emotional_signals(user_id, created_at DESC);
CREATE INDEX idx_emotional_signals_contact ON emotional_signals(contact_id, created_at DESC) WHERE contact_id IS NOT NULL;
```

This supersedes `docs/ADVISOR_COMPANION_PLAN.md` §4.6's `interaction_affect` table — that document should be updated to reference `emotional_signals` instead (see §9 of this document for the exact edit). Advisor turns write rows with `entity_type = 'advisor_turn'`; the existing per-message WhatsApp analysis pass (`message_worker.py`) already computes sentiment — it gains one more write, `entity_type = 'whatsapp_message'`, reusing that same LLM call's output rather than a new pass.

**Each domain entity caches its own current emotional read, same "denormalized cache" convention as `products.stock`/`relationships.health_score` already use** — not a fresh query over `emotional_signals` every time it's displayed:

- `relationships.emotional_signals_summary JSONB` (new column) — `{relationshipConfidence, trustTrend, communicationWarmth, buyingIntent, responseMomentum, conversationStress}`, recomputed alongside `health_score` in the same `health.py` recalculation pass (no new scheduler).
- `projects.emotional_signals_summary JSONB` (new column) — e.g. `{clientFrustrationTrend, avgResponseLatencyDelta, positiveLanguageTrend}`, recomputed whenever a project's linked contact's WhatsApp thread gets a new `emotional_signals` row.
- `suppliers.emotional_signals_summary JSONB` (new column) — `{reliabilityTrend, cooperationLevel, pricingStability, relationshipHealthTrend}`, recomputed on each supplier-conversation analysis pass (reuses the supplier-fact detector already scoped but unbuilt in `docs/BUSINESS_OS_PLAN.md` §8.1).

**Example, CRM:** instead of just `Lead Score = 78`, a lead's card also renders `Relationship Confidence: 91%`, a trust-trend sparkline, and a one-line "why" — the same "always tell them why" convention `docs/RELATIONSHIP_OS_PLAN.md` §1 already establishes for health scores, now extended to a richer signal set.

**Example, Projects:** "This client has become increasingly frustrated — average response latency up 300%, positive language down 42%" is a direct read of `projects.emotional_signals_summary`, not a new detector — the underlying WhatsApp-message emotional signals already exist once §4.2's write path lands.

**Example, Suppliers:** "Supplier A: reliable, often delivers early, very cooperative, pricing stable, relationship health improving" combines the existing `suppliers.reliability_score`/`.average_delivery_time` (already shipped) with the new `emotional_signals_summary` — a supplement, not a replacement.

### 4.3 Relationship Engine — Unchanged, Consumes the Emotion Engine

**Status: shipped (`docs/RELATIONSHIP_OS_PLAN.md`).** No changes to `health.py`'s algorithm. The only integration point: `health.py`'s recalculation pass, when it runs, also refreshes `relationships.emotional_signals_summary` from recent `emotional_signals` rows — one additional read/write inside an existing job, not a new scheduler.

### 4.4 Goal Engine — Elevated to Cross-Module (New)

**Status: extends the shipped `relationship_goals` (per-relationship) with a broader, cross-module goal system.** Humans (and businesses) organize around goals, not just relationships — "get married" touches finances, planning, family conversations, and venue logistics; "grow revenue to $20k/month" touches Studio, CRM, Inventory, Marketing, and Advisor all at once. The existing `relationship_goals` table stays exactly as-is for the narrower "goal about one specific relationship" case (e.g. "stay close to Grace") — this is a **parallel, broader tier**, not a replacement.

```sql
CREATE TABLE goal_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,             -- "Grow monthly revenue to $20,000", "Get married"
  goal_type VARCHAR(20) NOT NULL CHECK (goal_type IN ('business', 'personal')),
  target_value JSONB,                       -- {"metric": "monthly_revenue_cents", "target": 2000000, "by_date": "2026-12-31"} — optional, not every goal is quantifiable
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'abandoned', 'paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE goal_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goal_profiles(id) ON DELETE CASCADE,
  source_type VARCHAR(30) NOT NULL,    -- 'advisor_conversation' | 'deal' | 'project' | 'contact_life_event' | 'document'
  source_id UUID,                       -- polymorphic reference, nullable for free-text notes
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE goal_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goal_profiles(id) ON DELETE CASCADE,
  metric_value JSONB NOT NULL,          -- snapshot of target_value's metric at this point in time
  note TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE goal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goal_profiles(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL,     -- 'milestone' | 'setback' | 'reprioritized' | 'linked_entity_added'
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goal_memories_goal ON goal_memories(goal_id, created_at DESC);
CREATE INDEX idx_goal_progress_goal ON goal_progress(goal_id, recorded_at DESC);
```

**How other modules link to a goal**, without a parallel per-module goal table: a lightweight polymorphic join, `goal_linked_entities(goal_id, entity_type, entity_id)` — a deal, a project, a product, or a marketing campaign can be tagged against a goal this way, and the Goal Engine's progress view is a query across whatever's linked, not a bespoke rollup per module.

**What this unlocks that the per-relationship `relationship_goals` can't:** Advisor reasoning against a cross-module goal — *"We shouldn't discount this product, it hurts your quarterly revenue goal"* requires knowing the goal spans Studio pricing decisions, not just a conversation with one contact. The Reasoning Engine (§4.6) is what actually performs that check; the Goal Engine is what makes the goal itself a queryable object instead of a conversational aside.

### 4.5 Knowledge Graph — Extending the People-Graph to Everything (New)

**Status: extends the shipped `relationship_connections` (people-to-people only) to non-person entities.** `docs/RELATIONSHIP_OS_PLAN.md`'s Business Graph already lets Advisor say "Connected To: [other contacts]" on a contact page. The Neural Layer's Knowledge Graph is the same idea, generalized to every entity type Zuri already has a table for — suppliers, products, projects, deals — so a query like "who supplies the brake pads used in Project X, purchased by which customer, introduced by which employee" is a graph traversal, not four separate joins hand-written per feature.

```sql
CREATE TABLE knowledge_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_entity_type VARCHAR(30) NOT NULL,   -- 'contact' | 'supplier' | 'product' | 'project' | 'deal'
  from_entity_id UUID NOT NULL,
  to_entity_type VARCHAR(30) NOT NULL,
  to_entity_id UUID NOT NULL,
  relation_type VARCHAR(30) NOT NULL,      -- 'supplies' | 'used_by' | 'purchased_by' | 'introduced_by' | 'works_on' | 'connected_to'
  confidence DECIMAL(4,3) NOT NULL DEFAULT 1.0,   -- 1.0 for structural facts (a purchase order line), lower for AI-inferred edges
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kg_edges_from ON knowledge_graph_edges(user_id, from_entity_type, from_entity_id);
CREATE INDEX idx_kg_edges_to ON knowledge_graph_edges(user_id, to_entity_type, to_entity_id);
```

**Most edges don't need a detector — they already exist as foreign keys and just need to be surfaced as graph edges rather than reinvented:** `supplier_products` already encodes `supplier —supplies→ product`; `projects.deal_id`/`documents.deal_id` already encode `deal —relates_to→ project/document`; `contact_products` already encodes `product —purchased_by→ contact`. A one-time backfill materializes these as `knowledge_graph_edges` rows (or, cheaper: the graph-traversal query layer reads the existing FK tables directly and only writes to `knowledge_graph_edges` for the genuinely AI-inferred edges — e.g. `relationship_connections`' existing "mentioned in conversation" edges, and `'introduced_by'` edges an LLM has to infer from message content, not schema). **Recommendation: don't backfill the structural edges into a new table at all — write a query layer (`knowledge_graph.py`'s `traverse()`) that unions the existing FK relationships with the smaller set of genuinely-inferred `knowledge_graph_edges` rows.** This avoids a second source of truth for facts the schema already states directly.

### 4.6 Reasoning Engine — Generalizing Conversation Strategy (New Formalization)

**Status: generalizes PRODUCT_VISION.md's planned Engine 5 (Conversation Strategy Engine) beyond "what to say next."** Engine 5 already frames the right shape — multi-step planning against a goal, not single-turn reply generation — but it's scoped specifically to conversations. The Reasoning Engine is the same contract, usable by any module's decision, not just Advisor's:

```
retrieve  → pull the relevant Memory (Personal/Relationship/Business), Relationship Engine state, Goal Engine context, Emotion Engine state
reason    → identify tradeoffs, conflicts, and priorities (e.g. "this discount helps close the deal but conflicts with the revenue goal")
verify    → check the reasoning against evidence actually retrieved — no claim without a cited source, same discipline `docs/ADVISOR_COMPANION_PLAN.md`'s "evidence vs. interpretation" split already requires
act       → hand off to the Action Engine (§4.9) with a structured proposal, or return a synthesized answer with confidence + evidence + alternative (§8)
```

This is a service contract (`services/intelligence/app/neural/reasoning.py`, a single `reason(context, question) -> ReasoningResult` function), not a new UI or a new database table — Advisor's orchestrator (§3) is its first caller, but Studio's AI Business Advisor and the Autonomous Agent Engine should route through it too instead of each hand-rolling their own retrieve-then-prompt logic.

### 4.7 Reflection Engine (Fully Net-New)

**Status: nothing like this exists anywhere in the codebase today — this is the single most novel addition in this document.** Humans don't just remember; they reflect on what the memories add up to. A weekly job synthesizes what changed, using data every other engine already produces — no new detection, purely synthesis over `emotional_signals`, `relationship_health_logs`, `goal_progress`, `deal_stage_history`, `project_tasks`, and `stock_movements`.

```sql
CREATE TABLE reflection_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  highlights JSONB NOT NULL DEFAULT '[]',   -- [{"category": "relationship", "text": "Your relationship with Grace improved", "evidence": [...]}]
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reflection_summaries_user ON reflection_summaries(user_id, period_type, period_start DESC);
```

**Weekly reflection, worked example**, entirely derivable from existing tables — no new signal needs to be invented:
- "You handled conflict better this week" — from `emotional_signals`' valence trend on contacts flagged `signal_type = 'tone_shift'` (Gossip Worthiness Detector's own signal, reused, not duplicated)
- "You replied faster" — from `emotional_signals.behavioral_signals.response_latency_ms` trend
- "Your relationship with Grace improved" — from `relationships.health_score` delta over the period, same source as the existing health-change-reason system
- "You finally completed three delayed tasks" — from `project_tasks.status = 'done'` transitions where `due_date` had passed

**Life Timeline** is the same underlying data, rendered as a running narrative instead of a periodic digest — one `GET /api/reflection/timeline` endpoint that reads `reflection_summaries` plus significant `goal_events`/`contact_life_events`/`deal_stage_history` milestones, ordered chronologically: *"Started DogForce redesign → Candace approved retainer → began wedding planning → relationship conflict resolved → revenue increased → first supplier added."* This is what lets Advisor answer "how have I changed this year?" — a question no flat-transcript AI assistant can answer, but a straightforward query once Reflection Engine's synthesis has been running for a while.

**Scheduling:** same asyncio-scheduler convention as every other daily job (`daily_worker.py`) — a `run_reflection_scheduler()` at a fixed hour, generating `weekly` summaries every Monday and `monthly` on the 1st, `daily` optionally per-user-configurable (off by default — daily reflection risks becoming noise; weekly is the addictive cadence, not daily).

### 4.8 Prediction Engine — Consolidating What Already Exists (New Formalization)

**Status: three working predictors already exist, unconnected.** `services/intelligence/app/services/inventory_forecast.py` (Phase G, shipped) predicts stockouts. `clock_engine.py`'s replacement-date prediction (rOS Phase 3, shipped) predicts when a contact will need to re-buy a product. `health.py`'s churn-risk flagging (rOS Phase 2, shipped) predicts relationship decay. Each was built independently, inside its own module, with its own "extrapolate from a trailing window" logic. This section doesn't propose new prediction capability — it proposes one shared contract so the *next* prediction (e.g. "this customer has a high probability of buying within the week," "based on delivery speed you'll likely miss Friday," "you'll likely exceed this month's sales target") doesn't need a fourth bespoke implementation.

```python
# services/intelligence/app/neural/prediction.py
class Prediction(BaseModel):
    subject_type: str        # 'product' | 'contact' | 'project' | 'deal' | 'business_metric'
    subject_id: str | None
    prediction_type: str     # 'stockout' | 'purchase_likelihood' | 'delivery_delay' | 'goal_achievement' | 'churn_risk'
    predicted_value: dict
    confidence: float
    evidence: list[str]
    computed_at: datetime

class PredictionEngine:
    async def predict(self, prediction_type: str, subject_id: str) -> Prediction: ...
```

Existing predictors (`inventory_forecast.py`, the replacement-date logic, churn-risk) get thin adapters that produce this shape rather than being rewritten — the value is a consistent *contract* (subject/type/value/confidence/evidence), not a shared algorithm, since stockout extrapolation and churn-risk scoring are legitimately different math. New predictions (purchase likelihood, delivery-delay risk, goal-achievement probability) get built against this contract from day one instead of inventing their own response shape.

### 4.9 Action Engine — Upgraded to Multi-Step Workflows (Reconciles, Doesn't Duplicate Automation Engine)

**Status: `action_bundles` (Business OS Phase E, shipped) and `advisor_action_requests` (`docs/ADVISOR_COMPANION_PLAN.md`, planned) are both single-shot today — detect, propose a flat list of actions, approve, execute.** The upgrade: an action can itself be a small workflow with intermediate steps and conditional branches, not just a list of parallel actions to check off.

```
Customer asked for stock
  → check inventory (Prediction Engine: is this even in stock?)
  → if unavailable: find alternatives (Knowledge Graph: co-purchased/substitute products)
  → suggest reorder if below threshold (existing suggestedPurchaseOrders logic, Business OS Phase B)
  → draft WhatsApp reply (existing reply-draft pipeline)
  → wait for approval (existing action_bundles approval UI)
  → on send: reduce inventory (existing stock_movements 'sale' write)
  → if threshold crossed: notify supplier (existing PO suggestion, now auto-triggered instead of surfaced separately)
```

This is not a new execution mechanism — it's `action_bundles.actions` (already a JSONB array) gaining an optional `depends_on`/`condition` field per action so the frontend card (`ActionBundleCard`) can render and gate a sequence instead of only a flat checklist. **This is deliberately the smaller, system-detected sibling of the Automation Engine (PRODUCT_VISION.md Engine 9)**, not a competing workflow system: Action Engine workflows are proposed by a detector and approved once; Automation Engine workflows are designed by the user up front and run indefinitely. Where they should share code: both ultimately call the same underlying action executors (send WhatsApp, generate document, adjust stock, create reminder) — that executor layer is worth sharing explicitly rather than each system growing its own copy.

### 4.10 Skills — A Shared Extensibility Mechanism (New Formalization)

**Status: two ad-hoc mechanisms already exist and could converge here — not urgent, noted for later.** `agent_engine.py`'s prompt-described tool list (Autonomous Agent Engine) and the `[ACTION: ...]` chat-tag system (Studio/Advisor/Inbox) are both, functionally, "a bounded capability the model can invoke." A **Skill** would be the shared shape: something that retrieves via the Memory Engine, reasons via the Reasoning Engine, and executes via the Action Engine, packaged under one name (Sales Skill, Inventory Skill, Supplier Skill, Relationship Coach) instead of a growing per-feature prompt. **This is the lowest-priority item in this document** — worth doing once there are 4-5 near-duplicate "give the model this context and this action list" implementations to actually consolidate, not before. Do not build a Skills abstraction speculatively ahead of that need (per this codebase's own "don't design for hypothetical future requirements" convention).

---

## 5. Backend Architecture — The Calling Convention

New namespace: `services/intelligence/app/neural/` — `memory.py` (thin wrapper re-exporting `retrieval_service.py`'s existing functions under the three-category naming from §4.1), `emotion.py`, `goals.py`, `knowledge_graph.py`, `reasoning.py`, `reflection.py`, `prediction.py`. Existing services (`health.py`, `retrieval_service.py`, `inventory_forecast.py`, `action_bundles.py`) are **not moved or rewritten** — `neural/` re-exports and thinly wraps them where a shared contract is genuinely useful (§4.8's `Prediction` shape, for instance), and only net-new engines (Goal, Knowledge Graph, Reflection) get fully new modules here.

Any module wanting Neural Layer context imports from `neural/`, not from another module's internals directly — e.g. Studio's AI Business Advisor should call `neural.memory.get_business_context()` rather than reaching into Advisor's session-scoped retrieval helpers, and vice versa.

---

## 6. Intelligence Orchestration — Advisor's Updated Role

`docs/ADVISOR_COMPANION_PLAN.md`'s orchestrator (§6.1 there) becomes the first, most complete consumer of this layer: its "retrieve user profile and advisor memories," "retrieve relevant contacts/conversations," "detect emotional mode" responsibilities map directly onto Memory/Relationship/Emotion Engine calls, and its structured-output "actions"/"memory_suggestions" map onto the Action Engine. No new orchestrator is proposed here — see §9 for the specific cross-reference edits that document needs once this one exists.

---

## 7. Frontend Surfaces

- **Life Timeline** (§4.7) — a new page or a tab on `/dashboard`, rendering `reflection_summaries` + milestone `goal_events`/`contact_life_events` as a vertical chronological narrative, year → month → event.
- **Weekly Reflection card** — a Monday-morning card on `/dashboard`, same "AI Daily Brief" visual language already established, pulling the latest `reflection_summaries` row.
- **Cross-module emotional badges** (§4.2) — `relationships.emotional_signals_summary`/`projects.emotional_signals_summary`/`suppliers.emotional_signals_summary` render as small inline indicators (a trust-trend sparkline on a lead card, a frustration-trend chip on a project card, a cooperation-level badge on a supplier card) — reusing the existing icon-chip/stat-card design system, not a bespoke visual language per module.
- **Goal alignment indicators** — anywhere a decision touches an active goal (a Studio discount, a CRM pipeline stage change), a small "this affects your [goal name] goal" chip, sourced from `goal_linked_entities`.

---

## 8. Safety & Confidence Everywhere

Not a new principle — PRODUCT_VISION.md's Governance Engine already specifies this (`Confidence: 96%`, reasons listed, source cited, "Explain" action on every insight). This document's obligation: every new surface it proposes (Prediction Engine outputs, Goal Engine's "this hurts your goal" framing, Reflection Engine's weekly highlights, Reasoning Engine's tradeoff calls) must carry the same triplet — **confidence, evidence, alternative explanation** — as a hard requirement, not an aspiration:

```
"She may be upset."                              ❌ never this
"Confidence: 68%. Evidence: reply length          ✅ always this
 down, fewer emojis, longer response delay.
 Alternative: she may simply be busy."
```

Everything in §4 that produces a claim about a person, a business metric, or a prediction must render this shape. This reuses `docs/ADVISOR_COMPANION_PLAN.md`'s existing "evidence vs. interpretation" split (§3.1) and PRODUCT_VISION.md's Explainability spec — it does not introduce a new UI pattern, it enforces an existing one more broadly.

---

## 9. Cross-Document Edits Required

Once this document is agreed, `docs/ADVISOR_COMPANION_PLAN.md` needs these specific changes (not a rewrite):

1. **§3.6 (The Emotional Engine)** — replace with a short pointer: "Now specified platform-wide in `docs/NEURAL_LAYER_PLAN.md` §4.2. Advisor is one of several writers/readers of `emotional_signals`, not the owner of the schema."
2. **§4.5–§4.9 (the emotional schema additions)** — `interaction_affect` is superseded by `emotional_signals` (§4.2 above); `advisor_user_profiles`' new columns (`interests`, `spiritual_preferences`, `motivational_style`, `gossip_style`, `personal_mode_enabled`) stay exactly as planned — those are genuinely Advisor-specific, not platform-wide.
3. **§6.6–§6.8 (Emotional State Computation / Retrieval Weighting / Reconsolidation)** — become "calls into `neural/emotion.py`" rather than Advisor-owned services.
4. **§1 (Product Principle)** — add the §3 framing from this document: Advisor orchestrates the Neural Layer, it doesn't answer from its own reasoning.
5. **Phase 0 in the Advisor plan's build order** — becomes "adopt the Neural Layer's Emotion Engine" rather than "build the Emotion Engine," which changes its dependency (it now depends on this document's Phase 1 below, not the other way around).

No other section of `docs/ADVISOR_COMPANION_PLAN.md` (Gossip Mode, Proactive Interest Companion, Spiritual Companion, Motivational Partner, Boundary Keeper, Personal Mode activation) changes — those are genuinely Advisor-specific consumers of the Neural Layer, not part of it.

---

## 10. Phased Build

### Phase 1 — Platform-Wide Emotion Engine
- Migration: `emotional_signals` (§4.2), `emotional_signals_summary` columns on `relationships`/`projects`/`suppliers`
- `neural/emotion.py`: signal computation (generalized from the Advisor-only design), summary recomputation hooked into `health.py`'s existing recalculation pass
- No frontend yet — this phase is substrate only, same "backend-first" discipline as every prior emotional-engine phase in this codebase

Success criteria: a WhatsApp message analysis pass and an Advisor turn both write `emotional_signals` rows; `relationships.emotional_signals_summary` visibly updates.

### Phase 2 — Cross-Module Goal Engine
- Migration: `goal_profiles`, `goal_memories`, `goal_progress`, `goal_events`, `goal_linked_entities` (§4.4)
- CRUD API + a lightweight "link this deal/project/product to a goal" affordance on the relevant module pages
- Reasoning Engine's first real consumer: "does this action conflict with an active goal?" check, wired into one pilot surface (Studio's discount-approval flow is the plan's own worked example)

Success criteria: a user can create a cross-module goal, link entities to it, and get one goal-aware warning from Advisor or Studio.

### Phase 3 — Reflection Engine + Life Timeline
- Migration: `reflection_summaries` (§4.7)
- Weekly synthesis job (reuses existing signal sources, no new detection)
- Frontend: Weekly Reflection card + Life Timeline page

Success criteria: a user who's been active for 2+ weeks sees a genuinely accurate, evidence-backed weekly reflection without asking for it.

### Phase 4 — Knowledge Graph Query Layer
- `neural/knowledge_graph.py`'s `traverse()` unioning existing FK relationships (§4.5) — no migration needed for the structural edges
- `knowledge_graph_edges` table for the smaller set of AI-inferred edges only
- First consumer: Studio's "frequently bought together" (already shipped, Business OS Phase D) reimplemented as a graph traversal instead of a bespoke SQL query — proves the abstraction pulls its weight before other modules adopt it

Success criteria: at least one existing feature (co-purchase suggestions) is measurably simpler after migrating to the graph query layer.

### Phase 5 — Prediction Engine Consolidation
- `neural/prediction.py`'s shared `Prediction` contract (§4.8)
- Thin adapters over `inventory_forecast.py`, replacement-date prediction, churn-risk flagging — no algorithm changes
- First new prediction built against the contract: purchase-likelihood scoring for CRM (per the plan's own worked example)

Success criteria: a new prediction type ships in less code than the previous three took, because the contract/plumbing is already there.

### Phase 6 — Action Engine Workflows
- `action_bundles.actions` gains `depends_on`/`condition` (§4.9) — additive, no breaking change to Business OS Phase E's shipped shape
- `ActionBundleCard` gains sequence rendering
- Shared executor layer extracted for reuse by the (separately planned, unchanged) Automation Engine

Success criteria: at least one detected bundle (the plan's own inventory-check → alternative → reorder → notify-supplier example) executes as a real sequence, not a flat checklist.

Skills (§4.10) are deliberately not phased — revisit only once there's a concrete duplication to consolidate.

---

## 11. Open Decisions

1. **Does `emotional_signals` replace or sit alongside `message_analyses.sentiment`?** Recommendation: alongside — `message_analyses` stays the raw per-message analysis table; `emotional_signals` is the derived, cross-entity-typed layer written *from* that analysis (and from Advisor turns, which have no `message_analyses` row at all). Don't merge the tables; keep the write path additive.
2. **Should `goal_profiles` supersede `relationship_goals` eventually, or do both tiers stay permanently?** Recommendation: both stay — a goal genuinely scoped to one relationship ("stay close to Grace") doesn't need cross-module linking machinery; forcing every goal through `goal_profiles` would be over-engineering the common case.
3. **Backfilling `knowledge_graph_edges` for existing structural relationships** — see §4.5's recommendation against it; revisit only if the union-query approach proves too slow at scale.
4. **How much of §4 ships before Advisor's own Personal Mode work (already planned in `docs/ADVISOR_COMPANION_PLAN.md`) resumes?** Recommendation: Phase 1 here (platform-wide Emotion Engine) should land *before* `docs/ADVISOR_COMPANION_PLAN.md`'s own Phase 0, since building Advisor's emotional engine first and promoting it afterward would mean redoing the schema. Sequence this document's Phase 1 first.
