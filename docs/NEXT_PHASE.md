# Next Phase — Implementation Plan

## Current State (as of 2026-06-29)

### What Exists and Works

- ✅ Full monorepo, Vercel deployment live
- ✅ PostgreSQL 30-table schema with pgvector (Supabase managed, 25 migrations applied)
- ✅ WhatsApp service: Baileys (@whiskeysockets/baileys), QR auth + link code, session persistence via `useMultiFileAuthState` + Docker volume `wa_sessions`, message ingestion → DB + BullMQ queue
- ✅ First Impression Mode: `messaging-history.set` Baileys event captures historical messages on initial connect
- ✅ Clerk authentication on web app (deployed and working)
- ✅ Onboarding page: WhatsApp connection flow with real-time polling (2s interval), QR display, link code option, error recovery
- ✅ Web dashboard: all 17 pages production-ready, wired to live API, mobile-first
- ✅ Intelligence service: full pipeline running — message analysis, reply generation (3 variants), contact profiler, voice builder, cadence learner, health calculator, temporal worker, world knowledge worker
- ✅ `isHistorical` flag: historical messages skip reply generation and use wider AI batch intervals
- ✅ End-to-end suggestion pipeline: `messages.incoming` → analysis → `suggested_replies` → `messages.suggestion_ready` → Socket.io push → browser
- ✅ ECS production deployment: api + whatsapp + intelligence + redis + nginx at `47.84.205.81:5500`
- ✅ Historical Intelligence Sync: Diagnostics page card with live progress, API endpoints, background sync worker
- ✅ Auto Response Engine: full settings UI, `auto_response_settings` table, API routes, 3 approval modes
- ✅ Global WA status system: `useWAStatus` hook, sidebar status widget, mobile logo dot
- ✅ Leads page: live pipeline with hot/warm/cold stages, real WhatsApp quotes, score meters
- ✅ Kotlin companion app: NotificationListenerService → API relay
- ✅ React Native mobile scaffold: navigation, auth, typed API client

### Remaining Before Product is Fully Polished

**Production Infrastructure (highest priority):**
- SSL on ECS backend (currently HTTP only at port 5500)
- GitHub Actions CD (currently deploying manually via SSH)
- Database backups (no automated backup yet)
- Error monitoring (Sentry not set up)

**Intelligence:**
- Audio transcription (voice notes stored but not transcribed — Whisper integration missing)
- Opportunity detection engine (not implemented)
- Learning & optimisation engine (not implemented)

**Auto Response Execution (settings UI done, execution not hooked up):**
- Intelligence service worker needs to check `auto_response_settings` before deciding whether to queue a reply for auto-send
- Need a new BullMQ consumer path: when `approval_mode = 'auto'` and message meets criteria → send immediately vs. when `approval_mode = 'preview'` → surface in approval queue

---

## Priority 1 — SSL + GitHub Actions CD

The most impactful remaining infrastructure tasks. Currently the ECS backend runs plain HTTP, and deploys require manual SSH.

### SSL via Certbot

1. Point a domain (or subdomain) to `47.84.205.81`
2. Install Certbot on the ECS host: `apt install certbot`
3. Obtain certificate: `certbot certonly --standalone -d <domain>`
4. Update `nginx.conf` to listen on 443 with the Let's Encrypt cert
5. Add HTTP→HTTPS redirect on port 80
6. Update `NEXT_PUBLIC_API_URL` in Vercel to use `https://`
7. Set up auto-renewal cron: `certbot renew --pre-hook "docker compose stop nginx" --post-hook "docker compose start nginx"`

### GitHub Actions CD

Target workflow: push to `main` → build Docker images → push to registry → SSH deploy to ECS.

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: SSH deploy
        run: |
          ssh ${{ secrets.ECS_HOST }} "cd /opt/zuri && git pull && docker compose -f docker-compose.prod.yml up -d --build"
