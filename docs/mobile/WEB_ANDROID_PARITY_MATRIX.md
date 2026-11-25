# Zuri Android — Web ↔ Android Parity Matrix

> Part of the Zuri Android initial engagement, 2026-11-24. Built from `FEATURE_INVENTORY.md` (what exists) and `BACKEND_API_MAP.md` (what the backend allows). **Feature parity is the requirement.** No module is excluded here; the only proposed exclusions are listed at the end and require product-owner approval (`DECISIONS.md` D-12).

## Delivery modes

| Mode | Meaning | Works without account | Works offline |
|---|---|---|---|
| **LOCAL** | Implemented on device over the local encrypted database. The phone owns the data. | Yes | Yes |
| **HYBRID** | Local core, enriched with cloud data when an account is connected (imported/synced records merged and provenance-labelled) | Yes (local part) | Yes |
| **CLOUD** | Data owned by the Zuri backend. Android caches it for offline reading and queues writes in an outbox. | No | Read: cached. Write: queued (only once idempotency G4 exists). |
| **ONLINE** | Server-computed, needs a live connection (web search, multi-user, server analytics, payments, WhatsApp send via the cloud session). The last result is shown when offline, clearly dated. | No | Shows last cached result |
| **NATIVE** | New mobile capability with no web equivalent | Mostly yes | Mostly yes |

**Milestones** referenced below (detail in `IMPLEMENTATION_PLAN.md`):
- **M1** Foundation
- **M2** Notification ingestion
- **M3** Local AI runtime
- **M4** Local Neural Layer
- **M5** Context & workspaces
- **M6** Personal intelligence
- **M7** Cloud account
- **M8** Historical import
- **M9** Incremental sync & push
- **M10** Business Studio
- **M11** Document Engine
- **M12** Business Intelligence
- **M13** Remaining parity
- **M14** Mobile-native extras
- **M15** Hardening & release

**Backend dependencies (G-codes)** are defined in `BACKEND_API_MAP.md` summary:
- **G1** mobile auth exchange
- **G3** change feed / tombstones / paging
- **G4** idempotency
- **G5** device-message reconciliation
- **G6** realtime fixes
- **G7** push
- **G9** workspace column

---

## 1. Global / platform

| Feature (web) | Web status | Android mode | Android surface | Milestone | Depends on | Notes |
|---|---|---|---|---|---|---|
| Clerk sign-in / sign-up | working | CLOUD (optional) | Connect account flow | M7 | G1 | Never required to use the app (local-first) |
| Onboarding (use case, WhatsApp link, team invite, verify) | working | LOCAL + CLOUD | Local onboarding (sources, model, privacy); cloud onboarding inside Connect flow | M1, M7 | G1 | WhatsApp QR link is a *cloud* capability (server Baileys session) |
| Workspace mode business/personal/hybrid | working (UI mode) | LOCAL | Context switcher + workspaces | M5 | G9 for server-side isolation | Android adds real isolation (D-04) |
| Command palette / "Ask About Anything" | working | HYBRID | Global search + Ask bar | M4 (local), M12 (cloud) | — | `ASK_ANYTHING` prompt runs on-device over local DB |
| Notifications page (in-app) | working | HYBRID | Notifications screen | M6, M9 | G3, G7 | Local Zuri alerts + cloud notifications |
| Socket real-time | working (with bugs) | CLOUD | Foreground socket | M9 | G6 | Replay bug must not be copied |
| Push notifications | absent | NATIVE / CLOUD | FCM | M9 | G7 | New |
| Guided tour, PWA install, feedback prompt | working | NATIVE | First-run tips, in-app feedback | M15 | — | PWA prompt not applicable |
| Subscription read-only / grace banners, FeatureGate 402 | working (flags off) | CLOUD | Global 402 handler + banners | M7 | — | Two 402 shapes: `upgradeRequired`, `readOnly` |
| WhatsApp connection status widget | working | CLOUD | Cloud WhatsApp card in Sources | M7 | — | Distinct from notification access |

