# CLAUDE.md

## Branch Policy

**Always work directly on `main`.** Do not create feature branches. All commits go straight to `main` and are auto-deployed to production via GitHub Actions. This avoids branch divergence and merge conflicts.

---

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
│   ├── SCHEMA.md           Database schema reference (30 tables, 8 domains, 25 migrations)
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
| WhatsApp ingestion | Node.js + @whiskeysockets/baileys |
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

### `services/whatsapp` — Baileys Session Manager
One @whiskeysockets/baileys WebSocket session per connected user.

- Port: `3001` (dev, internal only)
- Session credentials stored via `useMultiFileAuthState` in Docker volume `wa_sessions` (mounted at `/app/db/sessions`)
- Memory: ~80–150MB per active session (no Chromium — Baileys uses WebSocket directly)
- On initial connect: `messaging-history.set` event fires with historical messages (First Impression Mode)
- On new message: normalise → write to DB → push `messages.incoming` to queue (with `isHistorical` flag for historical messages)
- On approved reply: consume `messages.send` → call Baileys `sendMessage()`

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
DASHSCOPE_API_KEY=     # Alibaba Cloud DashScope key (Qwen models — currently default text pool)
```

**CRITICAL — LiteLLM model naming:** All Gemini model names **must** use the `gemini/` prefix.
- ✅ `gemini/gemini-3.5-flash` ← use this
- ❌ `gemini-3.5-flash` ← LiteLLM will not find it
- ❌ `gemini-2.0-flash` ← wrong model AND wrong format

**CRITICAL — LiteLLM model naming (Qwen/DashScope):** All Alibaba Qwen model names **must** use the `dashscope/` prefix.
- ✅ `dashscope/qwen-max` ← use this
- ❌ `qwen-max` ← LiteLLM will not find it

Model selection for Qwen calls is routed through `services/intelligence/app/ai/model_router.py`, not hardcoded — it rotates across a fixed pool of models once each crosses ~1M tokens of free-tier usage (task-scoped pools: `text`/`vision`/`ocr`/`translation`). See `docs/MEMORY_ENGINE_PLAN.md` §5 for the full design. One open LiteLLM issue (BerriAI/litellm#12505) reports `dashscope/` provider resolution failing on some versions — smoke-test against the pinned LiteLLM version before relying on this in production.

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

# AI Providers (intelligence service)
# ALWAYS use gemini/ prefix with LiteLLM: gemini/gemini-3.5-flash
GOOGLE_AI_API_KEY=
DEFAULT_AI_MODEL=gemini/gemini-3.5-flash   # fallback once the Qwen pool is exhausted
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
# Qwen models (dashscope/ prefix) are the default text-generation pool for now —
# see model_router.py and docs/MEMORY_ENGINE_PLAN.md §5
DASHSCOPE_API_KEY=

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
    │         │  whatsapp-   │    │  12 engines         │
    │         │  web.js      │    │  Web search tools   │
    │         └──────────────┘    └─────────────────────┘
    │                                        │
    └────────────────────────────────────────┘
                                 │
                        PostgreSQL + pgvector
                        Redis (queue + cache)

    ┌──────────────────┐
    │ Kotlin Companion  │  ← Android background service
    │ App               │  ← POSTs when WhatsApp service is down
    └──────────────────┘
```

Message flow: WhatsApp → Baileys → `messages.incoming` queue → Intelligence service (analysis + suggestions) → DB write → `messages.suggestion_ready` job → API server → WebSocket push to client.

---

## Database

PostgreSQL 16 with pgvector. 30 tables across 8 domains + 2 system tables. 25 migrations applied. See `docs/SCHEMA.md` for full reference.

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

**Active focus:** Phase 10 — Production Polish

| Phase | Status |
|-------|--------|
| 1 — Foundation | ✅ Complete |
| 2 — WhatsApp Integration | ✅ Complete |
| 3 — AI Intelligence Core | ✅ Complete (audio transcription remaining) |
| 4 — Web Dashboard (full UI) | ✅ Complete — all 17 pages production-ready |
| 5 — Temporal Intelligence Engine | ✅ Complete |
| 6 — World Knowledge Engine | ✅ Complete |
| 7 — Production Deployment (ECS) | 🔄 Running at 47.84.205.81:5500; SSL + CD remaining |
| — Historical Sync + First Impression | ✅ Complete |
| — Auto Response Engine | ✅ Complete (execution wiring remaining) |
| — Global WA Status System | ✅ Complete |
| 8 — Autonomous Agent Engine | ✅ Complete |
| 9 — Business Intelligence & Executive Intelligence Platform | ✅ Complete |
| 10 — Production Polish | 🔄 Active |
| 11 — Enterprise Features | ⏳ Planned |
| — Kotlin Companion App | ✅ Built |
| — React Native Mobile | 🔄 Scaffold done |