```

Required GitHub secrets: `ECS_SSH_KEY`, `ECS_HOST`.

---

## Priority 2 — Audio Transcription (Whisper)

Voice notes arrive with `message_type = 'audio'` and a media URL. Currently stored but transcription is skipped.

### Implementation

In `services/intelligence/app/workers/message_worker.py`:

```python
if job_data.get('messageType') == 'audio' and job_data.get('mediaUrl'):
    transcription = await transcribe_audio(job_data['mediaUrl'])
    # UPDATE messages SET transcription = $1 WHERE id = $2
    await db.execute(
        "UPDATE messages SET transcription = $1 WHERE id = $2",
        transcription, message_id
    )
    body = transcription  # use transcription as message body for analysis
```

In `services/intelligence/app/engines/transcription.py` (new file):
- Download audio from media URL
- Call LiteLLM with Whisper model: `litellm.transcription(model="whisper-1", file=audio_bytes)`
- Return transcription text

---

## Priority 3 — Auto Response Execution

The settings are stored and the UI is complete. The execution path needs to be wired up.

### What's Missing

The intelligence service's `message_worker.py` currently generates suggestions but always writes them to `suggested_replies` with `status='pending'`. The auto-response logic needs to:

1. After generating a suggestion, check `auto_response_settings` for the user
2. If `enabled = false` → do nothing extra (existing behaviour)
3. If `enabled = true` and `approval_mode = 'auto'`:
   - Check business hours, active days
   - Check contact's `customer_status` against `respond_to_leads/customers/new_contacts`
   - If conversation is a group and `skip_groups = true` → skip
   - If message contains escalation keyword → skip, send escalation email notification
   - Apply `send_delay_seconds` delay via BullMQ `delay` option
   - Enqueue `messages.send` job directly (bypassing user approval)
4. If `approval_mode = 'preview'` → surface to approval queue (existing suggested_replies flow)
5. If `approval_mode = 'manual'` → do nothing extra (existing behaviour)

### DB Query to Add

```python
async def get_auto_response_settings(user_id: str) -> dict | None:
    row = await db.fetchrow(
        "SELECT * FROM auto_response_settings WHERE user_id = $1",
        user_id
    )
    return dict(row) if row else None
```

---

## Priority 4 — Opportunity Detection Engine

The `proactive_queue` table and the `/proactive` page are both ready. The engine that populates it for business opportunities is not implemented.

### What It Should Do

Scan conversations for signals: interest in buying, budget mentions, decision-making language, follow-up needed. Write a `proactive_queue` row with `suggestion_type = 'opportunity'` when detected.

### Entry Point

New engine file: `services/intelligence/engines/opportunity_detection.py`

Triggered from `message_worker.py` after message analysis completes, when `analysis.intent` contains signals like `buying_signal`, `objection`, `request_for_info`, or `price_inquiry`.

---

## Priority 5 — Database Backups

No automated backup currently. Risk: Supabase has its own backup but we don't control it.

- [ ] Add a daily backup cron on ECS: `pg_dump $DATABASE_URL | gzip > backup-$(date +%Y%m%d).sql.gz`
- [ ] Upload to Alibaba OSS via `ossutil`
- [ ] Retain 30 days, delete older

---

## Build Order Summary

| Priority | Task | Effort | Risk Without It |
|---|---|---|---|
| **Now** | SSL (Certbot) | 2h | Browser mixed-content warnings; no HTTPS |
| **Now** | GitHub Actions CD | 3h | Manual deploys are error-prone |
| **Next** | Audio transcription | 4h | Voice notes silently ignored |
| **Next** | Auto response execution | 1 day | Settings UI has no effect |
| **After** | Opportunity detection | 2 days | Proactive queue under-populated |
| **After** | Database backups | 2h | Data loss risk |
| **After** | Sentry error monitoring | 2h | Silent failures in production |
| **Future** | Autonomous agents (Phase 8) | 3 weeks | Business tier not unlocked |
| **Future** | Business Intelligence (Phase 9) | 2 weeks | No analytics/reporting |
