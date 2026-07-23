# AGENTS.md

## Branch Policy

**Always work directly on `main`.** Do not create feature branches. All commits go straight to `main` and are auto-deployed to production via GitHub Actions. This avoids branch divergence and merge conflicts.

---

## What This Project Is

**Zuri** — an AI Relationship Operating System built on top of WhatsApp and modern web workspaces. It is not a chatbot or auto-responder. It is a continuous, always-on intelligence layer that reads every conversation, builds living psychological profiles of contacts, reasons about relationship dynamics, surfaces proactive maintenance opportunities, and generates voice-matched reply drafts. The user stays in control; the AI advises, plans, and — in higher automation tiers — executes.

Twelve intelligence engines power the platform in three layers (Perception → Cognition → Execution), augmented by deep Business Workspace, Brand Studio, Operations ERP, Career OS, and Organization Team Governance engines. See `docs/PRODUCT_VISION.md` for the full product specification.

**Target users:** Individuals managing personal networks · Freelancers and solopreneurs · SMBs doing customer engagement · Enterprise sales, operations, support, and career-building teams.

Working title: **Zuri** (placeholder — rename before launch).

---

## Monorepo Structure

```
/
├── apps/
│   ├── web/            Next.js 15 SaaS dashboard + marketing (→ Vercel)
│   ├── mobile/         React Native + Expo (bare workflow — mirrors web)
│   └── companion/      Kotlin Android background notification relay
├── services/
│   ├── api/            Node.js (Fastify 5) — REST + WebSocket API server
│   ├── whatsapp/       Node.js — Baileys session manager, one instance per user
│   └── intelligence/   Python (FastAPI) — all AI engines, LiteLLM, context & memory management
├── packages/
│   └── shared-types/   TypeScript types shared across Node.js services
├── db/
│   ├── migrations/     PostgreSQL migrations (115 sequential, plain SQL files)
│   └── seeds/          Dev seed data
├── docs/
│   ├── ARCHITECTURE.md     System design, service communication, deployment
│   ├── ROADMAP.md          Phased build plan and current status
│   ├── SCHEMA.md           Database schema reference (115 migrations, 100+ tables across 15 domains)
│   ├── UI_SYSTEM_AND_COMPONENTS.md  UI design system, component library & responsive patterns
│   ├── PRODUCT_VISION.md   Full product spec — 12 engines, pricing, feature matrix
│   └── NEXT_PHASE.md       Concrete implementation plan for the current sprint
├── AGENTS.md           ← you are here
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
| API server | Node.js + Fastify 5 |
| WhatsApp ingestion | Node.js + @whiskeysockets/baileys |
| AI / intelligence | Python 3.12 + FastAPI + LiteLLM |
| Message queue | Redis 7 + BullMQ |
| Real-time push | Socket.io (API server → web/mobile) |
| Database | Supabase PostgreSQL 16 + pgvector extension |
| Migrations | Raw SQL (115 sequential numbered files in `db/migrations/`) |
| Auth & Teams | Clerk (web — `@clerk/nextjs`, Clerk Organizations), JWT (API — `fastify-jwt`) |
| Billing & Payments | Stripe |
| E-Signatures | HTML5 Canvas + Bézier Curve Smoothing + Pointer Capture |
| Monorepo tooling | Turborepo + npm workspaces |
| Deployment | Alibaba Cloud ECS (Docker Compose) + Vercel (web) |
| CI | GitHub Actions |

---

## Services

### `services/api` — Node.js API Server
The only internet-facing service (via nginx on ECS). All client traffic goes here.

- Port: `3000` (dev)
- WebSocket: same port via Socket.io
- Key responsibilities: auth, team organization scoping, conversation CRUD, document management, e-signatures, BYOK management, notification delivery, routing commands to whatsapp/intelligence services

### `services/whatsapp` — Baileys Session Manager
One @whiskeysockets/baileys WebSocket session per connected user.

- Port: `3001` (dev, internal only)
- Session credentials stored via `useMultiFileAuthState` in Docker volume `wa_sessions` (mounted at `/app/db/sessions`)
- Memory: ~80–150MB per active session (no Chromium — Baileys uses WebSocket directly)
- On initial connect: `messaging-history.set` event fires with historical messages (First Impression Mode)
- On new message: normalise → write to DB → push `messages.incoming` to queue (with `isHistorical` flag for historical messages)
- On approved reply: consume `messages.send` → call Baileys `sendMessage()`

### `services/intelligence` — Python AI Service
All AI inference lives here. Houses all 12 intelligence engines in three layers plus Knowledge Brain.

- Port: `8000` (dev, internal only)
- LiteLLM for provider-agnostic model calls (Anthropic, OpenAI, Google, Qwen/DashScope)
- pgvector for semantic context retrieval & knowledge search
- Event-driven scheduling (relationship clocks) rather than a single daily cron
- Web search tools for the World Knowledge Engine

### `apps/web` — Next.js SaaS Dashboard
Full product surface with 30+ production routes. Inbox, team locking, CRM contacts, business timeline, brand studio, ERP sales engine, documents studio, e-signatures, proactive queue, AI advisor, career OS, admin portal, settings, BYOK, billing. Auth via Clerk.

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
| Database | Supabase PostgreSQL (115 migrations applied) |
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
DASHSCOPE_API_KEY=     # Alibaba Cloud DashScope key
```

