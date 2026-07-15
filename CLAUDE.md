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

## Running Locally (step-by-step)

### Prerequisites
- Docker Desktop running
- Node.js 22+
- Python 3.12 with a `.venv` inside `services/intelligence/` (`python -m venv .venv && .venv/bin/pip install -r requirements.txt`)
- Each service has its own `.env` — copy from `.env.example` if missing

### 1 — Start infrastructure
```bash
docker compose up -d postgres redis
```
Redis and Postgres must be healthy before starting any service.

### 2 — Start services (each in its own terminal, or background them)

**API** (Node.js, port 3000):
```bash
npm run dev --workspace=services/api
```

**WhatsApp** (Node.js, port 3001):
```bash
npm run dev --workspace=services/whatsapp
```

**Intelligence** (Python, port 8000) — must use the `.venv` uvicorn, not system Python:
```bash
cd services/intelligence && .venv/bin/uvicorn app.main:app --reload --port 8000
```

**Web** (Next.js, port 3002):
```bash
npm run dev --workspace=apps/web
```

### 3 — Background all at once with log files
```bash
mkdir -p /tmp/zuri-logs
npm run dev --workspace=services/api          > /tmp/zuri-logs/api.log 2>&1 &
npm run dev --workspace=services/whatsapp     > /tmp/zuri-logs/whatsapp.log 2>&1 &
npm run dev --workspace=apps/web              > /tmp/zuri-logs/web.log 2>&1 &
cd services/intelligence && .venv/bin/uvicorn app.main:app --reload --port 8000 \
  > /tmp/zuri-logs/intelligence.log 2>&1 & cd -
```

Tail any log:
```bash
tail -f /tmp/zuri-logs/api.log
tail -f /tmp/zuri-logs/intelligence.log
```

### 4 — Verify everything is up
```bash
curl http://localhost:3000/health   # API
curl http://localhost:3001/health   # WhatsApp
curl http://localhost:8000/health   # Intelligence
# Web: open http://localhost:3002
```

### Common startup issues
| Symptom | Fix |
|---------|-----|
| Intelligence: `No module named uvicorn` | Use `.venv/bin/uvicorn`, not system Python |
| API: DB connection timeout | Dev `.env` points to Supabase — needs internet, or switch to local postgres |
| WhatsApp: `0 sessions to restore` | Normal in dev — connect a phone via the UI |
| Port already in use | `lsof -ti:3000 | xargs kill` (replace port as needed) |

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
SUPABASE_URL=              # for incoming WhatsApp media storage (services/whatsapp only)
SUPABASE_SERVICE_ROLE_KEY= # service-role key, NOT the anon key — see "Groups & Media" below
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

### SSH access to ECS

SSH key is stored at `.deploy-local/claude-local.pem` (gitignored — never commit).

```bash
ssh -i .deploy-local/claude-local.pem root@47.84.205.81
```

### Deploy to production

```bash
# On the server — pull latest + rebuild changed services
ssh -i .deploy-local/claude-local.pem root@47.84.205.81 \
  "cd /opt/zuri && git pull origin main && \
   docker compose -f docker-compose.prod.yml up --build -d"

# Rebuild only specific services (faster)
ssh -i .deploy-local/claude-local.pem root@47.84.205.81 \
  "cd /opt/zuri && git pull origin main && \
   docker compose -f docker-compose.prod.yml up --build -d --force-recreate intelligence api whatsapp"

# Tail production logs
ssh -i .deploy-local/claude-local.pem root@47.84.205.81 \
  "docker compose -f /opt/zuri/docker-compose.prod.yml logs --tail=50 -f"
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

PostgreSQL 16 with pgvector. 71 migrations applied (0001–0071) — `docs/SCHEMA.md`'s table/domain reference reflects the original 25-migration baseline and has not been kept current with everything shipped since (Marketing Studio, Deals/Opportunities, Business Workspace, etc.); treat its counts as a floor, not an exact figure.

**Domains:** Core · Contacts & Relationships · Conversations & Messages · AI Intelligence · Proactive System · Calendar · AI Advisor · Notifications · Business Workspace (`business_profiles`, `document_templates`, `documents`, `document_events`, `deal_stage_history`, `document_chat_messages`, `recurring_documents`, `document_pack_runs` — migrations 0043–0046)

Key design notes:
- All PKs are `uuid` (gen_random_uuid())
- `contact_insights` stores atomic AI observations — grows indefinitely, deactivated not deleted
- `context_snapshots` holds compressed relationship summaries with vector embeddings — replaces raw message history in prompts
- `relationship_health_logs` is append-only — `relationships.health_score` is the live value
- `events` (AI-extracted) and `calendar_events` (user-facing) are separate — linked via `source_event_id`
- `documents` is strictly AI/template-generated business documents (quotations, invoices, proposals, contracts, etc.) — distinct from `contact_documents`, which is human-uploaded files; cross-linked via `contact_documents.generated_document_id`
- `documents.embedding` (pgvector) powers semantic search; `documents.share_token` is the unauthenticated view-tracking link sent over WhatsApp

---

## Groups & Media Handling

**WhatsApp groups are displayed, never analysed.** `contacts.is_group` (set from the JID suffix — `@g.us` = group, `@s.whatsapp.net` = individual) has existed since day one, but the AI pipeline ignored it until migration `0054_group_chat_support.sql`. Current behavior:
- Group messages are stored and pushed to the Inbox in real time exactly like 1:1 messages — same `conversations`/`messages` rows, same Redis pub/sub, same UI.
- They are **never** sent through the analysis pipeline: `services/intelligence/app/workers/message_worker.py::_process` checks `contacts.is_group` first and short-circuits (no sentiment/embeddings, no profile rebuilds, no reply suggestions, no token spend). `services/intelligence/app/routes/conversation.py::analyse_history` has the same defensive check.
- Historical sync (`services/whatsapp/src/lib/session-manager.ts`'s `historical_batch` handler, and `services/api/src/lib/history-sync.ts`) writes every group message to the DB but never queues a group conversation for AI analysis.
- Auto-response is separately gated by `auto_response_settings.skip_groups` (default `TRUE`, `services/intelligence/app/services/auto_response.py`) — a per-user toggle, but off-by-default satisfies "never auto-reply to groups" out of the box.
- Per-message sender identity within a group (`messages.sender_display_name` / `sender_jid`, from Baileys' `msg.pushName` / `msg.key.participant`) is captured for **display only** — there is no per-participant `contacts` row yet. The dead `contact_group_members` table from migration `0003` is reserved for that future group-management work, not wired up.
- The group's own display name is kept in sync from WhatsApp chat metadata (`phone_chats` event → `MessageHandler.updateGroupNames`) rather than frozen on whoever sent the first message.

**Incoming media (images, documents, etc.) uploads to Supabase Storage.** `services/whatsapp/src/lib/supabase-storage.ts` uploads every downloaded WhatsApp media buffer to the **`chat-media`** bucket (public, create it in the Supabase dashboard — same bucket already reserved in `apps/web/src/lib/storage.ts`'s `StorageBucket` union) using the **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`, not the anon key — this is a trusted backend service writing arbitrary contacts' files, not a user's own browser upload). `messages.media_url` then stores the Supabase public URL directly. If `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` aren't set, it falls back to the pre-existing local-disk `wa_media` volume + `GET /api/media/:filename` route — this is what local dev without Supabase creds still uses. The Inbox frontend (`message-content.tsx`) renders both transparently.

---

## Studio ERP & AI Business Advisor

The Studio page (`apps/web/src/app/(dashboard)/studio/page.tsx`, "Business Knowledge Hub") is being built out into a proper small-business ERP, not just a catalog/rules editor.

