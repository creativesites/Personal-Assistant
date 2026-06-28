# Architecture

## System Overview

Zuri is a multi-service system. Each service has a single responsibility. They communicate via a message queue (BullMQ/Redis) and internal HTTP, never directly exposing internal services to the internet.

```
┌──────────────────────────────────────────────────────┐
│                   Client Layer                        │
│   Next.js Web App (Vercel)  │  React Native Mobile    │
└──────────────┬──────────────┴──────────┬─────────────┘
               │ REST + WebSocket         │ REST + WebSocket
               │ (via /api/proxy)         │
               ▼                         ▼
┌─────────────────────────────────────────────────────┐
│              API Server  (Node.js / Fastify)          │
│  Auth · Business logic · WebSocket push · Routing    │
│                     Port 3000                         │
└───────────┬──────────────────────────┬──────────────┘
            │ BullMQ jobs              │ HTTP (internal)
            ▼                         ▼
┌───────────────────┐      ┌─────────────────────────┐
│  WhatsApp Service  │      │   Intelligence Service   │
│  (Node.js)         │      │   (Python / FastAPI)     │
│  whatsapp-web.js   │      │   LiteLLM · pgvector     │
│  Port 3001         │      │   Port 8000              │
└────────┬──────────┘      └────────────┬────────────┘
         │                              │
         └──────────────┬───────────────┘
                        ▼
          ┌─────────────────────────┐
          │   Supabase PostgreSQL   │
          │   + pgvector extension  │
          │                         │
          │   Redis 7 (Docker)      │
          │   BullMQ + pub/sub      │
          └─────────────────────────┘

         ┌──────────────────┐
         │  Kotlin Companion │  ← Android only, background service
         │  App              │  ← POSTs to API when WA service is down
         └──────────────────┘
```

---

## Service Responsibilities

### API Server (`services/api`)
The only service reachable from the internet (via nginx on ECS). All client traffic goes here.

- **Auth**: Clerk JWT → Zuri JWT sync (`POST /api/auth/clerk-sync`); JWT verification on all protected routes
- **User management**: account, subscription, settings
- **Conversation proxy**: clients read message/conversation data through here (from DB)
- **Command routing**: client-approved replies → WhatsApp service; AI advisor queries → Intelligence service
- **Real-time**: Socket.io rooms per user — pushes incoming message events and suggestion-ready notifications; Redis pub/sub subscriber bridges WhatsApp/Intelligence events to Socket.io
- **Webhooks**: Stripe payment events

Does **not** talk to the WhatsApp service except via HTTP command routing. Does **not** run AI inference. It coordinates.

### WhatsApp Service (`services/whatsapp`)
Manages one browser-based WhatsApp Web session per connected user via `whatsapp-web.js` (Puppeteer + Chromium).

- **Session lifecycle**: spawn Chromium session per user, persist auth credentials to disk, restore on restart
- **QR flow**: on new session, Chromium loads WhatsApp Web, QR code is captured → converted to PNG data URL → written to `whatsapp_instances.qr_code` in DB → frontend polls status endpoint until QR appears
- **Auth persistence**: `LocalAuth` stores session credentials in `/app/db/sessions` (Docker volume `wa_sessions`). On service restart, `restoreAll()` finds DB rows with `status='connected'` and restores sessions without needing a new QR scan
- **Inbound**: receives message events from whatsapp-web.js → normalises → pushes `messages.incoming` job to queue
- **Outbound**: consumes `messages.send` jobs → calls whatsapp-web.js `sendMessage()`
- **Redis pub/sub**: publishes `whatsapp:qr:{userId}`, `whatsapp:connected:{userId}`, `whatsapp:disconnected:{userId}` — API's Redis subscriber picks these up and emits to the user's Socket.io room

Memory budget: ~350–500MB per active session (Chromium). The `shm_size: 512mb` on the Docker container is required.

