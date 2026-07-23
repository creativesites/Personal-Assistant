# Architecture

## System Overview

Zuri is a multi-service AI Relationship & Business Operating System. Each service has a single responsibility. They communicate via a message queue (BullMQ/Redis) and internal HTTP, never directly exposing internal services to the internet.

```
┌────────────────────────────────────────────────────────┐
│                    Client Layer                        │
│   Next.js 15 Web App (Vercel)  │  React Native Mobile   │
└──────────────┬─────────────────┴──────────┬────────────┘
               │ REST + WebSocket           │ REST + WebSocket
               │ (via /api/proxy)           │
               ▼                            ▼
┌───────────────────────────────────────────────────────┐
│              API Server  (Node.js / Fastify 5)         │
│  Auth · Team Scoping · E-Sigs · Documents · Routing   │
│                      Port 3000                        │
└───────────┬────────────────────────────┬──────────────┘
            │ BullMQ jobs                │ HTTP (internal)
            ▼                            ▼
┌───────────────────┐        ┌───────────────────────────┐
│  WhatsApp Service │        │    Intelligence Service   │
│  (Node.js)        │        │    (Python / FastAPI)     │
│  Baileys          │        │    LiteLLM · pgvector     │
│  Port 3001        │        │    Port 8000              │
└────────┬──────────┘        └────────────┬──────────────┘
         │                                │
         └──────────────┬─────────────────┘
                        ▼
           ┌───────────────────────────┐
           │    Supabase PostgreSQL    │
           │    + pgvector extension   │
           │    (115 migrations)       │
           │                           │
           │    Redis 7 (Docker)       │
           │    BullMQ + pub/sub       │
           └───────────────────────────┘

          ┌────────────────────┐
          │  Kotlin Companion  │  ← Android only, background service
          │  App               │  ← POSTs to API when WA service is down
          └────────────────────┘
```

---

## Service Responsibilities

### API Server (`services/api`)
The only service reachable from the internet (via nginx on ECS). All client traffic goes here.

- **Auth & Team Scoping**: Clerk JWT + Clerk Organizations sync (`POST /api/auth/clerk-sync`); JWT verification and `organization_id` scoping on all protected routes
- **BYOK Management**: Secure encryption and validation for Anthropic, OpenAI, Gemini, and DashScope API keys
- **User & Workspace management**: account, subscription, team seat limits, settings
- **Conversation & Team Inbox**: clients read message/conversation data, active conversation locking, collision warning indicators
- **Document Management & E-Signatures**: 15 document types, PDF generation, 1:1 canvas e-signatures with Bézier curve smoothing, public share token tracking
- **ERP & Sales Engine**: Sales orders, purchase orders, inventory locations, stock movements, bill of materials
- **Command routing**: client-approved replies → WhatsApp service; AI advisor queries → Intelligence service
- **Real-time**: Socket.io rooms per user/org — pushes incoming message events, active locks, and suggestion-ready notifications

**Route modules:**
- `routes/auth.ts` — Clerk sync, JWT
- `routes/whatsapp.ts` — connect, status, QR
- `routes/conversations.ts` — list, thread, messages, locking
- `routes/contacts.ts` — CRUD, CRM fields, merging
- `routes/leads.ts` — pipeline, stage management
- `routes/suggestions.ts` — approve, reject, regenerate
- `routes/proactive.ts` — nudge queue
- `routes/documents.ts` — 15 document types, templates, e-signatures
- `routes/erp.ts` — sales orders, purchase orders, inventory, BOM
- `routes/byok.ts` — bring your own key endpoints
- `routes/organization.ts` — Clerk Organizations, seat limits, team scoping
- `routes/companion.ts` — Android companion relay
- `routes/advisor.ts` — AI chat
- `routes/analytics.ts` — 11 BI sub-dashboards
- `routes/career.ts` — scraped jobs, readiness checklists, cover letters, CV studio
- `routes/admin.ts` — history sync & admin portal

### WhatsApp Service (`services/whatsapp`)
Manages one Baileys (@whiskeysockets/baileys) WebSocket session per connected user.

- **Session lifecycle**: spawn Baileys session per user, persist auth state to disk (`/app/db/sessions`), restore on restart
- **QR & Link code flow**: QR code generation and 8-digit link code pairing
- **First Impression Mode**: captures historical WAMessage[] on initial connect
- **Inbound & Outbound**: normalizes incoming messages and consumes `messages.send` jobs

### Intelligence Service (`services/intelligence`)
All AI inference, relationship analysis, and Knowledge Brain functions live here.

- **Message analysis**: sentiment, intent, entities, importance, promises, urgency
- **Context management**: compress message history into `context_snapshots` with pgvector
- **Knowledge Brain & Search**: PDF/Excel/CSV document chunking, vector search (`search_knowledge`), conversational KB chat (`chat_with_knowledge`), AI Knowledge Discovery
- **Temporal & World Knowledge**: per-relationship clocks, cadence deviation, web search tools
- **Model Routing**: LiteLLM with fallback to user's BYOK keys

---

## Queue Design

All queues run in Redis via BullMQ.

| Queue | Priority | Producer | Consumer |
|-------|----------|----------|----------|
| `messages.incoming` | HIGH | WhatsApp service | Intelligence service |
| `messages.send` | HIGH | API server | WhatsApp service |
| `messages.suggestion_ready` | HIGH | Intelligence service | API server |
| `analysis.update_contact_profile` | LOW | Intelligence service | Intelligence service |
| `temporal.clock_check` | LOW | Scheduler (every 15 min) | Intelligence service |
| `world.news_match` | LOW | Intelligence service (hourly) | Intelligence service |
| `knowledge.discovery` | LOW | Intelligence service | Intelligence service |

---

## Deployment (Alibaba ECS & Vercel)

- **ECS Backend**: `47.84.205.81:5500` running Docker Compose (`docker-compose.prod.yml`)
- **Web Dashboard**: Vercel auto-deployment connected to Supabase PostgreSQL (115 migrations applied)