**AI Business Advisor** (`OverviewModule`'s chat) now matches the main Advisor page's polish and capability instead of being a plain-text Q&A box:
- Markdown + interactive action cards render via the shared `ChatFormatter` component (`apps/web/src/components/ui/chat-formatter.tsx`) — the same hand-rolled markdown parser and `[ACTION: type | param | param]` tag system the main Advisor and Inbox's `intel-panel.tsx` use. No new parsing mechanism was introduced; Studio's chat was wired into the existing one.
- `services/intelligence/app/routes/conversation.py::studio_ask` now appends `ZURI_ACTION_INSTRUCTIONS` to its system prompt and includes a recent-contacts context block (id/name/lead_score/pipeline_stage) plus a low/out-of-stock products block, alongside its existing catalog/rules/suppliers context — giving the model contact_ids and stock context to act on.
- `OverviewModule`'s `handleChatAction` wires all five existing action types: `lead_score`/`pipeline_stage` → `PATCH /api/contacts/:id`, `reminder` → `POST /api/calendar/events`, `reply_draft` → resolves the contact's conversation via `GET /api/contacts/:id/messages` then sends via `POST /api/conversations/:id/messages` (Studio has no conversation already in view, unlike Inbox), `generate_document` → `POST /api/documents/ai-generate` + render, same as the main Advisor.
- There is a second, unrelated tool-calling mechanism in this codebase — `services/intelligence/app/services/agent_engine.py`'s prompt-described tool list + JSON dispatch, used only by the Autonomous Agent Engine (agent-assigned WhatsApp conversations). Don't confuse the two; the `[ACTION: ...]` tag system is the right fit for anything rendered in a chat UI with a confirm step.

**Inventory is a real stock ledger, not a single overwritable number.** Migration `0055_stock_movements.sql` adds a `stock_movements` table (`restock`/`sale`/`adjustment`/`waste`/`return`, signed `quantity_delta`, `previous_stock`/`new_stock`, optional `reason`). `POST /api/products/:id/stock-movements` records a movement and updates `products.stock`/`available` atomically (replacing the old blind `PATCH /api/products/:id {stock: N}` overwrite, which is still used elsewhere for cases like initial catalog entry); `GET /api/products/:id/stock-movements` returns the last 50 for the expandable history view in `InventoryModule`. Low/out-of-stock items get a one-click "Reorder via WhatsApp" `wa.me` link (pre-filled message) when a supplier with a WhatsApp number is linked, or an "Ask AI to draft reorder" fallback otherwise.

**Zuri Insights** (`GET /api/studio/insights`, `services/api/src/routes/studio.ts`) are deterministic, SQL-driven — not LLM-generated — on purpose: exact thresholds (available ≤ minimum_stock, margin < 15%, supplier reliability < 80% or delivery > 14 days) are more trustworthy for ERP data than a narrative summary, and the AI Business Advisor chat is where a user asks for narrative framing instead. Each relevant Studio tab (Overview, Inventory, Pricing, Suppliers) renders a slice of this endpoint's data as an insight card with an "Ask AI" button; clicking it calls `StudioPage`'s `onAskAI(prompt)`, which switches to the Overview tab and pre-fills (not auto-sends) the chat input via `OverviewModule`'s `initialPrompt`/`onConsumedPrompt` props — one shared endpoint and one shared chat session, not a bespoke LLM call per tab.

**Where Studio is headed:** `docs/STUDIO_ERP_PLAN.md` documents what's already shipped above (suppliers, rich product columns, stock ledger, insights). `docs/BUSINESS_OS_PLAN.md` is the forward-looking plan — turning Studio into a full "AI Business Operating System" (configurable product attributes/families, multi-location inventory, supplier AI memory, purchase orders, sales intelligence, projects, and the conversation-to-automatic-ERP-update loop that's the intended product differentiator). Phases A through G of that plan have shipped (below), including Phase E — the conversation-to-automation loop the plan itself calls the actual differentiator; manufacturing/BOM (Phase H) has not been built — per the plan, build only when a real user asks.

**Business OS Phase A — configurable product families & attributes** (migration `0056`): `product_families` is a user-defined hierarchy (e.g. Electronics > Phones > Samsung) with a denormalized `path`; `product_attribute_definitions` is the per-family custom-attribute schema (text/number/select/multiselect/boolean/date, with an `is_variant_axis` flag) a product's form renders from — "exactly like Odoo," no code required. `products.family_id`/`attributes`/`parent_product_id` extend the existing flat table rather than introducing per-vertical tables. `GET /api/product-families/:id/effective-attributes` walks the family's ancestor chain so a product inherits attributes from every level. `POST /api/products/:id/generate-variants` does cartesian-product variant generation over whichever attributes are marked `is_variant_axis` (e.g. Size × Color), creating child `products` rows linked via `parent_product_id` — no separate variants table. Studio's Catalog tab has a "Product Types" manager modal plus dynamic attribute fields and a per-product variants panel.

