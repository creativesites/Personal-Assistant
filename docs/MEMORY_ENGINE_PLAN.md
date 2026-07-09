# Memory Engine Plan

Status: **planning** — no implementation started. This doc is the design reference for turning Zuri from message-centric ("what did the last message say?") to memory-centric ("what does Zuri already know about this person, this business, and this relationship?"). It also covers adding Alibaba/Qwen as a second AI provider with free-tier rotation.

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

### 2.2 Unresolved before committing to production use

- **Route-version mismatch risk**: `memory-sdk-ts`'s README documents `/v2/conversation/*`, `/v2/atomic/*`, `/v2/scenario/*`, `/v2/core/*` routes; the `main`-branch `server.ts` I read exposes `/recall`, `/capture`, `/search/*`, `/seed`, `/session/end`. These may be the same API described two ways, or a version-ahead-of-main mismatch. **Verify against the exact npm version you pin before writing integration code** — don't assume either doc is current.
- **Multi-tenant isolation bug** (GitHub issue #62) — open bug report about `recall` API isolation between users/sessions. Zuri would run one Gateway instance serving many WhatsApp end-users' memory partitions — check this issue's resolution status before any production rollout. This is a hard blocker if unresolved, since cross-user memory leakage would be a serious privacy incident for exactly the kind of data (private relationship psychology) Zuri handles.
- **No Python SDK exists** (checked PyPI directly — nothing published). `services/intelligence` calls the Gateway over plain HTTP (`httpx`), same as it already does for LLM calls and web search — no new integration pattern needed, just a new HTTP client module.
- Deletion is file/session-level, not a documented single-call API — matters for the privacy design in §4.

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
| **User Memory** (preferred reply length, voice-note preference, sales style, working hours, frequently-rejects/accepts, favorite AI tone, approval rate, frequently-edited words) | `user_communication_profiles` only captures writing style | **Highest ROI, lowest risk in this whole plan** — `suggested_replies.status` (approved/edited/rejected) already exists and is unused for learning. Mining edit diffs and rejection patterns requires zero new capture, just analysis of data already in Postgres |
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
- If TAM spike confirms the isolation bug is resolved and routes are stable: adopt TAM (self-hosted) here specifically — highest-leverage use case, no existing relational pattern to preserve
- If not: native `agent_memories` table + pgvector recall, Experience Memory as a sub-type of Agent Memory
- Fix the autonomous-send wiring (§1.5) as part of this work — currently a dead end

**Phase 4 — Retrieval unification + real consolidation**
- Single `retrieval_service.py` replacing three ad-hoc context builders (`reply_gen.py`, `agent_engine.py`, `proactive.py`)
- Nightly consolidation job — and the decision point on real scheduling infra (§4.3)

**Phase 5 — Privacy & control surface**
- Memory transparency UI in `apps/web`, per-user TAM/data partitions, wired to `data_retention_policies`
