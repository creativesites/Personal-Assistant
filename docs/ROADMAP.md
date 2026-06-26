# Roadmap

## Build Priority

1. Backend services (API, WhatsApp, Intelligence, DB)
2. Next.js web dashboard — full-featured product surface
3. Kotlin companion app — Android background notification relay
4. React Native mobile app — mirrors web dashboard

Web dashboard and backend are the product. Mobile comes after.

---

## Phase 1 — Foundation

**Goal:** Local dev environment running end-to-end with skeleton services and the full database schema in place.

- [ ] Monorepo scaffold (Turborepo + pnpm workspaces)
- [ ] Root `package.json` and `turbo.json`
- [ ] `docker-compose.yml` — Postgres 16 + pgvector, Redis 7
- [ ] `packages/shared-types` — TypeScript types for queue jobs, API shapes, enums
- [ ] Database migrations — all 28 tables from schema
- [ ] API service skeleton (Fastify, health endpoint, JWT auth middleware)
- [ ] WhatsApp service skeleton (Fastify, health endpoint)
- [ ] Intelligence service skeleton (FastAPI, health endpoint)
- [ ] Environment variable setup (`.env.example` per service)
- [ ] Turborepo `dev` pipeline runs all services concurrently

**Exit criteria:** `pnpm dev` starts all services. `pnpm db:migrate` runs cleanly. Health endpoints return 200.

---

## Phase 2 — WhatsApp Integration

**Goal:** A user can connect their WhatsApp via QR code. Incoming messages are ingested and stored.

- [ ] open-wa session manager — spawn instance per user
- [ ] QR code generation and streaming to API server
- [ ] Session persistence — save/restore auth to avoid re-scanning
- [ ] Session health watchdog — auto-restart on disconnect
- [ ] Inbound message normalisation — map open-wa event to `messages` schema
- [ ] Message persistence — write conversations and messages to DB
- [ ] `messages.incoming` BullMQ job on every new message
- [ ] Media handling — store audio/image URLs, queue transcription jobs
- [ ] Outbound send — consume `messages.send` jobs, call open-wa
- [ ] API endpoint: `POST /api/whatsapp/connect` — initiate QR flow
- [ ] API endpoint: `GET /api/whatsapp/status` — instance health
- [ ] WebSocket event: `whatsapp:qr` — stream QR to client
- [ ] WebSocket event: `whatsapp:connected` — session established
- [ ] WebSocket event: `message:new` — push incoming message to client

**Exit criteria:** Connect a real WhatsApp number via QR. Send a message to it from another phone. The message appears in the database and a WebSocket event fires.

---

## Phase 3 — AI Intelligence Core

**Goal:** Every incoming message gets analysed. Suggested replies are generated and stored.

- [ ] LiteLLM setup — config for Anthropic + OpenAI, env-driven model selection
- [ ] Audio transcription — Whisper API integration for voice notes
- [ ] Message analysis pipeline — sentiment, intent, entities, importance, urgency
- [ ] `message_analyses` population
- [ ] Contact profile bootstrap — on first history import, build initial `contact_profiles`
- [ ] `user_communication_profiles` — analyse user's outbound messages to build voice model
- [ ] Persona resolution — select correct persona for contact (contact-specific → relationship-type → default)
- [ ] Context snapshot retrieval — pgvector semantic search for relevant past context
- [ ] Suggested reply generation — 3 variants per message, tone + reasoning included
- [ ] `suggested_replies` population
- [ ] `messages.suggestion_ready` job → API server → WebSocket push to client
- [ ] Contact insight extraction — atomic AI observations written to `contact_insights`
- [ ] Context snapshot trimming — cron-triggered compression of old message history

**Exit criteria:** Incoming message triggers analysis. `message_analyses` row created. Three `suggested_replies` rows created. WebSocket event fires to client within ~10 seconds.

---

## Phase 4 — Web Dashboard

**Goal:** The full product is usable via the web dashboard.

### Auth & Onboarding
- [ ] NextAuth setup — email/password + Google OAuth
- [ ] Registration + email verification
- [ ] Onboarding flow — persona setup, first contact import
- [ ] QR code connection UI — scan to link WhatsApp
- [ ] History import progress indicator

### Inbox
- [ ] Conversation list with unread counts and health indicators
- [ ] Message thread view
- [ ] Suggested reply panel — show suggestion, tone, reasoning
- [ ] Approve / edit / reject reply actions
- [ ] "Ask AI for alternatives" — request regeneration with different tone
- [ ] Contact context sidebar — relationship summary, recent insights

