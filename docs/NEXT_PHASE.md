# Next Phase — Implementation Plan

## Current State (as of 2026-06-28)

### What Exists and Works
- ✅ Full monorepo, Vercel deployment live
- ✅ PostgreSQL 28-table schema with pgvector (Supabase managed)
- ✅ WhatsApp service: whatsapp-web.js (Puppeteer + Chromium), QR auth, session persistence via LocalAuth + Docker volume `wa_sessions`, message ingestion → DB + BullMQ queue
- ✅ Clerk authentication on web app (deployed and working)
- ✅ Onboarding page: WhatsApp connection flow with real-time polling (2s interval), QR display, error recovery
- ✅ Web dashboard: Inbox, Relationships, Proactive, Settings pages wired to live API
- ✅ Intelligence service: full pipeline running — message analysis, reply generation (3 variants), contact profiler, voice builder, cadence learner, health calculator, temporal worker, world knowledge worker
- ✅ End-to-end suggestion pipeline: `messages.incoming` → analysis → `suggested_replies` → `messages.suggestion_ready` → Socket.io push → browser
- ✅ ECS production deployment: api + whatsapp + intelligence + redis + nginx at `47.84.205.81:5500`
- ✅ Kotlin companion app: NotificationListenerService → API relay
- ✅ React Native mobile scaffold: navigation, auth, typed API client

### What Remains Before the Product Is Fully Polished
The core intelligence pipeline is operational. The main remaining gaps are:

**Web Dashboard:**
- Contact detail page (full profile view, insights, health chart)
- Inbox conversation thread view with suggestion panel
- Proactive queue UI refinement

**Production Infrastructure:**
- SSL on ECS backend (currently HTTP only at port 5500)
- GitHub Actions CD (currently deploying manually)
- Database backups and monitoring

**Intelligence:**
- Audio transcription (voice notes unhandled)
- Opportunity detection engine (not implemented)
- Learning & optimization engine (not implemented)

---

## Phase 3 — AI Intelligence Core

**Goal:** Every incoming WhatsApp message triggers analysis, a suggested reply appears in the web inbox within 10–15 seconds, and the contact's profile begins accumulating insights.

This is the single highest-leverage phase. Everything the user sees in the dashboard depends on it.

### 3.1 — LiteLLM Setup & Model Configuration

- [ ] Install LiteLLM in `services/intelligence`
- [ ] `config.py` — model routing: fast model (GPT-4o-mini / Haiku) for quick analysis, smart model (Claude Sonnet / GPT-4o) for reply generation
- [ ] Environment-driven model selection (swap providers without code changes)
- [ ] Cost tracking wrapper — log token usage per job to DB for billing/monitoring
- [ ] Retry logic with exponential backoff on provider errors

**Models to configure:**
- Analysis (fast + cheap): `claude-haiku-4-5` or `gpt-4o-mini`
- Reply generation (quality): `claude-sonnet-4-6` or `gpt-4o`
- Embeddings: `text-embedding-3-small` (OpenAI) or `voyage-3` (Anthropic)
- Audio transcription: `whisper-1` (OpenAI)

---

### 3.2 — Message Analysis Pipeline

The `messages.incoming` queue consumer. Runs on every new message.

- [ ] BullMQ consumer in Python (using `bullmq` Python client or a Redis-native approach)
- [ ] **Sentiment analysis:** positive / negative / neutral + score (-1 to 1)
- [ ] **Emotion detection:** joy, anger, sadness, fear, surprise, love, frustration (array with scores)
- [ ] **Intent classification:** question, statement, request, complaint, compliment, update, farewell, greeting, buying_signal, objection
- [ ] **Entity extraction:** names, dates, places, products, amounts, commitments made
- [ ] **Importance scoring:** 0–10, factoring in relationship tier, urgency markers, time-sensitivity
- [ ] **Requires response flag:** boolean + urgency (immediate / today / this week / no rush)
- [ ] **Promises detection:** extract commitments made by either party
- [ ] Write `message_analyses` row
- [ ] Generate and store embedding for the message (pgvector)

