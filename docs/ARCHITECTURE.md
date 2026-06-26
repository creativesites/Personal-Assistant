# Architecture

## System Overview

Zuri is a multi-service system. Each service has a single responsibility. They communicate via a message queue (BullMQ/Redis) and internal HTTP, never exposing internal services to the internet.

```
┌──────────────────────────────────────────────────────┐
│                   Client Layer                        │
│   Next.js Web App (Vercel)  │  React Native Mobile    │
└──────────────┬──────────────┴──────────┬─────────────┘
               │ REST + WebSocket         │ REST + WebSocket
               ▼                         ▼
┌─────────────────────────────────────────────────────┐
│              API Server  (Node.js / Fastify)          │
│  Auth · Business logic · WebSocket push · Routing    │
│                     Port 3000                         │
└───────────┬──────────────────────────┬──────────────┘
            │ BullMQ jobs              │ HTTP (internal)
            ▼                         ▼
┌───────────────────┐      ┌─────────────────────────────────┐
│  WhatsApp Service  │      │   Intelligence Service           │
│  (Node.js)         │      │   (Python / FastAPI)             │
│  open-wa instances │      │   10 Intelligence Engines        │
│  Port 3001         │      │   LiteLLM · pgvector             │
└────────┬──────────┘      │   Web search tools               │
         │                 │   Port 8000                       │
         │                 └────────────────┬────────────────┘
         └──────────────┬───────────────────┘
                        ▼
          ┌─────────────────────────┐
          │   PostgreSQL 16         │
          │   + pgvector extension  │
          │                         │
          │   Redis 7               │
          │   (BullMQ + cache)      │
          └─────────────────────────┘

         ┌──────────────────┐
         │  Kotlin Companion │  ← Android only, background service
         │  App              │  ← POSTs to API when open-wa is down
         └──────────────────┘
```

---

## Service Responsibilities

### API Server (`services/api`)
The only service reachable from the internet (via nginx on ECS). All client traffic goes here.

- **Auth**: Clerk JWT verification (web), JWT issuance/verification for API-only clients
- **User management**: account, subscription, settings
- **Conversation proxy**: clients read message/conversation data through here
- **Command routing**: approved replies → WhatsApp service; AI advisor queries → Intelligence service
- **Real-time**: Socket.io rooms per user — pushes `message:new`, `suggestion:ready`, `relationship:update` events
- **Webhooks**: Stripe payment events

Does **not** talk to open-wa directly. Does **not** run AI inference. It coordinates.

### WhatsApp Service (`services/whatsapp`)
Manages one open-wa browser session per connected user.

- **Session lifecycle**: spawn on user connect, persist session to disk, reconnect on restart
- **Inbound**: open-wa `onMessage` event → normalise → persist to DB → push `messages.incoming` to queue
- **Outbound**: consume `messages.send` jobs → call open-wa to send
- **QR flow**: generate QR → stream to API server → WebSocket push to web client
- **Health monitoring**: watchdog pings each session every 30s, restarts on failure, notifies API on status change

Memory budget: ~350MB per active session. Sessions idle >2 hours are hibernated to reclaim memory.

### Intelligence Service (`services/intelligence`)
All AI inference and relationship analysis lives here. Structured around ten engines.

- **Message analysis**: consume `messages.incoming` → run full analysis pipeline → write `message_analyses`
- **Suggestion generation**: build context from profiles + snapshots → generate 3 reply variants → write `suggested_replies`
- **Profile management**: maintain `contact_profiles`, `contact_insights`, `user_communication_profiles`
- **Context management**: compress message history into `context_snapshots` with embeddings
- **Temporal engine**: per-relationship clocks, cadence deviation detection, proactive nudges
- **World knowledge**: web search integration, news monitoring, interest-to-story matching
- **Opportunity detection**: scan conversations for business and personal opportunities
- **Autonomous agents**: sales/support/community manager agents with permission boundaries

Uses LiteLLM for all model calls — swap providers by changing config, not code.

---

## The Ten Intelligence Engines

Each engine is a Python module under `services/intelligence/engines/`. They are self-contained: read from DB, write to DB, enqueue jobs. They do not call each other directly.

