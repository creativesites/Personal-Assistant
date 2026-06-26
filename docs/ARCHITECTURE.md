# Architecture

## System Overview

Zuri is a multi-service system. Each service has a single responsibility. They communicate via a message queue (BullMQ/Redis) and internal HTTP, never directly exposing internal services to the internet.

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
┌───────────────────┐      ┌─────────────────────────┐
│  WhatsApp Service  │      │   Intelligence Service   │
│  (Node.js)         │      │   (Python / FastAPI)     │
│  open-wa instances │      │   LiteLLM · pgvector     │
│  Port 3001         │      │   Port 8000              │
└────────┬──────────┘      └────────────┬────────────┘
         │                              │
         └──────────────┬───────────────┘
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

- **Auth**: JWT issuance and verification, NextAuth integration for web
- **User management**: account, subscription, settings
- **Conversation proxy**: clients read message/conversation data through here (from DB)
- **Command routing**: client-approved replies → WhatsApp service; AI advisor queries → Intelligence service
- **Real-time**: Socket.io rooms per user — pushes incoming message events and suggestion-ready notifications
- **Webhooks**: Stripe payment events

Does **not** talk to open-wa directly. Does **not** run AI inference. It coordinates.

### WhatsApp Service (`services/whatsapp`)
Manages one open-wa browser session per connected user.

- **Session lifecycle**: spawn on user connect, persist session to disk, reconnect on restart
- **Inbound**: receives message events from open-wa → normalises → pushes `messages.incoming` job to queue
- **Outbound**: consumes `messages.send` jobs → calls open-wa to send
- **QR flow**: generates QR, streams to API server which pushes to web client via WebSocket
- **Health monitoring**: watchdog pings each session, restarts on failure, notifies API on status change

Memory budget: ~350MB per active session. The session manager hibernates sessions idle for >2 hours to reclaim memory.

### Intelligence Service (`services/intelligence`)
All AI inference and relationship analysis lives here.

- **Message analysis**: consumes `messages.incoming` → runs sentiment, intent, entity extraction, importance scoring → writes `message_analyses`
- **Suggestion generation**: generates reply candidates using persona + contact profile + context snapshot → writes `suggested_replies`
- **Profile updates**: periodically updates `contact_profiles`, `contact_insights`, `user_communication_profiles`
- **Context management**: trims raw message history into `context_snapshots` (with embeddings) when token count exceeds threshold
- **Proactive engine**: daily cron — scans relationships for dormancy, upcoming events, unanswered promises → populates `proactive_queue`
- **AI Advisor**: handles direct user ↔ AI conversations with full relationship context

Uses LiteLLM for all model calls — swap providers by changing a config value, not code.

---

## Message Processing Pipeline

The critical path from a raw WhatsApp message to a suggestion appearing on the user's screen:

```
1. open-wa fires onMessage event
        ↓
2. WhatsApp service normalises message
   → persists to messages table
   → pushes messages.incoming job (HIGH priority)
        ↓
3. Intelligence service picks up job
   a. Transcribe audio if message_type = audio  (Whisper API)
   b. Run message_analyses (sentiment, intent, entities, importance)
   c. Check if response is needed
   d. If yes: pull contact_profile + latest context_snapshot
   e. Generate suggested_reply (3 variants)
   f. Write suggested_replies to DB
   g. Push messages.suggestion_ready job
        ↓
4. API server picks up messages.suggestion_ready
   → emits suggestion:ready WebSocket event to user's room
        ↓
5. Client receives event
   → updates inbox in real time
   → user sees message + suggested reply
```

Background jobs (profile updates, proactive queue generation, context trimming) run on LOW priority queues and are preempted by HIGH priority message jobs.

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
| `proactive.generate_daily` | LOW | Cron (08:00 user TZ) | Intelligence service |
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
| Production | Vercel | Alibaba Cloud ECS |

### Alibaba ECS (Production)

Single ECS instance running Docker Compose. Services communicate via Docker internal network. Only nginx is exposed to the internet.

```
nginx (80/443) → API server (3000)
               → Web app is on Vercel — direct
               
Internal network (docker):
  api ↔ whatsapp (3001)
  api ↔ intelligence (8000)
  api ↔ redis (6379)
  intelligence ↔ postgres (5432)
  whatsapp ↔ postgres (5432)
```

**SSL**: Let's Encrypt via Certbot on the ECS instance.

**Session storage**: open-wa session files volume-mounted to `/data/sessions` on the ECS host for persistence across container restarts.

**Database**: PostgreSQL runs in Docker on the same ECS instance. When usage grows, migrate to Alibaba RDS (drop-in, change `DATABASE_URL`).

### Vercel (Web App)

Next.js deploys to Vercel automatically. API routes that need long-running connections or WebSockets proxy to the ECS backend — they do not run on Vercel serverless.

WebSocket connections from the browser go directly to the ECS backend (not through Vercel).

---

## Scaling Path

The current architecture runs on a single ECS instance. When that's no longer enough:

1. **Move open-wa instances to a dedicated ECS instance** — they're the most memory-hungry component
2. **Move PostgreSQL to Alibaba RDS** — managed backups, read replicas, no operational burden
3. **Scale intelligence service horizontally** — it's stateless, runs multiple workers behind a load balancer
4. **Move Redis to Alibaba Redis (ApsaraDB)** — managed, persistent

No architectural changes needed for any of these steps — they're infrastructure swaps.

---

## Security

- All secrets in environment variables, never in code
- open-wa `session_data` encrypted at rest in the database
- Internal services not exposed outside Docker network
- API server validates JWT on every request
- Rate limiting on auth endpoints and AI advisor (cost protection)
- Stripe webhook signature verification
- Input validation on all API endpoints (Zod on Node.js, Pydantic on Python)