## 2. Personal intelligence

| Feature | Web status | Android mode | Surface | Milestone | Depends | Notes |
|---|---|---|---|---|---|---|
| Dashboard / Daily Brief | working | HYBRID | Today (Daily Brief) | M6 (local), M9 (cloud brief) | G3 | Local brief built from local signals; cloud `/api/proactive/brief` merged when connected |
| "Your Week in Review" (reflection) | working | HYBRID | Brief card + Timeline | M6 | — | Port `reflection.py` personal highlights (pure SQL) |
| Contacts CRM list | working | HYBRID | People | M6, M8 | G3 (>500 contacts) | Device contacts (READ_CONTACTS, declared) + notification senders + cloud contacts |
| Contact 360 (profile, AI profile, activity, calendar, business, docs, clocks, messages) | working | HYBRID | Person profile (tabs) | M6 (personal), M10 (business tabs) | G3 | AI profile computed locally (chunked) or imported |
| Relationships grid + health | working | HYBRID | People → Relationships | M6 | — | Port `health.py`, `cadence_learner.py` to Kotlin |
| Relationship detail (health history, clocks, goals) | working | HYBRID | Relationship detail | M6 | — | |
| Goals + detail (link entities, progress, timeline) | working | HYBRID | Goals, Goal detail | M6 | G3 for sync | |
| Life Timeline | working | HYBRID | Timeline | M6 | — | |
| Calendar (events, promises, prep) | working | HYBRID | Calendar | M6 | G3 | Reads device calendar (READ_CALENDAR, disclosed); writes via intents or the user's chosen calendar |
| AI Advisor (sessions, modes, memory, personalize, companion feed) | working | HYBRID | Ask Zuri | M4 (local), M13 (cloud companion parity) | — | Local model by default; cloud advisor only with remote-AI consent |
| Proactive nudges (send, regenerate, skip) | working | HYBRID | Recommendations | M6, M9 | G4 (send) | Local nudges from local cadence; send = RemoteInput reply or cloud send |
| Knowledge Brain (docs, facts, graph, Q&A) | working | HYBRID | Knowledge | M6 (local notes/docs), M13 (cloud KB) | G3 | Local RAG via on-device embeddings |
| Memory inspection & management | partial (advisor inspector + settings) | LOCAL (first-class) | Memory Inspector | M4 | — | Android makes this a first-class screen (brief §8) |
| Commitments / promises | working (calendar promises, `contact_promises`) | HYBRID | Commitments list + person tab | M4 | — | Core local extraction output |
| Tasks | working (contact tasks, project tasks) | HYBRID | Tasks | M4, M10 | G3 (project_tasks lacks updated_at) | |
| Opportunities (relationship) | working | HYBRID | Recommendations / person | M6 | — | |
| Connection value / network value | working (server JSONB) | HYBRID | Person → value card | M6 | — | Server-authoritative cache when connected |

## 3. Communication intelligence