**Business OS Phase B — supplier pricing & purchase orders** (migration `0057`, see plan §8): `supplier_products` gives a product per-supplier cost/lead-time/minimum-qty (a product can have more than one supplier at different prices, which `products.supplier_id` alone can't express). Purchase orders are `documents` rows (`document_type = 'purchase_order'`, `document_category = 'operations'`, the new `documents.supplier_id` FK set instead of `contact_id`) — no parallel table, same convention as quotations/invoices. Lifecycle: `draft` (created via `POST /api/purchase-orders`) → `sent` (approved via `POST /api/purchase-orders/:id/approve` — writes an `in_transit` `stock_movements` row per line and bumps the new `products.incoming` column) → `accepted` (received via `POST /api/purchase-orders/:id/receive` — writes a `restock` movement and unwinds `incoming`); `accepted` is reused from the existing status vocabulary rather than adding a PO-specific one. `GET /api/studio/insights` now also returns `suggestedPurchaseOrders` — for each low-stock product, its cheapest linked supplier and a recommended reorder quantity — rendered in Studio's Suppliers tab as a one-tap "Create & Send PO" card (`autoApprove: true` on create). Each supplier's expanded card in Studio also has a "Products supplied" panel to link/unlink products with cost and lead time.

**Business OS Phase C — multi-location inventory** (migration `0058`, see plan §7): `inventory_locations` + `product_stock_by_location` let stock be tracked per warehouse/shop/branch; every user gets an auto-created default "Main" location (backfilled from their existing `products.stock`/`reserved`) so single-location businesses — the common case — never see a location picker anywhere. `products.stock`/`reserved`/`available` stay the cross-location aggregate, kept in sync by the API layer on every movement, same denormalized-cache convention as `deals.pipeline_stage`. `POST /api/products/:id/stock-movements` is now location-aware: it accepts an optional `locationId` (defaulting to the default location) and a new `transfer` movement type that requires `toLocationId` and writes a linked pair of movements (`-qty` at the source, `+qty` at the destination) without touching the product's aggregate stock, since a transfer only redistributes where stock sits. The movement-type enum also gained `expired` and `committed` (the latter reserved for a future reservation workflow — not yet exposed in the manual Adjust Stock UI, since nothing wires it to `products.reserved` yet); `damaged` stays folded into `waste` per the plan's own open-decision #3. `services/api/src/routes/inventory-locations.ts` is the CRUD API (list/create/rename/set-default/delete, plus `GET /api/products/:id/stock-by-location`); Studio's Inventory tab has a "Locations" manager modal, and the Adjust Stock modal only shows location pickers once a second location actually exists.

**Business OS Phase D — sales intelligence** (no schema change, see plan §9): "customers who bought this also bought..." is computed live from real `contact_products` purchase history (`relation_type = 'purchased'`) rather than the manually-curated `products.crossSell`/`upsell` arrays those columns have sat unused since 0049 — `GET /api/products/:id/co-purchases` finds every other product bought by contacts who also bought this one, ranked by co-occurrence with a confidence % (co-buyers ÷ total buyers of the base product). Studio's Catalog tab renders this as a "Frequently bought together" panel per product with a one-click "+ Cross-sell" action that folds a data-driven pairing into the official `crossSell` array (reusing the existing PATCH support — no new write path needed). `GET /api/studio/insights` gained `topProfitable`/`topVelocity` (ranked from `stock_movements` `sale` rows × margin, all-time and trailing-30-day) and `avgOrderSize` (from `contact_products.quantity`), rendered as a "Most Profitable" / "Highest Velocity" pair of cards on the Pricing tab. `services/intelligence/app/memory/retrieval_service.py`'s `get_co_purchases`/`find_mentioned_catalog_item` feed the same co-purchase logic into `reply_gen.py`'s suggested-reply catalog context — if an incoming WhatsApp message names a catalog item, the model is told what else that item's past buyers usually buy, so a suggested reply can naturally mention it (the plan's own worked example: a brake-pads request nudging toward engine oil).

**Business OS Phase E — the conversation-to-automation loop** (migration `0059`, see plan §15/§16 — the plan's own highest-priority item): a customer typing something like "I'd like 10 uniforms" now surfaces a single multi-action approval card in the Inbox instead of requiring the user to manually update inventory, draft a quote, and set a reminder. Detection reuses the existing per-message analysis pass (`message_worker.py`'s single `analyse()` call, same convention as every other detector in this file) — `MessageAnalysis` gained an `order_intent_mentioned` field (models.py, prompts.py's `ANALYSE_MESSAGE`), deliberately narrower than `products_mentioned`: only a live, explicit order request with a quantity, not a price question or a past-tense mention. `services/intelligence/app/services/action_bundles.py`'s `ActionBundleService.detect_and_create` resolves each item against the catalog with the exact same single-ILIKE-match discipline as `contact_products.py` (ambiguous/zero matches are dropped), skips creating a new bundle if the same contact already has a pending one from the last hour (so a back-and-forth negotiation doesn't spam a card per message), and writes one `action_bundles` row (`user_id`, `contact_id`, `conversation_id`, `summary`, `actions` JSONB, `status`). It's called only for live (non-historical) customer messages, in the same gated block as reply generation, so an initial history sync doesn't flood a new user with stale "detected an order" cards.

The `actions` array reuses the exact `{type, params}` shape the `[ACTION: ...]` chat-tag system already uses (see §16's decision that passive-detection bundles need their own surface, not a new execution mechanism) — `generate_document` and `reminder` are literally the same two types the tag system already knows how to execute; `create_deal` (→ `POST /api/deals`) and `reserve_stock` (→ the new `POST /api/products/:id/reserve`, which finally wires the `committed` stock-movement type Phase C's enum added but left unused — it increments `products.reserved`/decrements `available` without touching `stock`, logging a `stock_movements` row where `previous_stock == new_stock` to signal "this changed what's spoken for, not what's on hand") are the two genuinely new types. `services/api/src/routes/action-bundles.ts` is pure CRUD (`GET /api/action-bundles?status=pending&contactId=`, `PATCH .../:id` to record `approved`/`partially_approved`/`dismissed`) — it does not execute anything; execution is client-side in the Inbox's new `ActionBundleCard` (`apps/web/.../inbox/_components/action-bundle-card.tsx`), which lets the user check/uncheck individual actions before approving. A `bundle:ready:{userId}` Redis pub/sub event (same `publish_event` → `redis-subscriber.ts` → Socket.io pattern `suggestion:ready` already uses) pushes new bundles live into the Inbox. Per plan §19 open-decision #5, everything here defaults to requiring manual approval — no auto-execute trust-level dial exists yet.

**Business OS Phase F — projects module & the "AI Project Manager" brief** (migration `0060`, see plan §11): `projects`/`project_tasks` are deliberately two tables with no Gantt/dependency graph — "lightweight ERP project management," not a project-management product. A project optionally links to a `contact_id` and/or `deal_id`; since `documents.deal_id` already existed, a project's invoices/quotations are found via `documents.deal_id = projects.deal_id` rather than a new FK on `documents`. `services/api/src/routes/projects.ts` is full CRUD for both tables (`GET/POST/PATCH/DELETE /api/projects[/:id]`, `POST/PATCH/DELETE /api/projects/:id/tasks[/:taskId]`), gated the same `requireMarketingAccess` way as every other Business OS route; its list/detail query (`PROJECT_LIST_SELECT`) aggregates `task_count`/`done_task_count`/`overdue_task_count` and `unpaid_invoice_count`/`pending_quotation_count` (the latter two joined from `documents` via `deal_id`) in one multi-join query rather than N+1 lookups. The "AI Project Manager" isn't a new notification system — it's two more `UNION ALL` branches (`task_overdue`, `project_behind`) on the existing AI Daily Brief CTE in `GET /api/proactive/brief` (`services/api/src/routes/proactive.ts`), so overdue tasks and behind-schedule projects with a linked contact surface in the same morning brief as everything else; `apps/web/.../dashboard/page.tsx` renders them with their own icon/color in `BRIEF_STYLES` and label in `sourceLabel()`. The `/projects` page (list + detail with inline task management) follows `/business`'s hero-card → filter-pills → list layout for visual consistency, and has its own `Projects` entry in the "Business" nav group (`layout.tsx`).

**Business OS Phase G — inventory forecasting & operational financial overview** (migration `0061`, see plan §7.3/§13): `inventory_forecasts` is one upserted row per product (`expected_stockout_date`, `recommended_order_qty`, `recommended_order_date`, `cash_required`), written by a new scheduled job — `services/intelligence/app/services/inventory_forecast.py`'s `InventoryForecastService.generate_for_all_users()` — that extrapolates sales velocity from `stock_movements` `sale` rows over a trailing 30-day window against current `available` stock and `supplier_lead_time`, following the exact same "plain SQL aggregation, not an LLM call" convention as `pricing_benchmarks.py`/`document_followups.py`. It degrades gracefully to no forecast for a product with zero sale movements in the window, rather than guessing — the plan itself notes this needs 2-3 months of real history to be useful. Wired into `daily_worker.py`/`main.py` as a fourth daily scheduler at 10:00 UTC (after pricing benchmarks at 09:00, same load-spreading convention). `GET /api/studio/insights` now also returns `stockoutForecasts` (products expected to stock out within 14 days, read from `inventory_forecasts` instead of a raw `minimum_stock` threshold), rendered as a violet insight card on the Inventory tab with an "Ask AI to plan ahead" action. Separately, `GET /api/studio/financial-overview` is the Operational Financial Overview — explicitly *not* accounting (no ledger, no double-entry, no chart of accounts): cash collected/outstanding from `documents.total_cents` grouped by invoice status, purchases from `restock`-type `stock_movements` valued at current `purchase_cost`, inventory value and average margin from `products`, rendered as a "Financial Overview" card on Studio's Overview tab. Expenses are the one deliberately deferred input — per the plan's own recommendation it reads a count/total off the already-defined-but-unused `expense_claim` document type rather than adding a parallel ledger table, and shows a soft note instead of a hard number until that document type is actually in use.

---

## Zuri Neural Layer

See `docs/NEURAL_LAYER_PLAN.md` for the full architecture — a shared substrate (Memory/Emotion/Relationship/Goal/Knowledge Graph/Reasoning/Reflection/Prediction/Action engines) that Advisor, Studio, CRM, Inventory, Projects, and Suppliers all draw on instead of each reinventing memory/emotion/prediction logic per module. Most of it reconciles with what already exists (`retrieval_service.py`, the per-relationship `relationship_goals`, `relationship_connections`, the Automation Engine's workflow builder) rather than duplicating it — only the genuinely new pieces (cross-module Goal Engine, Reflection Engine + Life Timeline, Knowledge Graph beyond people, and the platform-wide Emotion Engine below) get built here.

**Neural Layer Phase 1 — platform-wide Emotion Engine** (migration `0062`, see plan §4.2/§10): `emotional_signals` is a generic, polymorphic table (`entity_type`/`entity_id`/`contact_id`) that supersedes the Advisor-only `interaction_affect` design originally sketched in `docs/ADVISOR_COMPANION_PLAN.md` — any module can write an affect vector (valence/arousal/dominant emotion/emotion vector) against it, not just Advisor. `services/intelligence/app/neural/emotion.py`'s `EmotionEngine` has two writers: `record_from_message_analysis()` derives valence/arousal from the existing per-WhatsApp-message analysis's `emotions`/`sentiment` output (no new LLM call — reuses `message_worker.py`'s existing `MessageAnalyser` result, wired in right alongside the existing business-facts/opportunities/life-events extraction calls) and `record_advisor_turn()` makes one small dedicated classification call (`CLASSIFY_EMOTION` prompt) since Advisor's `/internal/advisor/ask` and `/internal/conversations/:id/ask` endpoints have no existing sentiment pass to reuse — wired in right before each returns its answer, with `contact_id` populated when the conversation-scoped endpoint has one. `relationships.emotional_signals_summary` (plus matching, not-yet-populated columns on `projects`/`suppliers`) is a denormalized cache — `{relationshipConfidence, trustTrend, communicationWarmth, buyingIntent, responseMomentum, conversationStress}` — recomputed inside `health.py`'s existing `RelationshipHealthService.recalculate()` pass (same message-count-driven cadence, no new scheduler); `buyingIntent` is deliberately left `null` since it needs business-signal correlation (deals, `order_intent_mentioned`) this engine doesn't read, not fabricated from affect alone. No frontend yet — this phase is backend substrate only, per the plan's own phasing.

**Neural Layer Phase 2 — cross-module Goal Engine** (migration `0063`, see plan §4.4/§10): `goal_profiles`/`goal_memories`/`goal_progress`/`goal_events`/`goal_linked_entities` are a deliberately separate tier from the existing per-relationship `relationship_goals` (both stay permanently, per the plan's own §11 open decision) — a goal here spans the whole business or life ("grow monthly revenue to $20,000") and links to any entity via the polymorphic `goal_linked_entities(goal_id, entity_type, entity_id)` join rather than a parallel per-module goal-linking table. `services/api/src/routes/goal-profiles.ts` is full CRUD (`GET/POST/PATCH/DELETE /api/goal-profiles[/:id]`, `POST /api/goal-profiles/:id/link`, `DELETE .../:id/link/:linkId`, `POST .../:id/progress`) plus a small Reasoning Engine pilot: `POST /api/goal-profiles/check-price-conflict` is a deterministic (not LLM) heuristic check — a ≥10% price drop or a resulting margin under 15% against an active business goal returns a confidence/evidence-backed conflict, same "never block, always disclose" posture as the rest of the codebase's approval flows. Studio's `PricingModule` calls this before saving a price decrease and shows a "Save Anyway" confirmation if flagged, rather than silently proceeding. The `/goals` page (list + create + detail with linked-entity picker/progress/timeline) has its own nav entry in the ungated bottom nav group (alongside Proactive/AI Advisor/Calendar, since goals span both business and personal modes), and `/projects/[id]` gained a "Link to goal" affordance as the first cross-module linking surface. `goal_memories` has no writer yet — populating it (e.g. from Advisor conversations that touch a linked goal) is follow-up work, not part of this phase's success criteria.

**Neural Layer Phase 3 — Reflection Engine + Life Timeline** (migration `0064`, see plan §4.7/§10): fully net-new — nothing like this existed before. `reflection_summaries` (`period_type` daily/weekly/monthly, `period_start`/`period_end`, `highlights` JSONB) is populated by `services/intelligence/app/neural/reflection.py`'s `ReflectionService`, which synthesizes what changed for a user purely from signals every other engine already produces — no new detection pass, no LLM call. Highlights only appear when a signal actually crosses a threshold (emotional tone shift ≥0.15 valence with ≥3 `emotional_signals` in the period, reply-latency change ≥20%, relationship health deltas, completed tasks, goal achievements/events, closed deals) — a quiet week produces fewer highlights, not padded ones. `project_tasks` gained a `completed_at` column (this migration) since only its current `status` was tracked before, not when it changed. `run_reflection_scheduler()` in `daily_worker.py` runs every Monday at 11:00 UTC — the first scheduler in that file gated on day-of-week rather than a plain daily cadence, staggered after `inventory_forecast`'s 10:00 slot. `services/api/src/routes/reflection.ts` exposes `GET /api/reflection/latest` (most recent summary) and `GET /api/reflection/timeline` (a `UNION ALL` merging `reflection_summaries`, `goal_events`, `contact_life_events`, and `deal_stage_history`'s closed-won/lost transitions into one chronological feed, capped at 200 rows) — rendered as a "Your Week in Review" card on `/dashboard` and a new `/timeline` Life Timeline page (grouped by month, vertical connector line), both reached via a new "Life Timeline" nav entry next to Goals. The emotional-trend highlight is a deliberate simplification of the plan's own worked example (which referenced a `gossip_worthy_events`/`tone_shift` mechanism that was never built) — it computes directly from `emotional_signals.valence` current-vs-prior-period averages instead.

**Neural Layer Phase 4 — Knowledge Graph Query Layer** (migration `0065`, see plan §4.5/§10): `knowledge_graph_edges` (`from_entity_type`/`from_entity_id`, `to_entity_type`/`to_entity_id`, `relation_type`, `confidence`) holds only AI-inferred edges — per the plan's own recommendation, structural relationships already expressed by a foreign key (`contact_products`, `supplier_products`, `goal_linked_entities`, etc.) are not backfilled into it; a query-time traversal layer unions the two instead. Since the plan's own `neural/knowledge_graph.py` naming assumes Python but the first consumer (`GET /api/products/:id/co-purchases`, Business OS Phase D) lives in `services/api` (Node) — and the two services keep independent DB pools, same split as everywhere else in this codebase — the traversal contract is implemented twice with the same shape: `services/api/src/lib/knowledge-graph.ts`'s `coPurchasers()`/`inferredNeighbors()` (the actual dependency of the co-purchases endpoint, which no longer needs to know `contact_products` is the underlying join table) and `services/intelligence/app/neural/knowledge_graph.py`'s `co_purchasers()`/`inferred_neighbors()` (matching the plan's naming — `retrieval_service.py::get_co_purchases`, used by `reply_gen.py`'s catalog context, now delegates to it instead of duplicating the same SQL). Both read/write the same `knowledge_graph_edges` table. Only the `contact_products`-derived co-purchase traversal has a real caller so far; `inferred_neighbors`/`inferredNeighbors` has no writer yet — the read path is ready for whichever engine first needs to record an edge no FK already expresses (e.g. "product X competes with product Y").

**Neural Layer Phase 5 — Prediction Engine Consolidation** (no new migration, see plan §4.8/§10): `services/intelligence/app/neural/prediction.py`'s `Prediction` model (`subject_type`/`subject_id`/`prediction_type`/`predicted_value`/`confidence`/`evidence`/`computed_at`) and `PredictionEngine.predict(prediction_type, subject_id, user_id)` give three already-shipped, previously-unconnected predictors one shared response shape without touching their underlying math: `stockout` reads `inventory_forecasts` (Business OS Phase G), `renewal_due` and `churn_risk` both read the matching open `opportunities` row by `opportunity_type` (`clock_engine.py`'s replacement-date prediction and `health.py`'s inline churn-risk logic, respectively — both already wrote to `opportunities` before this phase, so these are pure read adapters, not new writers). `purchase_likelihood` is the one genuinely new prediction, built directly against the contract per the plan's own worked example — a deterministic heuristic (not an LLM call, same convention as `pricing_benchmarks.py`) scoring a contact from recent `contact_products` quote/interest signals and `relationships.health_trend`. Exposed via `POST /internal/predictions/:predictionType` (`services/intelligence/app/routes/predictions.py`) and proxied through `GET /api/predictions/:predictionType/:subjectId` (`services/api/src/routes/predictions.ts`); a "Purchase Likelihood" card (percentage + evidence bullets) renders on `/contacts/[id]` for business/hybrid mode contacts, next to the existing Goals panel.

**Neural Layer Phase 6 — Action Engine Workflows** (no new migration — `action_bundles.actions` is already JSONB, see plan §4.9/§10): the conversation-to-automation loop's detected order bundle (Business OS Phase E) now gets a real dependency chain instead of a flat checklist. `services/intelligence/app/services/action_bundles.py::detect_and_create` sets a `dependsOn` array (indices into the same `actions` list, camelCase since this JSONB passes through the API verbatim rather than a snake_case translator) on each generated action: every `reserve_stock` depends on `create_deal`, `generate_document` depends on all the `reserve_stock` actions, and `reminder` depends on `generate_document` — the plan's own inventory-check→reorder→notify chain, minus a supplier-notify step since no such action type exists yet to reuse. `ActionBundleCard` (`apps/web/.../inbox/_components/action-bundle-card.tsx`) renders dependent actions indented with a connector icon, disables a checkbox until its dependencies are checked, cascades an uncheck downstream, and its `approve()` now walks the array in dependency order, marking anything whose prerequisite didn't finish as `'skipped'` rather than executing it anyway. `actionLabel`/`executeAction` were extracted into `apps/web/src/lib/action-executor.ts` — the shared executor layer the plan calls for, ready for the (separately planned, unchanged) Automation Engine to reuse once it has a code path that constructs this `{type, params}` shape; it doesn't yet, so nothing else consumes it today. `condition` (the plan's other proposed field) has no writer — only `dependsOn` had a concrete use case from the existing detector.

With Phase 6 shipped, all six Neural Layer phases in `docs/NEURAL_LAYER_PLAN.md` §10 are complete; only §4.10 Skills remains deliberately unphased (per the plan's own instruction — build only once there's a concrete duplication to consolidate).

---

## Advisor Companion

See `docs/ADVISOR_COMPANION_PLAN.md` for the full plan — Advisor's emotional/companion layer built on top of the Zuri Neural Layer above. All six phases are shipped: Phase 0 ("Emotional Foundation"), Phase 1 ("Companion Brain Foundation"), Phase 2 ("Relationship Analysis Experience"), Phase 3 ("Action Protocol And Approval"), Phase 4 ("Watch Replies And Narration"), Phase 4.5 ("Proactive Companion Crons"), Phase 5 ("Learning Loop And Personalization"), and Phase 6 ("Safe Scoped Automation").

**Phase 0 — Emotional Foundation** (migration `0066`, see plan §9): creates `advisor_user_profiles` — nominally a Phase 1 deliverable (§4.1) per the plan, but built here since Phase 0's own extension columns (`interests`, `spiritual_preferences`, `motivational_style`, `gossip_style`, `current_emotional_state`, `emotional_baseline`, `companion_features_paused`, §4.5) have nowhere to live without the base table; `personal_mode_enabled`/`personal_mode_enabled_at` are deliberately left for Phase 1 to add, exactly as the plan assigns them. Two corrections against what the plan assumed already existed: (1) wiring Advisor turns to write `emotional_signals` rows was already done in Neural Layer Phase 1 (`record_advisor_turn`, called from both `/internal/advisor/ask` and `/internal/conversations/:id/ask`) — Phase 0 only adds that this call now also upserts `advisor_user_profiles.current_emotional_state`, since the table didn't exist before; (2) reconsolidation (§6.8) was *not* already running platform-wide as the plan claimed — `emotional_signals.memory_weight` existed since Neural Layer Phase 1 but nothing ever wrote to it, so Phase 0 adds `EmotionEngine.reconsolidate()` (nightly at 04:00 UTC, `run_emotion_reconsolidation_scheduler` in `daily_worker.py`), which pulls a negative-valence signal's weight down when that same user+contact pair's more recent average valence has since improved, and recomputes `advisor_user_profiles.emotional_baseline` as a rolling 30-day average. State-dependent retrieval weighting (§6.7) ships as `emotional_congruence()`, a pure function in `neural/emotion.py` blending into an existing score rather than being a separate retrieval path. No frontend — this phase is backend substrate only, per the plan's own phasing. Incidentally fixed while wiring this phase's scheduler: Neural Layer Phase 3's reflection worker/scheduler were imported into `main.py` but never actually instantiated or started — the weekly reflection job had never run in production; fixed alongside this phase's own registration.

**Phase 1 — Companion Brain Foundation** (migration `0067`, see plan §9): adds `advisor_memories` (Advisor-specific memories about the user, not contacts — `preference`/`boundary`/`trait`/`goal`/`relationship_pattern`/`successful_advice`/`disliked_advice`), the two Phase-0-deferred `advisor_user_profiles` columns (`personal_mode_enabled`/`personal_mode_enabled_at`), and six new `advisor_sessions` columns (`companion_mode`, `active_contact_id`/`active_conversation_id`, `emotional_mode`, `last_intent`, `metadata`). `services/intelligence/app/services/advisor_companion.py`'s `AdvisorCompanionService.handle_turn()` now owns the global advisor turn end-to-end (intent classification, profile/memory/emotional-state retrieval, dynamic system-prompt assembly, memory-suggestion capture) — `routes/conversation.py`'s `/internal/advisor/ask` is now a thin delegator, and the Phase 0 contact-congruence reranking moved into this service along with it. `CLASSIFY_ADVISOR_TURN` (`ai/prompts.py`) combines intent classification and a light memory-suggestion proposal into one structured call rather than two separate LLM calls; a proposed memory is written directly to `advisor_memories` since the memory drawer already makes it visible/editable, not held for a separate confirm-card step. Scoped to the global advisor only — the conversation-scoped and Studio advisors keep their existing flow; folding them in is Phase 2 scope. `services/api/src/routes/advisor.ts` gains `GET/PATCH /api/advisor/profile`, `GET/POST /api/advisor/memories`, `DELETE /api/advisor/memories/:id`, `POST /api/advisor/memories/:id/correct`, and `PATCH /api/advisor/sessions/:id` (companion mode); the message-send response now also carries `assistantState`/`memorySuggestion`. `/advisor`'s right inspector panel gains Memory and Personalize tabs alongside the existing Context tab — a mode-chip row (including `gossip`, and `spiritual_companion` once a tradition is set) sits above the chat, and a small "reading: {mood}" badge confirms the detected emotional read after each turn. The Personalisation tab stays inside the drawer, not onboarding, per §7.6.

**Phase 2 — Relationship Analysis Experience** (no new migration, see plan §9): `AdvisorCompanionService` gains `handle_conversation_turn()` — the conversation-scoped counterpart to Phase 1's `handle_turn()`, now with genuinely deeper retrieval than the pre-Phase-2 `ask_ai` had (contact profile + relationship memory via `retrieval_service.get_contact_summary`/`get_relationship_memory`, plus the contact's and user's emotional state). `routes/conversation.py`'s `/internal/conversations/:id/ask` is now a thin delegator, same pattern as Phase 1's global-advisor route; `_get_recent_messages`/`_format_transcript` moved to `memory/retrieval_service.py` (`get_recent_messages`/`format_transcript`) so the still-separate `summarize`/`followup` endpoints share one implementation instead of duplicating it. For analysis-flavored intents only (`chat_analysis`/`relationship_advice`/`emotional_support`), `ANALYZE_CHAT_TURN` (`ai/prompts.py`) returns one structured completion combining the natural-language answer with `evidence`/`myRead`/`alternativeRead`/`whatIWouldDo` — every other intent uses `CONVERSATION_TURN`'s plain-text path instead of paying for structure it doesn't need. `RELATIONSHIP_ADVICE_POLICY` (§8.2) is folded into both prompts. A simple valence/arousal threshold check folds the user's current emotional state into the prompt when they're in a tense/anxious moment, per the plan's own worked example. Gossip mode is now reachable via the orchestrator's own judgment (§3.7) in both `handle_turn()` and `handle_conversation_turn()` — a `gossip`-classified intent switches `companion_mode` automatically, not just the explicit chip. The analysis prompt also already self-assesses `is_high_risk_draft` and the service already returns a `proposedAction` for `draft_reply`/`send_message` turns, but neither is acted on yet — Phase 3 is what persists `proposedAction` into `advisor_action_requests` and builds the approval flow. Frontend evidence cards render in the Inbox's `intel-panel.tsx` — the real per-conversation Advisor surface — with `advisor_messages.metadata` now also storing `analysis` so reloaded history still shows the card.

**Phase 3 — Action Protocol And Approval** (migration `0068`, see plan §9): `advisor_action_requests` — a durable approval log, ships with the full §4.9 action-type list already in its CHECK constraint (`send_devotional`/`send_motivational`/`send_interest_update` included from day one since this is a fresh table, though only `send_whatsapp_message` actually executes — the other two need Phase 4.5's crons first). `services/api/src/lib/whatsapp-send.ts`'s `sendWhatsAppMessage()` is extracted out of `POST /api/conversations/:id/messages` so `POST /api/advisor/actions/:id/execute` reuses the exact same WhatsApp send queue instead of a parallel sender, per the plan's own implementation note. The Boundary Keeper (§3.11/§6.13) is now a real 3-factor check in `AdvisorCompanionService._assess_boundary_risk()`: the model's own high-risk-draft self-assessment (Phase 2), the user's current arousal being elevated, and whether this contact has had a recent (14-day) negative average valence in `emotional_signals` — two or more factors sets `riskLevel: 'high'`. Risk level never blocks sending (approval is always required regardless, per §8.1's baseline); it only changes whether the approval card shows a "want to sleep on it?" note. `POST /api/advisor/actions/:id/approve` and `.../execute` are separate endpoints per the plan's route list, but the frontend's single "Send Now" button in `intel-panel.tsx`'s new approval card calls them back-to-back; `.../cancel` is the third terminal transition. `advisor_messages.metadata.actionRequestId` lets a reloaded chat history reconstruct the card. Only `send_whatsapp_message` executes today — every other action type 400s, since `create_reminder`/`generate_document` already have working equivalents through the `[ACTION: ...]` chat-tag system and `fetch_replies`/`watch_conversation`/`summarize_new_replies` are Phase 4 scope.

**Phase 4 — Watch Replies And Narration** (no new migration, see plan §9): a watch is stored as an `advisor_action_requests` row reusing Phase 3's already-unused `watch_conversation` action type — inserted `status = 'approved'` directly (no approval step needed for a passive watch, unlike a send), with `expires_at` from a `POST /api/advisor/watch` `expiresInMinutes` param (default 60). `services/api/src/routes/advisor.ts` gains `POST/GET /api/advisor/watch` and `DELETE /api/advisor/watch/:id`; a `GET` beyond the plan's literal §5.4 list lets both the frontend toggle and a reloaded chat history recover current watch state. A watch can also be started purely by chat — `AdvisorCompanionService.handle_conversation_turn` short-circuits on a `watch_replies`-classified intent (same pattern as Phase 1's `activate_personal_mode`) and calls the same `_create_watch()` helper the REST route uses, so "watch this chat and tell me when they reply" and the UI toggle write the identical row. `services/intelligence/app/workers/message_worker.py`'s `_process` calls `AdvisorCompanionService.find_active_watch()` right after the existing order-intent action-bundle detection (same `not is_historical`-guarded block); a hit fires `advisor.reply_received:{userId}` immediately (a fast, narration-less ping), then calls `generate_reply_narration()` — one structured completion (`NARRATE_REPLY` in `ai/prompts.py`) returning both the narration and 2-3 suggested next replies, deliberately not reusing `reply_gen.py`'s heavier pipeline — and fires `advisor.narration_ready:{userId}` once that completes, persisting the narration as a normal `advisor_messages` row (`metadata.type = 'narration'`) so it survives a reload. Both channels were added to `redis-subscriber.ts`'s explicit psubscribe list, matching the `suggestion:ready`/`bundle:ready` convention. The "warmer than last week" read comes from two already-computed signals — trailing-7-day vs prior-7-day average `emotional_signals.valence` for that contact, plus `relationships.health_trend` — not a new detection pass; a quiet week produces no trend line. The narration card renders inline in `intel-panel.tsx`'s chat tab (violet-tinted, distinct from Phase 2's indigo evidence card and Phase 3's emerald approval card) with suggested replies as tappable chips wired to the existing `onSetDraft`/`draftFocus` props. No separate notification surface exists yet for a user who isn't looking at the Inbox — that's §7.7's "Zuri Noticed Something" card, Phase 4.5 scope. The Watch toggle is disabled until a chat session exists for that conversation (i.e. until the first Advisor message has been sent), same constraint the chat-intent path has.

**Phase 4.5 — Proactive Companion Crons** (migration `0069`, see plan §9): four new intelligence-service crons under `services/intelligence/app/services/` — `gossip_detector.py`, `interest_companion.py`, `spiritual_companion.py`, `motivational_detector.py` — wired into `daily_worker.py`/`main.py` at 12:00/every-6h/13:00/14:00 UTC respectively, staggered after the existing Neural Layer/Business OS jobs. All four (except the Spiritual Companion, gated purely on `spiritual_preferences.tradition`) are gated on `personal_mode_enabled = true` rather than "organic discovery" — no literal discovery-tracking mechanism was ever built, and §1.2 designed `personal_mode_enabled` precisely so these crons are testable without one. `gossip_detector.py` runs 5 real SQL aggregations (`tone_shift`, `ghosting`, `sudden_interest`, `life_event`, `reciprocity_drop`) writing to the new `gossip_worthy_events` table; delivery timing (deciding *when* to surface a pending item) lives in Node's `GET /api/advisor/companion-feed` instead of Python, since Node already owns that read path and can check `advisor_user_profiles.current_emotional_state` directly. `interest_companion.py` is the user-facing sibling of the contact-facing `interest_matcher.py` — topics come from `advisor_user_profiles.interests` plus the close circle's aggregated `contact_insights`; its search deliberately uses only `web_search.py` (Tavily/SERP), not the plan's full 3-tier hybrid chain, since `ai/client.py` has no LiteLLM grounding/tool-calling wiring for any provider today and shipping an unverified new integration with no way to exercise real tool-call responses in this environment isn't a risk worth taking. `spiritual_companion.py`'s daily devotional and `motivational_detector.py`'s procrastination-signal nudge (stale contacts via a `LATERAL` join, unfulfilled `message_analyses.promises_detected`, deals stuck via `entered_stage_at`) both write through a new shared helper, `companion_delivery.py`'s `deliver_initiated_message()`, into the resolved global Advisor session (`advisor_messages.initiated = true`, the new column this migration adds) — gossip is the one exception, since it needs the "Tell me more" framing rather than a pre-written chat message. Context-sensitive verse offering and "pray with me" are inline orchestrator behavior, not a cron: `AdvisorCompanionService._spiritual_verse_line()` folds an optional verse-offering instruction into the system prompt when a tradition is set and the same low-valence/high-arousal state Phase 2 already checks for is present, and the `spiritual` intent now auto-switches `companion_mode` to `spiritual_companion` the same way `gossip` already does. The plan's separate Companion Preferences API (§5.5) isn't duplicated — `GET/PATCH /api/advisor/profile` (Phase 1) already covers those exact fields; only `GET /api/advisor/companion-feed`/`POST .../:id/dismiss` are new. The "Zuri Noticed Something" card on `/advisor` only surfaces gossip items (interest/devotional/motivational nudges already show up as ordinary chat messages) with "Tell me more"/"Not now" actions — no push-notification surface exists for a user who isn't looking at Advisor. No per-user timezone scheduling exists anywhere in `daily_worker.py`, so §3.8/§3.9's "user's own timezone"/"user-configured time" are both simplified to fixed UTC hours shared by every opted-in user.

**Phase 5 — Learning Loop And Personalization** (no new migration, see plan §9): closes the one genuinely-missing piece of §6.5's User Memory Learner — "after each advisor turn" and "after explicit feedback" already existed (Phase 1's per-turn `memory_suggestion`, the remember/correct/forget endpoints), so only "nightly consolidation" needed building. `services/intelligence/app/services/advisor_memory_learner.py`, scheduled at 15:00 UTC (after Phase 4.5's 14:00 motivational check), does three things: learns a preferred reply tone from `suggested_replies.status` outcomes (`approved`/`edited_and_sent`/`dismissed`, ≥5 samples, score ≥0.5) into `advisor_user_profiles.tone_preferences` and a matching memory; flags a high (`≥40%`) cancel rate on recent `send_whatsapp_message` `advisor_action_requests` as a `disliked_advice` memory; and deactivates weak `advisor_memories` (`confidence < 0.3`, unreinforced 30+ days, `evidence_count <= 1` — protecting anything ever corrected or reinforced) — mirroring `neural/emotion.py`'s reconsolidation pattern applied to `advisor_memories` instead of `emotional_signals`. Separately, this phase closes a gap Phase 4.5 itself left open: its own success criterion promised "dismissing/ignoring visibly reduces frequency" but nothing actually tracked engagement. `companion_delivery.py`'s new `engagement_rate()` reads `proactive_interest_chats.user_engaged` (now actually set — `POST /api/advisor/sessions/:id/messages` marks a session's most recent proactive delivery engaged when the user replies to a session whose last message was `initiated = true`); `interest_companion.py` and `motivational_detector.py` now skip their run entirely once combined engagement drops below 15% (≥5 samples), and `gossip_detector.py` skips detection once a user's 14-day dismiss rate exceeds 70% (≥5 resolved events). Deliberately not built: the associative emotional graph for pattern surfacing ("you've had three conversations like this...") and per-content-style learning (which devotional translation, which gossip phrasing) — both need materially more infrastructure than a nightly aggregation pass responsibly delivers; what shipped is frequency learning (more/less of this) and tone learning (which reply tone works), not full content-style personalization.

**Phase 6 — Safe Scoped Automation** (migration `0070`, see plan §9): `advisor_automation_grants` — one active grant per conversation at a time, `scope_description` in the user's own words (e.g. "logistical confirmations like meeting times"), a `duration`-derived `expires_at` — plus `advisor_automation_audit_log`, one row per candidate exchange while a grant is active (`auto_sent`/`skipped_out_of_scope`/`skipped_high_risk`). "Integrate with existing auto-response trust tiers" is literal: `services/intelligence/app/services/reply_gen.py` now calls `auto_response.py`'s `check_eligibility()` directly instead of `evaluate()` (which bakes in the `approval_mode == 'auto'` requirement) — every existing safety gate (business hours, per-contact/rule exclusions, escalation keywords, group/broadcast skipping, the master on/off switch) still applies unconditionally, and a scoped grant only ever overrides the `approval_mode` gate on top of that, never anything else. `services/intelligence/app/services/scoped_automation.py`'s `check_reply_in_scope()` re-classifies every candidate reply against the grant's stated scope via `CLASSIFY_SCOPED_AUTOMATION` (`ai/prompts.py`) rather than trusting the grant's own description to greenlight everything — `is_high_risk` (money, commitments, complaints, anything emotionally charged) always wins over `in_scope` regardless of what the grant nominally covers. A grant can be created via `POST /api/advisor/automation-grants` or by saying "handle this conversation for 10 minutes, auto-send only logistical confirmations" — a new `scoped_automation` intent short-circuits in `AdvisorCompanionService.handle_conversation_turn` the same way Phase 4's `watch_replies` does (literal message as scope, 30-minute default); revocation (`POST .../:id/revoke`) is REST-only, same asymmetry Phase 4's watch already has. `GET /api/advisor/automation-grants/:id/audit-log` powers a real queryable audit trail, surfaced in `intel-panel.tsx`'s new Automate panel (violet-tinted, alongside Phase 4's watch/narration cards) with scope, expiry, Revoke, and a "View log" list. No new send mechanism — a scoped-automation auto-send reuses `auto_response.py`'s existing `enqueue_send()` verbatim, indistinguishable from a normal auto-tier send once it clears eligibility + scope + risk.

With Phase 6 shipped, all six phases of `docs/ADVISOR_COMPANION_PLAN.md` are complete.

---

## Zuri Curiosity Layer

A cross-cutting engine (migration `0071`, `advisor_curiosity_prompts`) that notices gaps in what Zuri actually knows — about a contact, or about the user themselves — and asks about them, either woven naturally into a normal Advisor turn or delivered proactively out of the blue. Deliberately **not** part of the Advisor Companion Plan's Personal Mode Suite: filling in a contact's job title or the user's interests is a general CRM/relationship-intelligence quality improvement useful in business mode too, not a personality/companion feature, so it is never gated on `personal_mode_enabled`. The proactive nudge still respects `companion_features_paused` (the same honest kill switch every other unsolicited Advisor message respects).

**Gap detection** (`services/intelligence/app/services/curiosity_engine.py`) is plain SQL, same discipline as `pricing_benchmarks.py`/`gossip_detector.py` — no new inference pass. Contact gaps: `job_title`/`company` IS NULL for a close-circle contact (`importance_tier IN (1,2)`), `relationship_type` still at its schema default `'acquaintance'` despite 15+ exchanged messages, or no `contact_insights` row tagged `interests`/`hobbies`. User gaps: `advisor_user_profiles.interests` empty or `motivational_style` empty. `pick_next_gap()` filters out anything asked about the same (target, gap_type) pair in the last 14 days and picks randomly from what's left, weighting contact gaps 2:1 over user gaps since they compound into more of Zuri's existing intelligence (health scores, gossip, network value).

**Two delivery paths, one engine.** (1) *Inline* — `AdvisorCompanionService._curiosity_context_line()`, called from both `handle_turn` and `handle_conversation_turn`, first checks whether the user's current message answers a curiosity question asked in the last 72 hours (`check_pending_answer()` — a small classification call, `CLASSIFY_CURIOSITY_ANSWER` in `ai/prompts.py`) and if so applies the write and folds a brief acknowledgment instruction into the system prompt; otherwise, with a 20% per-turn chance, it suggests one fresh gap-filling question the model *may* weave in naturally ("only if it doesn't feel forced; otherwise skip it silently") — never mandatory, never every turn. (2) *Proactive* — `run_proactive_for_all_users()`, a new daily scheduler in `daily_worker.py`/`main.py` at 16:00 UTC (after Phase 5's memory learner at 15:00): every user gets checked, but each only has a 25% chance of actually being asked that day, so the "randomly ask about something" feel comes from the per-user coin flip rather than a fixed cadence. A confirmed match writes directly to the real field it targets (`contacts.job_title`/`company`, `relationships.relationship_type`, a new `contact_insights` row, or `advisor_user_profiles.interests`/`motivational_style`) rather than only ever landing as a freeform memory — the same "trusted write" convention explicit "remember this" already gets — but only when the extraction classifier reports confidence ≥ 0.6; anything softer is simply dropped rather than risking a bad structured write. No frontend changes were needed — both delivery paths ride the existing chat/`advisor_messages` surfaces (a woven-in question is just part of a normal answer; a proactive one is a normal `initiated = true` message via the same `companion_delivery.py` helper Phase 4.5's crons use) so a curiosity question reads as Zuri simply being a more attentive conversational partner, not a new UI element.

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

## Design System

**This is the default styling for every page in `apps/web` from now on.** It was established by `dashboard/page.tsx` and `advisor/page.tsx` and is also fully implemented in `settings/page.tsx`. Treat these three files as the reference implementation — when in doubt, look at how they solve a problem before inventing a new pattern. This supersedes the older flat gray/white token list under "Phase 1 UI Audit" below and the old dark slate-900 chat theme (no longer used anywhere).

**Page background** — a soft gradient that fades from indigo/teal tints into slate at the bottom, not a flat color:
```
bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)]
```
(a simpler two-stop variant `bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)]` is also acceptable for simpler pages). Never use a flat `bg-gray-50` page background or a dark page background going forward.

**Radius scale** — the defining visual trait of this system. Bigger surfaces get bigger radii:
- `rounded-xl` / `rounded-2xl` — buttons, icon chips, pills, small controls
- `rounded-3xl` — stat tiles, cards, sidebar/nav containers
- `rounded-[1.75rem]` — mid-size section cards
- `rounded-[2rem]` — hero sections, feature sections, empty states

**Hero / feature card pattern**:
```
relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-white via-indigo-50 to-cyan-50
shadow-2xl shadow-indigo-200/40 ring-1 ring-white
```
layered with an absolutely-positioned decorative overlay for depth:
```
absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.28),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.22),transparent_30%)]
```

**"Live"/status pill** (used for anything real-time or AI-active):
```
inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100
```
with a pulsing dot: `h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]`.

**Typography**:
- Big display numbers: `text-5xl md:text-6xl font-black tracking-tight tabular-nums`
- Page-level headlines: `text-2xl md:text-4xl font-bold tracking-tight`
- Feature/empty-state headers: `text-2xl md:text-3xl font-black tracking-tight`
- Section titles inside cards: `text-sm font-semibold text-gray-900`

**Buttons**:
- Primary CTA: `rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 active:bg-indigo-700`
- High-contrast secondary "dark chip" (e.g. nav into Advisor): `bg-slate-950 text-white rounded-2xl shadow-lg shadow-slate-900/15`

**Icon chips** — a recurring atom used everywhere a section, stat, or list row needs a glanceable icon: a soft colored circle/rounded-square, `w-10 h-10` to `w-11 h-11 rounded-2xl bg-{color}-50 text-{color}-600`. Brand/AI avatars use a gradient variant instead: `bg-gradient-to-br from-indigo-600 to-cyan-500` with a white icon and `shadow-lg shadow-indigo-200`.

**Stat card**:
```
rounded-3xl border border-white bg-white/95 p-4 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100 hover:shadow-md
```
icon chip on top, value as `text-2xl font-black tracking-tight text-gray-950`, label as `text-xs font-semibold text-gray-500`.

**Standard content card**: `rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70` in light mode; use `bg-white/90` or `bg-white/80` with `backdrop-blur-xl` for glassy overlays sitting on the gradient page background.

**Section header pattern**: title (`text-sm font-semibold text-gray-900`) + a "View all" link (`text-xs text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1`) with a small trailing arrow icon.

**List rows inside cards**: `flex items-center gap-3 border-b border-gray-50 px-4 py-3.5 last:border-b-0 hover:bg-gray-50/80`.

**Empty states**: `rounded-[2rem] border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm shadow-gray-200/60`.

**Color roles**:
- `indigo-600` — primary/brand accent
- `slate-950` / `gray-950` — highest-contrast headings and "dark chip" surfaces
- `gray-500` / `slate-500` — secondary/muted text
- `emerald` — success, positive, live/active
- `red` / `rose` — danger, urgent
- `amber` — warning
- `violet` / `blue` / `cyan` — stat-card variety accents

**Tinted shadows** — shadows are colored to match the section's hue, not plain black/gray: `shadow-indigo-200/40`, `shadow-emerald-100/80`, etc. This is deliberate and should be followed everywhere, not just on hero cards.

**Ring + border layering** — cards and pills commonly combine a border or background with a `ring-1` (`ring-gray-100` / `ring-white` / `ring-indigo-100`) for a subtle glassy, layered depth. Use both together, not one or the other.

**Chat bubbles** (from Advisor, reusable anywhere a conversational UI is needed): user bubble `bg-indigo-600 text-white shadow-lg shadow-indigo-200`; assistant bubble `bg-white border border-white shadow-sm shadow-slate-200/80 ring-1 ring-slate-100`.

**Sidebar / nav surfaces**: `bg-white/90 backdrop-blur-xl border-r border-slate-200`.

**Tab bars** (reference: `settings/page.tsx`) — mobile is a horizontal `overflow-x-auto` strip of pill buttons inside `border-t border-slate-100 bg-slate-50/80 px-2 py-2 lg:hidden`; each pill is `inline-flex min-h-10 items-center gap-2 rounded-2xl px-3 text-xs font-bold`, active = `bg-indigo-600 text-white shadow-sm`, inactive = `bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100`. Desktop is a `sticky top-6 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm` vertical list, active = `bg-indigo-50 text-indigo-700` with an icon chip `bg-indigo-600 text-white shadow-sm`, inactive icon chip `bg-slate-100 text-slate-500`. Any new multi-tab UI (e.g. the Analytics sub-nav) should match this pattern, and on mobile should also keep the active tab scrolled into view rather than resetting to the first tab on navigation.

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
| — Business Workspace (Documents — quotations/invoices/proposals/contracts) | ✅ Complete (Phases 0–4) |
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
- [x] Business Workspace (`/business` page) — AI-native document management, shipped across 5 phases (migrations 0043–0046, see `docs/BUSINESS_WORKSPACE_PLAN.md`):
  - Phase 0: Brand Kit (`business_profiles`), Jinja2 + Playwright rendering pipeline, quotation/invoice generation, `document_templates`
  - Phase 1: status lifecycle (draft→generated→sent→viewed→downloaded→accepted/rejected/expired/paid→archived), one-click quotation→invoice→receipt conversion, WhatsApp PDF delivery, version history, Business Timeline (`GET /api/contacts/:id/business-timeline`)
  - Phase 2: conversational AI generation (`POST /api/documents/ai-generate`), AI Document Memory (`contact_insights.source_document_id`), `documents.ai_summary`, quality checker, derived business-stage label, Inbox AI Action card
  - Phase 3: per-document AI chat assistant, `create_document` autonomous-agent tool, scheduled/recurring documents, expiring-quotation/overdue-invoice follow-ups via `proactive_queue`, Advisor `[ACTION: generate_document]` tag
  - Phase 4: semantic document search (`documents.embedding`), view tracking via `share_token`-scoped public links, a documents signal in the Relationship Engine health score, "AI Compares Documents" insights, pricing benchmarks (`business_facts.category = 'pricing_benchmark'`), Automatic Business Packs (`document_pack_runs`)

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

**Design tokens (Tailwind):** superseded by the **Design System** section above — that section is the current source of truth (gradient backgrounds, radius scale, tinted shadows, icon chips, tab bars). The two still-accurate baseline rules from the original audit:
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