**CRITICAL — LiteLLM model naming:** All Gemini model names **must** use the `gemini/` prefix (`gemini/gemini-3.5-flash`). All Alibaba Qwen model names **must** use the `dashscope/` prefix (`dashscope/qwen-max`).

---

## Environment Variables

Each service has its own `.env`. Copy from `.env.example` in each service directory.

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

# Internal service security — MUST match on both Vercel and ECS
INTERNAL_API_SECRET=          # shared between apps/web and services/api
API_URL=http://localhost:3000  # used by apps/web server-side
NEXT_PUBLIC_API_URL=http://localhost:3000  # used by browser

# AI Providers (intelligence service & BYOK fallback)
GOOGLE_AI_API_KEY=
DEFAULT_AI_MODEL=gemini/gemini-3.5-flash
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DASHSCOPE_API_KEY=

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
    │         │  Baileys     │    │  12 engines + KB    │
    │         └──────────────┘    └─────────────────────┘
    │                                        │
    └────────────────────────────────────────┘
                                 │
                        PostgreSQL + pgvector
                        Redis (queue + cache)
```

Message flow: WhatsApp → Baileys → `messages.incoming` queue → Intelligence service (analysis + suggestions) → DB write → `messages.suggestion_ready` job → API server → WebSocket push to client.

---

## Database

PostgreSQL 16 with pgvector. **115 migrations applied (`0001_extensions.sql` through `0115_organization_workspace_scoping.sql`)** across 15 main domains. See `docs/SCHEMA.md` for full reference.

Key design notes:
- All PKs are `uuid` (`gen_random_uuid()`)
- Organization scoping via `organization_id` on key tables (`contacts`, `conversations`, `documents`, `agents`, `kb_documents`)
- `contact_insights` stores atomic AI observations — deactivated not deleted
- `context_snapshots` holds compressed relationship summaries with vector embeddings
- `documents` stores 15 document types with full quote-to-invoice-to-receipt lifecycle and E-Signatures

---

## Auth & Organization Governance Architecture

Web app uses **Clerk** for SSO and Team Governance:

1. Browser signs in via Clerk → gets a Clerk session & selected Organization
2. `useZuriSession` hook calls Next.js `/api/auth/clerk-sync` (server route)
3. Next.js route calls backend `POST /api/auth/clerk-sync` with `X-Internal-Secret` header
4. Backend finds-or-creates a `users` row, syncs Clerk Organization memberships, returns a Zuri JWT containing `user_id` and active `organization_id`
5. All subsequent API calls use that Zuri JWT as `Authorization: Bearer <token>`
6. Database queries scope data by active `organization_id` (or user fallback)

---

## Current Status

**Active focus:** Phase 10 — Production Polish & Ecosystem Expansion

| Phase | Status |
|-------|--------|
| 1 — Foundation | ✅ Complete |
| 2 — WhatsApp Integration | ✅ Complete |
| 3 — AI Intelligence Core | ✅ Complete |
| 4 — Web Dashboard (30+ Pages UI) | ✅ Complete |
| 5 — Temporal Intelligence Engine | ✅ Complete |
| 6 — World Knowledge Engine | ✅ Complete |
| 7 — Production Deployment (ECS) | ✅ Running at 47.84.205.81:5500 |
| 8 — Autonomous Agent Engine | ✅ Complete |
| 9 — Business Intelligence & Executive Intelligence Platform | ✅ Complete |
| — Business Workspace & Documents (15 types) | ✅ Complete |
| — Brand Studio & Operations ERP | ✅ Complete |
| — Business ERP Sales Engine & Bill of Materials | ✅ Complete |
| — E-Signatures & Auto-Dunning | ✅ Complete |
| — Career OS & CV Studio | ✅ Complete |
| — Bring Your Own Key (BYOK) | ✅ Complete |
| — Shared Team Inbox & Organization Workspace Scoping | ✅ Complete |
| 10 — Production Polish | 🔄 Active |
| 11 — Enterprise Features | 🔄 Active |

---

## Web Dashboard — Page Inventory (30+ Pages)

All pages are located in `apps/web/src/app/(dashboard)/` and `apps/web/src/app/(admin)/`:

| Route | File | Description |
|-------|------|-------------|
| `/dashboard` | `dashboard/page.tsx` | Main Executive Dashboard: KPIs, Business Health, Quick Actions |
| `/inbox` | `inbox/page.tsx` | Shared Team Inbox with active locking, collision warning & AI suggestions |
| `/inbox/queue` | `inbox/queue/page.tsx` | Pending AI reply suggestions queue |
| `/contacts` | `contacts/page.tsx` | CRM Contact grid; Lead Scores, Pipeline Stages, Contact Merge |
| `/contacts/[id]` | `contacts/[id]/page.tsx` | Contact Detail; Tabs: Overview, Messages, Business Timeline, AI Notes |
| `/leads` | `leads/page.tsx` | Sales Lead Pipeline; Hot/Warm/Cold stages, score meters |
| `/relationships` | `relationships/page.tsx` | Relationship Health Grid; Health score trends |
| `/proactive` | `proactive/page.tsx` | Relationship Nudge Queue & Morning Coffee Feed |
| `/business` | `business/page.tsx` | Business ERP Sales Engine: Quotations, Invoices, Receipts, Sales Orders |
| `/studio` | `studio/page.tsx` | Brand Studio & Operations ERP: Catalog, Inventory, Purchase Orders, BOM |
| `/documents` | `documents/page.tsx` | Document Studio: 15 Document Types, E-Signatures, PDF Generation, Dunning |
| `/knowledge-base` | `knowledge-base/page.tsx` | Knowledge Brain: Document Upload, Vector Search, AI Knowledge Discovery |
| `/agents` | `agents/page.tsx` | AI Workforce & Autonomous Agents Management |
| `/escalations` | `escalations/page.tsx` | Agent Escalations Queue |
| `/analytics` | `analytics/page.tsx` | BI Platform with 11 sub-analytics views |
| `/career` | `career/page.tsx` | Career OS: Scraped Jobs, Readiness Checklists, Cover Letter Studio, CV Studio |
| `/goals` | `goals/page.tsx` | Relationship & Business Goals Management |
| `/timeline` | `timeline/page.tsx` | Cross-Contact Business Event Timeline |
| `/organization` | `organization/page.tsx` | Clerk Organizations, Seat Limits, Team Members & Scoping |
| `/advisor` | `advisor/page.tsx` | AI Advisor Chat Interface |
| `/calendar` | `calendar/page.tsx` | Calendar Grid & AI Extracted Events |
| `/automation` | `automation/page.tsx` | Workflow Automation Rules |
| `/broadcasts` | `broadcasts/page.tsx` | WhatsApp Broadcasts & Bulk Sending Engine |
| `/notifications` | `notifications/page.tsx` | Notification Center |
| `/billing` | `billing/page.tsx` | Subscription Plans & Usage Bars |
| `/settings` | `settings/page.tsx` | Account, Workspace, AI Engines, BYOK, Auto Responses, Organization Settings |
| `/diagnostics` | `diagnostics/page.tsx` | System Diagnostics & Historical Intelligence Sync |
| `/admin` | `(admin)/admin/page.tsx` | Admin Portal: Users, Billing, Revenue, Queues, Promotions, Features |

---

## Mode-Gating & Scoping Conventions

- Use `<FeatureGate modes={['business', 'hybrid']}>` to gate business features.
- Read `session.data?.organizationId` and `session.data?.mode` from `useZuriSession()`.
- API endpoints check JWT claims for `organization_id` to automatically enforce workspace isolation.