### Relationship Dashboard
- [ ] Contact list with health scores and trend indicators
- [ ] Contact detail page — profile, insights, event timeline, health history chart
- [ ] Relationship type and importance tier editing
- [ ] Manual notes on contacts

### Proactive Queue
- [ ] Daily suggestions feed (the "morning coffee" view)
- [ ] Approve / snooze / dismiss actions
- [ ] Draft message preview with one-click approve

### AI Advisor
- [ ] Chat interface for direct AI conversations
- [ ] Context-aware — can reference specific contacts or conversations
- [ ] Session history

### Calendar
- [ ] Calendar view (month / week)
- [ ] Event list with contact links
- [ ] Create / edit calendar events
- [ ] Reminder configuration

### Settings
- [ ] Auto-reply rules builder
- [ ] Persona management (create, edit, assign to contacts)
- [ ] Notification preferences (quiet hours, priority threshold)
- [ ] Contact tier and dormancy settings

### Billing
- [ ] Stripe checkout — subscription plans
- [ ] Plan management and cancellation
- [ ] Usage display

**Exit criteria:** A user can sign up, connect WhatsApp, see incoming messages with suggestions, approve a reply, view their relationship dashboard, and manage settings — all from the web browser.

---

## Phase 5 — Proactive System

**Goal:** The system proactively surfaces relationship maintenance opportunities without user prompting.

- [ ] Daily proactive cron — runs at 08:00 per user timezone
- [ ] Dormant relationship detection — flag contacts past `dormancy_alert_days`
- [ ] Event extraction pipeline — mine conversations for birthdays, deadlines, life events
- [ ] Promise / commitment tracking — extract from `message_analyses.promises_detected`
- [ ] Proactive queue population with priority scoring
- [ ] Push notifications for high-priority proactive suggestions
- [ ] Relationship health score recalculation on each interaction
- [ ] Health trend alerts — notify user when a relationship health drops sharply

**Exit criteria:** After 48 hours of data, the system surfaces at least one proactive suggestion without the user asking.

---

## Phase 6 — Production Deployment

**Goal:** System running on Alibaba ECS + Vercel, accessible at a real domain.

- [ ] `docker-compose.prod.yml` — production Docker Compose config
- [ ] Nginx config — SSL termination, routing, rate limiting
- [ ] Let's Encrypt SSL setup
- [ ] GitHub Actions CI — lint, typecheck, test on PR
- [ ] GitHub Actions CD — deploy to ECS on merge to main
- [ ] Vercel project setup — auto-deploy web app
- [ ] Environment variable management on ECS
- [ ] Monitoring — basic uptime checks, error alerting
- [ ] Database backup schedule

**Exit criteria:** System live at a real domain. CI runs on every PR. Deployment is automated.

---

## Phase 7 — Kotlin Companion App

**Goal:** Android background app that relays WhatsApp notifications to the system — enables mobile-only tier and provides open-wa fallback.

- [ ] `NotificationListenerService` setup
- [ ] WhatsApp notification parsing — extract sender, message preview
- [ ] API integration — POST to `/api/companion/message` on each notification
- [ ] Reply via notification action — consume pre-generated suggestions
- [ ] Session token for device auth
- [ ] APK build + distribution via web dashboard download link

**Exit criteria:** Install app on Android phone. When a WhatsApp message arrives, the notification content appears in the system within 5 seconds, without open-wa running.

---

## Phase 8 — React Native Mobile App

**Goal:** Full-featured mobile app mirroring the web dashboard.

- [ ] Expo bare workflow setup
- [ ] Auth flow
- [ ] Inbox with suggested replies
- [ ] Relationship dashboard
- [ ] Proactive queue view
- [ ] AI Advisor chat
- [ ] Calendar
- [ ] Push notification integration (Expo Notifications)
- [ ] Settings

**Exit criteria:** All web dashboard features available on iOS and Android.

---

## Current Status

**Active phase:** Phase 1 — Foundation

| Phase | Status |
|-------|--------|
| 1 — Foundation | In progress |
| 2 — WhatsApp Integration | Not started |
| 3 — AI Intelligence Core | Not started |
| 4 — Web Dashboard | Not started |
| 5 — Proactive System | Not started |
| 6 — Production Deployment | Not started |
| 7 — Kotlin Companion App | Not started |
| 8 — React Native Mobile | Not started |
