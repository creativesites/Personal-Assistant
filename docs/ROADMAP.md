# Roadmap

## Build Priority

1. **AI Intelligence Core** — the pipeline that turns raw messages into suggestions. Nothing else works without it.
2. **Web Dashboard Full UI** — make the shell a real product (runs in parallel with #1)
3. **Temporal + World Knowledge Engines** — elevate from reactive to genuinely proactive
4. **Production Deployment** — live on ECS at a real domain
5. **Autonomous Agent Engine** — unlock the Business tier
6. **Business Intelligence Engine** — analytics and reporting for enterprise
7. **React Native Mobile** — mirrors web dashboard on iOS/Android

See `docs/NEXT_PHASE.md` for detailed implementation tasks for the active phases.

---

## Status Overview

| Phase | Status |
|-------|--------|
| 1 — Foundation | ✅ Complete |
| 2 — WhatsApp Integration | ✅ Complete |
| 3 — AI Intelligence Core | 🔄 Active |
| 4 — Web Dashboard (Full UI) | 🔄 Active (scaffold deployed) |
| 5 — Temporal Intelligence Engine | ⏳ Up next |
| 6 — World Knowledge Engine | ⏳ Up next |
| 7 — Production Deployment (ECS) | ⏳ Planned |
| 8 — Autonomous Agent Engine | ⏳ Planned |
| 9 — Business Intelligence Engine | ⏳ Planned |
| 10 — Enterprise Features | ⏳ Planned |
| — Kotlin Companion App | ✅ Complete |
| — React Native Mobile | 🔄 Scaffold done |

---

## Phase 1 — Foundation ✅

**Goal:** Local dev environment running end-to-end with skeleton services and the full database schema in place.

- [x] Monorepo scaffold (Turborepo + npm workspaces)
- [x] Root `package.json` and `turbo.json`
- [x] `docker-compose.yml` — Postgres 16 + pgvector, Redis 7
- [x] `packages/shared-types` — TypeScript types for queue jobs, API shapes, enums
- [x] Database migrations — all 28 tables
- [x] API service skeleton (Fastify 5, JWT auth middleware, health endpoint, auth routes)
- [x] WhatsApp service skeleton (Fastify, health endpoint)
- [x] Intelligence service skeleton (FastAPI, health endpoint)
- [x] Environment variable setup (`.env.example` per service)
- [x] Turborepo dev pipeline runs all services concurrently

---

## Phase 2 — WhatsApp Integration ✅

**Goal:** A user can connect their WhatsApp via QR code. Incoming messages are ingested and stored.

- [x] open-wa session manager — spawn instance per user
- [x] QR code generation and streaming to API server
- [x] Session persistence — save/restore auth to avoid re-scanning
- [x] Session health watchdog — auto-restart on disconnect
- [x] Inbound message normalisation — map open-wa event to `messages` schema
- [x] Message persistence — write conversations and messages to DB
- [x] `messages.incoming` BullMQ job on every new message
- [x] Media handling — store audio/image URLs, queue transcription jobs
- [x] Outbound send — consume `messages.send` jobs, call open-wa
- [x] API endpoints: `/api/whatsapp/connect`, `/api/whatsapp/status`
- [x] WebSocket events: `whatsapp:qr`, `whatsapp:connected`, `message:new`
- [x] Companion relay endpoint: `POST /api/companion/message`

---

## Phase 3 — AI Intelligence Core 🔄

**Goal:** Every incoming message gets analysed. Suggested replies are generated and stored. The product becomes useful.

### Intelligence Pipeline
- [ ] LiteLLM setup — Anthropic + OpenAI, env-driven model selection
- [ ] BullMQ consumer for `messages.incoming` in Python
- [ ] Message analysis: sentiment, intent, entities, importance, promises, urgency
- [ ] `message_analyses` population with pgvector embedding
- [ ] Audio transcription via Whisper for voice notes

### Profiles & Memory
- [ ] `user_communication_profiles` — analyse user's outbound messages to build voice model
- [ ] Contact profile bootstrapping — build initial `contact_profiles` on first contact
- [ ] Contact insight extraction — atomic observations written to `contact_insights`
- [ ] Context snapshot creation — compress message history with pgvector embeddings
- [ ] Context retrieval — semantic search to pull relevant past context into prompts
- [ ] Nightly context trimming cron

### Suggestion Generation
- [ ] Persona resolution — contact-specific → relationship-type → default
- [ ] Reply generation — 3 variants per message with tone + reasoning
- [ ] Voice matching — replies must sound like the user, not generic AI
- [ ] `suggested_replies` population
- [ ] `messages.suggestion_ready` → API server → WebSocket push to client

**Exit criteria:** Incoming WhatsApp message → 3 suggested replies in dashboard within 15 seconds.

---

## Phase 4 — Web Dashboard (Full UI) 🔄

**Goal:** The deployed shell becomes a real, usable product. Currently the pages exist but show no live data.

**Auth & Onboarding** (partially done — Clerk auth working)
- [x] Clerk authentication — registration, login, route protection
- [ ] Onboarding flow — persona setup, QR connection, history import progress
- [ ] First-run experience

**Inbox**
- [ ] Conversation list — unread counts, health indicators, last message preview
- [ ] Message thread view — WhatsApp-style bubbles, real-time updates via Socket.io
- [ ] Suggestion panel — 3 cards with tone + reasoning, approve / edit / reject
- [ ] "Regenerate" — request new suggestions with different tone
- [ ] Contact context sidebar — relationship summary, top insights, health score

**Relationships**
- [ ] Contact list with health scores, trend arrows, last contact date
- [ ] Contact detail page — profile, insights, event timeline, 90-day health chart
- [ ] Relationship type and importance tier editing
- [ ] Manual notes

**Proactive Queue**
- [ ] Suggestion feed with context and drafted messages
- [ ] Approve / snooze / dismiss actions
- [ ] Badge count in nav

**AI Advisor**
- [ ] Chat interface — context-aware AI conversation
- [ ] Can reference specific contacts by name
- [ ] Conversation history

**Settings**
- [ ] Persona management
- [ ] Notification preferences and quiet hours
- [ ] WhatsApp connection management
- [ ] Contact dormancy thresholds

**Billing**
- [ ] Stripe checkout — subscription plans
- [ ] Plan management and usage display

**Exit criteria:** User can sign up, connect WhatsApp, see live messages with suggestions, approve a reply, view relationship health, manage settings — all from the browser.

---

## Phase 5 — Temporal Intelligence Engine ⏳

**Goal:** Replace the single daily cron with per-relationship clocks. The system becomes genuinely proactive based on each relationship's unique rhythm.

- [ ] Cadence learning — analyse message timestamps per contact, build timing model
- [ ] Per-relationship clock configuration (auto-learned + manually overridable)
- [ ] Deviation detection — background process runs every 15 minutes
- [ ] Clock types: daily_checkin, weekly_touchpoint, dormancy_watch, post_event_followup
- [ ] "Good morning" / "good night" engine for close relationships
- [ ] Spontaneous moment injection — casual content at organic moments (jokes, shared articles, memes)
- [ ] `temporal.clock_check` queue job (runs every 15 min)
- [ ] Relationship health recalculation on each interaction
- [ ] Health trend alerts — notify when a relationship health drops sharply

**Exit criteria:** System proactively surfaces relationship maintenance opportunities without user prompting, timed to each relationship's natural rhythm.

---

## Phase 6 — World Knowledge Engine ⏳

**Goal:** The intelligence layer has live awareness of world events and can connect external information to specific relationships.

- [ ] Web search integration (Tavily API or SerpAPI)
- [ ] News feed indexing — hourly, cached in Redis
- [ ] Contact interest tag extraction from profiles
- [ ] Interest-to-story matcher — flags relevant news per contact
- [ ] Proactive queue injection — "thought of you" drafts triggered by news match
- [ ] Live query tool — web search called during reply generation for factual questions
- [ ] Financial data integration — stock/crypto alerts for relevant contacts
- [ ] Sports results watcher

**Exit criteria:** System surfaces at least one world-knowledge-driven proactive suggestion per active day.

---

## Phase 7 — Production Deployment (ECS) ⏳

**Goal:** Full backend running on Alibaba ECS. Accessible at a real domain. Deployments automated.

- [ ] `docker-compose.prod.yml` — production Docker Compose config
- [ ] Nginx config — SSL termination, WebSocket support, rate limiting
- [ ] Let's Encrypt SSL via Certbot
- [ ] GitHub Actions CD — build + push images to Alibaba Container Registry → SSH deploy on push to `main`
- [ ] Environment variable management on ECS (Alibaba KMS or host `.env`)
- [ ] Database backup — daily pg_dump to Alibaba OSS
- [ ] Monitoring — Uptime Robot (health endpoints), Sentry (error tracking)
- [ ] Log aggregation — structured logs from all services

**Exit criteria:** System live at a real domain. CI runs on every PR. Deployment is one push.

---

## Phase 8 — Autonomous Agent Engine ⏳

**Goal:** Users can activate AI agents that handle conversations without requiring approval on every message. Business tier differentiator.

- [ ] Agent configuration UI: create agent, set role, permission boundaries, assign to contacts/segments
- [ ] Sales Agent: qualification, objection handling, meeting booking integration
- [ ] Support Agent: FAQ matching against knowledge base, ticket creation, escalation
- [ ] Community Manager Agent: group content scheduling, moderation flagging
- [ ] Knowledge Engine: upload PDFs, websites, Notion — chunked, embedded, searchable
- [ ] Escalation rules engine: detect frustration / out-of-scope / explicit human request → pause → notify
- [ ] "Requires Human Attention" folder
- [ ] Autonomous action audit log
- [ ] Trust level configuration per relationship (Observe → Suggest → Assisted → Delegated → Autonomous)

**Exit criteria:** Activate support agent on a segment of contacts. Customer sends a FAQ-type message. Agent responds autonomously within 30 seconds. Sends a frustration-trigger. Agent escalates to human inbox immediately.

---

## Phase 9 — Business Intelligence Engine ⏳

**Goal:** Analytics that prove Zuri's ROI and give managers actionable operational insights.

- [ ] Analytics dashboard in web app
- [ ] Conversation funnel (lead → qualified → opportunity → closed)
- [ ] Agent performance metrics (response time, resolution rate, CSAT)
- [ ] AI suggestion acceptance rate
- [ ] Revenue attribution — link closed deals to conversation threads
- [ ] Proactive impact report — monthly automated digest
- [ ] Custom report builder (drag-and-drop metrics)
- [ ] CSV / PDF export

---

## Phase 10 — Enterprise Features ⏳

**Goal:** Features that unlock $500+/month contracts.

- [ ] Shared team inbox — multi-agent, collision detection, @mention internal notes
- [ ] RBAC — custom roles, data scoping by team/region, immutable audit log
- [ ] Customer consent management — GDPR opt-in/opt-out tracking per contact
- [ ] Data retention policies — configurable auto-deletion of raw message content
- [ ] Bring Your Own AI Key (BYOK) — plug in own Anthropic/OpenAI contract
- [ ] Official WhatsApp Business API option (via 360dialog / Twilio) — same dashboard, compliant channel
- [ ] White-labeling — custom domain, logo, brand voice lock
- [ ] Broadcast + segmentation engine — AI-tagged segments, personalised bulk sends
- [ ] CRM integration — HubSpot, Salesforce, Pipedrive (bi-directional)
- [ ] Webhook engine — custom "if this, then that" rules
- [ ] Public REST API — rate-limited, for custom integrations
- [ ] Zapier / Make integration

---

## Future — Multi-Channel Engine

Beyond WhatsApp:

- Instagram DMs
- Facebook Messenger
- Telegram
- SMS
- Email
- LinkedIn (read-only analysis)

One relationship, all channels. The same intelligence layer processes every message source. Long-term vision: Zuri becomes channel-agnostic.