**Pydantic schema for analysis output:**
```python
class MessageAnalysis(BaseModel):
    sentiment: str
    sentiment_score: float
    emotions: list[EmotionScore]
    intent: list[str]
    entities: dict
    importance_score: int
    requires_response: bool
    response_urgency: str
    promises_detected: list[Promise]
    embedding: list[float]
```

---

### 3.3 — User Voice Model

Before generating any suggested replies, the system must understand how the user writes.

- [ ] `user_communication_profiles` population job
- [ ] Analyse the user's outbound message history (last 200 messages minimum)
- [ ] Extract: average message length, punctuation style, emoji frequency, vocabulary patterns, formality level, opener/closer patterns
- [ ] Build a "voice profile" prompt fragment used in all reply generation
- [ ] Trigger: run on first message ingestion for a new user; refresh weekly

---

### 3.4 — Contact Profile Bootstrapping

- [ ] On first message from a contact, create initial `contact_profiles` row
- [ ] Seed with: display name, relationship type, conversation history summary (last 50 messages)
- [ ] Background job: `analysis.bootstrap_contact_profile` — deeper analysis after 10+ messages
- [ ] Extract `contact_insights`: communication style, response patterns, known interests, recurring topics
- [ ] Store insights as atomic rows in `contact_insights` table

---

### 3.5 — Context Snapshot Management

Critical for token efficiency. Replaces raw message history in prompts.

- [ ] `context_snapshots` creation: when a conversation exceeds 50 messages, compress to a summary
- [ ] Summary includes: key topics discussed, relationship dynamics observed, commitments made, emotional patterns, recent context
- [ ] Generate embedding for the snapshot (for semantic retrieval)
- [ ] Context retrieval function: given a new message, fetch the most relevant snapshots via pgvector cosine similarity
- [ ] `analysis.trim_context` cron: runs nightly, compresses old message history

---

### 3.6 — Persona Resolution

- [ ] Default persona: "default" — mirrors the user's voice, casual tone
- [ ] Persona selection hierarchy: contact-specific persona → relationship-type persona → default
- [ ] Persona prompt: defines tone, formality, emoji usage, opening style, closing style
- [ ] Store personas in `personas` table (already in schema)
- [ ] Bootstrap with 3 default personas: Personal (casual), Professional (formal), Customer Service (warm + efficient)

---

### 3.7 — Suggested Reply Generation

The most visible output of the intelligence service.

- [ ] Trigger: after `message_analyses` is written and `requires_response = true`
- [ ] Context assembly: pull contact profile + latest context snapshot + recent 10 messages
- [ ] Generate **3 reply variants** with distinct tones (e.g., warm / direct / playful)
- [ ] Each variant includes: `suggestion_text`, `tone`, `reasoning` (brief explanation of why this response)
- [ ] Voice matching: apply user communication profile to ensure replies sound like the user
- [ ] Write 3 rows to `suggested_replies`
- [ ] Push `messages.suggestion_ready` job to BullMQ
- [ ] API server consumes `messages.suggestion_ready` → emits `suggestion:ready` Socket.io event to user's room

**Prompt architecture:**
```
System: You are drafting a WhatsApp reply on behalf of [user_name].
  Voice profile: [user_communication_profile.voice_summary]
  
Contact: [contact_name] — [relationship_type]
  Profile: [contact_profile.personality_summary]
  Current mood: [latest_message_analysis.sentiment] / [emotions]
  
Context: [most_relevant_context_snapshot.summary]

Recent conversation:
  [last_10_messages]

Incoming message: "[message_body]"

Draft 3 reply options. Each must sound exactly like [user_name] writes.
Return JSON: [{text, tone, reasoning}]
```

---

### 3.8 — Phase 3 Exit Criteria

1. Send a WhatsApp message to a connected number
2. Within 15 seconds, 3 suggested replies appear in the web dashboard inbox
3. `message_analyses` row exists with populated sentiment, intent, and entities
4. `suggested_replies` table has 3 rows for the message
5. `contact_profiles` row exists for the sender
6. At least one `contact_insights` row exists for the sender