| Feature | Web status | Android mode | Surface | Milestone | Depends | Notes |
|---|---|---|---|---|---|---|
| Notification capture (WhatsApp, WA Business, Telegram, Signal, Messenger, Slack, Gmail, SMS apps) | n/a (companion relay, broken) | NATIVE | Sources, Inbox | M2 | — | Source adapters; per-app consent |
| Inbox (conversation list, filters, unread, needs reply) | working | HYBRID | Inbox | M2 (local), M8–M9 (cloud) | G3, G5 | Unified view; provenance per message (phone vs cloud) |
| Conversation thread (bubbles, reactions, media, forward, pin, star) | working | HYBRID | Conversation | M2, M9 | G3, G6 | Phone-captured messages are text + placeholders only |
| Reply dock with AI suggestions | working | HYBRID | Reply sheet | M4 | — | Local draft generation; send via RemoteInput (tap) or cloud |
| Send via cloud WhatsApp session | working | CLOUD | Send (cloud) | M9 | G4 | Idempotency required before enabling |
| Media send/receive, voice recorder | working | CLOUD | Attach | M13 | G4 | |
| Voice-note transcription | incomplete | ONLINE (cloud) / NATIVE (optional local) | Transcribe | M13 / M14 | — | Local only if D-14 approves sherpa-onnx |
| Conversation summary, follow-up, analyze, ask | working | HYBRID | Thread → Summary / Ask | M4 | — | Local model first |
| AI reply queue (`/inbox/queue`) | working | CLOUD | Inbox → Queue filter | M9 | G3 | Cloud suggestions merged with local drafts |
| Action bundles (order → deal/stock/doc/reminder) | working | CLOUD (execute) + LOCAL (detect) | Bundle card | M10 | G4 | Local detection proposes; execution on cloud ERP |
| Advisor watch replies + narration | working | HYBRID | Thread → Watch | M13 | G6 | Local watch works on phone-captured messages |
| Scoped automation grants + audit log | working | CLOUD | Thread → Automate | M13 | G4 | Never auto-send from the phone (feasibility §1.5) |
| Assign/lock/team notes | working | CLOUD | Thread menu | M13 | G6 | Org feature |
| WhatsApp Status stories | working | CLOUD | Inbox stories row | M13 | G6 | |
| Broadcasts | working (orphaned) | CLOUD | Business → Broadcasts | M13 | G4 | |
| Escalations | working | CLOUD | Business → Escalations | M13 | — | |
| Daily inbox briefing, sync status/cancel | working | CLOUD | Inbox header | M8 | — | |
| Contact matching | server: JID; phone: name | LOCAL | Identity resolution | M2, M8 | G5 | Fuzzy fingerprint + user confirmation |
| Communication preferences / voice profile | working (server) | LOCAL | Settings → Voice | M4 | — | Port `BUILD_USER_VOICE_PROFILE`; should stay local |

## 4. Business Studio

| Feature | Web status | Android mode | Surface | Milestone | Depends | Notes |
|---|---|---|---|---|---|---|
| Studio Overview (AI business advisor, insights, financial overview) | working | CLOUD + ONLINE | Studio home | M10 | — | Insights are SQL on the server |
| Business profiles / brand kit / signatures | working | HYBRID | Workspace settings → Brand | M10, M11 | G3 | Local-only users keep brand locally |
| Workspaces | absent server-side | LOCAL | Workspace switcher | M5 | G9 (optional) | D-04 |
| Contacts / companies / customers (LTV, tiers) | working | CLOUD + LOCAL | CRM, Companies | M10 | G3 | Companies are a contact facet on the server (`company` field) |
| Leads pipeline | working | CLOUD | Leads | M10 | G3 | |
| Deals / opportunity pipeline | working | HYBRID | Pipeline board, Opportunity detail | M10 | G3, G4 | Local deals for local-only users |
| Projects (+ tasks, milestones, time, budget, templates) | working | HYBRID | Projects, Project detail | M10 | G3, G4 | Time tracking gets a native foreground timer |
| Products / services / catalog (families, variants, pricing tiers, capacity, workflow) | working / incomplete (catalog AI helper) | HYBRID | Catalog, Product detail | M10 | G3 | Local catalog powers offline quotes |
| Inventory (movements, locations, transfers, reserve) | working | CLOUD | Inventory | M10 | G4 | Ledger writes need idempotency |
| Suppliers + purchase orders | working | CLOUD | Suppliers, POs | M10 | G4 | |
| Sales orders, receivables aging, financial ledger | working | CLOUD | Sales | M10 | — | |
| Pricing (margins, goal conflict check) | working | CLOUD | Catalog → Pricing | M10 | — | |
| Business rules (facts) | working | HYBRID | Knowledge → Rules | M10 | — | |
| Business feed / "Zuri Noticed" | working | HYBRID | Studio → Noticed | M10 | G3 | Local detections + cloud feed |
| Marketing content (AI social posts) | working (no publishing) | ONLINE | Studio → Marketing | M13 | — | |
| Social account connect | placeholder | — | not built until web builds it | — | — | Follows web |
| Agents (workforce) + detail | incomplete / working | CLOUD | Business → Agents | M13 | — | |
| Automation rules | incomplete (missing endpoint) | CLOUD | — | M13 | web fix | Follows web once fixed |
| Team & organization | working | CLOUD | Settings → Organization | M13 | — | |
| E-signatures (brand signatures; client e-sign on public page) | working | CLOUD | Document → Sign | M11 | — | Capture via native signature pad |

