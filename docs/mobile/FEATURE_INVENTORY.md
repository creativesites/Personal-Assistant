# Zuri Android — Feature Inventory (Audit A + backend capabilities)

> Part of the Zuri Android initial engagement (audit phase), 2026-11-24. Read-only. Paths are relative to `apps/web/src/app/` unless noted. Every web-called endpoint was cross-checked against the route literals registered in `services/api/src`. Pages were **not** exercised in a browser, so visual behaviour is unverified.

## Status vocabulary

The brief's classification maps onto the labels used in the tables below as follows:

| Brief classification | Label used below | Meaning |
|---|---|---|
| Implemented and working | **working** | Calls real, existing endpoints with real handlers |
| Implemented but incomplete | **incomplete** | Real, but contains a broken/missing endpoint or dead UI |
| Partially implemented | **partial** | Significant parts are mock or static |
| Planned but not implemented | **placeholder** | Static / no real data / "coming soon" |
| Deprecated | **legacy** | Superseded code still imported |
| Unknown / requires verification | flagged inline as *verify* | Could not be confirmed from code alone |

A route existing is **never** treated as evidence of implementation; every "working" row cites the endpoints it calls.

## Summary by domain

| Domain | Pages | working | incomplete | partial | placeholder | Notes |
|---|---|---|---|---|---|---|
| Personal intelligence | 12 | 12 | – | – | – | Memory has no page (advisor inspector + settings) |
| Communication | 4 | 4 | (1 dead UI) | – | – | `/broadcasts` orphaned from nav |
| Business Studio / ERP | 8 (+13 Studio modules) | 7 | 1 (Studio: 2 modules) | – | Social module | `/projects` not in nav |
| Business Intelligence | 12 | 11 | – | – | Reports | |
| Documents | 2 + shared components + public share | all | – | – | – | Public share blocked by middleware |
| Career | 5 (+ public portfolio) | 4 | – | CV editor | Portfolio | AI Suite is a mock |
| Agents / automation | 3 | 1 | 2 | – | – | |
| Billing / membership | 2 (+ public pricing) | all | – | – | – | Hidden while tiers flag off |
| Settings / profile / diagnostics / org | 8 | 7 | Settings → Enterprise | – | – | `/team` is an alias |
| Admin console | 11 | 10 | – | – | `/admin/logs` 404 | |
| Public marketing site | 15 | – | – | – | 15 static | Not a parity target (D-12) |

Totals: 90 pages; working ≈ 60, incomplete ≈ 9, partial ≈ 5, placeholder/static ≈ 15, alias 1.

---


## 1. Auth, session, JWT

- **Clerk** (`@clerk/nextjs`). `(auth)/login/page.tsx` and `register/page.tsx` render Clerk `<SignIn>`/`<SignUp>`; `sso-callback` pages handle OAuth redirect.
- `middleware.ts`: `clerkMiddleware`; public routes = `/`, marketing pages, `/admin-setup`, `/login`, `/register`, `/api/auth/clerk-sync`, `/api/proxy/*`, `/api/diagnostics/*`. Signed-in user on `/login|/register` → `/inbox`. Unauthed on protected → `/login` (API → 401 JSON).
  - **Bug:** `/shared/(.*)`, `/p/(.*)`, `/api/p/(.*)`, and marketing `/feedback` are **not** in the public matcher → unauthenticated customers opening a document share link or public portfolio are redirected to `/login`.
- `hooks/use-zuri-session.ts`: on Clerk sign-in, `POST /api/auth/clerk-sync` (Next route) → backend `POST /api/auth/clerk-sync` with `X-Internal-Secret` → returns `{token, user:{id, mode, marketingAccess, isAdmin, planFamily, isCompanyManaged, organization, onboardingCompleted}}`.
  - **JWT held in a module-level in-memory store** (`_store`, keyed by Clerk userId) — not localStorage/cookie. Lost on reload → re-synced. Re-syncs every 60 s while tab visible and on `visibilitychange`; `refreshZuriSession()` exported for post-payment.
  - `setStoredMode()` broadcasts mode changes; company-managed users are locked to `business` mode.
  - Exposed as `session.data?.accessToken`, `.mode`, `.planFamily`, etc.; `status: loading|authenticated|unauthenticated`.
- `lib/api.ts` `apiClient(path, {token, ...})` → `${NEXT_PUBLIC_API_URL}${path}`, `Authorization: Bearer`, auto `'{}'` body for writes, throws `ApiError(status, msg, data)`. Many pages bypass it with raw `fetch` + same header.
- `hooks/use-api.ts` `useApi<T>(path|null, token)` → `{data, loading, error, refetch}`.
- Uploads/binaries go through `/api/proxy/api/...` (e.g. knowledge upload, CV PDF).
- No forced redirect to `/onboarding` for new users; onboarding is reached via dashboard checklist / "Reconnect" links (`/onboarding?reconnect=true`).
- Server currently runs `FREE_TESTING_MODE` → session `planFamily='enterprise'`, so all `FeatureGate requiredFamily` checks pass; Billing nav hidden unless `NEXT_PUBLIC_TIERS_ENABLED=true`.

## 2. Navigation (`(dashboard)/layout.tsx`)

Sidebar (desktop md+, **dark `bg-gray-950`**, collapsible hubs persisted in localStorage `zuri-nav-collapsed-groups`, minimizable). Items filtered by `showForModes`; groups optionally by `requiresMarketingAccess`.

| Hub | Items (mode restriction) |
|---|---|
| 💬 Inbox Hub | Dashboard · Inbox (badge) · AI Reply Queue `/inbox/queue` (business, hybrid) · Proactive Nudges · AI Advisor · Notifications (unread count) |
| 👥 Customers Hub | Contacts CRM · Sales Leads (business, hybrid) · Relationships (personal, hybrid) · Goals · Business & Life Timeline · Activity Feed `/feed` (business, hybrid) |
| 📄 Operations Hub | Business ERP & Quotes `/business` (b,h) · Brand Studio & Catalog `/studio` (b,h) · Documents & Signatures `/business` (**duplicate href**) (b,h) · Knowledge Brain `/knowledge-base` · Autonomous Workforce `/agents` (b,h) · Agent Escalations (badge) (b,h) · Career OS & CV Studio · BI Analytics & Reports (b,h) · Calendar |
| ⚙️ Workspace Hub | Organization & Team (b,h) · Billing & Plans (only if TIERS_ENABLED) · Settings & BYOK · Give Feedback · System Diagnostics |
| Footer | Billing (flag) · Settings · Profile · Diagnostics; plus link to `/settings/ai` |

