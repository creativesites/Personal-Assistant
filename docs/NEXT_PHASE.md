# Next Phase — Production Polish

## Current State (as of 2026-06-29)

### What's Complete

- ✅ Full monorepo, Vercel deployment live
- ✅ PostgreSQL 30-table schema with pgvector (Supabase managed, 25 migrations applied)
- ✅ WhatsApp service: Baileys, QR + link code, session persistence, message ingestion
- ✅ First Impression Mode: historical message capture on initial connect
- ✅ Clerk authentication (web app), JWT auth (API)
- ✅ Onboarding: WhatsApp connection flow with real-time polling
- ✅ Web dashboard: 17+ pages production-ready, wired to live API, mobile-first
- ✅ Intelligence service: full pipeline — analysis, reply generation, contact profiler, voice builder, cadence learner, health calculator, temporal engine, world knowledge engine
- ✅ Auto Response Engine: settings UI and API complete; 3 approval modes
- ✅ Historical Intelligence Sync: Diagnostics page, API, background worker
- ✅ Global WA status system
- ✅ Phase 8: Autonomous Agent Engine — agents, knowledge base, escalation rules, trust levels
- ✅ Phase 9: Business Intelligence Platform — 11 intelligence endpoints, 11 analytics pages, Business Health Score, AnalyticsSubNav
- ✅ ECS production deployment: api + whatsapp + intelligence + redis + nginx at `47.84.205.81:5500`
- ✅ Kotlin companion app

### Gaps Remaining (Production Polish)

The product is feature-complete. These are the wiring gaps and hardening tasks that stand between "built" and "production-ready".

---

## Priority 1 — SSL + GitHub Actions CD

**Impact:** Removes the last infrastructure blockers. Without SSL, browsers flag the API as insecure. Without CD, every deploy is a manual SSH operation.

### SSL via Certbot

1. Point a domain/subdomain to `47.84.205.81`
2. On ECS: `apt install certbot python3-certbot-nginx`
3. `certbot --nginx -d <domain>` — obtains cert and patches nginx config automatically
4. Certbot adds its own renewal cron; verify with `certbot renew --dry-run`
5. Update Vercel env: `NEXT_PUBLIC_API_URL=https://<domain>`
6. Update `CORS_ORIGIN` on ECS `.env` to match the Vercel URL

### GitHub Actions CD

Target: push to `main` → SSH into ECS → `git pull && docker compose up -d --build`

```yaml
# .github/workflows/deploy.yml
name: Deploy to ECS
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.ECS_HOST }}
          username: root
          key: ${{ secrets.ECS_SSH_KEY }}
          script: |
            cd /opt/zuri
            git pull origin main
            docker compose -f docker-compose.prod.yml up -d --build
```

Required secrets in GitHub: `ECS_SSH_KEY`, `ECS_HOST` (`47.84.205.81`).

---

## Priority 2 — Auto Response Execution

**Impact:** The Auto Response settings UI is complete and the database table exists, but the intelligence service never reads those settings. Messages always queue for manual approval regardless of what the user configured.

### What's Missing

In `services/intelligence/app/workers/message_worker.py`, after generating a suggestion:

```python
async def maybe_auto_send(user_id: str, conversation_id: str, suggestion_id: str, message_body: str):
    settings = await conn.fetchrow(
        "SELECT * FROM auto_response_settings WHERE user_id = $1", user_id
    )
    if not settings or not settings['enabled']:
        return  # existing behaviour — stays pending

    if settings['approval_mode'] == 'auto':
        # check business hours, contact type, escalation keywords
        # if all pass: enqueue messages.send job directly
        await queue.add('messages.send', {
            'userId': user_id,
            'conversationId': conversation_id,
            'suggestedReplyId': suggestion_id,
        }, delay=settings['send_delay_seconds'] * 1000)
    # 'preview' and 'manual' — no change, stay as pending suggestion
```

Business hours check: compare current UTC time against `business_hours_start`/`end` and `active_days` array.