## 5. Business Intelligence

| Feature | Web status | Android mode | Surface | Milestone | Depends | Notes |
|---|---|---|---|---|---|---|
| Executive dashboard, sales, customers, conversations, operations, opportunities, predictions, health score, ROI, timeline, campaigns | working | ONLINE (cached) | BI screens (mobile-composed, not web dashboards shrunk) | M12 | — | 11 server endpoints, read-only |
| Reports hub | placeholder | — | follows web | — | — | |
| Natural-language business queries | working (`/api/search/ask`) | HYBRID | Ask (business context) | M12 | — | Local `ASK_ANYTHING` over local tables + cloud fallback with consent |
| Evidence-backed insights | partial (insights cards, Reality Engine evidence) | HYBRID | Insight cards with "why" | M12 | — | Every insight cites its query/records |
| Client health, project risk, invoice intelligence | working (SQL) | CLOUD/LOCAL | Studio + BI | M10, M12 | — | |
| Document analytics | working | ONLINE | Documents → Insights | M11 | — | |

## 6. Document generation

| Feature | Web status | Android mode | Surface | Milestone | Depends | Notes |
|---|---|---|---|---|---|---|
| Document list/filter/search | working | HYBRID | Document Studio home | M11 | G3 | |
| 18 business types (quotation … expense claim) | working | HYBRID | Type selector | M11 | — | Registry mirrors `PHASE_0_TYPES` |
| Create manually (4-step wizard) | working | LOCAL + CLOUD | Editor | M11 | G4 | |
| AI generate from instruction | working | HYBRID | Create from natural language | M11 | — | Local model drafts structure; code computes money |
| Missing-information workflow | absent | NATIVE | Missing info sheet | M11 | — | New; never invent |
| Templates (8 business, 7 career) | working | LOCAL | Template selector | M11 | — | Same `@zuri/pdf-templates` rendered in WebView (D-09) |
| Brand profiles, numbering per profile | working | HYBRID | Workspace brand | M11 | G4 | Offline numbering policy (D-10) |
| PDF render + preview | working (client render) | LOCAL | Preview | M11 | — | |
| DOCX export | absent | NATIVE | Export | M11 | — | From MeetingMind DOCX renderer |
| Validation / quality check | working (AI quality check) | LOCAL + ONLINE | Validation panel | M11 | — | Deterministic rules first, AI check optional |
| Provenance inspector | absent | NATIVE | Sources sheet | M11 | — | New |
| Version history, revise, duplicate, convert quote→invoice→receipt | working | HYBRID | Versions, actions | M11 | G3 | |
| Status lifecycle (sent/accepted/paid…) | working | CLOUD (sync) / LOCAL | Status chips | M11 | G4 | |
| Send via WhatsApp (cloud) | working (`/send`) / broken (`/send-whatsapp`) | CLOUD | Share → Zuri WhatsApp | M11 | G4 | Use `/send` only |
| Share via Android share sheet | n/a | NATIVE | Share | M11 | — | |
| Per-document AI chat | working | HYBRID | Editor → Ask | M11 | — | |
| Recurring documents, business packs | working | CLOUD | Document Studio → Automations | M13 | — | Server-executed |
| Public share page / client e-sign | working (middleware bug) | CLOUD (web link) | Share link | M11 | web fix | Opens the web page |
| Career documents (resume, cover letter, letters, reference sheet, portfolio PDF) | working | CLOUD | Career | M13 | — | |

