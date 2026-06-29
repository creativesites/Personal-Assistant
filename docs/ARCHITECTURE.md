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
│  Baileys           │      │   LiteLLM · pgvector     │
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
- **History sync**: `POST /api/admin/history-sync/start`, `GET /api/admin/history-sync/status`, `POST /api/admin/history-sync/cancel` — re-queues stored messages as historical for AI re-analysis
- **Auto response settings**: `GET /api/settings/auto-response`, `PUT /api/settings/auto-response`
- **Webhooks**: Stripe payment events

Does **not** talk to the WhatsApp service except via HTTP command routing. Does **not** run AI inference. It coordinates.

**Route modules:**
- `routes/auth.ts` — Clerk sync, JWT
- `routes/whatsapp.ts` — connect, status, QR
- `routes/conversations.ts` — list, thread, messages
- `routes/contacts.ts` — CRUD, CRM fields
- `routes/leads.ts` — pipeline, stage management
- `routes/suggestions.ts` — approve, reject, regenerate
- `routes/proactive.ts` — nudge queue
- `routes/companion.ts` — Android companion relay
- `routes/advisor.ts` — AI chat
- `routes/analytics.ts` — KPI aggregations
- `routes/team.ts` — team members
- `routes/broadcasts.ts` — bulk message sends
- `routes/enterprise.ts` — enterprise features
- `routes/media.ts` — media proxy
- `routes/agents.ts` — agent configuration
- `routes/admin.ts` — history sync endpoints
- `routes/settings.ts` — auto response settings

### WhatsApp Service (`services/whatsapp`)
Manages one Baileys (@whiskeysockets/baileys) WebSocket session per connected user.

- **Session lifecycle**: spawn Baileys session per user, persist auth state to disk, restore on restart
- **QR flow**: on new session, Baileys generates a QR → stored to `whatsapp_instances.qr_code` in DB → frontend polls status endpoint until QR appears
- **Link code**: alternative to QR — user enters a 8-digit code in their WhatsApp mobile app
- **Auth persistence**: `useMultiFileAuthState` stores session credentials in `/app/db/sessions` (Docker volume `wa_sessions`). On service restart, `restoreAll()` finds DB rows with `status='connected'` and restores sessions without needing a new QR scan
- **First Impression Mode**: on initial session connect, Baileys fires `messaging-history.set` with historical WAMessage[] — the service normalises these and emits them as `historical_message` events (handled separately from live messages with `isHistorical: true`)
- **Inbound**: receives `messages.upsert` events from Baileys → normalises → pushes `messages.incoming` job to queue
- **Outbound**: consumes `messages.send` jobs → calls Baileys `sendMessage()`
- **Redis pub/sub**: publishes `whatsapp:qr:{userId}`, `whatsapp:connected:{userId}`, `whatsapp:disconnected:{userId}` — API's Redis subscriber picks these up and emits to the user's Socket.io room

Memory budget: ~80–150MB per active Baileys session (much lighter than the previous Puppeteer/Chromium approach).

**Transport layer**: `src/transport/baileys.ts` extends `WhatsAppTransport` base class. Emits `'message'` (live) and `'historical_message'` (from `messaging-history.set`) events.

### Intelligence Service (`services/intelligence`)
All AI inference and relationship analysis lives here. Structured around twelve engines in three layers.

> **Current state**: Core pipeline implemented and running. The `messages.incoming` worker analyses every message, generates reply suggestions, extracts calendar events, and updates relationship health. Temporal, world knowledge, profile, and voice workers are running. `isHistorical` flag support built in — historical messages skip reply generation and use wider batch intervals to avoid flooding the AI provider. Opportunity detection, autonomous agents, governance, and learning engines are not yet implemented.

- **Message analysis**: consume `messages.incoming` → run full analysis pipeline → write `message_analyses` ✅
- **Historical message support**: `isHistorical` flag skips reply generation; wider AI call intervals (20–50 messages vs 5–20) for batch efficiency ✅
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
   → Baileys socket created with useMultiFileAuthState (dataPath = /app/db/sessions/userId)
   → sessions.set(userId, transport)  — in-memory registration
   → transport._boot()  — opens WebSocket to WhatsApp servers (async)

4. 'connection.update' event fires with QR code (within ~5–15 s)
   → DB: UPDATE whatsapp_instances SET qr_code = $1, status = 'qr_pending'
   → Redis: PUBLISH whatsapp:qr:{userId}

5. Frontend poll returns: { status: 'qr_pending', qrCode: '<data:image/png;base64,...>' }
   → <img src={qrCode}> rendered — user sees QR

6. User scans QR with WhatsApp mobile app
   (OR: requests link code — 8-digit code shown, user types it in WhatsApp)

7. 'connection.update' fires with connection = 'open'
   → DB: status = 'connected', phone_number = <number>, qr_code = NULL
   → Redis: PUBLISH whatsapp:connected:{userId}
   → Baileys fires 'messaging-history.set' with historical messages
   → Historical messages normalised → pushed to queue with isHistorical: true

8. Frontend poll returns: { connected: true }
   → Redirect to /inbox
```

---

## Message Processing Pipeline

The critical path from a raw WhatsApp message to a suggestion appearing on the user's screen:

```
1. Baileys fires 'messages.upsert' event
        ↓
2. WhatsApp service normalises message
   → persists to messages table
   → pushes messages.incoming job (HIGH priority)
        ↓
