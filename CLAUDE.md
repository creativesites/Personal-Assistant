# CLAUDE.md

## What This Project Is

**Zuri** — an AI Relationship Operating System built on top of WhatsApp. It is not a chatbot or auto-responder. It is a continuous, always-on intelligence layer that reads every conversation, builds living psychological profiles of contacts, reasons about relationship dynamics, surfaces proactive maintenance opportunities, and generates voice-matched reply drafts. The user stays in control; the AI advises, plans, and — in higher automation tiers — executes.

Twelve intelligence engines power the platform in three layers (Perception → Cognition → Execution). See `docs/PRODUCT_VISION.md` for the full product specification.

**Target users:** Individuals managing personal networks · Freelancers and solopreneurs · SMBs doing customer engagement · Enterprise sales and support teams.

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
│   └── intelligence/   Python (FastAPI) — all AI engines, LiteLLM, context management
├── packages/
│   └── shared-types/   TypeScript types shared across Node.js services
├── db/
│   ├── migrations/     PostgreSQL migrations (sequential, plain SQL)
│   └── seeds/          Dev seed data
├── docs/
│   ├── ARCHITECTURE.md     System design, service communication, deployment
│   ├── ROADMAP.md          Phased build plan and current status
│   ├── SCHEMA.md           Database schema reference (28 tables, 8 domains)
│   ├── PRODUCT_VISION.md   Full product spec — 12 engines, pricing, feature matrix
│   └── NEXT_PHASE.md       Concrete implementation plan for the current sprint
├── CLAUDE.md           ← you are here
├── README.md
├── .gitignore
├── turbo.json          Turborepo pipeline config
├── package.json        Root workspace manifest (npm workspaces)
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
| WhatsApp ingestion | Node.js + @open-wa/wa-automate |
| AI / intelligence | Python 3.12 + FastAPI + LiteLLM |
| Message queue | Redis 7 + BullMQ |
| Real-time push | Socket.io (API server → web/mobile) |
| Database | PostgreSQL 16 + pgvector extension |
| Migrations | Raw SQL (sequential numbered files in `db/migrations/`) |
| Auth | Clerk (web — `@clerk/nextjs`), JWT (API — `fastify-jwt`) |
| Billing | Stripe |
| Monorepo tooling | Turborepo + npm workspaces |
| Deployment | Alibaba Cloud ECS (Docker Compose) + Vercel (web) |
| CI | GitHub Actions |

---

## Services

### `services/api` — Node.js API Server
The only internet-facing service (via nginx on ECS). All client traffic goes here.

- Port: `3000` (dev)
- WebSocket: same port via Socket.io
- Key responsibilities: auth, user management, conversation CRUD, notification delivery, routing commands to whatsapp/intelligence services

### `services/whatsapp` — open-wa Session Manager
One open-wa browser session per connected user.

- Port: `3001` (dev, internal only)
- Session data stored in `db/sessions/` (volume-mounted in Docker)
- Memory: ~350MB per active session — monitor on ECS
- On new message: normalise → write to DB → push `messages.incoming` to queue
- On approved reply: consume `messages.send` → call open-wa

### `services/intelligence` — Python AI Service
All AI inference lives here. Houses all 12 intelligence engines in three layers.

- Port: `8000` (dev, internal only)
- LiteLLM for provider-agnostic model calls (Anthropic, OpenAI, Google, etc.)
- pgvector for semantic context retrieval
- Event-driven scheduling (relationship clocks) rather than a single daily cron
- Web search tools for the World Knowledge Engine

### `apps/web` — Next.js SaaS Dashboard
Full product surface. Inbox, relationships, proactive queue, AI advisor, calendar, onboarding (QR), settings, billing. Auth via Clerk.

### `apps/companion` — Kotlin Android App
Background `NotificationListenerService`. Reads WhatsApp notifications, POSTs to `/api/companion/message`. Dual role: open-wa fallback + mobile-only tier enabler.

### `apps/mobile` — React Native App (Expo)
Mobile mirror of web dashboard. Lower priority — build after web is feature-complete.

---

## Key Commands