## 7. Career

| Feature | Web status | Android mode | Milestone | Notes |
|---|---|---|---|---|
| Career OS home (feed, fetch jobs, radar, noticed, progress) | working | CLOUD + ONLINE | M13 | Job discovery is server web search |
| Opportunity detail (readiness, company intel, intro path, tailoring, interviews, apply→project) | working | CLOUD + ONLINE | M13 | |
| CV Studio wizard (14 steps), templates, health, ATS | working | CLOUD | M13 | Rewrite-only AI: can run locally (`REWRITE_CV_TEXT`) |
| CV editor (sections, versions) | partial (AI suite mocked) | CLOUD | M13 | Do **not** port the mock AI suite |
| Public portfolio | placeholder | — | — | Follows web |
| Career passive detection from messages | working | HYBRID | M4/M13 | Tier B local extractor |

## 8. Settings, billing, admin

| Feature | Web status | Android mode | Milestone | Notes |
|---|---|---|---|---|
| Account, workspace, currency | working | HYBRID | M1, M7 | |
| AI Engines (BYOK, provider pick, Business Manager, Reality Engine toggles) | working (list decorative) | LOCAL + CLOUD | M3, M13 | Android shows only real toggles |
| Auto Responses trust tiers, audiences, exclusions | working | CLOUD | M13 | Affects cloud agent only; phone never auto-sends |
| Memory (agent memories, facts) | working | HYBRID | M4, M13 | |
| Privacy (retention, assistant, exclusions, export, clear, delete account) | working (export bug) | LOCAL + CLOUD | M1, M7, M15 | Android adds Privacy Center |
| Enterprise (API keys, webhooks) | broken | CLOUD | M13 | Follows web fix |
| Connected social accounts | working | CLOUD | M13 | |
| BYOK management + AI usage logs | working | CLOUD + LOCAL | M3, M13 | Device BYOK keys in Keystore, separate from cloud BYOK |
| Profile, diagnostics, token usage, intelligence health | working | HYBRID | M15 | Android diagnostics include model, listener health |
| Billing / membership / guided mobile-money payment | working (hidden) | ONLINE | M13 | Play billing policy (R-12) |
| Redeem gift | working | ONLINE | M13 | |
| Organization / team | working | CLOUD | M13 | |

---

## 9. Proposed exclusions (require explicit approval — D-12)

| Area | Reason | Alternative |
|---|---|---|
| Public marketing site (15 static pages) | Not an app feature | Link to the website |
| Admin console (11 pages: users, sessions, queues, payments approval, revenue, promotions, reviews) | Operator tooling; high-privilege actions on a phone increase risk | Keep web-only. If wanted, a read-only "Admin glance" later. |
| Admin-setup bootstrap | One-time operator action | Web only |

Everything else in this matrix is **in scope** for Android.

## 10. Mobile-native additions (no web equivalent)

| Capability | Milestone |
|---|---|
| Notification capture with per-source adapters, coverage indicator, listener health | M2 |
| On-device models: catalog, download, compatibility, routing, "What leaves my phone" | M3 |
| Memory Inspector with provenance and confidence | M4 |
| Context switcher with isolation guarantees | M5 |
| Reply through the notification's RemoteInput (tap to send) | M4 |
| App lock, biometric vault, FLAG_SECURE, recents protection | M1 |
| Share-sheet import (WhatsApp "Export chat" .txt, PDFs into Knowledge) | M14 |
| Home-screen widget (Today), Quick Settings tile (pause capture) | M14 |
| Native project timer (foreground) | M10 |
| DOCX export | M11 |