| Engine | Responsibility | Key Outputs |
|--------|---------------|-------------|
| 1. Relationship Intelligence | Deep psychological profiling, living memory | `contact_profiles`, `contact_insights` |
| 2. Temporal Intelligence | Per-relationship clocks, cadence deviation | `proactive_queue` (timing-triggered) |
| 3. Opportunity Detection | Scan for personal + business opportunities | `proactive_queue` (opportunity-triggered) |
| 4. World Knowledge | Web search, news, trends connected to contacts | `proactive_queue` (world-event-triggered) |
| 5. Conversation Strategy | Multi-step conversation planning, goal-oriented | `suggested_replies` with plan |
| 6. Autonomous Agents | Sales/support/community agents with permissions | Outbound messages, escalations |
| 7. Knowledge Engine | Business KB indexing, semantic Q&A | Agent context for responses |
| 8. Business Intelligence | Analytics, funnel tracking, revenue attribution | Metrics tables |
| 9. Automation Engine | Visual workflow execution | Workflow step results |
| 10. Multi-Channel | Future: normalise messages across channels | Unified message stream |

---

## Message Processing Pipeline

The critical path from a raw WhatsApp message to a suggestion on screen:

```
1. open-wa fires onMessage event
        ↓
2. WhatsApp service normalises message
   → persists to messages table
   → pushes messages.incoming job (HIGH priority)
        ↓
3. Intelligence service picks up job
   a. Transcribe audio if message_type = audio  (Whisper API)
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

Background jobs (profile updates, clock checks, proactive generation, context trimming) run on LOW priority queues and are preempted by HIGH priority message jobs.

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

## Database Design Decisions

**UUID primary keys everywhere** — avoids sequential ID enumeration, works cleanly in distributed setups.

**`contact_insights` is append-only with deactivation** — insights are never deleted, only marked `is_active = false`. This preserves the learning history and lets the AI understand that a trait *changed*, not just that it was wrong.

**Two separate tables for events and calendar** — `events` is the AI's raw extraction layer (may be low-confidence, unconfirmed). `calendar_events` is the user-facing calendar. Confirmed events populate calendar entries via `source_event_id`. Keeps AI noise away from the user's clean calendar.

**`context_snapshots` with pgvector** — instead of feeding all message history into every AI prompt, the system maintains compressed summaries with vector embeddings. The intelligence service queries for semantically relevant past context rather than loading everything. Token-efficient and scales well.

**`relationship_health_logs` is append-only** — the live score sits on `relationships.health_score`, updated in-place. The log table is written to periodically and never modified. Powers trend charts and lets the AI observe historical health patterns.

---

## Deployment

### Environments

| Environment | Web | Services |
|-------------|-----|---------|
| Development | `localhost:3002` | `docker compose` |
| Production | Vercel (auto-deploy on `main`) | Alibaba Cloud ECS |

### Alibaba ECS (Production)

Single ECS instance running Docker Compose. Services communicate via Docker internal network. Only nginx is exposed to the internet.

```
nginx (80/443) → API server (:3000)

Internal Docker network:
  api        ↔ whatsapp (:3001)
  api        ↔ intelligence (:8000)
  api        ↔ redis (:6379)
  api        ↔ postgres (:5432)
  whatsapp   ↔ postgres (:5432)
  whatsapp   ↔ redis (:6379)
  intelligence ↔ postgres (:5432)
  intelligence ↔ redis (:6379)
```

**SSL**: Let's Encrypt via Certbot on the ECS instance.

**Session storage**: open-wa session files volume-mounted to `/data/sessions` on the ECS host — persistent across container restarts.

**Database**: PostgreSQL in Docker on the same ECS instance. When usage grows, migrate to Alibaba RDS (change `DATABASE_URL`, no code changes needed).

### Vercel (Web App)

Next.js deploys automatically on push to `main`. Long-running connections and WebSockets are not handled on Vercel serverless — they go directly to the ECS backend.

WebSocket connections: browser → ECS backend directly (not proxied through Vercel).

---

## Scaling Path

The current architecture runs on a single ECS instance. Growth steps — each is an infrastructure swap, no architectural changes needed:

1. **Move open-wa sessions to a dedicated ECS instance** — most memory-hungry component (~350MB/session)
2. **Move PostgreSQL to Alibaba RDS** — managed backups, read replicas, no operational burden
3. **Scale intelligence service horizontally** — stateless Python workers, run N instances behind a load balancer
4. **Move Redis to Alibaba ApsaraDB for Redis** — managed, persistent, HA

---

## Security

- All secrets in environment variables, never in code
- open-wa `session_data` encrypted at rest in the database
- Internal services not exposed outside Docker network
- API server validates JWT on every request
- Clerk verifies session tokens for web app routes
- `X-Internal-Secret` header secures Next.js → API server internal calls
- Rate limiting on auth endpoints and AI advisor (cost protection)
- Stripe webhook signature verification
- Input validation on all API endpoints (Zod on Node.js, Pydantic on Python)
- Audit log for all autonomous agent actions (required for enterprise tier)
