# Roadmap

## Build Priority

1. **AI Intelligence Core** — the pipeline that turns raw messages into suggestions.
2. **Web Dashboard Full UI** — 30+ pages across Personal, Business, ERP, Documents, and Career OS.
3. **Temporal + World Knowledge Engines** — proactive relationship clocks and live context.
4. **Production Deployment** — live on ECS (`47.84.205.81:5500`) and Vercel.
5. **Autonomous Agent Engine & Knowledge Brain** — workforce automation, document chunking & AI discovery.
6. **Business Intelligence Platform** — Executive Health Score (0-100), 11 analytics sub-dashboards.
7. **Business Workspace & Operations ERP** — 15 document types, Sales/Purchase orders, Bill of Materials, inventory tracking, E-Signatures.
8. **Shared Team Inbox & Organization Scoping** — Clerk Organizations integration, seat limits, active conversation locking.
9. **Bring Your Own Key (BYOK)** — user-provided AI models (Anthropic, OpenAI, Gemini, DashScope).
10. **Career OS & CV Studio** — scraped job workspace, readiness checklists, cover letters, resume studio.

See `docs/NEXT_PHASE.md` for detailed implementation tasks for the active phases.

---

## Status Overview

| Phase / Component | Status |
|-------------------|--------|
| 1 — Foundation | ✅ Complete |
| 2 — WhatsApp Integration | ✅ Complete |
| 3 — AI Intelligence Core | ✅ Complete |
| 4 — Web Dashboard (30+ Pages UI) | ✅ Complete |
| 5 — Temporal Intelligence Engine | ✅ Complete |
| 6 — World Knowledge Engine | ✅ Complete |
| 7 — Production Deployment (ECS) | ✅ Running at 47.84.205.81:5500 |
| 8 — Autonomous Agent Engine & Workforce | ✅ Complete |
| 9 — Business Intelligence & Executive Platform | ✅ Complete |
| — Business Workspace & Documents (15 types) | ✅ Complete |
| — Brand Studio & Operations ERP | ✅ Complete |
| — Business ERP Sales Engine & Bill of Materials | ✅ Complete |
| — E-Signatures & Auto-Dunning | ✅ Complete |
| — Knowledge Base & AI Discovery Engine | ✅ Complete |
| — Bring Your Own Key (BYOK) | ✅ Complete |
| — Shared Team Inbox & Organization Workspace Scoping | ✅ Complete |
| — Career OS & CV Studio | ✅ Complete |
| 10 — Production Polish | 🔄 Active |
| 11 — Enterprise Features | 🔄 Active |
| — Kotlin Companion App | ✅ Complete |
| — React Native Mobile | 🔄 Scaffold done |

---

## Phase Summary & Accomplishments

### Phase 1 — Foundation ✅
- Monorepo scaffold (Turborepo + npm workspaces)
- Supabase PostgreSQL 16 + pgvector, Redis 7
- Shared types package (`@zuri/types`)
- API service (Fastify 5, JWT auth)
- WhatsApp service (Baileys session manager)
- Intelligence service (FastAPI + LiteLLM)

### Phase 2 — WhatsApp Integration ✅
- Baileys WebSocket session manager per user
- QR code & 8-digit link code pairing
- Session persistence (`useMultiFileAuthState`)
- First Impression Mode: historical message capture (`messaging-history.set`)
- Media handling & transcription infrastructure
- Outbound message send queue (`messages.send`)

### Phase 3 — AI Intelligence Core ✅
- LiteLLM provider-agnostic model routing
- Inbound message analysis (sentiment, intent, entities, urgency)
- Vector embeddings (`pgvector`) for messages & context snapshots
- Communication profiles & contact insights
- Tone personas & voice-matched reply suggestions

### Phase 4 — Web Dashboard (30+ Pages UI) ✅
- Clerk authentication & Clerk Organizations team integration
- Mode selection (Personal / Business / Hybrid)
- 30+ production-ready dashboard & admin routes
- Mobile-first bottom tab bar and responsive top bar
- Global WA status indicator widget

### Phase 5 — Temporal Intelligence Engine ✅
- Per-relationship clocks & cadence learning
- Deviation detection (runs every 15 minutes)
- "Good morning / good night" awareness
- Spontaneous moment injection
- Relationship health scoring & trend alerts

### Phase 6 — World Knowledge Engine ✅
- Web search integration (Tavily / SerpAPI)
- Contact interest tag matching
- News-driven proactive outreach suggestions
- Live factual query search during reply generation

### Phase 7 — Production Deployment (ECS) ✅
- Docker Compose production config on Alibaba Cloud ECS
- Nginx reverse proxy on port `5500`
- Web dashboard auto-deploy on Vercel

### Business Workspace & Operations ERP ✅
- Brand Kit (`business_profiles`): logo, signature, stamp, bank details
- 15 Document Types: Quotations, Invoices, Receipts, Purchase Orders, Delivery Notes, Credit Notes, Contracts, Proposals, Certificates, Statements of Work, Inspection/Visit reports, Timesheets
- One-click status lifecycle: Quote → Invoice → Receipt
- Business ERP Sales Engine: Sales Orders, Purchase Orders, Inventory Locations, Bill of Materials, Stock Movements
- E-Signatures: Canvas 1:1 pixel accuracy, pointer capture, Bézier stroke smoothing
- Client Portal & View-tracking public link

### Shared Team Inbox & Organization Workspace Scoping ✅
- Shared inbox with active conversation locking
- Collision warning indicators when two team members view/type in the same thread
- Clerk Organizations integration with seat limits and team member assignments
- Database-level `organization_id` workspace scoping

### Bring Your Own Key (BYOK) ✅
- Production BYOK management system
- Secure key encryption & validation endpoints
- Support for custom Anthropic, OpenAI, Gemini, and DashScope/Qwen keys

### Knowledge Base & AI Brain ✅
- Document upload (PDF, Excel, CSV, text) with chunking & OCR
- Vector semantic search (`search_knowledge`)
- Conversational chat with KB (`chat_with_knowledge`)
- AI Knowledge Discovery Engine: extracts candidate facts from conversations for user approval

### Career OS & CV Studio ✅
- Scraped job discovery workspace
- Readiness checklists & skill gap analysis
- AI Cover Letter Studio
- Living Resume & CV Studio with PDF export

---

## Next Priorities (Phase 10 & 11)

1. **SSL Certbot & Automated GitHub Actions CD**
2. **Auto Response Execution Wiring**
3. **Voice Note Audio Transcription (Whisper)**
4. **Sentry Error Monitoring & Automated DB Backups**
5. **Multi-Channel Engine Extensions**