**Runtime stack**: `node:22-bookworm-slim` + `apt-get install chromium`. Alpine Linux is incompatible with Puppeteer v20+.

### Intelligence Service (`services/intelligence`)
All AI inference and relationship analysis lives here. Structured around twelve engines in three layers.

> **Current state**: Core pipeline implemented and running. The `messages.incoming` worker analyses every message, generates reply suggestions, extracts calendar events, and updates relationship health. Temporal, world knowledge, profile, and voice workers are also running. Autonomous agents, governance, and learning engines are not yet implemented.

- **Message analysis**: consume `messages.incoming` → run full analysis pipeline → write `message_analyses` ✅
- **Suggestion generation**: build context from profiles + snapshots → generate 3 reply variants → write `suggested_replies` ✅
- **Profile management**: maintain `contact_profiles`, `contact_insights`, `user_communication_profiles` ✅
- **Context management**: compress message history into `context_snapshots` with embeddings ✅
- **Temporal engine**: per-relationship clocks, cadence deviation detection, proactive nudges ✅
- **World knowledge**: web search integration, news monitoring, interest-to-story matching ✅
- **Opportunity detection**: scan conversations for business and personal opportunities ⏳ Planned
- **Autonomous agents**: sales/support/community manager agents with permission boundaries ⏳ Planned
- **Governance**: AI Memory Explorer, privacy levels, explainability, audit log, data control center ⏳ Planned
- **Learning**: optimise from outcomes — accepted/rejected suggestions, timing feedback, model routing ⏳ Planned

Uses LiteLLM for all model calls — swap providers by changing config, not code. Primary model: `gemini/gemini-3.5-flash` (must use `gemini/` prefix with LiteLLM).

---

## The Twelve Intelligence Engines

Each engine is a Python module under `services/intelligence/engines/`. They are self-contained: read from DB, write to DB, enqueue jobs. They do not call each other directly.

### Layer 1 — Perception (Observe & Understand)

| Engine | Responsibility | Key Outputs |
|--------|---------------|-------------|
| 1. Relationship Intelligence | Deep psychological profiling, living memory | `contact_profiles`, `contact_insights` |
| 2. Temporal Intelligence | Per-relationship clocks, cadence deviation | `proactive_queue` (timing-triggered) |
| 3. Opportunity Detection | Scan for personal + business opportunities | `proactive_queue` (opportunity-triggered) |
| 4. World Knowledge | Web search, news, trends connected to contacts | `proactive_queue` (world-event-triggered) |

### Layer 2 — Cognition (Reason & Plan)

| Engine | Responsibility | Key Outputs |
|--------|---------------|-------------|
| 5. Conversation Strategy | Multi-step conversation planning, goal-oriented | `suggested_replies` with plan |
| 7. Knowledge Engine | Business KB indexing, semantic Q&A | Agent context for responses |
| 12. Learning & Optimization | Optimise from outcomes, model routing, A/B testing | Improved prompts, routing config |

### Layer 3 — Execution (Act & Govern)

| Engine | Responsibility | Key Outputs |
|--------|---------------|-------------|
| 6. Autonomous Agents | Sales/support/community agents with permissions | Outbound messages, escalations |
| 8. Business Intelligence | Analytics, funnel tracking, revenue attribution | Metrics tables |
| 9. Automation Engine | Visual workflow execution | Workflow step results |
| 10. Multi-Channel | Future: normalise messages across channels | Unified message stream |
| 11. Governance & Privacy | Memory control, audit log, explainability, data rights | Audit records, privacy settings |

---

## WhatsApp Connection Flow (End to End)

The full sequence for linking a new WhatsApp account:

```
1. User navigates to /onboarding
   → Frontend starts polling GET /api/whatsapp/status every 2 s immediately

2. User clicks "Start connection"
   → POST /api/proxy/api/whatsapp/connect  (Next.js proxy → API)
   → API forwards to POST /internal/sessions/connect (WhatsApp service)

3. WhatsApp service: startSession(userId)
   → upsertInstance(userId, 'connecting')  — DB row created/reset
   → Client created with LocalAuth (clientId = userId, dataPath = /app/db/sessions)
   → sessions.set(userId, { client, instanceId })  — in-memory registration
   → client.initialize()  — launches Chromium, loads WhatsApp Web (async)

4. client 'qr' event fires (within ~15–30 s)
   → QRCode.toDataURL(rawQr) — converts to base64 PNG data URL
   → DB: UPDATE whatsapp_instances SET qr_code = $1, status = 'qr_pending'
   → Redis: PUBLISH whatsapp:qr:{userId}  (API Socket.io picks this up)

5. Frontend poll returns: { status: 'qr_pending', qrCode: '<data:image/png;base64,...>' }
   → <img src={qrCode}> rendered — user sees QR

6. User scans QR with WhatsApp mobile app

7. client 'authenticated' event → client 'ready' event
   → DB: status = 'connected', phone_number = <number>, qr_code = NULL
   → Redis: PUBLISH whatsapp:connected:{userId}

8. Frontend poll returns: { connected: true }
   → Redirect to /inbox
```

If the session already exists in memory (e.g., `restoreAll()` started it on container boot), the connect endpoint returns **409**. The frontend treats this as "already starting — keep polling" rather than an error.

---

## Message Processing Pipeline

The critical path from a raw WhatsApp message to a suggestion appearing on the user's screen:

```
1. whatsapp-web.js fires 'message' event
        ↓
2. WhatsApp service normalises message
   → persists to messages table
   → pushes messages.incoming job (HIGH priority)
        ↓
3. Intelligence service picks up job
   a. Transcribe audio if message_type = audio
   b. Run message_analyses (sentiment, intent, entities, importance, promises)
   c. Generate and store message embedding (pgvector)
   d. Check if response is needed
   e. If yes: resolve persona, pull contact_profile + context_snapshot
   f. Generate 3 suggested_reply variants (voice-matched)
   g. Write suggested_replies to DB
   h. Push messages.suggestion_ready job (HIGH priority)
        ↓
4. API server picks up messages.suggestion_ready
   → emits suggestion:ready WebSocket event to user's room
        ↓
5. Client receives event
   → inbox updates in real time
   → user sees message + 3 suggested replies with tone/reasoning
```

The full pipeline is implemented and running.

---

## Trust Engine (Cross-Cutting)

Every relationship has a configurable autonomy level. This is not a separate service — it's a configuration layer checked by the Autonomous Agent Engine before taking any action.

| Level | Name | Behavior |
|-------|------|---------|
| 0 | Observe | Analyse conversations. No actions. |
| 1 | Suggest | Draft replies and proactive items. User always approves. (Default) |
| 2 | Assisted | Auto-send routine low-stakes messages (acknowledgements). Confirm on anything substantive. |
| 3 | Delegated | Handle FAQs, schedule meetings, follow up on invoices. Escalate exceptions. |
| 4 | Autonomous | Full agent mode within defined permission boundaries. |

---

## Queue Design

All queues run in Redis via BullMQ.

| Queue | Priority | Producer | Consumer |
|-------|----------|----------|----------|
| `messages.incoming` | HIGH | WhatsApp service | Intelligence service |
| `messages.send` | HIGH | API server | WhatsApp service |
| `messages.suggestion_ready` | HIGH | Intelligence service | API server |
| `analysis.update_contact_profile` | LOW | Intelligence service | Intelligence service |
| `analysis.trim_context` | LOW | Intelligence service (cron) | Intelligence service |
| `temporal.clock_check` | LOW | Scheduler (every 15 min) | Intelligence service |
| `temporal.nudge_generated` | MEDIUM | Intelligence service | API server |
| `world.news_match` | LOW | Intelligence service (hourly) | Intelligence service |
| `opportunity.detected` | MEDIUM | Intelligence service | API server |
| `notifications.deliver` | MEDIUM | API server | API server |

