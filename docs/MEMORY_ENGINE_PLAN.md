# Memory Engine Plan

Status: **Phases 0–2 implemented** (see §6 for what shipped vs. what's still open). This doc is the design reference for turning Zuri from message-centric ("what did the last message say?") to memory-centric ("what does Zuri already know about this person, this business, and this relationship?"). It also covers adding Alibaba/Qwen as a second AI provider with free-tier rotation.

---

## 1. Current State — How the Intelligence Layer Actually Works Today

This section documents ground truth (verified against code, not docs) as of 2026-07, so later sections can cite exactly what's reused vs. net-new.

### 1.1 WhatsApp connect → historical sync → first-pass analysis

- Connect: `POST /api/whatsapp/connect` → `services/whatsapp` `SessionManager.startSession()` → Baileys session persisted via `useMultiFileAuthState` in a Docker volume (`/app/db/sessions/<userId>`) — session secrets live on disk per-user, not in Postgres.
- Right after `connection: open`, Baileys fires `messaging-history.set` once with the device's chat history ("First Impression Mode"). Normalised (no media re-download) into a single `historical_batch`, walked sequentially through the same `MessageHandler.handleMessage(userId, msg, isHistorical=true)` used for live messages.
- Every historical message gets the full per-message AI pass (sentiment/emotions/intent/topics/entities/importance/embeddings → `message_analyses`, plus event extraction → `events`). Reply-suggestion generation and agent routing are skipped for history. Aggregate jobs (health, cadence, contact profile, voice profile) run on a wider message-count cadence during backfill but always fire on message #1, so the product looks populated almost immediately.
- A separate, user/admin-triggered "Historical Intelligence Sync" (`sync_jobs` table, Diagnostics page) re-walks everything already in Postgres through the identical pipeline — a backfill/re-analysis tool, not something that fires automatically on connect.

### 1.2 A live message comes in

```
Baileys 'messages.upsert' → normalise → contacts/conversations/messages (direct write)
   → Redis PUBLISH message:new:{userId} → Socket.io → inbox refresh
   → BullMQ messages.incoming
        → MessageAnalyser (sentiment/intent/embedding) → message_analyses
        → EventExtractor → events
        → Orchestrator: route_to_agent (if an agent is assigned) OR generate_suggestion
              → ReplyGenerator → suggested_replies (status=pending)
              → Redis PUBLISH suggestion:ready:{userId} → Socket.io → inbox shows draft
        → every 5th msg: health recalculation; every 5th (+1st): cadence learning
        → every 10th (+1st): enqueue contact-profile rebuild
        → every 20th outbound (+1st): enqueue voice-profile rebuild
```

`services/api` never consumes `messages.incoming` — it only produces jobs and bridges Redis pub/sub to Socket.io. Sending an approved suggestion goes through a different queue (`send.reply`), consumed by `services/whatsapp`.

### 1.3 The "cron jobs" — reality check

There is no actual cron anywhere (no BullMQ `repeat`, no node-cron, no APScheduler/Celery beat, no k8s CronJob). What exists instead, as plain `asyncio.sleep()` loops inside the Python `intelligence` service:

| Loop | Interval | Does |
|---|---|---|
| `run_daily_scheduler` | once/day, 07:00 UTC | AI-generates proactive check-in suggestions for every user |
| `run_temporal_scheduler` | every 15 min | Global sweep of `relationship_clocks`; fires dormancy/weekly-touchpoint nudges |
| `run_world_knowledge_scheduler` | every 2 hrs | Refreshes news cache, matches headlines to contact interests |

Everything else that looks like a job (health score, cadence, profile/voice rebuilds) is message-count-triggered, not time-based. Three BullMQ workers (`temporal.clock_check`, `world.knowledge_check`, `proactive.generate_daily`) are fully wired up but have zero producers anywhere — dead code. These asyncio loops have no leader election, so running multiple replicas of the intelligence service would duplicate nudges.

### 1.4 The personalization profile — when/how

- **Contact profile** (`ContactProfiler.profile()`) — two LLM calls: extract atomic `contact_insights` (key/value/confidence/supporting quote), then synthesize `contact_profiles` (personality_summary, communication_style, emotional_patterns, known_triggers, current_life_context, mood_baseline, plus CRM fields: buying_behaviour, pain_points, goals, preferences, relationship_stage). Old insights are marked `is_active=false` and replaced wholesale each run.
- **User voice profile** (`UserVoiceBuilder.build()`) — needs ≥10 outbound messages; one LLM call → vocabulary/sentence structure/punctuation/humor/formality/greeting & closing patterns/characteristic phrases → `user_communication_profiles`, injected into reply-generation prompts.

### 1.5 Known bugs / gaps found during this investigation

Fix these opportunistically while touching the relevant code in the phases below — don't schedule a dedicated cleanup pass.

| Gap | File | Impact |
|---|---|---|
| Profiler ignores `locked_fields`/`user_edited_fields` | `services/intelligence/app/services/profiler.py` | User-locked profile fields get silently overwritten by the next AI pass |
| `contact_insights.evidence_count`/`source_message_ids`/`superseded_by` never populated | same | No real evidence traceability despite schema supporting it |
| `context_snapshots` table defined, never written by any code | — | Proactive-suggestion prompts fall back to `'No recent context available'` |
| `auto_response_settings` never read by the intelligence service | `message_worker.py` | All 3 approval modes are no-ops; every live message needs manual approval regardless of settings |
| Autonomous/delegated agents enqueue to `messages.send` with a mismatched payload shape; `services/whatsapp` consumes `send.reply` | `agent_engine.py` vs `reply-consumer.ts` | Trusted agents can never actually deliver a message |
| `json` imported conditionally but used unconditionally | `services/intelligence/app/services/reply_gen.py:66,157` | `NameError` when a user has no `user_communication_profiles` row yet — `suggestion:ready` silently fails to publish |
| Dead BullMQ queues: `temporal.clock_check`, `world.knowledge_check`, `proactive.generate_daily` | various workers | Registered/started, never fed — remove or actually wire up |

---

## 2. TencentDB Agent Memory (TAM) — What It Actually Is

Two distinct offerings share the name:

1. **Open-source project** (`TencentCloud/TencentDB-Agent-Memory` on GitHub, MIT license) — self-hosted, local-first by default (SQLite + sqlite-vec), Node.js ≥22.16.
2. **Managed AGM cloud service** — same architecture, Tencent-hosted. No published pricing, no region list, no product-specific compliance certification (PIPL/GDPR/ISO) — only generic Tencent Cloud platform-level claims.

**Architecture — layered long-term memory:**

- **L0 Conversation** — raw dialogue, verbatim
- **L1 Atom** — extracted facts/preferences/constraints, each traceable back to source (`node_id`)
- **L2 Scenario** — aggregates atoms into task-level "scene blocks"
- **L3 Persona** — synthesized human-readable profile (`persona.md`)

Consolidation is threshold-triggered (every N conversations or idle timeout → L1; time interval → L2; every 50 new memories → L3). Retrieval is hybrid BM25+vector (RRF). Default retention is indefinite. Explicit design goal: no lossy compression — everything traces back to ground truth.

### 2.1 Is it usable outside OpenClaw/Hermes? — **Yes, confirmed**

The GitHub repo's own OpenClaw plugin surface made this look OpenClaw/Hermes-locked, but direct source inspection confirms otherwise:

- **Core is explicitly host-neutral by design.** `src/core/tdai-core.ts`'s own header: *"Host-neutral facade for TDAI memory capabilities... depends only on abstract interfaces (HostAdapter, LLMRunner), never on a specific host."* `src/adapters/` has exactly two adapters (`openclaw/`, `standalone/`) — OpenClaw is one integration, not the architecture.
- **The Gateway is a plain generic HTTP server**, confirmed by reading `src/gateway/server.ts` directly: `GET /health`, `POST /recall`, `POST /capture` (write/ingest), `POST /search/memories`, `POST /search/conversations`, `POST /session/end`, `POST /seed` (bulk ingest). Auth is opt-in Bearer token. LLM backend defaults to any OpenAI-compatible endpoint, not a Tencent-only model.
- **Smoking-gun proof**: `docker/opensource/Dockerfile.hermes`'s container `CMD` starts *only* the Gateway (`node ... server.ts`) — Hermes itself is a separate on-demand CLI (`docker exec -it <container> hermes`), not a runtime dependency of the Gateway being up and serving HTTP.
- A host-agnostic TypeScript client is published on npm: `@tencentdb-agent-memory/memory-sdk-ts` — plain `MemoryClient` HTTP wrapper, zero OpenClaw/Hermes coupling.
- Maintainers are actively soliciting adapters for other platforms (GitHub issue #235, "Cross-Platform Adapters for the Memory Plugin," names Claude Code/Codex/Dify) — confirms the core/adapter split is intentional and Zuri-style third-party integration is exactly the intended use.

**Practical path for Zuri:** run the Gateway as a plain Node process/sidecar (no OpenClaw, no Hermes required) and call its REST API over plain HTTP from `services/intelligence` (Python) or `services/api` (Node).

```bash
npm install @tencentdb-agent-memory/memory-tencentdb tsx
export TDAI_LLM_BASE_URL=... TDAI_LLM_API_KEY=... TDAI_LLM_MODEL=...
export TDAI_GATEWAY_PORT=8420
node --import tsx/esm node_modules/@tencentdb-agent-memory/memory-tencentdb/src/gateway/server.ts
# then: curl http://localhost:8420/health
```

### 2.2 Spike results (pinned npm `@tencentdb-agent-memory/memory-tencentdb@1.0.0`, verified by installing and reading the actual shipped source, not just docs)

- **Route-version mismatch — resolved, no mismatch.** The installed v1.0.0 package's `src/gateway/server.ts` dispatches `/v2/*` to `src/gateway/v2-router.ts`, which implements the full documented set: `L0 Conversation` (add/query/search/**delete**), `L1 Atomic` (update/query/search/**delete**), `L2 Scenario` (ls/read/write/**rm**), `L3 Core` (read/write) — all POST, under `/v2/`. The `memory-sdk-ts` README's routes are current, not ahead of what ships. The older `/recall`/`/capture`/`/search/*`/`/seed` routes (§2.1) still exist alongside `/v2/*` for backward compatibility — prefer `/v2/*` for new integration work since it's the actively-developed surface.
- **A real delete API exists** — corrects the earlier assumption. `atomic/delete`, `conversation/delete`, and `scenario/rm` are documented v2 endpoints, not just file-level cleanup. This meaningfully de-risks the right-to-be-forgotten design in §4.6.
- **Multi-tenancy is a first-class v2 concept, not something Zuri would have to bolt on.** Every `/v2/*` request carries `Authorization: Bearer <apiKey>` + `x-tdai-service-id: <serviceId>`. In service mode, `resolveStore(serviceId)` / `resolveStorage(serviceId)` pool a distinct store per `serviceId`, and each request additionally scopes by a body-level `session_id`. This maps directly onto the partition design in §3: `serviceId = zuri:{userId}`, `session_id = zuri:{userId}:{contactId}` — the two-level isolation Zuri needs is native, not custom-built.
- **Issue #62 status: confirmed still OPEN as of this spike.** Cross-user leakage (one user's `recall` returning another user's persona/paths) was filed against **v0.1.0**, which predates the `x-tdai-service-id` / `resolveStore(serviceId)` service-mode architecture found in v1.0.0 — it looks like it was reported against an older single-tenant, local-`dataDir` deployment mode, not the current per-serviceId-pooled v2 API. That is **not** the same as "fixed by the new architecture" — nobody has verified the new design is immune to the same class of bug. **Before any production rollout: run an explicit two-`serviceId` isolation test against the pinned v1.0.0 v2 API and confirm zero crossover.** Treat this as a hard gate, not a formality.
- **No Python SDK exists** (checked PyPI directly — nothing published). `services/intelligence` calls the Gateway over plain HTTP (`httpx`), same as it already does for LLM calls and web search — no new integration pattern needed, just a new HTTP client module.

---

## 3. Privacy Plan — Using TAM's Model for Zuri

Zuri's core asset is exactly the kind of data TAM's privacy model is built for: psychological profiles built from people's private conversations. Given the managed AGM service has no verified compliance guarantees:

- **Self-host the OSS Gateway on Zuri's own ECS box**, not the Tencent-managed AGM service. Keeps every byte of relationship-psychology data inside infrastructure Zuri already controls. LLM calls go to the same providers (Gemini/Qwen/Anthropic) Zuri already sends analysis to — no new third party in the data path.
- **One memory partition per Zuri user** (`session_key = zuri:{userId}`, sub-partitioned per contact `zuri:{userId}:{contactId}`), mirroring the existing per-user `whatsapp_instances`/auth-folder isolation pattern. Turns "delete a user's data" into "delete their partition's files" — a workable answer to TAM's missing delete-API, and it slots directly into the existing but currently-inert `data_retention_policies` table.
- Must be validated against the multi-tenant isolation bug (§2.2) before any partition scheme is trusted in production.
- Directly serves the "user stays in control" ethos in `PRODUCT_VISION.md` — memory lives on infrastructure Zuri operates, not a third-party cloud memory service with unverified guarantees.

---

## 4. The Memory-Centric Architecture

### 4.1 Why

Right now the architecture is message-centric: messages come in, get analyzed, results land in relational tables. The next evolution is memory-centric: every AI component asks "what does Zuri already know about this person, this business, and this relationship?" instead of "what did the last message say?"

```
WhatsApp → Message Queue → Message Analysis
                                  │
                                  ▼
                          ┌───────────────┐
                          │ Memory Engine │
                          └───────────────┘
   Conversation Memory → Relationship Memory → Business Memory
        → Knowledge Memory → User Memory → Agent Memory
        → Temporal Memory → Vector Search → LLM
```

### 4.2 Memory layers — target state vs. what already exists

Grading each layer by how much already exists vs. genuinely net-new keeps this plan grounded in real code rather than a from-scratch rebuild.

| Layer | Status in Zuri today | What's net-new |
|---|---|---|
| **Conversation Memory** (short-term, hours/days: current topic, objective, unanswered questions, pending promises, sentiment, negotiation state, recent products/files) | `message_analyses` has sentiment/intent/promises/events per-message, but nothing rolls them into one live "state of this conversation" object — `reply_gen.py` re-queries "last 10 messages" every time | A rolling Redis object per conversation (TTL'd), updated after each message, consumed directly by reply generation instead of ad-hoc re-querying |
| **Contact Memory** (AI-generated CRM: communication style, emoji usage, typical reply time, budget, likes, frequently-buys, preferred payment, trust level, relationship stage, buying frequency, common questions, last frustration, lifetime spend, notes) | `contact_profiles` + `contact_insights` exist but are flat free-text fields; profiler ignores `locked_fields` (§1.5) | Expand to a richer structured field set via a JSONB `structured_attributes` bag + versioned pydantic schema — flexible schema beats another wide migration every time a field is added |
| **Relationship Memory** (separate from profile: relationship strength, cadence, missed followups, outstanding promises, conflict history, shared history duration, conversation themes, important dates) | `relationships.health_score`, `relationship_health_logs`, `relationship_clocks` exist; `promises_detected` captured per-message but never aggregated | Build an "outstanding promises" / "missed followups" / "shared history" aggregation view — mostly SQL over data already captured, no new AI calls |
| **Business Memory** (global: products, pricing, shipping rules, refund policy, FAQ, hours, inventory, promotions, suppliers, tax, bank details, WA templates, brand voice, common objections) | Doesn't exist | Should be the **same mechanism** as Knowledge Memory below, not a separate table |
| **Knowledge Memory** (AI auto-learns facts from conversation with confidence merging — e.g. product price mentioned by multiple customers converges to a high-confidence, auto-approved fact) | KB/`contact_documents` exists for uploaded docs; nothing auto-learns facts with confidence-merging | Merge Business + Knowledge Memory into one auto-learned + human-curated fact store. Most naturally TAM-shaped (L1 atom + consolidation is exactly this pattern) |
| **User Memory** (preferred reply length, voice-note preference, sales style, working hours, frequently-rejects/accepts, favorite AI tone, approval rate, frequently-edited words) | `user_communication_profiles` only captures writing style | `approval_rate`/`tone_acceptance` are derivable today from `suggested_replies.status`/`tone` alone. `frequently_edited_words` looked free but wasn't — there was no endpoint that ever captured an edited draft (`edited_and_sent` was a defined status nothing set). Implemented the missing capture point too (see §6) rather than ship a feature with permanently-empty data |
| **Agent Memory** (past negotiations, discounts given, successful closing strategies, objections, competitor mentions, refund history, escalations, VIP customers, community culture — per agent type) | `agent_actions` is an action *log*, not semantic memory; autonomous agents currently can't send at all (§1.5) | Biggest lift, biggest payoff — no existing relational pattern to preserve, so this is where TAM's hybrid recall has the most leverage |
| **Experience Memory** (situation → action → outcome → confidence → use-again; case-based organizational intelligence) | Doesn't exist in any form | Genuinely novel. Implement as a **sub-type of Agent Memory**, not a separate subsystem — experiences are always attached to a specific agent |

### 4.3 Consolidation

"Nightly worker: extract facts → merge similar → dedupe → boost confidence → archive old → summarize → store long-term" is a good forcing function for a decision Zuri has been deferring: today there is **no true cron anywhere** (§1.3). Adding nightly consolidation, plus agent-memory decay/scoring, is the point to decide: keep stacking bespoke `asyncio.sleep()` loops, or introduce real scheduling (BullMQ `repeat` or APScheduler) now, before the count of scheduled responsibilities grows further.

### 4.4 Confidence & provenance

Every memory should carry: confidence, source, created/updated, evidence_count, supporting messages, AI-generated vs. human-confirmed, contradicted, expires, importance. This is exactly the shape of columns that already exist unused on `contact_insights` (`evidence_count`, `source_message_ids`, `superseded_by`) — extend that same shape uniformly across every memory layer rather than reinventing it per-table.

### 4.5 Retrieval — memory-first LLM calls

Today `reply_gen.py`, `agent_engine.py`, and `proactive.py` each build their own ad-hoc context independently. Target: one shared retrieval entrypoint every AI call goes through:

```
Prompt → Memory Search → Conversation Context → Relationship Memory
       → Business Memory → Knowledge Base → Agent Memory
       → Relevant Experiences → LLM
```

### 4.6 Privacy & user control

Users should be able to: view every memory Zuri has created; edit AI-generated memories; delete individual memories or entire categories; mark memories "never use again"; pause memory creation for selected contacts; choose retention periods; export all memories; approve/reject AI-generated business facts before they become permanent. Every memory carries provenance (conversation, uploaded document, manual entry, AI inference, imported data) and why the AI believes it's true.

This maps directly onto the per-user TAM partition design in §3, plus the existing but currently-inert `data_retention_policies` table. Real frontend work too — a new "Memory" settings page in `apps/web`, not just backend.

### 4.7 Where this lives in the codebase

Structurally reasonable to mirror the proposed layout, but **start as a package inside `services/intelligence`** (`app/memory/`) rather than a new deployed service:

```
services/intelligence/app/memory/
    memory_worker.py
    consolidation_worker.py
    retrieval_service.py
    conflict_resolver.py
    memory_scorer.py
    memory_graph.py
    tam_adapter.py       # HTTP client to the self-hosted TAM Gateway (§2.1)
    memory_search.py
```

A new deployed service means a new Docker container, new internal auth, new deployment step, and cross-service HTTP latency on every reply-generation call — real operational cost for what's currently one Python process. Promote to its own service later only if load demands it.

---

## 5. Alibaba/Qwen as a Second AI Provider, With Free-Tier Rotation

### 5.1 Provider prefix

LiteLLM uses a `dashscope/` prefix for Qwen models (e.g. `dashscope/qwen-max`) — same pattern as the existing `gemini/` requirement in this repo. **Add the equivalent CRITICAL callout to root `CLAUDE.md`** once verified:
- ✅ `dashscope/qwen-max`
- ❌ `qwen-max`

One open LiteLLM GitHub issue (#12505, "dashscope/qwen: LLM Provider NOT provided") reports this failing under some versions/configs — **smoke-test every model against the actual pinned LiteLLM version and DashScope key before rollout**, don't assume the prefix works out of the box.

New env var: `DASHSCOPE_API_KEY`.

### 5.2 Task-aware pools, not one flat rotation list

The 10 models given aren't interchangeable — 3 are vision-language, 1 is OCR, 1 is machine-translation. Round-robining a sentiment-analysis call onto `qwen-vl-ocr-2025-11-20` would silently degrade output. Split into pools:

| Pool | Models | Used for |
|---|---|---|
| **Text** (default) | `qwen-max`, `qwen3-max`, `qwen3.5-plus-2026-02-1`, `qwen-plus-2025-07-28`, `qwen3.7-plus`, `qwen3.5-122b-a10b` | message analysis, reply generation, profiling, agent replies — everything currently on `DEFAULT_AI_MODEL` |
| **Vision** | `qwen3-vl-32b-thinking`, `qwen3-vl-235b-a22b-thinking` | analyzing image messages, image-based KB documents |
| **OCR** | `qwen-vl-ocr-2025-11-20` | scanned documents / receipts / images-with-text in the KB pipeline |
| **Translation** | `qwen-mt-flash` | only if/when multi-language WhatsApp support is added |

This also gets real testing coverage per pool — vision/OCR models currently have zero call sites in Zuri, so this plan doubles as "wire up media analysis" (audio transcription / image analysis is already a listed roadmap gap).

### 5.3 Rotation mechanics

- New module `services/intelligence/app/ai/model_router.py`. `get_active_model(pool: str) -> str` returns the current model for a pool; every LLM call site (`client.complete_json`) reports `usage.total_tokens` back to the router after the call.
- Usage counters live in **Redis** (`ai:tokens:{model}`), not in-process memory — the intelligence service has no leader election (§1.3), so an in-memory counter would reset on restart and blow through the free tier unpredictably across multiple workers.
- When a model's counter crosses 1,000,000, the router advances to the next model in that pool's list and logs the switch. When a pool exhausts every model in its list, fall back to `DEFAULT_AI_MODEL` (Gemini) rather than erroring.
- Mirror counters into a Postgres table (`ai_model_usage`: model, pool, tokens_used, last_used_at) for a future usage dashboard — Redis alone isn't queryable/reportable.
- **Default for now**: pool `text` starts on `qwen-max`, `vision` on `qwen3-vl-32b-thinking`, `ocr` on `qwen-vl-ocr-2025-11-20`, `translation` on `qwen-mt-flash`.

---

## 6. Phased Roadmap

**Phase 0 — Foundations**
- Qwen multi-provider router (task-aware pools, Redis-backed rotation), default `text` pool to `qwen-max`; smoke-test `dashscope/` prefix against the pinned LiteLLM version
- TAM integration spike: pin an npm version, verify actual Gateway route set against that version (§2.2), check resolution status of the multi-tenant isolation bug (#62) before any multi-user use
- Fix the bugs in §1.5 opportunistically while touching this code

**Phase 1 — Structured memory in Postgres (no new infra dependency)**
- Conversation Memory (Redis rolling object)
- Contact Memory schema expansion (JSONB + pydantic)
- Relationship Memory aggregation (promises, followups, themes)
- Confidence/provenance columns populated everywhere, uniformly
- User Memory v2 from existing `suggested_replies` edit/reject data

**Phase 2 — Business + Knowledge Memory**
- Unified auto-learned + curated fact store with confidence-merge
- Human approval workflow before AI-generated facts become "permanent"

**Phase 3 — Agent + Experience Memory**
- Spike confirmed TAM's v2 API has a real per-`serviceId`/`session_id` isolation model (§2.2) — but issue #62 is still open against an older deployment mode, so run the two-`serviceId` isolation test called out there before adopting TAM here in production
- If that test passes: adopt TAM (self-hosted) for agent memory specifically — highest-leverage use case, no existing relational pattern to preserve
- If not: native `agent_memories` table + pgvector recall, Experience Memory as a sub-type of Agent Memory
- Fix the autonomous-send wiring (§1.5) as part of this work — currently a dead end

**Phase 4 — Retrieval unification + real consolidation**
- Single `retrieval_service.py` replacing three ad-hoc context builders (`reply_gen.py`, `agent_engine.py`, `proactive.py`)
- Nightly consolidation job — and the decision point on real scheduling infra (§4.3)

**Phase 5 — Privacy & control surface**
- Memory transparency UI in `apps/web`, per-user TAM/data partitions, wired to `data_retention_policies`

---

## Implementation Status (Phase 0 + Phase 1 — shipped)

**Phase 0:**
- `services/intelligence/app/ai/model_router.py` — task-scoped pools (`text`/`vision`/`ocr`/`translation`), Redis-backed rotation at 1M tokens/model, Postgres mirror (`ai_model_usage`, migration `0027`). `client.py` now defaults to the `text` pool (`qwen-max` first) instead of `DEFAULT_AI_MODEL`; falls back to Gemini only once a pool is fully exhausted.
- `services/intelligence/scripts/smoke_test_dashscope.py` — run manually with a real `DASHSCOPE_API_KEY` before relying on this; not run automatically anywhere.
- TAM spike done against pinned `@tencentdb-agent-memory/memory-tencentdb@1.0.0` — findings folded into §2.2 (route mismatch resolved, delete API exists, multi-tenancy is native via `x-tdai-service-id`, issue #62 still open but against an older deployment mode — isolation test still required before Phase 3).
- Bugs fixed opportunistically: `profiler.py` now respects `locked_fields`; `reply_gen.py`'s conditional `json` import (`NameError` risk) fixed; `agent_engine.py`'s autonomous-send now targets the correct `send.reply` queue with the correct payload shape (was silently undeliverable before); three dead BullMQ queues (`temporal.clock_check`, `world.knowledge_check`, `proactive.generate_daily`) are now actually fed instead of sitting idle; a second class of bug found along the way — `json.dumps()` was being passed into columns where the asyncpg `jsonb` codec already serializes Python objects itself, double-encoding `relationship_clocks.peak_hours`/`typical_day_of_week`, `user_communication_profiles.writing_style`/`common_phrases`, and `agent_actions.tools_used` into JSON-string scalars instead of real objects — fixed all four.

**Phase 1:**
- Conversation Memory: `services/intelligence/app/memory/conversation_memory.py`, Redis-backed, 3-day TTL. Updated after every live message in `message_worker.py`; consumed by `reply_gen.py`.
- Contact Memory: `contact_profiles.structured_attributes` (JSONB, migration `0028`), merged not replaced each profiling run. New `ContactStructuredAttributes` pydantic model, extended `BUILD_CONTACT_PROFILE` prompt.
- Relationship Memory: new `relationship_memory` table (migration `0028`) + `services/intelligence/app/services/relationship_memory.py` — pure SQL aggregation (promises, themes, important dates, `nudge_count`-derived missed-followups), no new AI calls. Recomputed alongside cadence learning in `temporal_worker.py`.
- Confidence/provenance: `contact_insights.evidence_count` and `.superseded_by` are now actually populated by `profiler.py` (were schema-only before).
- User Memory v2: `services/intelligence/app/services/user_memory.py` mines `suggested_replies.status`/`.tone` into `approval_rate`/`tone_acceptance` (real data now). `frequently_edited_words` required adding the missing capture point — `suggested_replies.edited_text` column (migration `0028`) plus `POST /api/suggestions/:id/approve` now accepts an optional `editedText`; `reply-consumer.ts` no longer clobbers the `edited_and_sent` status back to `sent`. This signal starts empty and fills in as real edits happen going forward — it wasn't backfillable.

**Phase 2:**
- New `business_facts` table (migration `0029`) — the unified Business + Knowledge Memory fact store. Competing values for the same `fact_key` coexist as separate rows with independent confidence/evidence rather than one row being force-overwritten on every contradiction; readers take the highest-confidence *approved* row per key.
- Extraction folded into the existing per-message analysis call, not a new LLM call: `MessageAnalysis.business_facts_mentioned` (new field, `models.py` + `ANALYSE_MESSAGE` prompt) is only populated when a message states a concrete business fact (price/policy/hours/etc.) — most messages produce none.
- `services/intelligence/app/services/business_facts.py` — `record_candidates()` merges corroborating mentions (confidence +0.15/mention, capped 0.99) and auto-approves once a fact crosses confidence ≥0.9 *and* evidence_count ≥3 — the "82% → 91% → 99% → approved automatically" pattern from the brief. A human rejecting a candidate (`is_active=FALSE`) stops it from being reinforced by future mentions. Runs for historical messages too — unlike conversation memory, a business's chat history is exactly where its prices/policies were first stated, so backfill has real value here.
- `get_approved_facts()` — current best value per key, wired into both `reply_gen.py` and `agent_engine.py` prompt context so replies/agents can actually use known pricing/policy facts, not just recall/regurgitate them from raw chat history.
- API surface for the approval workflow: `services/api/src/routes/business-facts.ts` (`GET` list/filter by category/pending, `POST` manual entry — auto-approved since a human typed it, `PATCH` edit, `POST /:id/approve`, `POST /:id/reject`). **No dedicated frontend page yet** — that's explicitly Phase 5's "memory transparency UI" scope; today the approval workflow exists at the API level only, ready for a UI to call.

**Not done yet (tracked for the phases above):** Agent/Experience Memory (Phase 3), retrieval unification and real consolidation scheduling (Phase 4), the memory transparency UI (Phase 5) — including the still-missing frontend for approving/rejecting business facts from Phase 2.
