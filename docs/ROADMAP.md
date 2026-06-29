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
| 3 — AI Intelligence Core | ✅ Complete (audio transcription remaining) |
| 4 — Web Dashboard (Full UI) | ✅ Complete — all 17 pages production-ready |
| 5 — Temporal Intelligence Engine | ✅ Complete |
| 6 — World Knowledge Engine | ✅ Complete |
| 7 — Production Deployment (ECS) | 🔄 Running at 47.84.205.81:5500 — SSL + CD pipeline remaining |
| 8 — Autonomous Agent Engine | ⏳ Planned |
| 9 — Business Intelligence Engine | ⏳ Planned |
| 10 — Enterprise Features | ⏳ Planned |
| — Historical Sync + First Impression | ✅ Complete |
| — Auto Response Engine | ✅ Complete |
| — Global WA Status System | ✅ Complete |
| — Kotlin Companion App | ✅ Complete |
| — React Native Mobile | 🔄 Scaffold done |

---

## Phase 1 — Foundation ✅

**Goal:** Local dev environment running end-to-end with skeleton services and the full database schema in place.

- [x] Monorepo scaffold (Turborepo + npm workspaces)
- [x] Root `package.json` and `turbo.json`
- [x] `docker-compose.yml` — Postgres 16 + pgvector, Redis 7
- [x] `packages/shared-types` — TypeScript types for queue jobs, API shapes, enums
- [x] Database migrations — initial 28 tables (0001–0020)
- [x] API service skeleton (Fastify 5, JWT auth middleware, health endpoint, auth routes)
- [x] WhatsApp service skeleton (Fastify, health endpoint)
- [x] Intelligence service skeleton (FastAPI, health endpoint)
- [x] Environment variable setup (`.env.example` per service)
- [x] Turborepo dev pipeline runs all services concurrently

---

## Phase 2 — WhatsApp Integration ✅

**Goal:** A user can connect their WhatsApp via QR code. Incoming messages are ingested and stored.

- [x] Baileys (@whiskeysockets/baileys) session manager — spawn instance per user
- [x] QR code generation and storage to DB; frontend polls for display
- [x] Link code authentication as alternative to QR scanning
- [x] Session persistence — `useMultiFileAuthState` stores credentials to Docker volume `wa_sessions`; `restoreAll()` on service restart
- [x] Session health watchdog — auto-restart on disconnect
- [x] Inbound message normalisation — map Baileys events to `messages` schema
- [x] `messaging-history.set` event handler — captures historical messages on initial connect (First Impression Mode)
- [x] Message persistence — write conversations and messages to DB
- [x] `messages.incoming` BullMQ job on every new message (with `isHistorical` flag for historical messages)
- [x] Media handling — store audio/image URLs, queue transcription jobs
- [x] Outbound send — consume `messages.send` jobs, call Baileys `sendMessage()`
- [x] API endpoints: `/api/whatsapp/connect`, `/api/whatsapp/status`
- [x] Redis pub/sub events: `whatsapp:qr:{userId}`, `whatsapp:connected:{userId}`, `whatsapp:disconnected:{userId}`
- [x] Companion relay endpoint: `POST /api/companion/message`

---

## Phase 3 — AI Intelligence Core ✅

**Goal:** Every incoming message gets analysed. Suggested replies are generated and stored. The product becomes useful.

### Intelligence Pipeline
- [x] LiteLLM setup — env-driven model selection (primary: `gemini/gemini-3.5-flash`)
- [x] BullMQ consumer for `messages.incoming` in Python
- [x] Message analysis: sentiment, intent, entities, importance, promises, urgency
- [x] `message_analyses` population with pgvector embedding
- [x] `isHistorical` flag — skips reply generation for historical messages, uses wider batch intervals
- [ ] Audio transcription via Whisper for voice notes

### Profiles & Memory
- [x] `user_communication_profiles` — analyse user's outbound messages to build voice model
- [x] Contact profile bootstrapping — build initial `contact_profiles` on first contact
- [x] Contact insight extraction — atomic observations written to `contact_insights`
- [x] Context snapshot creation — compress message history with pgvector embeddings
- [x] Context retrieval — semantic search to pull relevant past context into prompts
- [x] Nightly context trimming cron

### Suggestion Generation
- [x] Persona resolution — contact-specific → relationship-type → default
- [x] Reply generation — 3 variants per message with tone + reasoning
- [x] Voice matching — replies must sound like the user, not generic AI
- [x] `suggested_replies` population
- [x] `messages.suggestion_ready` → API server → WebSocket push to client

**Exit criteria met:** Incoming WhatsApp message → 3 suggested replies in dashboard within 15 seconds.

---

## Phase 4 — Web Dashboard (Full UI) ✅

**Goal:** The deployed shell becomes a real, usable product.

**Auth & Onboarding**
- [x] Clerk authentication — registration, login, route protection
- [x] Onboarding flow — WhatsApp QR + link code connection with real-time polling
- [x] Mode selection (Personal / Business / Hybrid) during onboarding