---

## Database Design Decisions

**UUID primary keys everywhere** — avoids sequential ID enumeration, works cleanly in distributed setups.

**`contact_insights` is append-only with deactivation** — insights are never deleted, only marked `is_active = false`. This preserves the learning history and lets the AI understand that a trait changed, not just that it was wrong.

**Two separate tables for events and calendar** — `events` is the AI's raw extraction layer (may have low confidence, may be unconfirmed). `calendar_events` is the user-facing calendar. Confirmed events can spawn calendar entries via `source_event_id`. This keeps AI noise away from the user's clean calendar.

**`context_snapshots` with pgvector** — instead of feeding all message history into every AI prompt, the system maintains compressed summaries with vector embeddings. When generating a reply, the intelligence service queries for semantically relevant past context rather than loading everything. Token-efficient and scales well.

**`relationship_health_logs` is append-only** — the live score lives on `relationships.health_score`, updated in-place. The log table is written-to periodically and never modified. This gives trend data without complex audit tables.

---

## Deployment

### Environments

| Environment | Web | Services |
|-------------|-----|---------|
| Development | `localhost:3000` | `docker compose` |
| Production | Vercel (auto-deploy on push to `main`) | Alibaba Cloud ECS `47.84.205.81` |

### Alibaba ECS (Production)

Single ECS instance running Docker Compose (`docker-compose.prod.yml`). Services communicate via Docker internal network. Only nginx is exposed externally.

```
nginx (port 5500) → API server (3000)

Internal Docker network:
  api     → whatsapp    (http://whatsapp:3001)
  api     → intelligence (http://intelligence:8000)
  api     → redis        (redis://redis:6379)
  whatsapp → supabase    (DATABASE_URL)
  intelligence → supabase (DATABASE_URL)
```

**Database**: Supabase PostgreSQL (external managed service, not a local Docker container). Both `services/api` and `services/whatsapp` connect via the same `DATABASE_URL`.

**Session storage**: whatsapp-web.js auth credentials stored in Docker named volume `wa_sessions`, mounted at `/app/db/sessions` inside the container. Persists across container restarts.

**Web app**: Browser API calls go to `NEXT_PUBLIC_API_URL=/api/proxy` — a Next.js catch-all route that proxies to the ECS backend. This avoids mixed-content errors (HTTPS Vercel → HTTP ECS).

**No SSL yet on ECS**: API is served plain HTTP on port 5500. The proxy on Vercel handles HTTPS for the browser.

### Vercel (Web App)

Next.js auto-deploys on push to `main`. The `/api/proxy/[...path]` route forwards browser requests to the ECS backend, stripping CORS and mixed-content issues. Direct WebSocket connections for Socket.io are proxied the same way.

---

## Scaling Path

The current architecture runs on a single ECS instance. When that's no longer enough:

1. **Move WhatsApp sessions to a dedicated instance** — they're the most memory-hungry component (~400–500MB per session)
2. **Move database to Alibaba RDS** — managed backups, read replicas; already using Supabase as an external DB, migration is a connection string change
3. **Scale intelligence service horizontally** — it's stateless, runs multiple workers behind a load balancer
4. **Move Redis to Alibaba ApsaraDB** — managed, persistent

No architectural changes needed for any of these steps — they're infrastructure swaps.

---

## Security

- All secrets in environment variables, never in code
- Internal services not exposed outside Docker network
- API server validates JWT on every request
- Clerk verifies session tokens for web app routes
- `X-Internal-Secret` header secures Next.js → API server internal calls
- Rate limiting on auth endpoints and AI advisor (cost protection)
- Stripe webhook signature verification
- Input validation on all API endpoints (Zod on Node.js, Pydantic on Python)
- Audit log for all autonomous agent actions (required for enterprise tier)