```bash
# Start local infrastructure (Postgres, Redis)
docker compose up -d postgres redis

# Install dependencies
npm install --legacy-peer-deps

# Start all services in development
npm run dev

# Start a single service
npm run dev --workspace=services/api
npm run dev --workspace=services/whatsapp
npm run dev --workspace=services/intelligence   # runs uvicorn --reload

# Run database migrations
npm run db:migrate

# Seed development data
npm run db:seed

# Build all packages
npm run build

# Run tests
npm run test

# Type-check
npm run typecheck

# Lint
npm run lint
```

**Note:** This repo uses npm workspaces (not pnpm). `apps/mobile` is intentionally excluded from the root workspace to prevent React 18/19 conflicts — run `npm install` inside `apps/mobile` separately when doing mobile work.

---

## Production Infrastructure

| Resource | Value |
|----------|-------|
| ECS server (Alibaba Cloud) | `47.84.205.81` |
| API public port | `5500` (nginx proxies → api:3000) |
| Web app | https://zuri-personal-assistant-delta.vercel.app |
| Database | Supabase PostgreSQL (NOT local — see `.env` on server) |
| Redis | Local Docker container on ECS |
| Docker Compose file | `docker-compose.prod.yml` (no postgres container — uses Supabase) |

**Production `.env` location:** `/opt/zuri/.env`

Required keys in production `.env`:
```
DATABASE_URL=      # Supabase connection string
REDIS_PASSWORD=    # for the local Redis container
JWT_SECRET=        # min 64 chars
INTERNAL_API_SECRET=   # shared with Vercel — 98c2ba10361bc6678f860c7b53d953ff
CORS_ORIGIN=https://zuri-personal-assistant-delta.vercel.app
GOOGLE_AI_API_KEY=     # Gemini API key
DEFAULT_AI_MODEL=gemini/gemini-3.5-flash
```

**CRITICAL — LiteLLM model naming:** All Gemini model names **must** use the `gemini/` prefix.
- ✅ `gemini/gemini-3.5-flash` ← use this
- ❌ `gemini-3.5-flash` ← LiteLLM will not find it
- ❌ `gemini-2.0-flash` ← wrong model AND wrong format

**Vercel environment variables** (set in Vercel dashboard):
```
NEXT_PUBLIC_API_URL=http://47.84.205.81:5500
API_URL=http://47.84.205.81:5500
INTERNAL_API_SECRET=98c2ba10361bc6678f860c7b53d953ff
```

---

## Environment Variables

Each service has its own `.env`. Never commit `.env` files. Copy from `.env.example` in each service directory.

**Core variables:**

```bash
# Database (Supabase in prod, local postgres in dev)
DATABASE_URL=postgresql://zuri:password@localhost:5432/zuri_dev

# Redis
REDIS_URL=redis://localhost:6379

# API auth
JWT_SECRET=

# Clerk (apps/web only)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/register
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/inbox
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/inbox

# Internal service security — MUST match on both Vercel and ECS
INTERNAL_API_SECRET=          # shared between apps/web and services/api
API_URL=http://localhost:3000  # used by apps/web server-side (Next.js API routes)
NEXT_PUBLIC_API_URL=http://localhost:3000  # used by browser

# AI Providers (intelligence service — Gemini is primary)
# ALWAYS use gemini/ prefix with LiteLLM: gemini/gemini-3.5-flash
GOOGLE_AI_API_KEY=
DEFAULT_AI_MODEL=gemini/gemini-3.5-flash
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Web search (intelligence service — World Knowledge Engine)
SERP_API_KEY=
TAVILY_API_KEY=

# Stripe (apps/web + services/api)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Internal service URLs
WHATSAPP_SERVICE_URL=http://localhost:3001
INTELLIGENCE_SERVICE_URL=http://localhost:8000
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
    │         ┌─────────┴────┐    ┌──────────┴──────────┐
    │         │  WhatsApp    │    │  Intelligence       │
    │         │  Service     │    │  Service            │
    │         │  (Node.js)   │    │  (Python)           │
    │         │  open-wa     │    │  12 engines         │
    │         └──────────────┘    │  Web search tools   │
    │                             └─────────────────────┘
    │                                        │
    └────────────────────────────────────────┘
                                 │
                        PostgreSQL + pgvector
                        Redis (queue + cache)

    ┌──────────────────┐
    │ Kotlin Companion  │  ← Android background service
    │ App               │  ← POSTs when open-wa is down
    └──────────────────┘
```

