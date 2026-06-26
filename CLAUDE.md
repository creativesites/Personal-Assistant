# CLAUDE.md

## What This Project Is

A WhatsApp AI Relationship Intelligence Platform. It is **not** a chatbot or auto-responder — it is a proactive relationship co-pilot that monitors WhatsApp conversations, builds deep psychological profiles of contacts, surfaces maintenance suggestions, and generates contextually accurate reply drafts that mirror the user's own voice. The user stays in control; the AI advises.

Target users: individuals who want to maintain relationships better, and SMBs managing customer engagement.

Working title: **Zuri** (placeholder — rename before launch).

---

## Monorepo Structure

```
/
├── apps/
│   ├── web/            Next.js SaaS dashboard + marketing (→ Vercel)
│   ├── mobile/         React Native + Expo (lower priority — mirrors web)
│   └── companion/      Kotlin Android background notification relay
├── services/
│   ├── api/            Node.js (Fastify) — REST + WebSocket API server
│   ├── whatsapp/       Node.js — open-wa session manager, one instance per user
│   └── intelligence/   Python (FastAPI) — AI analysis, LiteLLM, context management
├── packages/
│   └── shared-types/   TypeScript types shared across Node.js services
├── db/
│   ├── migrations/     PostgreSQL migrations (sequential, plain SQL)
│   └── seeds/          Dev seed data
├── docs/
│   ├── ARCHITECTURE.md Full technical architecture and decisions
│   ├── ROADMAP.md      Phased build plan and current status
│   └── SCHEMA.md       Database schema reference (28 tables, 8 domains)
├── CLAUDE.md           ← you are here
├── README.md
├── .gitignore
├── turbo.json          Turborepo pipeline config
├── package.json        Root workspace manifest
└── docker-compose.yml  Local dev infrastructure
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web dashboard | Next.js 15 (App Router) → Vercel |
| Mobile app | React Native + Expo (bare workflow) |
| Companion app | Kotlin (Android) |
| API server | Node.js + Fastify |
| WhatsApp service | Node.js + @open-wa/wa-automate |
| AI/analytics service | Python 3.12 + FastAPI + LiteLLM |
| Message queue | Redis 7 + BullMQ |
| Real-time push | Socket.io (API server → web/mobile) |
| Database | PostgreSQL 16 + pgvector extension |
| ORM / migrations | Drizzle ORM (Node.js), raw SQL migrations |
| Auth | NextAuth.js (web), JWT (API) |
| Billing | Stripe |
| Monorepo tooling | Turborepo + pnpm workspaces |
| Deployment | Alibaba Cloud ECS (Docker Compose) + Vercel (web) |
| CI | GitHub Actions |

---

## Services

### `services/api` — Node.js API Server
The central hub. Handles auth, business logic, and real-time push to clients. All client requests (web and mobile) go here. Communicates with the `whatsapp` and `intelligence` services via BullMQ jobs and HTTP.

- Port: `3000` (dev)
- WebSocket: same port via Socket.io
- Key responsibilities: auth, user management, conversation CRUD, notification delivery, bridging queue results back to clients

### `services/whatsapp` — open-wa Session Manager
One open-wa instance per connected user. Manages QR authentication, session persistence, message ingestion, and outbound sends. On new message, fires a job onto the BullMQ `messages.incoming` queue. On approved reply, sends via the open-wa instance.

- Port: `3001` (dev, internal only — not exposed to clients)
- Session data stored in `db/sessions/` (volume-mounted in Docker)
- Memory: ~350MB per active user instance — monitor closely on ECS

### `services/intelligence` — Python AI Service
Consumes jobs from `messages.incoming`, runs analysis, generates reply suggestions, manages contact profiles, context snapshots, and proactive queue population. Returns structured JSON results back via queue or HTTP callback.

- Port: `8000` (dev, internal only)
- LiteLLM for provider-agnostic AI calls (Anthropic, OpenAI, Google, etc.)
- pgvector queries for semantic context retrieval

### `apps/web` — Next.js SaaS Dashboard
Full-featured product surface. Inbox, relationship map, proactive queue, AI advisor chat, calendar, settings, onboarding (QR flow), and billing. Connects to API server via REST and WebSocket.

### `apps/companion` — Kotlin Android App
Silent background service. Reads WhatsApp notification content via `NotificationListenerService`, POSTs to API server as fallback when open-wa session is disconnected. Also used by mobile-only tier users.

---

## Key Commands

```bash
# Start local infrastructure (Postgres, Redis)
docker compose up -d postgres redis