**What's been built:**
- [x] Full monorepo scaffold (Turborepo + npm workspaces)
- [x] Database: Supabase PostgreSQL, 25 migrations (0001–0025), pgvector, 30 tables
- [x] API service: Fastify 5, JWT auth, Clerk-sync endpoint, all CRUD routes, Socket.io
- [x] WhatsApp service: Baileys (@whiskeysockets/baileys), QR + link code, session persistence, message ingestion
- [x] First Impression Mode: `messaging-history.set` event captures historical messages on initial connect
- [x] Historical Intelligence Sync: API + Diagnostics UI, background worker, sync_jobs tracking
- [x] Auto Response Engine: `auto_response_settings` table, settings API, full UI with 3 approval modes
- [x] Intelligence service: message analyser, reply generator, contact profiler, voice builder, health calculator, cadence learner, temporal engine, world knowledge engine, all BullMQ workers
- [x] `isHistorical` flag: historical messages skip reply generation, use batch AI intervals
- [x] Redis pub/sub pipeline: intelligence → `suggestion:ready:{userId}` → API Socket.io → browser
- [x] Global WA status system: `useWAStatus` hook, sidebar widget (5 states), mobile logo dot
- [x] Next.js web app on Vercel: all 17+ pages built, mobile-first, polished UI
- [x] Leads page: live pipeline with hot/warm/cold stages, real WA quotes, score meters
- [x] CRM contacts: full CRM fields (company, job title, email, lead score, pipeline stage)
- [x] Kotlin companion app (NotificationListenerService, API relay)
- [x] React Native mobile scaffold (Expo, navigation, auth, typed API client)
- [x] Production Docker Compose on ECS: api + whatsapp + intelligence + redis + nginx
- [x] Phase 8 — Autonomous Agent Engine: AI agents with roles, tool calling, knowledge base, escalation rules, trust levels (Observe → Autonomous), AI Workforce UI
- [x] Phase 9 — Business Intelligence & Executive Intelligence Platform: 11 intelligence API endpoints, Executive Dashboard, Sales/Customer/Conversation/Operations/Opportunities/Predictions/Health Score/ROI/Timeline/Reports pages, Business Health Score (0-100 with A-F grading), AnalyticsSubNav

**What's next:** See `docs/NEXT_PHASE.md`.

---

## Web Dashboard — Phase 1 Audit & Phase 3 Pages

### Phase 1 UI Audit (apps/web)

All components in `apps/web/src/components/ui/` are production-ready. Key findings:

| Component | File | Notes |
|-----------|------|-------|
| Button | `button.tsx` | variants: primary/secondary/ghost/danger; sizes: sm/md/lg |
| Badge | `badge.tsx` | variants: default/info/success/warning/error/purple |
| Card | `card.tsx` | wrapper div with standard border+shadow |
| Input + Textarea | `input.tsx` | forwarded ref, error state, label |
| Select | `select.tsx` | forwarded ref, options prop |
| Modal + ConfirmModal | `modal.tsx` | Portal-based, backdrop dismiss |
| Toast + ToastProvider | `toast.tsx` | variants match Badge; use `useToast()` hook |
| Avatar | `avatar.tsx` | sizes: xs/sm/md/lg/xl; initials fallback |
| Skeleton | `skeleton.tsx` | SkeletonText, SkeletonCard, SkeletonListItem |
| EmptyState | `empty-state.tsx` | icon + title + description + optional action |
| PageHeader | `page-header.tsx` | title + description + breadcrumbs + action slot |
| DataTable | `data-table.tsx` | sortable columns, row click handler |
| Tabs | `tabs.tsx` | render-prop API; variants: underline/pill |
| Dropdown | `dropdown.tsx` | trigger + items with icons |
| HealthBar | `health-bar.tsx` | 0–100 score → colour gradient bar |
| StatCard | `stat-card.tsx` | label + value + delta % + icon slot |
| ModeBadge | `mode-badge.tsx` | coloured pill for business/personal/hybrid |
| FeatureGate | `feature-gate.tsx` | mode-based gating; `fallback` prop |