Message flow: WhatsApp → open-wa → `messages.incoming` queue → Intelligence service (analysis + suggestions) → DB write → `messages.suggestion_ready` job → API server → WebSocket push to client.

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
- **Queue job names** follow `domain.action` pattern: `messages.incoming`, `analysis.contact_profile`, `temporal.check_relationship_clock`.
- **Python**: use `ruff` for linting, `black` for formatting, `pydantic` for all data models.
- **Migrations**: sequential numbered SQL files in `db/migrations/` — `0001_initial.sql`, etc. Never edit an applied migration; add a new one.
- **No `console.log` in production paths** — use the logger (`pino` in Node.js, `structlog` in Python).
- **Secrets**: never hardcode, always from environment.
- **Engines**: each intelligence engine is a Python module under `services/intelligence/engines/`. Engines are self-contained — they read from DB, write to DB, and enqueue jobs. They do not call each other directly.

---

## Auth Architecture

Web app uses **Clerk** for SSO (no passwords). The flow:

1. Browser signs in via Clerk → gets a Clerk session
2. `useZuriSession` hook calls Next.js `/api/auth/clerk-sync` (server route)
3. Next.js route calls backend `POST /api/auth/clerk-sync` with `X-Internal-Secret` header
4. Backend finds-or-creates a `users` row by `clerk_user_id`, returns a Zuri JWT
5. All subsequent API calls use that Zuri JWT as `Authorization: Bearer <token>`

The `INTERNAL_API_SECRET` is the shared secret between Vercel and the ECS API. It must match on both ends.

---

## Current Status

**Active phases:** Phase 3 (AI Intelligence) + Phase 4 (Web Dashboard)

| Phase | Status |
|-------|--------|
| 1 — Foundation | ✅ Complete |
| 2 — WhatsApp Integration | ✅ Complete |
| 3 — AI Intelligence Core | 🔄 Core pipeline done; voice model + context snapshots remaining |
| 4 — Web Dashboard (full UI) | 🔄 All pages wired to live API; contact detail + inbox sidebar remaining |
| 5 — Temporal Intelligence Engine | ⏳ Planned |
| 6 — World Knowledge Engine | ⏳ Planned |
| 7 — Production Deployment (ECS) | 🔄 Running on 47.84.205.81:5500 |
| 8 — Autonomous Agent Engine | ⏳ Planned |
| 9 — Business Intelligence Engine | ⏳ Planned |
| 10 — Enterprise Features | ⏳ Planned |
| 11 — Kotlin Companion App | ✅ Built |
| 12 — React Native Mobile | 🔄 Scaffold done |

**What's been built:**
- [x] Full monorepo scaffold (Turborepo + pnpm workspaces)
- [x] Database: Supabase PostgreSQL, all migrations (0001–0011), pgvector
- [x] API service: Fastify 5, JWT auth, Clerk-sync endpoint, all CRUD routes, Socket.io
- [x] WhatsApp service: open-wa session manager, QR + link code, session persistence, message ingestion
- [x] Intelligence service: message analyser, reply generator, contact profiler, health calculator, proactive engine, all BullMQ workers
- [x] Redis pub/sub pipeline: intelligence → `suggestion:ready:{userId}` → API Socket.io → browser
- [x] Next.js web app on Vercel: Clerk auth, inbox (live), relationships (live), proactive (live), onboarding
- [x] Kotlin companion app (NotificationListenerService, API relay)
- [x] React Native mobile scaffold (Expo, navigation, auth, typed API client)
- [x] Production Docker Compose on ECS: api + whatsapp + intelligence + redis + nginx

**What's next:** See `docs/NEXT_PHASE.md`.
