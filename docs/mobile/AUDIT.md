# Zuri Android — Audit Report

> **Engagement:** Zuri Android, initial engagement (audit → architecture → design → approval gate).
> **Phase:** Audit (deliverable 1 of 3). **Status:** complete, awaiting product-owner review.
> **Date:** 2026-11-24. **Repository state audited:** `Personal-Assistant` `main` at `c2db648` → `27628f0` (another agent committed during the audit; nothing in this audit depends on those two commits). **MeetingMind** at `48da219` (`release/1.0-paid-launch`).
> **Method:** read-only. No production code, schema, API, or git state was modified. All new files are under `docs/mobile/` and `design/mobile/` and are uncommitted.

## Document set

| Document | Contents |
|---|---|
| `AUDIT.md` (this) | Executive summary, method, current development state (Audit E), cross-cutting findings, defects found |
| `FEATURE_INVENTORY.md` | Every web route and backend capability, with status and file references (Audit A) |
| `WEB_ANDROID_PARITY_MATRIX.md` | Every feature mapped to an Android delivery mode, milestone and dependencies |
| `BACKEND_API_MAP.md` | API server (Part A), database (Part B), intelligence/WhatsApp/companion/RN app (Part C) (Audit B) |
| `MEETINGMIND_REUSE_ANALYSIS.md` | What to lift from MeetingMind, how, and what to leave (Audit C) |
| `ANDROID_FEASIBILITY.md` | Notification access, Play policy, background limits, on-device runtimes, security primitives (Audit D) |
| `RISKS_AND_OPEN_QUESTIONS.md` | Risks register and questions that need a product-owner answer |

---

## 1. Executive summary

1. **Zuri is large and mostly real.** It has 90 web pages, about 60 of which are working end-to-end. There are ~605 API endpoints across 75 route files, 187 Postgres tables, ~67 intelligence services, 51 prompt templates and 26 scheduled jobs. Most modules named in the brief exist and call real endpoints. Exceptions:
   - **Placeholder:** Reports, Social connect, the public portfolio.
   - **Mocked:** the CV editor's AI Suite.
   - **Incomplete:** Enterprise settings, Automation rules, Agent corrections.

   The Android app must therefore be a **client of a large existing product**, not a re-imagining of it.

2. **The backend is reusable, but it cannot support a local-first device today.**
   - **Login:** there is no mobile-safe login. The only path trusts a shared secret that must never ship in an APK.
   - **Change tracking:** there is no incremental sync. There are no `updated_since` queries, no triggers maintaining `updated_at`, and `messages` has no `updated_at` at all. Deletes are hard and leave no tombstones, and most lists are hard-capped.
   - **Retries:** there is no idempotency. A retried message send double-sends on WhatsApp.
   - **Phone-captured messages:** the existing companion relay creates duplicate pseudo-contacts.

   Local-first Android can still start immediately, because the device-only experience needs no backend changes. Cloud connection, import and sync need a **small, well-defined set of backend additions** (listed in `BACKEND_API_MAP.md` "Summary" G1–G9). Each requires product-owner approval and coordination with the web/backend agent.

3. **There is no workspace concept on the server.** Everything belongs to one `user_id`. `users.mode` (personal/business/hybrid) is an account-wide UI mode, and `business_profiles` are document-branding profiles, not workspaces. The brief's requirement that "Business A's data must not become knowledge for Business B" is therefore **not representable server-side today**. The Android architecture proposes a device-side workspace model that can be enforced locally, plus an optional server RFC. This is the most important **product decision** in the engagement (`DECISIONS.md` D-04).

4. **Notification intelligence is feasible but bounded by the platform.**
   - **What it sees:** only what other apps post, with no history.
   - **Redaction:** Android 15+ redacts OTP-bearing messages for listeners like Zuri.
   - **Hidden content:** Signal is often content-hidden, and Gmail gives snippets only.
   - **SMS:** reading SMS directly is not permitted for this app; SMS comes through the SMS app's notifications.
   - **Accessibility:** must never be used to read chats or press Send.
   - **Matching to server messages:** notifications expose neither the WhatsApp message id nor (reliably) the chat JID. Reconciling phone-captured messages with server-ingested WhatsApp history is fuzzy and must be designed explicitly.

5. **On-device AI is feasible on mid/high-end phones, with our own runtime.**
   - **Gemini Nano is foreground-only**, so it cannot do background extraction.
   - **Recommended runtime:** LiteRT-LM with Gemma 4 E2B/E4B (Apache-2.0) and EmbeddingGemma, gated by device RAM.
   - **What MeetingMind gives us:** model catalog, verified resumable downloads, model routing and JSON-validation patterns are mature and reusable.
   - **What it doesn't:** its runtime (MediaPipe LLM Inference) is deprecated for mobile, it has no on-device neural embedder, and its privacy routing is per-screen.