---

## Phase 4 — Web Dashboard (Full UI)

**Goal:** The shell becomes a real product. Users can see messages, review suggestions, approve replies, and browse their relationship health.

This runs in parallel with Phase 3 — UI can be built against mock data first, then wired to live API once Phase 3 is complete.

### 4.1 — Inbox (Core Loop)

- [ ] API: `GET /api/conversations` — list with unread count, last message, health score
- [ ] API: `GET /api/conversations/:id/messages` — message thread with analyses
- [ ] API: `GET /api/conversations/:id/suggestions` — suggested replies for latest message
- [ ] API: `POST /api/suggestions/:id/approve` — approve + send via WhatsApp
- [ ] API: `POST /api/suggestions/:id/reject` — mark rejected
- [ ] API: `POST /api/conversations/:id/regenerate` — request new suggestions with different tone

**UI:**
- [ ] Conversation list (left panel): sorted by last activity, unread badge, health indicator dot
- [ ] Message thread (center): WhatsApp-style bubbles, timestamp, sender avatar
- [ ] Suggestion panel (right): 3 cards with tone label + reasoning, approve/edit/reject buttons
- [ ] Contact context sidebar: relationship summary, top insights, health score mini-chart
- [ ] Real-time updates via Socket.io (new message arrives → thread updates without refresh)

### 4.2 — Onboarding Flow

- [ ] Step 1: Persona setup — 3 questions about communication style or paste example messages
- [ ] Step 2: WhatsApp QR scan — display QR from `/api/whatsapp/connect`, listen for `whatsapp:connected` event
- [ ] Step 3: History import — initiate import of existing conversations, show progress bar
- [ ] Step 4: Done — redirect to inbox

### 4.3 — Relationships Page

- [ ] Contact grid/list with health scores, trend arrows, last contact date
- [ ] Contact detail page: profile summary, insight tags, event timeline, health chart (30/90/365 day)
- [ ] Relationship type and importance tier editor
- [ ] Manual notes field

### 4.4 — Proactive Queue

- [ ] Feed of AI-generated suggestions (dormancy alerts, event acknowledgements, spontaneous moments)
- [ ] Each card: contact name + reason + draft message + approve / snooze / dismiss
- [ ] "Send now" → routes to WhatsApp service
- [ ] Badge count in nav for pending items

### 4.5 — Settings (Basic)

- [ ] Persona management: create, edit, assign to contacts
- [ ] Notification preferences: quiet hours, priority threshold
- [ ] WhatsApp connection status + reconnect button

---

## Phase 5 — Temporal Intelligence Engine

**Goal:** Replace the single 8 AM cron with per-relationship clocks. The system becomes genuinely proactive and personal.

- [ ] `RelationshipClock` model: stores cadence baseline per relationship (auto-learned from history)
- [ ] Cadence learning: analyse message timestamps per contact, build distribution (mean, std dev, peak hours)
- [ ] Deviation detection: background process checks each clock against current time
- [ ] Clock types: daily_checkin, weekly_touchpoint, dormancy_watch, post_event_followup
- [ ] Nudge generation: when clock fires → create `proactive_queue` item with personalized draft
- [ ] Manual override: user can configure clock per contact from relationship settings page
- [ ] "Good morning" engine: for close contacts, detect typical morning text window; if missed, prompt
- [ ] Spontaneous moment injection: randomly draft casual content (joke, meme suggestion, shared article) based on contact's interests profile when timing feels natural

**Queue additions:**
- `temporal.clock_check` — runs every 15 minutes, evaluates all active clocks
- `temporal.nudge_generated` — fires when a clock triggers a new proactive item

---

## Phase 6 — World Knowledge Engine

**Goal:** Give the intelligence layer eyes on the world. Suggestions become contextually aware of real-time events.