**All 17 pages production-ready:**
- [x] `/dashboard` — stats overview, quick actions, recent activity
- [x] `/inbox` — 3-panel desktop / pane-switch mobile; real AI suggestions; approve/edit/send
- [x] `/inbox/queue` — pending AI reply suggestions; approve/edit/skip
- [x] `/contacts` — CRM contact grid; filter/sort/search; lead scores
- [x] `/contacts/[id]` — Contact detail; tabs: Overview/Messages/AI Notes
- [x] `/leads` — Lead pipeline; hot/warm/cold stages; score meter; verbatim WA quotes
- [x] `/relationships` — Relationship health grid; filter by attention/dormant
- [x] `/proactive` — Relationship nudge queue; approve/skip with draft copy
- [x] `/analytics` — KPIs, AI performance, health distribution bars
- [x] `/automation` — Automation rules list; toggle enable/disable
- [x] `/advisor` — Full-height AI chat; suggested prompts when empty
- [x] `/calendar` — Month grid; day event list; AI-extracted events
- [x] `/notifications` — All/unread filter; mark read; type badges
- [x] `/billing` — Plan card; usage bars; plan comparison table
- [x] `/settings` — Account/Workspace/AI Engines/Privacy/Auto Responses tabs
- [x] `/profile` — User card; WA status; quick nav links
- [x] `/diagnostics` — 7 connection checks; config snapshot; Historical Sync card

**Mobile-first:**
- [x] Bottom tab bar (mode-aware: Personal / Business / Hybrid)
- [x] Mobile top bar with hamburger menu + WA status dot on logo
- [x] All pages fully responsive

**Exit criteria met:** User can sign up, connect WhatsApp, see live messages with suggestions, approve a reply, view relationship health, manage settings — all from the browser.

---

## Phase 5 — Temporal Intelligence Engine ✅

**Goal:** Replace the single daily cron with per-relationship clocks.

- [x] Cadence learning — analyse message timestamps per contact, build timing model
- [x] Per-relationship clock configuration (auto-learned + manually overridable)
- [x] Deviation detection — background process runs every 15 minutes
- [x] Clock types: daily_checkin, weekly_touchpoint, dormancy_watch, post_event_followup
- [x] "Good morning" / "good night" engine for close relationships
- [x] Spontaneous moment injection — casual content at organic moments
- [x] `temporal.clock_check` queue job (runs every 15 min)
- [x] Relationship health recalculation on each interaction
- [x] Health trend alerts — notify when relationship health drops sharply

---

## Phase 6 — World Knowledge Engine ✅

**Goal:** The intelligence layer has live awareness of world events.

- [x] Web search integration (Tavily / SerpAPI)
- [x] News feed indexing — hourly, cached in Redis
- [x] Contact interest tag extraction from profiles
- [x] Interest-to-story matcher — flags relevant news per contact
- [x] Proactive queue injection — "thought of you" drafts triggered by news match
- [x] Live query tool — web search called during reply generation for factual questions
- [x] Financial data integration — stock/crypto alerts for relevant contacts
- [x] Sports results watcher

---

## Phase 7 — Production Deployment (ECS) 🔄

**Goal:** Full backend running on Alibaba ECS. Accessible at a real domain. Deployments automated.

- [x] `docker-compose.prod.yml` — production Docker Compose config (api + whatsapp + intelligence + redis + nginx)
- [x] Nginx config — routing, WebSocket support
- [x] Environment variable management on ECS (host `.env` at `/opt/zuri/.env`)
- [x] Backend running at `47.84.205.81:5500`; web app deployed on Vercel
- [ ] Let's Encrypt SSL via Certbot (ECS backend currently HTTP only)
- [ ] GitHub Actions CD — automated deploy on push to `main`
- [ ] Database backup — daily pg_dump to Alibaba OSS
- [ ] Monitoring — Uptime Robot (health endpoints), Sentry (error tracking)
- [ ] Log aggregation — structured logs from all services

---

## Historical Sync + First Impression Intelligence ✅

**Goal:** The product aggressively populates itself from existing WhatsApp history on day one.

- [x] `messaging-history.set` Baileys event — captures historical messages on initial connect
- [x] Manual Historical Intelligence Sync via Diagnostics page — re-analyses all stored messages
- [x] `isHistorical` flag on BullMQ jobs — skips reply suggestions, uses batch AI intervals
- [x] History sync API: `POST /api/admin/history-sync/start`, `GET /api/admin/history-sync/status`, `POST /api/admin/history-sync/cancel`
- [x] `sync_jobs` table — tracks per-user sync progress with conversation/message/contact/lead/insight counters
- [x] Progress UI in Diagnostics page — live 2s polling, progress bar, stats grid, cancel button
- [x] Within 10–20 min of first connect: full CRM, profiles, leads, pipeline populated from history

---

## Auto Response Engine ✅

**Goal:** AI can send replies automatically based on configurable rules, with business hours and approval modes.

- [x] `auto_response_settings` table — per-user settings (one row)
- [x] Settings API: `GET /api/settings/auto-response`, `PUT /api/settings/auto-response`
- [x] Auto Responses tab in Settings page — full configuration UI
- [x] Business hours configuration (start/end time, active days, timezone)
- [x] Three approval modes: auto / preview / manual (off by default)
- [x] Conversation type filtering (leads, customers, new contacts; skip groups/broadcasts)
- [x] Escalation keywords + notify email
- [x] Greeting and away message templates
- [x] Learning toggles (smart follow-up, learn from corrections)

---

## Global WA Status System ✅

**Goal:** App displays data from DB even when WhatsApp is disconnected. Connection status visible everywhere.

- [x] `useWAStatus` hook — polls `/api/whatsapp/status` at 8s (transitional) / 30s (stable) intervals
- [x] Sidebar status widget — replaces "Connect WhatsApp" button when status is known
  - Connected: green dot + phone number + Manage link
  - Connecting/QR pending/link code: amber spinner + context text + /onboarding link
  - Error: red WifiOff icon + "Tap to reconnect"
  - Disconnected: grey WifiOff + "Reconnect WhatsApp"
  - Unknown: original "Connect WhatsApp" CTA
- [x] Mobile top bar: coloured dot on Zuri logo (green glow / amber pulse / red / grey)
- [x] No data gating on WA connection — all pages read from DB directly

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