6. **The server's per-message analysis maps well onto a phone.**
   - **Split for small models:** the 20-field analysis should become a core per-message schema (sentiment, intent, entities, commitments, events, urgency) and a gated business/career schema.
   - **Directly portable:** health, cadence, relationship-memory, reflection, gossip and lead-score engines are pure SQL/heuristics and can be ported to SQLite.
   - **Server-only:** web-search engines, job scraping, agents and ERP execution.

7. **Document generation is the strongest existing subsystem and the most delicate to bring offline.**
   - **Already right:** the server keeps money in integer cents with deterministic totals and numbering.
   - **Rendering:** 15 react-pdf templates are shared by web and server. Android cannot run them natively.
   - **Recommendation:** render the *same* templates in a sandboxed WebView, so web and Android output stay identical, including offline. Native DOCX comes from MeetingMind's block exporter.
   - **Numbering:** offline documents need a numbering policy.

8. **Repository hygiene risks** that affect any new work:
   - The production `INTERNAL_API_SECRET` value is printed in `CLAUDE.md`. Rotate it.
   - Seven migration numbers are duplicated. They are harmless to the runner but confusing.
   - `docs/NEXT_PHASE.md` and `docs/SCHEMA.md` are stale.
   - CLAUDE.md contradicts the code in several places (media fallback, mobile nav tabs, the `byok_keys` table, sidebar style).

---

## 2. Method