3. Intelligence service picks up job
   a. Check isHistorical flag
   b. If audio: transcribe via Whisper (TODO)
   c. Run message_analyses (sentiment, intent, entities, importance, promises)
   d. Generate and store message embedding (pgvector)
   e. If isHistorical: skip reply generation; use wider AI call intervals
   f. If not historical and requires_response:
      - resolve persona, pull contact_profile + context_snapshot
      - generate 3 suggested_reply variants (voice-matched)
      - write suggested_replies to DB
      - push messages.suggestion_ready job (HIGH priority)
        ↓
4. API server picks up messages.suggestion_ready
   → emits suggestion:ready WebSocket event to user's room
        ↓
5. Client receives event
   → inbox updates in real time
   → user sees message + 3 suggested replies with tone/reasoning
```

## Historical Sync Flow

Triggered from the Diagnostics page or on first WhatsApp connect:

```
1. POST /api/admin/history-sync/start
   → creates sync_jobs row (status=running)
   → runSync() executes async in background

2. runSync() iterates conversations ordered by last_message_at DESC
   → for each conversation, fetches messages from DB
   → pushes messages.incoming job for each message (isHistorical: true)
   → updates sync_jobs progress every 5 conversations
   → queries DB for fresh contact/lead/insight counts

3. Intelligence service processes jobs with isHistorical: true
   → skips reply generation
   → runs profile extraction, insight creation, relationship health update
   → wider batch intervals to avoid AI rate limits

4. GET /api/admin/history-sync/status
   → returns progress, stats, current chat name

5. POST /api/admin/history-sync/cancel
   → sets in-memory cancel signal for that syncJobId
   → updates sync_jobs status to 'cancelled'
```

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

## Global WA Status System

The web app displays data from DB regardless of WhatsApp connection state.

### Status Polling

`apps/web/src/hooks/use-wa-status.ts` — `useWAStatus(token)` hook:
- Polls `GET /api/whatsapp/status` on a self-scheduling timer
- 8s interval for transitional states: `connecting`, `qr_pending`, `link_code_pending`
- 30s interval for stable states: `connected`, `disconnected`, `error`, `unknown`
- Returns `WAStatus { status, connected, phone, lastConnectedAt }`

### Status Widget in Sidebar

The `WAStatusWidget` component in `apps/web/src/app/(dashboard)/layout.tsx` renders:
- `connected` → green glow dot + phone number + "Manage" link to /settings
- `connecting/qr_pending/link_code_pending` → amber Loader2 spinner + context text + /onboarding link
- `error` → red WifiOff icon + "Tap to reconnect"
- `disconnected` → grey WifiOff + "Reconnect WhatsApp" link
- `unknown` → original indigo "Connect WhatsApp" CTA with Smartphone icon

### Mobile Status Dot

Coloured dot overlaid on the Zuri logo in the mobile top bar:
- Connected → green with glow shadow
- Transitional → amber with CSS `animate-pulse`
- Error → red
- Disconnected → grey

---

## Database Design Decisions

**UUID primary keys everywhere** — avoids sequential ID enumeration, works cleanly in distributed setups.

**`contact_insights` is append-only with deactivation** — insights are never deleted, only marked `is_active = false`. This preserves the learning history and lets the AI understand that a trait changed, not just that it was wrong.

**Two separate tables for events and calendar** — `events` is the AI's raw extraction layer (may have low confidence, may be unconfirmed). `calendar_events` is the user-facing calendar. Confirmed events can spawn calendar entries via `source_event_id`. This keeps AI noise away from the user's clean calendar.

**`context_snapshots` with pgvector** — instead of feeding all message history into every AI prompt, the system maintains compressed summaries with vector embeddings. When generating a reply, the intelligence service queries for semantically relevant past context rather than loading everything. Token-efficient and scales well.

**`relationship_health_logs` is append-only** — the live score lives on `relationships.health_score`, updated in-place. The log table is written-to periodically and never modified. This gives trend data without complex audit tables.

**`sync_jobs` for history sync** — one row per sync run per user. Tracks conversation/message counts and AI extraction results (contacts, leads, insights) for the Diagnostics progress UI.

**`auto_response_settings` is one row per user (UNIQUE on user_id)** — upserted via `ON CONFLICT (user_id) DO UPDATE SET`. Stores business hours, approval mode, escalation config, and message templates.

**CRM fields on `contacts`** — `customer_status`, `pipeline_stage`, `lead_score`, `company`, `job_title`, `email`, `industry`, `website`, `source`, `archived_at` — added via migration 0021 to power the Leads and Contacts pages.

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
  api          → whatsapp     (http://whatsapp:3001)
  api          → intelligence (http://intelligence:8000)
  api          → redis        (redis://redis:6379)
  whatsapp     → supabase     (DATABASE_URL)
  intelligence → supabase     (DATABASE_URL)
```

**Database**: Supabase PostgreSQL (external managed service, not a local Docker container). All services connect via the same `DATABASE_URL`.

**Session storage**: Baileys auth state stored in Docker named volume `wa_sessions`, mounted at `/app/db/sessions` inside the container. Persists across container restarts.

**Web app**: Browser API calls go to `NEXT_PUBLIC_API_URL=/api/proxy` — a Next.js catch-all route that proxies to the ECS backend. This avoids mixed-content errors (HTTPS Vercel → HTTP ECS).

**No SSL yet on ECS**: API is served plain HTTP on port 5500. The proxy on Vercel handles HTTPS for the browser.

### Vercel (Web App)

Next.js auto-deploys on push to `main`. The `/api/proxy/[...path]` route forwards browser requests to the ECS backend, stripping CORS and mixed-content issues.

---

## Scaling Path

The current architecture runs on a single ECS instance. When that's no longer enough:

1. **Move WhatsApp sessions to a dedicated instance** — Baileys sessions are memory-light (~100–150MB each) but Chromium is no longer in use
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