- **Not in nav (orphans/deep-link only):** `/projects` (reached from chat-formatter cards, goals, career), `/broadcasts` (no inbound link at all), `/automation` (no nav entry; agents page covers it), `/team` (alias of organization), `/business/analytics` and `/business/brand-studio` (from `/business` dropdown), `/settings/ai` (footer link), `/career/jobs/[id]`, `/career/cv-studio/*`, `/redeem/[code]`.
- **Mobile bottom tab bar** (4 tabs by mode): business: Home/Inbox/Studio/Documents · personal: Home/Inbox/People(`/relationships`)/Documents · hybrid: Home/Inbox/Studio/Documents. Bar is minimizable. (CLAUDE.md's described tab sets — Contacts/Queue/Proactive — are outdated.)
- Mobile top bar: hamburger (drawer sidebar), logo, search, notifications.
- Global chrome: `CommandPalette` (⌘K), `SubscriptionStatusBanner` (read-only/grace), `WAReconnectModal` (QR/link code via socket), WA-disconnected banner, socket connection pill (offline/reconnecting/syncing), `GuidedTourProvider` + `TourTriggerButton`, `PwaInstallPrompt`, `DashboardFeedbackPrompt` (review modal), BYOK key check (`GET /api/byok/keys`), notification toast on `notification:new`.
- **Command palette** (`components/command-palette.tsx`): views root / pick-contact / create-deal / ask-results. Static actions: Ask AI Advisor, View Relationships, View Recommendations, Export Relationships CSV, Export Leads CSV, Create Deal… (`POST /api/deals`), Add Task…, Run Health Recalculation… (`/api/contacts/:id/recalculate-health`); live contact search; Enter = "Ask About Anything" (`POST /api/search/ask`).

## 3. Real-time (Socket.io, `lib/socket.ts`)

Singleton `getSocket(token)`; on connect emits `authenticate` (token) → `authenticated` → emits `sync:request {lastSeenSeq}` (seq persisted in localStorage `zuri_socket_last_seq`) → `sync:replay {missed[], latestSeq}` / `sync:complete`. Status via `useSocketStatus`.
- **Bug:** `sync:replay` "re-emits" missed events with `socket.emit(...)`, which sends them **to the server**, not to local listeners — replayed events never reach handlers.

Events listened to:

| Event | Where |
|---|---|
| `notification:new` | layout (toast + badge) |
| `whatsapp:connected`, `whatsapp:disconnected` | `hooks/use-wa-status.ts` (also polls `/api/whatsapp/status` 8 s transitional / 30 s stable) |
| `whatsapp:qr`, `whatsapp:link_code` | `_components/wa-reconnect-modal.tsx` |
| `message:new`, `message:reaction`, `message:status:update`, `conversation:upsert`, `conversation:read`, `conversation:assigned`, `conversation:locked`, `conversation:unlocked`, `history:progress`, `suggestion:ready`, `suggestion:failed`, `bundle:ready`, `presence:update`, `agent:default-updated`, `byok:error`, `authenticated`, `reconnect` | `inbox/page.tsx` |
| `advisor.narration_ready` | `inbox/_components/intel-panel.tsx` |
| `reality.resolved` | `proactive/page.tsx` |
| `career.job_discovery.progress` | `career/_components/use-job-discovery-run.ts` (falls back to 3 s polling) |

Not listened to anywhere despite CLAUDE.md: `advisor.reply_received` (only narration_ready is used).

---

## 4. Personal intelligence

| Route | File | What it does | Main endpoints | Key components | Gating | Status |
|---|---|---|---|---|---|---|
| `/dashboard` | `(dashboard)/dashboard/page.tsx` (1219) | Home: setup checklist, Business/Personal health, "Your Week in Review", Needs Reply, Needs Attention, AI Daily Brief, Proactive queue (send/regenerate), Zuri Marketing card, quick actions, test-message simulator, Train-your-AI widget | `/api/proactive/brief`, `/api/proactive`, `/api/proactive/:id/{send,regenerate}`, `/api/reflection/latest`, `/api/analytics/health-rollup`, `/api/analytics/campaigns`, `/api/contacts`, `/api/conversations`, `/api/conversations/simulate-test-message`, `/api/business-facts`, `/api/business-profile`, `/api/settings/auto-response`; widget: `/api/knowledge/documents`, `/api/knowledge/suggestions*`, `/api/proxy/api/knowledge/upload` | `_components/train-your-ai-widget.tsx`, `executive-achievements.tsx`, `components/executive-roi-summary.tsx` | sections switch on mode (business/personal/hybrid) | working |
| `/contacts` | `contacts/page.tsx` (1438) | CRM grid/list, filter/sort/search, add contact, tags, bulk actions, CSV bulk import | `/api/contacts`, `/api/contacts/:id`, `/api/contacts/:id/tags`, `/api/contacts/bulk`, `/api/contacts/bulk-import` | add-contact modal | lead-score UI hidden in personal mode | working |
| `/contacts/[id]` | `contacts/[id]/page.tsx` (2821) | Contact 360. Tabs: Profile · AI Profile · Activity (note/call/meeting/email/quote/stage-change logging) · Calendar · Business (business timeline, financial ledger) · Docs · Clocks · Messages. Per-contact AI mode Observe/Co-Pilot/Autopilot, tasks, goals, context entries, purchase-likelihood card, health recalc | `/api/contacts/:id` (+ `/activities`, `/business-timeline`, `/clock(/:id)`, `/context(/:id)`, `/documents(/:id)`, `/events(/:id)`, `/financial-ledger`, `/messages`, `/profile`, `/recalculate-health`, `/tags`, `/tasks(/:id)`), `/api/conversations?contactId=`, `/api/conversations/:id/analyze`, `/api/documents?contactId=`, `/api/goals(/:id)`, `/api/predictions/purchase_likelihood/:id`, `/api/products`, `/api/social-posts` | edit contact modal | AI/lead/business tabs hidden in personal mode | working |
| `/relationships` | `relationships/page.tsx` | Relationship health grid, filters (needs attention, dormant…), analyze-all | `/api/relationships`, `/api/relationships/analyze-all` | — | nav: personal/hybrid | working |
| `/relationships/[id]` | `relationships/[id]/page.tsx` (1047) | Relationship detail: overview, health history, clocks, relationship goals | `/api/relationships/:id`, `/clocks(/:id)`, `/goals`, `/health-history`, `/api/goals(/:id)`, `/api/contacts/:id` | — | — | working |
| `/goals` | `goals/page.tsx` | Cross-module goals list (all/active/achieved/paused/abandoned) + create | `/api/goal-profiles` | New Goal modal | — | working |
| `/goals/[id]` | `goals/[id]/page.tsx` | Goal detail: progress, timeline, link deal/project/product/contact/document | `/api/goal-profiles/:id`, `/link`, `/link/:linkId`, `/api/{contacts,deals,documents,products,projects}` | link-entity modal | — | working |
| `/timeline` | `timeline/page.tsx` | Life Timeline grouped by month | `/api/reflection/timeline` | — | — | working |
| `/calendar` | `calendar/page.tsx` (1220) | Month grid, day list, event CRUD (appointment/anniversary/celebration…), promises (fulfill), prep checklist | `/api/calendar/events(/:id)`, `/api/calendar/promises/:id(/fulfill)`, `/api/contacts` | event modal | — | working |
| `/advisor` | `advisor/page.tsx` (1130) | Full-height AI chat with sessions; companion mode chips (balanced/best_friend/coach/soft/business/dating/analyst/gossip, spiritual when set); right inspector tabs Context/Memory/Personalize; "Zuri Noticed" companion-feed card; `[ACTION:…]` cards via ChatFormatter; generate_document | `/api/advisor/sessions(/:id)`, `/api/advisor/sessions/:id/messages`, `/api/advisor/memories(/:id)`, `/api/advisor/profile`, `/api/advisor/companion-feed`, `/companion-feed/:id/dismiss`, `/api/documents/ai-generate` | `components/ui/chat-formatter.tsx`, BYOK fast-track card | — | working |
| `/proactive` | `proactive/page.tsx` | Nudge queue: approve/send, regenerate, skip, recommendations; refetch on `reality.resolved` | `/api/proactive(/:id)`, `/:id/send`, `/:id/regenerate`, `/api/proactive/recommendations`, `/api/opportunities/:id` | — | — | working |
| `/notifications` | `notifications/page.tsx` | All/unread, mark read, mark all read | `/api/notifications`, `/:id/read`, `/read-all` | — | — | working |
| `/knowledge-base` | `knowledge-base/page.tsx` (2207) | "Knowledge Brain": tabs Memory Dashboard / Fact & Policy Roster / Documents Vault / Knowledge Graph / Search & Q&A Studio; upload docs, add URL, reindex, duplicates merge, auto-captured suggestion queue, business facts by category | `/api/knowledge/*` (documents, chunks, add-url, reindex, duplicates, graph, search, chat, analytics, suggestions…), `/api/business-facts*`, `/api/proxy/api/knowledge/upload` | — | — | working |
| "Memory" | (no page) | Advisor memory lives in `/advisor` inspector; data export/clear in Settings → Memory/Privacy | — | — | — | n/a |

## 5. Communication

| Route | File | What it does | Main endpoints | Key components | Gating | Status |
|---|---|---|---|---|---|---|
| `/inbox` | `inbox/page.tsx` (2533) + 25 `_components` | WhatsApp inbox: 3-panel desktop / pane switch mobile. Paginated chat list with filters (all/unread/needs_reply/hot_leads/vip/waiting/assigned_to_me), bulk delete, sync banner + cancel, daily briefing. Thread: bubbles, reactions, media (lightbox, audio waveform, transcribe), forward, pinned msg, group participants drawer, presence. Reply dock: AI suggestions (approve/dismiss/regenerate), ghost-text, slash commands, emoji, attachments, voice recorder, schedule. Status stories bar, post status, view/reply status. Lock/unlock, assign to teammate, default agent. Intel panel (tabs overview/memory/activity/chat/files): contact facts, privacy settings, tasks, Advisor conversation chat with evidence cards, approval cards (send), Watch replies + narration, scoped Automate grants + audit log, action bundles, quote/document suggestion cards, quick doc modal, auto-response exclusions | `/api/conversations(?limit&offset)`, `/api/conversations/:id/{messages,messages/:mid,messages/:mid/react,read,media,forward,analyze,summarize,followup,context,ask,ask/messages,assign,lock,unlock,participants}`, `/api/conversations/bulk-delete`, `/api/conversations/messages/:id/transcribe`, `/api/messages/:id/{suggestions,regenerate}`, `/api/suggestions/:id/{approve,dismiss}`, `/api/inbox/{briefing,sync-status,sync-cancel}`, `/api/statuses(/:id/reply)`, `/api/contacts/:id(/promises,/refresh-avatar,/privacy-settings,/tasks)`, `/api/proactive/:id`, `/api/settings/auto-response/exclusions(/:id)`, `/api/agents/default`, `/api/team`, `/api/system/queue-health`, `/api/action-bundles`, `/api/advisor/{actions,actions/:id/{approve,execute,cancel},watch(/:id),automation-grants(/:id/revoke,/audit-log)}`, `/api/documents(/:id/send, /generate, /send-whatsapp)`, `/api/calendar/events` | `intel-panel.tsx` (2273), `message-bubble.tsx` (1095), `reply-dock.tsx` (723), `action-bundle-card.tsx`, `voice-recorder-dock.tsx`, `status-*`, `quick-doc-modal.tsx`, `quote-suggestion-card.tsx`, `document-suggestion-card.tsx` | business-only intel sections hidden in personal mode | working, **one dead UI**: intel-panel "Suggested Actions" list renders `MOCK_ACTIONS` (Follow up tomorrow / Offer 10% discount / Send catalogue / Book appointment / Create invoice) as buttons **with no onClick** |
| `/inbox/queue` | `inbox/queue/page.tsx` | Pending AI reply suggestions approve/edit/skip | `/api/suggestions/pending`, `/:id/approve`, `/:id/dismiss` | — | nav: business/hybrid | working |
| `/broadcasts` | `broadcasts/page.tsx` (183) | Broadcast list, create, send, cancel | `/api/broadcasts`, `/:id/send`, `/:id/cancel` | New broadcast modal | none | working but **orphaned (no nav link)** |
| `/escalations` | `escalations/page.tsx` | Agent escalations requiring human attention; resolve | `/api/escalations?status=`, `/api/escalations/:id` | — | nav b/h | working |

## 6. Business Studio / ERP

| Route | File | What it does | Main endpoints | Gating | Status |
|---|---|---|---|---|---|
| `/studio` | `studio/page.tsx` (3046) + `_components/` | Tabbed Business OS — 13 modules (below) | see below | `FeatureGate requiredFamily="professional"`; nav b/h | incomplete (see modules) |
| `/business` | `business/page.tsx` (1615) | Documents workspace: filter all/quotation/invoice/receipt; manual + AI create; status transitions (sent/accepted/rejected/paid/archive); convert quote→invoice→receipt; duplicate; quality check; per-doc AI chat; send via WhatsApp; semantic search; insights; Automatic Business Packs (new customer, renewal); recurring documents CRUD; delete/archive; embedded Signatures, Brand, Payment-settings modules; links to brand-studio & analytics | `/api/documents*` (incl. `/ai-generate`, `/:id/{chat,convert,duplicate,quality-check,send,status}`, `/search`, `/insights`, `/packs/:k/run`), `/api/recurring-documents(/:id)`, `/api/business-profile`, `/api/contacts` | nav b/h | working |
| `/business/brand-studio` | `business/brand-studio/page.tsx` | Theme presets, fonts, colors → saves business profile; static mock document preview canvas | `/api/business-profile` | — | working (preview is a static mockup) |
| `/business/analytics` | `business/analytics/page.tsx` | Document & financial analytics summary | `/api/documents/analytics/summary` | — | working |
| `/projects` | `projects/page.tsx` | Projects list (active/on hold/completed/cancelled) + create | `/api/projects`, `/api/contacts` | — | working, **not in nav** |
| `/projects/[id]` | `projects/[id]/page.tsx` (1050) | Tasks (todo/in_progress/done/blocked), milestones, time tracking (start/stop/manual), budget card, apply template, generate linked document, link to goal, link to career opportunity | `/api/projects/:id`, `/tasks(/:tid)`, `/milestones(/:mid)`, `/time-entries(/start, /:eid/stop)`, `/documents`, `/apply-template`, `/api/goal-profiles(/:id/link)` | — | working |
| `/feed` | `feed/page.tsx` | Business Feed ("Zuri Noticed"), event-type filter pills, show dismissed, dismiss | `/api/business-feed?…`, `/api/business-feed/:id/dismiss` | nav b/h | working |
| `/leads` | `leads/page.tsx` (1309) | Lead pipeline hot/warm/cold/negotiation stages, score meters, quotes, stage moves | `/api/leads`, `/api/leads/:id/stage` | nav b/h | working |

**Studio modules** (`MODULES` in studio/page.tsx):

| Module | Location | Endpoints | Status |
|---|---|---|---|
| Overview (AI Business Advisor chat with ACTION cards, Zuri Insights, Financial Overview, recent events) | inline | `/api/advisor/sessions*` (category=business), `/api/studio/insights`, `/api/studio/financial-overview`, `/api/studio/preset`, `/api/studio/auto-extract`, `/api/contacts/:id(/messages)`, `/api/conversations/:id/messages`, `/api/calendar/events`, `/api/documents/ai-generate` | working |
| Sales & Orders | `_components/sales-module.tsx` | `/api/studio/sales/orders(/:id/status)`, `/api/studio/receivables/aging`, `/api/documents`, `/api/documents/:id/convert` | working |
| Catalog (families/attributes, variants, co-purchases, WhatsApp catalog sync, secondary items, AI content generation) | `_components/catalog-module.tsx` (2279) | `/api/products*`, `/api/product-families*`, `/api/product-attribute-definitions/:id`, `/api/suppliers`, `/api/documents*`, `/api/signatures`, **`/api/advisor/chat` (does not exist)** | incomplete |
| Services (pricing tiers, capacity, workflow, deliverables, start project) | `_components/services-module.tsx` | `/api/products*`, `/pricing-tiers`, `/capacity`, `/workflow-stages`, `/start-project` | working |
| Customers (LTV, tiers, outstanding) | `_components/customers-module.tsx` | `/api/studio/customers` | working |
| Inventory (stock adjust, movements, locations, transfers) | inline | `/api/products/:id/stock-movements`, `/api/inventory-locations(/:id)` | working |
| Pricing (margin, price-conflict check vs goals) | inline | `/api/products`, `/api/goal-profiles/check-price-conflict` | working |
| Suppliers (+ supplier products, purchase orders approve/receive) | inline | `/api/suppliers*`, `/api/purchase-orders(/:id/approve,/receive)`, `/api/documents?type=purchase_order` | working |
| Rules (business rules facts) | inline | `/api/business-facts?category=business_rule` | working |
| Brand (default + named brand profiles, signatures) | `_components/brand-module.tsx`, `signatures-module.tsx` | `/api/business-profile`, `/api/business-profiles(/:id, /set-default)`, `/api/signatures` | working |
| Knowledge | `_components/knowledge-module.tsx` | `/api/knowledge/*`, `/api/business-facts`, **`/api/knowledge/scrape` (does not exist)** | incomplete |
| Marketing (AI social posts per product) | inline | `/api/products`, `/api/social-posts`, `/api/social-accounts`, `/api/products/:id/generate(s)` | working (no real publishing) |
| Social (connect platforms) | inline | `/api/social-accounts` | **placeholder** — Connect buttons `alert("… OAuth connection coming soon")` |

## 7. Business Intelligence (`/analytics/*`, all `FeatureGate requiredFamily="business"` on the root; nav b/h; `AnalyticsSubNav`)

| Route | File | Endpoint | Status |
|---|---|---|---|
| `/analytics` | `analytics/page.tsx` | `/api/analytics/executive`, `/api/conversations`, `/api/conversations/:id/analyze` | working |
| `/analytics/sales` | `analytics/sales/page.tsx` | `/api/analytics/sales` (zero-valued fallback on error) | working |
| `/analytics/customers` | | `/api/analytics/customers` | working |
| `/analytics/conversations` | | `/api/analytics/conversations` | working |
| `/analytics/operations` | | `/api/analytics/operations` | working |
| `/analytics/opportunities` | | `/api/analytics/opportunities` | working |
| `/analytics/predictions` | | `/api/analytics/predictions` | working |
| `/analytics/health` | | `/api/analytics/health` (Business Health Score A–F) | working |
| `/analytics/roi` | | `/api/analytics/roi` | working |
| `/analytics/timeline` | | `/api/analytics/timeline` | working |
| `/analytics/campaigns` | | `/api/analytics/campaigns`, `/recommendations` | working |
| `/analytics/reports` | `analytics/reports/page.tsx` | calls `/api/analytics/reports` (**route doesn't exist**, error swallowed; comment "Placeholder — endpoint not yet implemented") | **placeholder** — static link cards to other analytics pages + "Coming Soon" scheduled email reports |

## 8. Documents

| Route | File | What it does | Endpoints | Status |
|---|---|---|---|---|
| `/documents/new` | `documents/new/page.tsx` (1529) | 4-step wizard: type → client (contact picker or manual) → line items/catalog picker/dynamic fields → template/brand profile/signature/payment → save → client-side PDF render | `/api/documents`, `/api/documents/:id`, `/:id/render-context`, `/api/documents/ai-generate`, `/api/business-profile`, `/api/contacts`, `/api/proxy…` | working |
| `/documents/[id]/edit` | `documents/[id]/edit/page.tsx` | Full editor; draft → PATCH, else `/revise` then edit new draft | `/api/documents/:id`, `/:id/revise` | working |
| shared pickers | `documents/_components/*` | `ContactPicker`, `LineItemsEditor`, `TemplatePicker` (`/api/document-templates`), `BusinessProfilePicker` (`/api/business-profiles`), `CatalogPickerModal` (`/api/products`, `/pricing-tiers`), `DynamicDocFields` (1037 lines, per-type fields), `SignatureSelector` (`/api/signatures`), `PaymentSettingsModule` | working |
| PDF rendering | `components/documents/ClientPdfRenderer.tsx`, `DocumentPreviewModal.tsx`, `CvPdfPreviewModal.tsx` | Browser render with `@zuri/pdf-templates` + `@react-pdf/renderer` from `/render-context`, then upload bytes `POST /api/documents/:id/render-complete`; preview modal also lists `/versions` and sends `/send`. CV preview fetches server-rendered `/api/career/cvs/:id/pdf` via proxy | working |
| legacy | `components/generate-pdf/*` (EditableInput, InvoicePage, DownloadPDF…) | Older editable-invoice components, imported by `business/page.tsx` and brand-studio | legacy |
| `/shared/[token]` | `shared/[token]/page.tsx` (754) | Public customer document view: details, accept/reject action, comments, e-sign, pay | `/api/documents/shared/:token`, `/api/documents/public/:token/{details,action,comments,sign,pay}` | working **but blocked for logged-out users by middleware** |

## 9. Career

| Route | File | What it does | Endpoints | Gating | Status |
|---|---|---|---|---|---|
| `/career` | `career/page.tsx` + `_components/` | Career OS: onboarding modal (mode picker + quick-start), hero, progress strip, preferences bar, profile editor, unified Job Feed (opportunities + scraped jobs, Save/Hide, badges), Fetch Jobs with live progress, Career Radar, Zuri Noticed, Resume Studio (generate/upload/score/match), Cover Letter Studio (compose letter, reference sheet, portfolio PDF), opportunity cards (apply→project, interviews, intro path, readiness, company intel, CV tailoring); mode-adaptive section order | `/api/career/{profile,activity,opportunities(/:id),job-discovery/{status,run,run/:id},scraped-jobs,radar,resume(/upload,/:id/score,/:id/match),cover-letter,letters/compose,reference-sheet,portfolio-pdf,documents,employment-history,opportunities/:id/{apply,interviews,introduction-path,readiness,company-intelligence,match/:cvId,tailoring-suggestions}}`, `/api/career/interviews/:id`, `/api/documents/:id/pdf` | `FeatureGate requiredFamily="personal"` | working |
| `/career/jobs/[id]` | `career/jobs/[id]/page.tsx` (623) | Job detail tabs: Overview & Details / CV & Cover Letter / Company Intelligence / Ask Zuri Advisor; match analysis, manual readiness, create project | `/api/career/opportunities/:id`, `/create-project`, `/manual-readiness`, `/match-analysis` | — | working |
| `/career/cv-studio` | `cv-studio/page.tsx` | List CVs, create master CV | `/api/career/cvs` | — | working |
| `/career/cv-studio/[id]` | `cv-studio/[id]/page.tsx` | 14-step autosave wizard (`WizardShell`): personal, summary/objectives (AI rewrite toolbar), employment, education, certs, skills, awards, volunteer, memberships, publications, projects, references, additional info; live HTML preview; template picker; PDF download; CV Health + ATS | `/api/career/cvs/:id`, nine entry resources `/api/career/{employment-history,education,certifications,skill-groups,awards,volunteer-work,memberships,publications,references}(/:id)`, `/api/career/cv-assistant/{rewrite,suggest-metric}`, `/cvs/:id/{health,ats-score,project-links}`, `/api/projects` | — | working |
| `/career/cv-studio/[id]/editor` | `cv-studio/[id]/editor/page.tsx` | Web editor: section reorder/hide/rename, version history (restore/duplicate/compare JSON), template toolbar, ATS Match Engine, Bullet Transformer, Portfolio Studio panel, Cover Letter Generator, Interview Coach | `/api/career/cvs/:id(/sections,/versions,/duplicate)`, `/ats-score`; **`/api/career/ai-rewrite` (missing)**; `/api/career/ai-suite` (**Next route returning hardcoded text**, cover letter signed "Winston Zulu", canned interview questions/feedback); `/api/p/:slug` (**in-memory mock**) | — | **partial** |
| `/p/[slug]` | `p/[slug]/page.tsx` (784) | Public portfolio page with view analytics/inquiries | `/api/p/:slug` → Next route with in-memory stores and hardcoded profiles ("Sarah Jenkins", Winston special-case) | not in public matcher | **placeholder/mock** |

## 10. Marketing (product) / Agents / Automation

| Route | File | What it does | Endpoints | Gating | Status |
|---|---|---|---|---|---|
| `/agents` | `agents/page.tsx` (1027) | "AI Workforce Command Center": agents list/create/edit, metrics, test-draft, escalations, corrections | `/api/agents(/:id)`, `/api/agents/metrics`, `/api/agents/test-draft`, `/api/escalations`, **`/api/agents/corrections` (missing)** | `FeatureGate modes=[business,hybrid]` | incomplete |
| `/agents/[id]` | `agents/[id]/page.tsx` | Agent detail: permissions (send links, share pricing, book meetings), escalation triggers, conversation assignments | `/api/agents/:id`, `/:id/assignments(/:aid)` | — | working |
| `/automation` | `automation/page.tsx` (1239) | Hire agent, agent performance, escalations, automation rules list/toggle | agents/escalations endpoints + **`/api/automation/rules` (missing)** | `FeatureGate requiredFamily="business"`; no nav link | incomplete |
| Marketing (social content) | Studio Marketing/Social modules | see §6 | `marketingAccess` gates Settings "Connected Accounts" tab | partial |

## 11. Billing / Membership (hidden from nav while `NEXT_PUBLIC_TIERS_ENABLED` ≠ true)

| Route | File | What it does | Endpoints | Status |
|---|---|---|---|---|
| `/billing` | `billing/page.tsx` + `_components/` | MembershipCard, ProgressRing, UsageCards, BillingTimeline, plan catalog, `GuidedPaymentModal` (plan+period+BYOK → Airtel/MTN → pay-to → confirm with screenshot → waiting), Referral & Gift card, Student verification | `/api/subscriptions/me`, `/api/subscription-plans`, `/api/billing/{usage-summary,timeline}`, `/api/byok/keys`, `/api/subscriptions/checkout(/:id/confirm)`, `/api/referrals/me`, `/api/gifts`, `/api/student-verification(/me)` | working |
| `/redeem/[code]` | `redeem/[code]/page.tsx` | Redeem gift membership | `/api/gifts/redeem/:code` | working |
| `/pricing` (public) | `(marketing)/pricing/page.tsx` | Public plan catalog | `/api/subscription-plans`, `/api/byok` | working |
| hook | `hooks/use-subscription-status.ts` + `components/subscription-status-banner.tsx` | read-only/grace banner | `/api/subscriptions/me` | working |

## 12. Settings / Profile / Diagnostics / Organization / Admin

### `/settings` (`settings/page.tsx`, 3291 lines) — tabs
`account` · `workspace` · `brand_kit` · `intelligence` (label "AI Engines") · `auto_responses` · `memory` · `privacy` · `enterprise` · `connected_accounts` (only if marketingAccess). Tab bar: mobile horizontal pills, desktop sticky vertical list (matches Design System). Lazy-loads per tab.

| Tab | Contents / toggles | Endpoints | Status |
|---|---|---|---|
| Account | WA connection status (+ reconnect → `/onboarding?reconnect=true`), product tour launcher, billing link, profile | `/api/users/me`, `/api/users/me/stats`, `/api/whatsapp/{status,connect}` | working |
| Workspace | Workspace mode (business/personal/hybrid), preferred currency (ZMW/USD/GBP/EUR/ZAR), regional format | `/api/users/me` | working |
| Brand Kit | Business profile fields + asset upload | `/api/business-profile`, `/api/business-profile/assets` | working |
| AI Engines | BYOK card; AI provider/model picker (save pref); engine list (Proactive suggestions, Relationship clocks, World knowledge, Voice matching, Lead detection, Sentiment analysis) — **decorative, always-on `<Toggle enabled />`**; **real toggles:** Business Manager Assistant ("Proactive business formalization", `business_manager_paused`) and Reality Engine ("Keep Zuri's suggestions honest", `reality_engine_paused`) | `/api/advisor/profile` | working (engine list static) |
| Auto Responses | Default agent trust level: Off / Suggest (approve every) / Assisted / Delegated / Autonomous; master Auto-respond switch; audience toggles: respondToLeads, respondToCustomers, respondToNewContacts, skipGroups, skipBroadcasts; Inclusion-Only Mode; learnFromCorrections, smartFollowupEnabled; per-contact exclusions & inclusions (contact picker), NL exclusion rule parser, exclusion rules | `/api/settings/auto-response`, `/exclusions(/:id)`, `/exclusions/parse`, `/exclusion-rules(/:id)`, `/inclusions(/:id)`, `/api/agents`, `/api/agents/default`, `/api/contacts` | working |
| Memory | Agent memories list/delete; business facts approve/reject | `/api/agents/:id/memories(/:mid)`, `/api/business-facts*` | working |
| Privacy | Data retention ("keep insights forever" checkbox), AI Privacy Assistant (scan + Apply Strict Privacy bulk), privacy exclusions, export memory, clear all AI memories, CSV exports (contacts/conversations/full workspace), delete account request/cancel | `/api/data-retention`, `/api/privacy/{assistant,bulk-apply,account-status,delete-account-request,cancel-account-deletion}`, `/api/settings/privacy/exclusions(/:id)`, `/api/memory/{export,clear-all}`, `/api/export/*` | working |
| Enterprise | API keys, webhooks, BYOK | **`/api/enterprise/api-keys`, `/api/enterprise/webhooks`, `/api/enterprise/byok` — none exist** (API serves `/api/api-keys`, `/api/webhooks`); errors swallowed → always empty | **broken** |
| Connected Accounts | Social accounts list/disconnect | `/api/social-accounts(/:id)` | working |

### Other
| Route | File | What it does | Endpoints | Status |
|---|---|---|---|---|
| `/settings/ai` | `settings/ai/page.tsx` (964) | BYOK management (providers, keys add/delete/test, settings), AI usage analytics & logs | `/api/byok/{providers,keys(/:id),settings,test}`, `/api/ai/analytics`, `/api/ai/logs` | working |
| `/profile` | `profile/page.tsx` | User card, WA status/connect, stats, quick links | `/api/users/me/stats`, `/api/whatsapp/*`, `/api/business-profile` | working |
| `/diagnostics` | `diagnostics/page.tsx` (1234) | Connection checks (Clerk sync, auth/me, contacts, AI pipeline, advisor logs, WA service/instance), Historical Sync start/cancel/resume, config snapshot, Token Usage & AI Costs, Intelligence Health Score | `/api/diagnostics/{token-usage,intelligence-health,ai-pipeline,advisor-logs}`, `/api/admin/history-sync/*`, `/api/auth/me`, `/api/whatsapp/service-health`, Next `/api/diagnostics/*` | working |
| `/organization` | `organization/page.tsx` (1080) | Create org, tabs Members / Departments & Teams / Governance / Audit Trail / Org Settings; invite | `/api/organization/*` | `FeatureGate requiredFamily="business"` | working |
| `/team` | `team/page.tsx` (7) | Renders `OrganizationPage` | — | alias |
| `/give-feedback` | `give-feedback/page.tsx` | Feedback form | `/api/feedback` | working |
| `/onboarding` | `onboarding/page.tsx` (1245) | 4 steps: Profile (use case: Business & Team Inbox / Career & Freelance / Personal Admin) → WhatsApp (QR polling or phone link code) → Team invite → Verify (sync status, test message); `?reconnect=true` mode | `/api/whatsapp/{connect,status,test-message}`, `/api/inbox/sync-status`, `/api/team`, `/api/organization/invite`, `/api/auth/onboarding-complete` | working |
| `/admin-setup` | `admin-setup/page.tsx` | First-admin bootstrap | `/api/admin/setup(-status)` | working |

### Admin console `(admin)` — layout gates on `session.data.isAdmin`, dark theme
| Route | Endpoints | Status |
|---|---|---|
| `/admin` overview | `/api/admin/stats`, `/api/admin/queues/failed`, `/retry-failed` | working |
| `/admin/users`, `/admin/users/[id]` | `/api/admin/users(/:id)`, `/adjust-subscription`, `/api/admin/plans` | working |
| `/admin/sessions` | `/api/admin/sessions(/:id)` | working |
| `/admin/queues` | `/api/admin/queues(/:name)` | working |
| `/admin/features` | `/api/admin/features` | working |
| `/admin/billing` | `/api/admin/billing` | working |
| `/admin/payments` | `/api/admin/payments`, `/:id/approve`, `/:id/reject` | working |
| `/admin/promotions` | promo codes, gifts, student verifications | working |
| `/admin/revenue` | `/api/admin/revenue`, `/api/admin/payments/match` | working |
| `/admin/reviews` | `/api/admin/reviews(/:id)`, `/api/admin/feedback(/:id)` | working |
| `/admin/logs` | **nav link exists, no page** → 404 | missing |

## 13. Public marketing site `(marketing)` (all static; no API except noted)

`/` (landing), `/whatsapp` (with static `InboxMockup`), `/marketing`, `/how-it-works`, `/pricing` (API-backed), `/privacy`, `/legal`, `/feedback` (posts `/api/feedback`; not in public matcher), industry pages `/clinics`, `/mechanics`, `/real-estate`, `/restaurants`, `/retail`, `/schools`, `/travel` (each a 72-line wrapper of `_components/IndustryPage.tsx`). Shared: `MarketingNav`, `MarketingFooter`, `AuthCta`, `ReviewsSection` (`/api/reviews`). Status: placeholder/static content (not needed for Android parity).

---

## 14. Endpoint mismatches (web calls a path the API never registers)

| Web call | Caller | Effect |
|---|---|---|
| `/api/enterprise/api-keys`, `/api/enterprise/webhooks`, `/api/enterprise/byok` | `settings/page.tsx` Enterprise tab | silently empty; API actually has `/api/api-keys`, `/api/webhooks` |
| `/api/automation/rules` | `automation/page.tsx` | rules list never loads |
| `/api/agents/corrections` | `agents/page.tsx` | corrections panel empty |
| `/api/analytics/reports` | `analytics/reports/page.tsx` | acknowledged placeholder |
| `/api/advisor/chat` | `studio/_components/catalog-module.tsx` | catalog AI helper fails |
| `/api/knowledge/scrape` | `studio/_components/knowledge-module.tsx` | URL scrape fails (KB page uses `/api/knowledge/add-url`, which exists) |
| `/api/career/ai-rewrite` | `career/_components/cv-studio/bullet-transformer.tsx` | fails (should likely be `/api/career/cv-assistant/rewrite`) |
| `/api/settings/byok` | `components/byok-fast-track-card.tsx` (used in advisor, settings/ai) | save fails |
| `/api/career/ai-suite`, `/api/p/:slug` | Next routes | exist but return hardcoded/in-memory mock data |

## 15. Design system (verified)

- Reference look confirmed in `dashboard/page.tsx`, `advisor/page.tsx`: page gradient `bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,…)]`, hero `rounded-[2rem] bg-gradient-to-br from-white via-indigo-50 to-cyan-50 shadow-2xl shadow-indigo-200/40` with radial overlays, stat tiles `rounded-3xl … ring-1 ring-gray-100`, indigo-600 primary, slate-950 dark chips, tinted shadows, live pill with emerald pulsing dot, icon chips `rounded-2xl bg-{c}-50 text-{c}-600`, AI avatar gradient indigo→cyan.
- **Deviations from CLAUDE.md:** the sidebar is **dark** (`bg-gray-950`, gray-800 borders), not `bg-white/90 backdrop-blur`; `settings/page.tsx` uses flat `bg-slate-50` (no gradient) though cited as reference (its tab bar pattern does match); inbox, contacts, analytics pages still use the older flat gray/white style (no gradient/large radii).
- UI kit `components/ui/`: Button (primary/secondary/ghost/danger; sm/md/lg), Badge (default/info/success/warning/error/purple), Card, Input/Textarea, Select, Modal/ConfirmModal (portal), Toast (`useToast`), Avatar (xs–xl), Skeleton*, EmptyState, PageHeader, DataTable, Tabs (underline/pill), Dropdown, HealthBar, StatCard, ModeBadge, FeatureGate (modes / entitlements / requiredFamily), ChatFormatter (markdown + `[ACTION: type | …]` cards: lead_score, pipeline_stage, reminder, reply_draft, generate_document, estimate_duration, start_project), SignaturePad, celebration-effects. Shared libs: `action-executor.ts` (bundle actions: create_deal, reserve_stock, generate_document, reminder, create_product, create_supplier, create_career_opportunity, advance_deal_stage, start_project), `business-event-labels.ts`, `export-csv.ts`, `phone.ts`, `storage.ts`/`supabase.ts`, `celebrations.ts`.
- Guided tour (`components/guided-tour/`) with per-area step sets (e.g. CAREER_TOUR_STEPS, DOCUMENT_TOUR_STEPS), PWA install prompt.

## 16. Surprises vs CLAUDE.md

1. `/projects` has **no nav entry** (CLAUDE.md says it's in the Business nav group); `/broadcasts` and `/automation` are unreachable from nav; admin `/admin/logs` link 404s.
2. Mobile bottom tabs differ from CLAUDE.md (Studio/Documents instead of Contacts/Queue/Proactive).
3. Share links (`/shared/[token]`) and public portfolios (`/p/[slug]`) require login per middleware.
4. Career AI Suite (cover letter generator, interview coach) and Portfolio are **hardcoded mocks** — the cover letter mock literally signs "Winston Zulu" and invents achievements, contradicting the CV Studio "never invent" policy.
5. Settings Enterprise tab points at wrong URLs; "AI Engines" list is decorative.
6. Socket replay re-emits to server instead of client handlers.
7. Billing is hidden (TIERS flag) and API returns `planFamily=enterprise` in FREE_TESTING_MODE, so all plan gates are currently open.
8. Duplicate `/business` entries in Operations Hub.

---

## 17. Backend capabilities with no dedicated web page

The following engines are real (server code that runs) but surface only indirectly. Each is a feature Android must decide how to represent. Detail is in `BACKEND_API_MAP.md` §C.2.

| Capability | Server module | Trigger | Surfaces in web via | Status |
|---|---|---|---|---|
| Per-message perception (sentiment, intent, entities, promises, events, business/career mentions) | `services/intelligence/app/services/analyser.py`, `workers/message_worker.py` | per inbound message | Inbox intel panel, calendar, proactive, feeds | working (failure-fallback bug) |
| Relationship health (6 signals, trend) | `services/health.py` | every 5th message | Relationships, contact detail | working |
| Cadence / relationship clocks | `cadence_learner.py`, `clock_engine.py` | queue + 15-min scheduler | Contact clocks, proactive | working |
| Relationship memory (promises/topics/events) | `relationship_memory.py` | queue | Advisor context | working |
| Conversation memory (unanswered questions, pending promises) | `memory/conversation_memory.py` (Redis, 3-day TTL) | per message | Reply generation context only | working (ephemeral) |
| Contact profiling & insights | `profiler.py` | 1st and every 10th message | Contact AI Profile tab | working |
| User voice profile | `voice_builder.py` | every 20 outbound | Reply drafts | working |
| Emotion Engine (valence/arousal, reconsolidation) | `neural/emotion.py` | per message, nightly | Advisor reading badge | working |
| Goal Engine, Reflection, Life Timeline | `neural/reflection.py`, goal routes | weekly/monthly/quarterly | Goals, timeline, dashboard | working |
| Knowledge graph (co-purchases) | `neural/knowledge_graph.py`, `lib/knowledge-graph.ts` | on read | Catalog "bought together" | working (inferred-edge writer absent) |
| Prediction Engine | `neural/prediction.py` | HTTP | Contact purchase-likelihood card | working |
| Reality Engine (auto-resolve stale nudges, contradictions) | `reality_engine.py` | per message, hourly, daily | Proactive refresh, Studio feed | working |
| Curiosity Engine | `curiosity_engine.py` | inline 20%, daily 25% | Advisor chat | working |
| Gossip / motivational / spiritual / interest companions | `gossip_detector.py`, etc. | daily | Advisor "Zuri Noticed" | working (personal mode) |
| Advisor memory learner | `advisor_memory_learner.py` | nightly | Advisor memory tab | working |
| Business Manager, insights, feed detectors, project progress, document follow-ups, pricing benchmarks, inventory forecast | various | daily | Proactive dock, Studio, feed | working |
| Action bundles (conversation → ERP update) | `action_bundles.py` | per live message | Inbox bundle card | working |
| Scoped automation / auto-response | `scoped_automation.py`, `auto_response.py` | per message | Inbox Automate panel, Settings | working |
| Autonomous agents, KB, consolidation | `agent_engine.py`, `knowledge_retriever.py` | queue | Agents, Knowledge Brain | working |
| World knowledge (news → contact nudges) | `news_indexer.py`, `interest_matcher.py` | every 2 h | Proactive | working (needs web-search keys) |
| Job discovery, scraping, company intel, career coach | `job_discovery.py`, `job_scraper.py`, … | daily / 4×day | Career OS | working |
| Token usage tracking | `ai/token_usage.py` | every AI call | Diagnostics | working |
| Semantic search over messages/documents/KB | pgvector columns | on read | Document search, KB search | *verify* — embeddings may be NULL in prod (`OPENAI_API_KEY`) |
| Voice-note transcription | `services/api/src/lib/transcription.ts` (Node, not the intelligence service) | on demand: `POST /api/conversations/messages/:id/transcribe` | Inbox voice bubble "transcribe" | **incomplete** — tries Gemini, then OpenAI Whisper. The Gemini model name is derived from `DEFAULT_AI_MODEL`, which in production is `anthropic/claude-haiku-5-5`, so the Gemini call likely fails and it falls through to Whisper only if `OPENAI_API_KEY` is set. Historical media is never downloaded. *verify* in prod |
| Context snapshots | `context_snapshots` table | never written | — | **dead schema** |