| Audit | Scope | Approach |
|---|---|---|
| A — Web app | `apps/web/src` (90 pages, components, hooks, middleware) | Every page and its `_components` grepped for API calls, mocks/TODOs, gating and socket listeners. Every web-called endpoint cross-checked against the 491 route literals registered in `services/api`. Not exercised in a browser. |
| B — Backend | `services/api` (75 route files), `db/migrations` (138 files), `services/intelligence`, `services/whatsapp`, `packages/*` | Route-by-route read with auth guards. Every `CREATE TABLE`/`ALTER TABLE` parsed. Intelligence pipeline traced from queue to writers. |
| C — MeetingMind | `/Users/winstonzulu/Documents/GitHub/MeetingMind` | Read-only code and docs review. No Gradle (the repo has someone else's uncommitted work and a one-Gradle-at-a-time rule). |
| D — Android feasibility | Platform and Play policy | Official Android developer and Play Console Help pages checked on the audit date. Every claim tagged [V]/[S]/[K]. |
| E — Current state | Git branches, uncommitted work, docs, active development | Below. |

Findings were checked for internal consistency across audits. Where two audits disagreed, the code wins and the disagreement is noted. Example: `apps/companion`'s listener is called "naive" by B and "skeleton" by C. Both are right.

**Not verified** (requires a running system or device):
- Production-applied migrations.
- Whether `OPENAI_API_KEY` is set in production.
- Real WhatsApp notification extras on current builds (`shortcutId` = chat JID?).
- On-device tokens/sec for candidate models.
- Visual behaviour of web pages.

---

## 3. Audit E — Current development state

### 3.1 Active work

- **Another agent is actively developing web/backend on `main`.** It made four commits during this audit:
  - `33af673` plan tiers off for personal use
  - `c2db648` auto-reply rules
  - `9c0c56e` hide Billing nav
  - `27628f0` profiler relationship-type inference

  Recent themes are WhatsApp history import (`b99b8ae`, migrations 0130/0131), inbox parity (reactions, stars, pins, statuses, delete-for-me), the Claude Haiku 5.5 default, and the move to a GCP Compute Engine VM.
- **Branch policy (CLAUDE.md):** all work goes directly to `main`, which auto-deploys. This engagement therefore **commits nothing**. The new `docs/mobile/` and `design/mobile/` directories are untracked. *Risk:* a `git add -A` by the other agent would sweep them into a production deploy commit. They are documentation only, but see `RISKS_AND_OPEN_QUESTIONS.md` R-17.
- **Remote branches:** five stale `claude/*` branches (Jun–Jul 2026). Two have unmerged commits:
  - `leads-page-ai-pipeline-hrg5k0`: 3 inbox commits, likely superseded by later inbox work.
  - `whatsapp-ai-relationship-assistant-gn3ogp`: 1 docs commit.

  Neither affects Android.
- **MeetingMind:**
  - The main checkout has uncommitted edits (MainActivity, database, export, companion).
  - The sibling worktree `mm-wt-sync` is a non-compiling WIP merge.
  - Any extraction must come from a committed revision (`48da219`), not the working tree.

### 3.2 Database and migrations

- 138 migration files (0001–0131). No gaps, but seven duplicated prefixes: 0026, 0032, 0101, 0112, 0116, 0117, 0118. `db/migrate.js` keys on full filename and applies them lexically, so this is harmless today.
- **0131 is a hotfix for 0130.** Any environment with 0130 but not 0131 drops every history batch.
- Which migrations production has applied cannot be determined from the repo.
- **No triggers or functions exist in any migration.** This matters for sync (see BACKEND_API_MAP §B.4).

### 3.3 Existing mobile/Android code

| Path | State | Verdict |
|---|---|---|
| `apps/companion` (Kotlin, ~150 lines of logic) | Won't build (missing launcher icons, no Gradle wrapper). Would crash on Android 14+ (`startForeground` without an FGS type). Naive parsing (title/text only, duplicates on update, relays summaries). No retry. Manual pasted 30-day JWT. Uses deprecated `security-crypto`. | **Superseded** by Zuri Android's notification ingestion. Retire after Zuri Android ships (D-01). |
| `apps/mobile` (Expo 51 / RN 0.74, 944 lines) | Untouched scaffold since first commit. Email/password auth that 500s for Clerk users. Calls nonexistent endpoints. Missing assets. Cannot host a NotificationListenerService without native code. | **Retire.** Keep the screen list only as a checklist (D-01). |
| `apps/worker` | Empty directory | n/a |

### 3.4 Documentation drift (CLAUDE.md and docs vs code)

| Claim | Reality | Source |
|---|---|---|
| WhatsApp media falls back to a local `wa_media` volume | `mediaUrl = null`; no local write | `services/whatsapp/src/transport/baileys.ts` ~L811–826 |
| Mobile bottom tabs are Contacts/Queue/Proactive | Home/Inbox/Studio/Documents (People in personal mode) | `apps/web/src/app/(dashboard)/layout.tsx` |
| Sidebar is `bg-white/90 backdrop-blur` | Dark `bg-gray-950` | same |
| `/projects` is in the Business nav | No nav entry | same |
| `byok_keys` table | Does not exist; keys live in `user_ai_keys` | migrations 0019/0111/0112 |
| `DEFAULT_AI_MODEL` default is Claude | Code default `dashscope/qwen-max`; Claude only if env sets it | `services/intelligence/app/config.py:31` |
| `docs/NEXT_PHASE.md` (ECS at 47.84.205.81) | Production is on GCP Compute Engine | CLAUDE.md "Production Infrastructure" |
| `docs/SCHEMA.md` (30 tables) | 187 live tables | migrations |
| Audio transcription "remaining" (Phase 3) | Exists in the API service (Gemini → Whisper), with a model-name bug | `services/api/src/lib/transcription.ts` |

### 3.5 Environment flags that change behaviour

- `FREE_TESTING_MODE` defaults to **true** (`services/api/src/config.ts:28`). Every user resolves to plan family `enterprise`, and the read-only guard is a no-op.
- `MARKETING_ACCESS_OPEN_FOR_TESTING = true` is hard-coded (`services/api/src/lib/marketing-access.ts:9`).
- `NEXT_PUBLIC_TIERS_ENABLED` hides Billing in the web nav.

Android must implement the 402 `upgradeRequired`/`readOnly` handling anyway. It will be invisible until these flags flip.

---

## 4. Cross-cutting findings that shape the architecture

| # | Finding | Evidence | Architectural consequence |
|---|---|---|---|
| F1 | Single-owner data model; orgs map members onto the owner's `user_id` | BACKEND_API_MAP §B.2, `lib/org-scope.ts` | Device data is keyed by an account binding, not by org. Workspaces must be modelled on the device (D-04). |
| F2 | Personal vs business is a UI mode, not a partition | `users.mode`, soft per-contact signals | Context isolation is a new concept. Android enforces it locally; a server RFC is optional. |
| F3 | Server message identity = Baileys `whatsapp_message_id`; notifications don't expose it | §B.3, §C.6 | Device messages get local ids plus a reconciliation fingerprint; the server needs a reconciliation endpoint (G5). |
| F4 | `updated_at` is unreliable and deletes are untracked | §A.3, §B.4 | A server change feed with triggers and tombstones is a prerequisite for incremental sync (G3). Until then, Android supports **import + read-through cache**, not sync. |
| F5 | No idempotency on creates or sends | §A.3 | Client outbox with idempotency keys; server must honour them (G4) before Android performs any write that can double-execute (WhatsApp send, document create). |
| F6 | No push channel | §A.4 | Android receives cloud events only while foregrounded (socket) until FCM is added (G7). The phone's own notification ingestion is unaffected. |
| F7 | Embeddings 1536-d OpenAI, possibly not produced in prod | §C.4 | On-device embeddings form a separate index (EmbeddingGemma); vectors are never mixed or uploaded as server vectors. |
| F8 | react-pdf templates are the single source of document layout | §A.6 | Android renders the same templates in a WebView (D-09) rather than re-implementing 15 layouts. |
| F9 | AI money/amount rules are prompt-enforced, not code-enforced, on the server (`GENERATE_DOCUMENT_DATA`) | §C.9 | Android's Document Engine enforces "AI proposes structure, code owns numbers" in code (validation layer), not only in prompts. |
| F10 | Plenty of server AI is "user-level cognition" that is pure SQL | §C.2 | Port health/cadence/memory/reflection/gossip/lead-score to Kotlin over Room, so personal intelligence works offline with *no LLM at all* on low-end devices. |

---

## 5. Defects found during the audit (report to the web/backend owner — not Android work)

Severity: **H** = data loss, a security issue or a silently broken user-facing promise. **M** = broken feature. **L** = hygiene.

| Sev | Defect | Location |
|---|---|---|
| H | Production `INTERNAL_API_SECRET` value printed in CLAUDE.md. `clerk-sync` mints a JWT for any email to whoever holds it. | `CLAUDE.md`, `services/api/src/routes/auth.ts:59` |
| H | `POST /api/documents/:id/send-whatsapp` calls a nonexistent WhatsApp route, then marks the document `sent` anyway. The dunning worker calls nonexistent `/api/messages/send`. | `documents.ts` (~3 call sites), `workers/dunning-reminder-worker.ts:119` |
| H | Retried `POST /api/conversations/:id/messages` double-sends on WhatsApp (no idempotency) | `lib/whatsapp-send.ts` |
| M | Embeddings are only produced if `OPENAI_API_KEY` is set. It is not in the documented production key list, so semantic search may be silently off. | `services/intelligence/app/ai/client.py` |
| M | Analyser LLM-failure fallback emits `intent.category`, but `intent.primary` is required, so the job fails instead of degrading | `services/intelligence/app/services/analyser.py`, `models.py` |
| M | Redis subscriber omits `conversation:*`, `message:delete`, `message:reaction`, `status:new`, so they are never delivered live | `services/api/src/lib/redis-subscriber.ts` |
| M | Web socket replay `socket.emit`s missed events to the server instead of local handlers | `apps/web/src/lib/socket.ts` |
| M | Public share links `/shared/[token]` and `/p/[slug]` are redirected to `/login` | `apps/web/src/middleware.ts` |
| M | CV editor AI Suite returns hardcoded text (a cover letter signed with the owner's name, invented achievements). Contradicts the "never invent" policy. | `apps/web/src/app/api/career/ai-suite` |
| M | Web calls 8 nonexistent endpoints (Enterprise tab, automation rules, agent corrections, reports, `/api/advisor/chat`, `/api/knowledge/scrape`, `/api/career/ai-rewrite`, `/api/settings/byok`) | FEATURE_INVENTORY §14 |
| M | Outbound messages stored with a `direct-<uuid>` id that is never replaced, so the WhatsApp echo probably duplicates them (unconfirmed) | `lib/whatsapp-send.ts` |
| M | `GET /api/export/full-workspace` selects nonexistent columns | `routes/privacy.ts` |
| M | Voice-note transcription derives its Gemini model name from `DEFAULT_AI_MODEL` (a Claude ID in prod), so it likely fails and falls through to Whisper only if `OPENAI_API_KEY` is set | `services/api/src/lib/transcription.ts` |
| L | `/api/auth/login` returns 500 for Clerk users (null password hash) | `routes/auth.ts:320` |
| L | `GET /api/media/:filename` and `milestones.ts` (mock data) require no auth | `routes/media.ts`, `routes/milestones.ts` |
| L | `GET /api/conversations/:id/messages` has side effects (marks read, enqueues reconciliation) | `routes/conversations.ts` |
| L | Message-count maintenance counters live in process memory and reset on restart | `workers/message_worker.py` |
| L | `apps/companion` would crash on Android 14+ | `ZuriNotificationService.kt` |

---

## 6. What the audit does *not* conclude

- It does not conclude any module is out of scope. Feature parity is the requirement. Modules that only make sense online (admin console, analytics dashboards) are classified as **online-only**, not excluded. The only proposed exclusions (public marketing site, admin console) are listed in `DECISIONS.md` for explicit approval.
- It does not assume the backend additions will be approved. The Android plan is sequenced so the **local-only product ships value without them** (milestones M1–M5). Cloud milestones are gated on the backend RFCs.