Escalation keyword check: scan `message_body` against `escalation_keywords` array (case-insensitive). If matched: skip auto-send, mark suggestion with `status='escalated'`, send email to `notify_email`.

---

## Priority 3 — Audio Transcription (Whisper)

**Impact:** Voice notes are silently dropped. The body is null, analysis is skipped, and the conversation appears empty. Common in many markets.

### Implementation

New file: `services/intelligence/app/engines/transcription.py`

```python
import litellm
import httpx

async def transcribe_audio(media_url: str) -> str | None:
    async with httpx.AsyncClient() as client:
        response = await client.get(media_url)
        if response.status_code != 200:
            return None
    audio_bytes = response.content
    result = await litellm.atranscription(model="whisper-1", file=("audio.ogg", audio_bytes, "audio/ogg"))
    return result.text
```

In `message_worker.py`, before analysis:

```python
if job_data.get('messageType') == 'audio' and job_data.get('mediaUrl') and not body:
    transcription = await transcribe_audio(job_data['mediaUrl'])
    if transcription:
        await conn.execute(
            "UPDATE messages SET transcription = $1, body = $1 WHERE id = $2",
            transcription, message_id
        )
        body = transcription
```

Requires `OPENAI_API_KEY` in the intelligence service `.env` (Whisper is an OpenAI-only model via LiteLLM).

---

## Priority 4 — Error Monitoring (Sentry)

**Impact:** Failures in production are currently silent. No visibility into crashes, unhandled exceptions, or degraded AI responses.

### Setup

**API service (`services/api`):**
```bash
npm install @sentry/node
```
```typescript
// services/api/src/instrument.ts
import * as Sentry from '@sentry/node'
Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV })
```
Import `./instrument` at the top of `src/index.ts`.

**Intelligence service (`services/intelligence`):**
```bash
pip install sentry-sdk
```
```python
# app/main.py (top)
import sentry_sdk
sentry_sdk.init(dsn=os.getenv('SENTRY_DSN'), environment=os.getenv('ENV', 'production'))
```

Add `SENTRY_DSN` to production `.env` and Vercel env vars. Create a free project at sentry.io.

---

## Priority 5 — Database Backups

**Impact:** Supabase has its own PITR but we don't control the retention window. A daily snapshot gives a secondary recovery path.

```bash
# /opt/zuri/backup.sh
#!/bin/bash
set -e
FILENAME="zuri-backup-$(date +%Y%m%d-%H%M).sql.gz"
pg_dump "$DATABASE_URL" | gzip > "/tmp/$FILENAME"
ossutil cp "/tmp/$FILENAME" "oss://zuri-backups/$FILENAME"
find /tmp -name "zuri-backup-*.sql.gz" -mtime +1 -delete
```

Add to crontab on ECS: `0 2 * * * /opt/zuri/backup.sh >> /var/log/zuri-backup.log 2>&1`

Requires `ossutil` installed and configured with Alibaba Cloud OSS credentials.

---

## Priority 6 — Opportunity Detection Engine

**Impact:** The `/proactive` queue runs on temporal signals (cadence deviation). It doesn't yet detect commercial intent — buying signals, follow-up gaps, or price inquiries.

### Entry Point

New file: `services/intelligence/engines/opportunity_detection.py`

Triggered from `message_worker.py` after analysis, when `intent.primary` is `request` or `question` and any of these conditions are true:
- Topics array contains price/cost/quote/order/delivery keywords
- `importance_score > 7`
- Contact has `pipeline_stage` in `('lead', 'warm', 'hot')` and `requires_response = true`

When triggered: write a `proactive_items` row with `suggestion_type = 'opportunity'` and draft message.

---

## Priority 7 — Performance & UX Polish

Smaller items that improve the shipped experience:

### API
- [ ] Add `Cache-Control: max-age=30` headers to analytics endpoints (data doesn't change by the second)
- [ ] Add pagination to `/api/contacts` and `/api/conversations` (currently returns all rows)
- [ ] Rate-limit the `/api/auth/clerk-sync` endpoint (currently unbounded)

### Frontend
- [ ] Add loading skeletons to dashboard, contacts, and leads pages (currently show empty content while fetching)
- [ ] `500` and `404` error pages (currently Next.js defaults)
- [ ] PWA manifest + service worker for "Add to Home Screen" on mobile
- [ ] Toast notifications for approved replies (currently silent success)

### Intelligence
- [ ] Retry logic for failed LiteLLM calls (currently a failed AI call silently drops the job)
- [ ] Job dead-letter queue — failed BullMQ jobs should land in a reviewable queue, not disappear
- [ ] Batch message analysis uses 30s intervals; tune based on provider rate limits

---

## Priority 8 — Knowledge Base: AI Brain (in progress)

**Impact:** The KB page already exists with document storage, chunking, and agent injection. The current work (workflow `wf_125e4a2b-83c`) adds PDF/Excel upload, a chat interface, KB search, and wires KB retrieval into every reply suggestion.

Completed in the running workflow:
- [x] Migration 0026: `category`, `tags`, `word_count`, `file_size_bytes`, `used_count`, `last_used_at`, `summary` on `kb_documents`
- [x] `pdfplumber` + `openpyxl` in requirements
- [ ] `search_knowledge()` + `chat_with_knowledge()` in knowledge_retriever.py
- [ ] `/internal/knowledge/search` + `/internal/knowledge/chat` FastAPI endpoints
- [ ] KB retrieval injected into reply_gen.py (powers all reply suggestions)
- [ ] `POST /api/knowledge/upload` multipart endpoint (PDF/Excel/CSV)
- [ ] Full page overhaul: stats, Ask Your KB chat, search, rich document table, upload modal

---

## Priority 9 — AI Knowledge Discovery Engine

**This is one of Zuri's biggest product differentiators.** Most AI systems only *consume* a knowledge base. Zuri continuously *builds* one by observing conversations — just like a new employee would.

### Vision

Instead of requiring businesses to manually document everything, the AI proactively extracts valuable facts from conversations and proposes them as structured knowledge entries. A jersey price mentioned 73 times across conversations becomes a Knowledge Candidate with 98% confidence. When the owner corrects a delivery fee in chat, Zuri detects the change and proposes an update.

### Architecture

```
WhatsApp Messages
       │
       ▼
AI Intelligence Pipeline
       │
       ▼
Knowledge Discovery Engine ← extractors run after every message analysis
       │
       ▼
Knowledge Candidates (pending approval)
       │
  (Auto or User Approval, configurable)
       ▼
Knowledge Base (structured, versioned)
       │
       ▼
AI Replies · Agents · Planning · CRM · Automation · BI
       │
       ▼
New Conversations → loop continues
```

### Extractors

Each extractor runs as a lightweight post-processor after `message_worker.py` completes analysis. Results go into a `knowledge_candidates` table.

| Extractor | Detects |
|-----------|---------|
| Pricing | Product prices, delivery fees, service charges |
| Policy | Return/refund/warranty/exchange rules |
| FAQ | Repeated Q&A patterns across conversations |
| Business Hours | Opening times, holidays, exceptions |
| Location | Delivery areas, store locations, service zones |
| Product | Products, SKUs, descriptions, availability |
| Service | Services offered, turnaround times |
| Process | How the business handles orders, bookings, repairs |
| Promotion | Active discounts, deals, offers |
| Sales Script | Common objection handling and closing techniques |
| Objection | Customer hesitations and how they were resolved |

### Confidence Engine

Scores a candidate from 0-100 based on:
- Number of observations (1×=35%, 2×=48%, 12×=81%, 54×=97%)
- Source quality (owner conversation → +20%, historical chats → +5% per occurrence)
- Owner confirmation → 100%
- Contradicting evidence → penalty proportional to conflict count
- Recency (older observations decay slowly)

### Knowledge Candidates Page (`/knowledge-base/candidates`)

New sub-page inside Knowledge Base.

Columns: Suggestion | Category | Confidence | Source | Times Observed | Status | Actions

Actions per candidate: Approve / Edit & Approve / Reject / Merge (with existing entry)

Clicking opens a detail panel with:
- Full suggested knowledge entry
- Supporting evidence (links to source conversations)
- Current KB entry (if conflict/update)
- Version comparison (old vs proposed)

### Approval Modes (settings)

Three modes per user (stored in `knowledge_discovery_settings` or similar):
- **Manual Approval** — everything requires review (recommended default)
- **Auto-approve High Confidence** — confidence ≥ 95% auto-promotes, user notified
- **Fully Automatic** — all candidates auto-promote; user can undo

### Knowledge Evolution & Versioning

Knowledge entries don't get overwritten — they get versioned.

When a candidate conflicts with an existing entry:
```
Jan: Delivery Fee = K50 (KB entry, v1)
Mar: AI detects K80 in 5 conversations (candidate, 92% confidence)
     → Proposed: KB entry v2 = K80 (v1 archived as historical)
```

### Contradiction Detection

When multiple sources disagree, flag a warning:
- Website says K450, conversations say K500, PDF says K480
- Warning shown in KB health panel with source breakdown
- User can resolve by selecting the authoritative source

### Database Schema (new tables needed)

```sql
CREATE TABLE knowledge_candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category        VARCHAR(100),
  title           VARCHAR(255) NOT NULL,
  proposed_value  TEXT NOT NULL,           -- structured as JSON or plain text
  source_type     VARCHAR(50) NOT NULL,    -- 'historical_conversation' | 'live_conversation' | 'owner_chat' | 'document'
  source_refs     TEXT[],                  -- conversation IDs, message IDs, document IDs
  observation_count INT NOT NULL DEFAULT 1,
  confidence      NUMERIC(5,2) NOT NULL DEFAULT 0,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending | approved | rejected | merged
  existing_kb_id  UUID REFERENCES kb_documents(id) ON DELETE SET NULL, -- if this updates an existing entry
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE kb_document_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  version_number  INT NOT NULL,
  content_snapshot TEXT NOT NULL,
  change_summary  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Implementation Plan

1. **Migration** — `0027_knowledge_discovery.sql` adds `knowledge_candidates` and `kb_document_versions` tables
2. **Extractor base class** — `services/intelligence/engines/knowledge_extractors/base.py` — defines `extract(message, analysis, contact) → list[CandidateFact]`
3. **Individual extractors** — one file per extractor type (pricing.py, policy.py, faq.py, etc.)
4. **Discovery worker** — runs after message analysis in `message_worker.py`, fans out to all extractors, deduplicates against existing candidates, writes to `knowledge_candidates`
5. **Confidence calculator** — `engines/knowledge_extractors/confidence.py`
6. **API routes** — `GET/POST/PATCH /api/knowledge/candidates` endpoints
7. **Candidates page** — `/knowledge-base/candidates` with the review UI

---

## Build Order Summary

| Priority | Task | Effort | Risk Without It |
|---|---|---|---|
| **1** | SSL + GitHub Actions CD | 3h | HTTP-only; manual deploys |
| **2** | Auto response execution | 1 day | Settings UI has no effect |
| **3** | Audio transcription | 4h | Voice notes silently dropped |
| **4** | Sentry error monitoring | 2h | Silent production failures |
| **5** | Database backups | 2h | Data loss risk |
| **6** | Opportunity detection engine | 2 days | Proactive queue under-populated |
| **7** | Performance & UX polish | 3 days | Rough edges in production |
| **8** | KB AI Brain (upload + chat + search) | 🔄 in progress | KB is passive document storage |
| **9** | AI Knowledge Discovery Engine | 2 weeks | Business never builds institutional memory |