**Shared utilities:**
- `src/lib/cn.ts` — `cn(...classes)` classname helper
- `src/hooks/use-api.ts` — `useApi<T>(path, token)` → `{ data, loading, error, refetch }`
- `src/lib/api.ts` — `apiClient<T>(path, opts)` + `ApiError`; body must be `JSON.stringify(obj)` for objects
- `src/lib/socket.ts` — singleton Socket.io client (`getSocket()`)
- `src/hooks/use-zuri-session.ts` — Clerk sync + JWT + mode broadcaster; token is `session.data?.accessToken`
- `src/hooks/use-wa-status.ts` — polls `/api/whatsapp/status`; 8s transitional / 30s stable; returns `WAStatus { status, connected, phone, lastConnectedAt }`

**Design tokens (Tailwind):**
- Primary: `indigo-600` (hover: `indigo-700`)
- Surface: `white` with `border-gray-200` / `shadow-sm`
- Background: `gray-50`
- Text: `gray-900` (headings), `gray-700` (body), `gray-500` (muted), `gray-400` (placeholder)
- Danger: `red-500/600`
- Success: `green-500/600`
- Rounded corners: `rounded-xl` for cards, `rounded-lg` for inputs/buttons, `rounded-full` for pills/avatars
- Touch targets: minimum `44px` height on all interactive elements
- Mobile-first breakpoints: base (mobile) → `sm:` (640px) → `md:` (768px) → `lg:` (1024px)

### Phase 3 Page Inventory

All pages are in `apps/web/src/app/(dashboard)/`:

| Route | File | Description |
|-------|------|-------------|
| `/dashboard` | `dashboard/page.tsx` | Home: stats, quick actions, recent activity |
| `/inbox` | `inbox/page.tsx` | 3-panel desktop / pane-switch mobile; AI suggestions |
| `/inbox/queue` | `inbox/queue/page.tsx` | Pending AI reply suggestions; approve/edit/skip |
| `/contacts` | `contacts/page.tsx` | CRM contact grid; filter/sort/search; lead scores |
| `/contacts/[id]` | `contacts/[id]/page.tsx` | Contact detail; tabs: Overview/Messages/AI Notes |
| `/leads` | `leads/page.tsx` | Lead pipeline; hot/warm/cold stages; score meter |
| `/relationships` | `relationships/page.tsx` | Relationship health grid; filter by attention/dormant |
| `/proactive` | `proactive/page.tsx` | Relationship nudge queue; approve/skip with draft copy |
| `/analytics` | `analytics/page.tsx` | KPIs, AI performance, health distribution bars |
| `/automation` | `automation/page.tsx` | Automation rules list; toggle enable/disable |
| `/advisor` | `advisor/page.tsx` | Full-height AI chat; suggested prompts when empty |
| `/calendar` | `calendar/page.tsx` | Month grid; day event list; AI-extracted events |
| `/notifications` | `notifications/page.tsx` | All/unread filter; mark read; type badges |
| `/billing` | `billing/page.tsx` | Plan card; usage bars; plan comparison table |
| `/settings` | `settings/page.tsx` | Account/Workspace/AI Engines/Privacy/Auto Responses tabs |
| `/profile` | `profile/page.tsx` | User card; WA status; quick nav links |
| `/diagnostics` | `diagnostics/page.tsx` | 7 connection checks; Historical Sync card; config snapshot; expandable rows |

### Navigation Architecture

**Sidebar (desktop, md+):** Full nav with grouped sections + footer nav. Width: `w-64`.

**Bottom tab bar (mobile):** Fixed bottom, mode-aware 4 tabs:
- Business: Home / Inbox / Contacts / Queue
- Personal: Home / Inbox / People / Proactive
- Hybrid: Home / Inbox / Contacts / Proactive

**Mobile top bar:** Hamburger + logo + notifications bell link.

**Content clearance:** `pt-14 pb-14 md:pt-0 md:pb-0` to avoid overlap with top/bottom bars.

### Mode-Gating Conventions

Use `<FeatureGate modes={['business', 'hybrid']}>` to gate business-only features.
Use `useZuriSession()` to read `session.data?.mode` for conditional rendering.
Leads and lead score UI only renders when `mode !== 'personal'`.
The AI Notes tab in contact detail is hidden when `mode === 'personal'`.