# Start all services in development
pnpm dev

# Start a single service
pnpm --filter api dev
pnpm --filter whatsapp dev
pnpm --filter intelligence dev   # runs uvicorn with --reload

# Run database migrations
pnpm db:migrate

# Seed development data
pnpm db:seed

# Build all packages
pnpm build

# Run tests
pnpm test

# Type-check
pnpm typecheck

# Lint
pnpm lint
```

---

## Environment Variables

Each service has its own `.env`. Never commit `.env` files. Copy from `.env.example` in each service directory.

**Core variables across services:**

```
# Database
DATABASE_URL=postgresql://zuri:password@localhost:5432/zuri_dev

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# AI Providers (intelligence service — set at least one)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_AI_API_KEY=

# Stripe (web + api)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Internal service URLs
WHATSAPP_SERVICE_URL=http://localhost:3001
INTELLIGENCE_SERVICE_URL=http://localhost:8000
API_URL=http://localhost:3000
```

---

## Architecture Overview

```
Browser / Mobile App
    │
    ├── REST + WebSocket ──→ API Server (Node.js :3000)
    │                             │
    │                   ┌─────────┴──────────┐
    │                   │                    │
    │            BullMQ Queue           HTTP (internal)
    │            (Redis)                     │
    │                   │                    │
    │         ┌─────────┴────┐    ┌──────────┴──────┐
    │         │  WhatsApp    │    │  Intelligence   │
    │         │  Service     │    │  Service        │
    │         │  (Node.js)   │    │  (Python)       │
    │         └──────────────┘    └─────────────────┘
    │                   │                    │
    └───────────────────┴────────────────────┘
                                 │
                        PostgreSQL + pgvector
```

Message flow: WhatsApp → open-wa → `messages.incoming` queue → Intelligence service analyses → results written to DB → API server notified → WebSocket push to client.

---

## Database

PostgreSQL 16 with pgvector. 28 tables across 8 domains. See `docs/SCHEMA.md` for full reference.

**Domains:** Core · Contacts & Relationships · Conversations & Messages · AI Intelligence · Proactive System · Calendar · AI Advisor · Notifications

Key design notes:
- All PKs are `uuid` (gen_random_uuid())
- `contact_insights` stores atomic AI observations — grows indefinitely, deactivated not deleted
- `context_snapshots` holds compressed relationship summaries with vector embeddings — replaces raw message history in prompts
- `relationship_health_logs` is append-only — `relationships.health_score` is the live value
- `events` (AI-extracted) and `calendar_events` (user-facing) are separate — linked via `source_event_id`

---

## Conventions

- **TypeScript** everywhere in Node.js services. Strict mode enabled.
- **Shared types** live in `packages/shared-types` — queue job payloads, API response shapes, enum values. Import from `@zuri/types`.
- **Queue job names** follow `domain.action` pattern: `messages.incoming`, `analysis.contact_profile`, `proactive.generate_daily`.
- **Python**: use `ruff` for linting, `black` for formatting, `pydantic` for all data models.
- **Migrations**: sequential numbered SQL files in `db/migrations/` — `0001_initial.sql`, `0002_add_pgvector.sql`, etc. Never edit an applied migration; add a new one.
- **No `console.log` in production paths** — use the logger (`pino` in Node.js, `structlog` in Python).
- **Secrets**: never hardcode, always from environment.

---

## Current Status

- [x] Project documentation and architecture defined
- [x] Database schema designed (28 tables)
- [ ] Monorepo scaffold (Turborepo + pnpm workspaces)
- [ ] Docker Compose local dev environment
- [ ] Database migrations
- [ ] API service skeleton
- [ ] WhatsApp service skeleton
- [ ] Intelligence service skeleton
- [ ] Next.js web app scaffold
- [ ] Auth flow
- [ ] open-wa session management
- [ ] Message ingestion pipeline
- [ ] AI analysis pipeline
- [ ] Suggested reply generation
- [ ] Web dashboard UI
- [ ] Billing (Stripe)
- [ ] Kotlin companion app
- [ ] React Native mobile app