- [ ] Tavily API integration (or SerpAPI) for web search
- [ ] News feed indexing: hourly fetch of top stories, cached in Redis
- [ ] Contact interest tags: extracted from profiles (`contact_insights` where `key = 'interests'`)
- [ ] Interest-to-story matcher: background job matches fresh news against contact interest profiles
- [ ] Opportunity injection: when a match is found, add to `proactive_queue` with drafted "thought of you" message
- [ ] Live query tool: when AI generates a reply to a factual question, it can call the search tool mid-generation
- [ ] Financial data: stock/crypto alerts for contacts with investment interests or business clients
- [ ] Sports results watcher: match results against contact sport preferences

**Tool definition for intelligence service:**
```python
tools = [
    {
        "name": "web_search",
        "description": "Search the web for current information",
        "input_schema": {"query": str, "max_results": int}
    },
    {
        "name": "get_stock_price",
        "description": "Get current price for a stock or crypto symbol",
        "input_schema": {"symbol": str}
    }
]
```

---

## Phase 7 — Production Deployment (ECS)

**Goal:** Full backend running on Alibaba Cloud ECS, accessible at a real domain.

- [ ] `docker-compose.prod.yml` with production config (no volume mounts for code, proper restart policies)
- [ ] Nginx config: SSL termination, routing (`/api/*` → API server, WebSocket upgrade headers)
- [ ] Let's Encrypt certificate via Certbot
- [ ] GitHub Actions CD: build images, push to Alibaba Container Registry, SSH deploy to ECS on push to `main`
- [ ] Environment variable management on ECS (use Alibaba KMS or `.env` file on host, never in image)
- [ ] Database backup: daily pg_dump to Alibaba OSS
- [ ] Monitoring: Uptime Robot for health endpoints, Sentry for error tracking in both Node.js and Python services
- [ ] Log aggregation: structured logs from all services, collected to a central location

---

## Phase 8 — Autonomous Agent Engine

**Goal:** Users can toggle on AI agents that handle conversations automatically, escalating to human when needed.

This is the Business tier differentiator.

- [ ] Agent configuration UI: create agent, assign role, set permission boundaries, assign to contacts/segments
- [ ] Sales Agent: qualification flow, objection handling library, meeting booking via Calendly webhook
- [ ] Support Agent: FAQ matching against knowledge base, ticket creation, escalation rules
- [ ] Community Manager Agent: group content scheduling, moderation flagging, discussion prompts
- [ ] Escalation engine: detect frustration, explicit human requests, out-of-scope topics → pause agent → notify human
- [ ] "Requires Human Attention" folder: conversations paused by agent, sorted by urgency
- [ ] Agent activity log: every autonomous action logged with reasoning

---

## Phase 9 — Business Intelligence Engine

- [ ] Analytics dashboard (new page in web app)
- [ ] Conversation funnel visualization (stages, conversion rates, drop-off)
- [ ] Agent performance metrics (if team inbox active)
- [ ] Revenue attribution: link deal-closed events to conversation threads
- [ ] Proactive impact report: automated monthly digest
- [ ] AI suggestion acceptance rate tracking
- [ ] Exportable reports (CSV / PDF)

---

## Build Order Summary

| Priority | Phase | Est. Effort | Unlocks |
|---|---|---|---|
| **NOW** | Phase 3 — AI Intelligence Core | 2–3 weeks | The entire product |
| **NOW** | Phase 4 — Web Dashboard Full UI | 2–3 weeks (parallel) | Usable product |
| **Next** | Phase 5 — Temporal Intelligence Engine | 1 week | Personal proactivity |
| **Next** | Phase 6 — World Knowledge Engine | 1 week | Contextual awareness |
| **Next** | Phase 7 — Production Deployment | 1 week | Live for real users |
| **After** | Phase 8 — Autonomous Agent Engine | 3 weeks | Business tier |
| **After** | Phase 9 — Business Intelligence | 2 weeks | Enterprise sales |

**The critical path is Phase 3.** Nothing else matters until the AI pipeline produces its first suggestion.
