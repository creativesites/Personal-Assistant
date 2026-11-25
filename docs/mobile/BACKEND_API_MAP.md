# Zuri Android — Backend, API & Data Map

> Part of the Zuri Android initial engagement (audit phase). Read-only audit of `services/api`, `db/migrations`, `services/intelligence`, `services/whatsapp`, `apps/companion`, `apps/mobile`, `packages/*` at `main` HEAD `c2db648`, 2026-11-24. Nothing was modified. CLAUDE.md claims were treated as hypotheses; corrections are marked **[CORRECTION]**.
>
> Three parts: **A — API server** (what Android can call), **B — Database** (what the data model allows), **C — Intelligence, WhatsApp, companion and RN app** (what logic exists and what can run on-device).

## Summary for the Android plan

**Reusable as-is (~95% of the surface).** About 605 REST endpoints across 75 route files. They use plain JSON over HTTPS with a Bearer JWT. CRUD for contacts, conversations, documents, ERP, projects, deals, career, advisor, calendar and billing can be called from a Kotlin client (Retrofit/Ktor + kotlinx.serialization). The intelligence and WhatsApp services are internal-only, so Android only ever talks to `services/api`.

### Updates after the audit (deployed 2026-11-24, reported by the backend session)

These supersede the matching statements further down.

- **Inbound WhatsApp media no longer uses Supabase** (it was never configured in prod).
  - `messages.media_url` is now `/api/messages/:id/media`.
  - The endpoint is **authenticated** (Bearer header; `?token=` also accepted, but Android uses the header) and owner-only.
  - It supports Range and `&download=1`.
  - It fetches from WhatsApp on first view: this can take seconds, and returns 404 once WhatsApp no longer holds the file.
  - Files live in the `wa_media` volume at `<userId>/<messageId>`. New column `messages.media_meta` (migration 0133).
  - The old unauthenticated `GET /api/media/:filename` remains only for outbound uploads.
- **Plan tiers are off; personal-only product for now.**
  - `FREE_TESTING_MODE` also disables intelligence-service credits, the subscription lifecycle worker and document-credit 402s, and `getEffectivePlanFamily` returns `enterprise`.
  - **Android builds no billing/upgrade UI**, only a global 402 handler (this resolves Q-09).
- **Auto-reply:** `auto_response_settings.send_delay_max_seconds` (0132), API `sendDelayMaxSeconds`. Auto mode is live in inclusion mode for a few contacts. The send consumer drops an auto-reply if the user replied manually or a newer one is queued.
- **Contacts:**
  - `@lid` contacts are resolved to phone-number JIDs (renamed in place or merged via `merged_into_id`). `contacts.phone_number` is reliable for non-`@lid` rows, which helps notification identity matching.
  - `relationships.relationship_type` is now inferred by the profiler (spouse/partner/family/close_friend/friend/colleague/client/business_contact).
- **Coordination:**
  - The backend session owns `services/*`, `db/migrations`, `apps/web`. Backend RFCs (G1–G9) are requested from it rather than edited by the Android track.
  - Migrations are taken through 0133.
  - Both tracks stage explicit paths only.

**Missing, and needed before Android can integrate:**

| # | Gap | Evidence | Needed change (backend, requires approval) |
|---|---|---|---|
| G1 | No mobile-safe login | `POST /api/auth/clerk-sync` trusts `X-Internal-Secret`, never verifies a Clerk token (`routes/auth.ts:59`) | New `POST /api/auth/clerk-exchange` that verifies the Clerk session JWT (JWKS); refresh/revocation (`jti`/token version, logout) |
| G2 | Secret exposure | `INTERNAL_API_SECRET` value is printed in `CLAUDE.md` | **Rotate it** (independent of Android) |
| G3 | No incremental sync | No `updated_since`, no cursors on most lists, hard caps (contacts 500, messages 150/conversation, documents 100, notifications 100), no triggers maintaining `updated_at`, `messages` has no `updated_at`/`user_id`, hard deletes with no tombstones | `updated_at` triggers, `sync_tombstones`/change log, `GET /api/sync/changes`, message history paging, side-effect-free message GET |
| G4 | No idempotency | Retried message send double-sends on WhatsApp; retried document create burns a number | `Idempotency-Key` honoured on creates; client-supplied UUIDs |
| G5 | Phone-captured messages duplicate everything | `routes/companion.ts` invents `companion_<name>@c.us` JIDs and random message ids | New `POST /api/device/messages:batch` reconciliation endpoint (chat key, sender, fromMe, per-message time, client id) |
| G6 | Real-time gaps | `conversation:*`, `message:delete`, `message:reaction`, `status:new` published but never psubscribed (`lib/redis-subscriber.ts`) | Add patterns; socket auth in handshake |
| G7 | No push | No FCM/device-token table or code | `device_tokens` + `POST/DELETE /api/devices` + fan-out |
| G8 | No API contract | `packages/contracts`, `packages/events` are empty; no OpenAPI | Generate OpenAPI from Zod (or hand-write DTOs per milestone) |
| G9 | No workspace partition | Everything keyed by one `user_id`; `users.mode` is a UI mode; `business_profiles` are brand profiles | Workspace column(s) if server-side isolation is approved (see `DECISIONS.md`) |

**Defects found during the audit (not Android work — report to the web/backend owner):**

- `POST /api/documents/:id/send-whatsapp` calls a nonexistent `/api/whatsapp/send-message`. The document is marked sent but nothing is sent. The dunning worker calls a nonexistent `/api/messages/send` the same way.
- `analyser.py`'s LLM-failure fallback uses `intent.category`, but `IntentAnalysis.primary` is required. The job fails and retries instead of degrading.
- Embeddings are produced only when `OPENAI_API_KEY` is set, and that key is not in the documented production key list. If it is really absent, every pgvector column is NULL and semantic search silently does nothing. Verify on the VM.
- Outbound messages are inserted with a temporary `direct-<uuid>` id that is never replaced. The WhatsApp echo likely produces a duplicate row. Unconfirmed.
- `GET /api/export/full-workspace` selects columns that don't exist.
- `/api/auth/login` returns 500 for Clerk users (null password hash).
- `GET /api/media/:filename` and `milestones.ts` need no login, and `milestones.ts` serves mock data.
- The message counters in `message_worker.py` live in process memory, so they reset on restart.
- **[CORRECTION]** CLAUDE.md says WhatsApp media falls back to local disk. The current code sets `mediaUrl = null` instead.

---

# Part A — API server (`services/api`)

**Headline:** the API is a plain JSON-over-HTTPS REST API with a Bearer JWT, so a Kotlin client can reuse ~95% of it as-is (Retrofit/Ktor + kotlinx.serialization). The gaps are (1) **auth bootstrap** — there is no mobile-safe way to obtain a Zuri JWT for a Clerk user, (2) **offline sync** — no delta/`updated_since`, hard row caps instead of pagination, no tombstones, no idempotency, and (3) **real-time** — several event channels are silently never delivered, and there is no push-notification (FCM) infrastructure at all.

---

## A.0. Inventory

- 75 route files in `services/api/src/routes/`, all registered in `services/api/src/app.ts:121-197`. ~605 endpoints (plus 36 generated by the `registerCareerEntryRoutes()` factory in `services/api/src/lib/career-entry-crud.ts`).
- Plugins: `services/api/src/plugins/authenticate.ts` (`request.jwtVerify()` → 401), `plugins/authenticateAdmin.ts` (JWT + `isAdmin` claim → 403).
- Workers inside the API process (`services/api/src/index.ts`): social-publish, recurring-documents, subscription-lifecycle, dunning-reminder, WA disconnect-checker. Socket.io + Redis psubscribe started after `listen()`.
- `packages/contracts/` and `packages/events/` are **empty directories** (no files). Only `packages/shared-types` (`@zuri/types`: `enums.ts`, `queue.ts`, `statuses.ts`) and `packages/pdf-templates` have content. There is **no OpenAPI / JSON-schema export** of the API — request schemas are inline Zod objects per route; response shapes are ad-hoc `formatX()` mappers (camelCase). A Kotlin client must hand-write DTOs (or the team adds `zod-to-openapi` / `@fastify/swagger`).
- Global config: `services/api/src/config.ts`. Notable flags: `FREE_TESTING_MODE` (default **true** → `getEffectivePlanFamily()` returns `'enterprise'` and `readOnlyModeGuard` is a no-op), `MARKETING_ACCESS_OPEN_FOR_TESTING = true` hard-coded in `lib/marketing-access.ts:9`.

---

## A.1. Auth

### A.1.1 How it works today
| Route | File:line | Auth | Notes |
|---|---|---|---|
| `POST /api/auth/clerk-sync` | `routes/auth.ts:59-256` | **`X-Internal-Secret` header** must equal `INTERNAL_API_SECRET` (skipped entirely if env unset) | Body `{clerkUserId, email, name, clerkOrgId?, orgRole?, orgSlug?}`. Finds user by `clerk_user_id`, else links by **email**, else creates user + trial subscription + calendar + default agent. Syncs Clerk org → `organizations`/`organization_members`. Returns `{token, user:{id,email,fullName,mode,marketingAccess,isAdmin,onboardingCompleted,planFamily,isCompanyManaged,organization}}`. JWT claims `{userId, isAdmin, orgId}`, `expiresIn: '30d'`. |
| `POST /api/auth/register` | `auth.ts:258-318` | none | `{email,password(min 8),fullName}` → bcrypt(12) → `{token, user:{id,email,fullName}}`. JWT claims only `{userId}` (no `isAdmin`/`orgId`). |
| `POST /api/auth/login` | `auth.ts:320-348` | none | `{email,password}` → `{token,user}`. **Bug:** Clerk-created users have `password_hash = NULL` (migration `0011_clerk_auth.sql` dropped NOT NULL); `bcrypt.compare(pw, null)` throws → 500 instead of 401. `apps/mobile/src/lib/api.ts:34` (the RN scaffold) uses this route, so it only works for legacy password accounts. |
| `POST /api/auth/onboarding-complete` | `auth.ts:350` | JWT | |
| `GET /api/auth/me`, `PATCH /api/users/me`, `GET /api/users/me/stats` | `auth.ts:515/574/659` | JWT | `PATCH` body `{mode?, timezone?, marketingAccess?('none'|'waitlisted')}` |

- JWT: `@fastify/jwt` registered in `app.ts` with `secret: config.JWT_SECRET` (HS256 default, symmetric). No `iss`/`aud`, no `jti`, no revocation list, no refresh tokens, no `/api/auth/logout`. Token is valid for 30 days and cannot be invalidated short of rotating `JWT_SECRET` (which logs out everyone).
- The web flow: browser Clerk session → Next.js server route `apps/web/src/app/api/auth/clerk-sync/route.ts` (uses `auth()`/`currentUser()` from `@clerk/nextjs/server`) → backend `/api/auth/clerk-sync` with the internal secret. The backend **never verifies a Clerk token itself** — it fully trusts whoever holds `INTERNAL_API_SECRET`. (Note: CLAUDE.md publishes the literal production secret value; that secret should be considered compromised and rotated regardless of the mobile work, and the web route also logs its first 8 chars at line 34.)
- `enterprise.ts` lets users create `api_keys` (hashed) but **nothing ever verifies them** — no middleware reads `api_keys`. Dead for auth purposes.

### A.1.2 What a native Android client needs
The internal secret must not ship in an APK (anyone holding it can mint a JWT for *any* email via clerk-sync — full account takeover). Options, best first:
1. **New `POST /api/auth/clerk-exchange` (recommended).** Android uses the Clerk Android SDK (`com.clerk:clerk-android`) to sign in, obtains a Clerk session JWT (`session.getToken()`), and POSTs it as `Authorization: Bearer <clerk_jwt>`. Backend verifies it with `@clerk/backend`'s `verifyToken()` (JWKS, check `azp`/authorized parties), reads `sub`/email/org claims, then runs the *same* find-or-create body as clerk-sync (extract that body into a shared function). Returns the Zuri JWT. No secret on device.
2. Add **refresh semantics**: either keep the 30-day JWT and simply re-exchange a fresh Clerk token on 401 (simplest — Clerk SDK owns the long-lived session), or issue a short-lived access JWT (e.g. 1h) + opaque refresh token stored in a new `auth_refresh_tokens` table with rotation/revocation and a `POST /api/auth/refresh` + `POST /api/auth/logout`. Also add `jti`/`tokenVersion` claim to allow per-user revocation (lost phone).
3. Make register/login/clerk-sync issue **identical claims** (`userId, isAdmin, orgId`) — today email/password tokens lack `isAdmin`/`orgId`.
4. Fix `/api/auth/login` null-hash 500.

### A.1.3 Authorization layers (all preHandlers; apply equally to mobile)
- `authenticate` — JWT only. Most routes.
- `authenticateAdmin` — JWT + `isAdmin` claim (`plugins/authenticateAdmin.ts`). All `/api/admin/*`, `POST /api/diagnostics/token-usage/cost-rates`.
- `requireFeature(area)` / `requireAnyFeature` — `lib/entitlements.ts:85-110`. 402 with `{error, upgradeRequired:{feature,currentFamily,requiredFamily}}`. Areas: `career_os, cv_studio, job_search, interview_coach, advisor_companion, business_os, teams, analytics, automation, enterprise_api`. Trial (`trialing`) maps to `business`. Bypassed entirely while `FREE_TESTING_MODE=true`.
- `requireMarketingAccess` — `lib/marketing-access.ts`; currently a no-op (hard-coded open). 403 when re-enabled.
- `readOnlyModeGuard` — global `preHandler` hook (`app.ts`, `lib/entitlements.ts:130-153`). Blocks POST/PUT/PATCH/DELETE with **402 `{error, readOnly:true}`** when `subscriptions.status='read_only'`, except prefixes `/api/auth, /api/subscriptions, /api/admin, /api/webhooks, /api/health`. No-op while `FREE_TESTING_MODE`. Android should handle 402 globally (two shapes: `upgradeRequired` vs `readOnly`).
- Org RBAC — `lib/rbac.ts` (`requireOrgRole`, `requireWritePermission` — viewers read-only) and `lib/org-scope.ts` (`getEffectiveScope` → `ownerUserId`/`organizationId`). Used selectively (conversations/team/organization); most domain routes still scope purely by `user_id = $userId`.
- Daily credit counters (`subscriptions.*_remaining_today`) → 402 on exhaustion for AI paths (e.g. `documents.ts` ai-generate).
- **Rate limits:** none in Fastify (no `@fastify/rate-limit`). Only nginx (`nginx.prod.conf:26-27,45-46,69-70`): `/api/` 30 r/s per IP burst 60; `/api/auth/` **10 r/min** per IP burst 20. Caddy terminates TLS in front of nginx on GCP. Mobile carrier NAT (many users behind one IP — common in Zambia) can hit the per-IP auth limit; consider keying on user/JWT.
- CORS (`app.ts`): irrelevant to native apps (no Origin header).

---

## A.2. Route map by domain
Full machine-extracted list with each file's preHandlers is in §10 (appendix). Domain grouping and notable shapes:

| Domain | Files | Key endpoints / shapes | Auth |
|---|---|---|---|
| Auth/user | `auth.ts` | see §1 | mixed |
| Health | `health.ts` | `GET /health` | public |
| Conversations/messages/inbox | `conversations.ts` (1,737 lines), `suggestions.ts`, `team.ts` | `GET /api/conversations?limit&offset` (limit 1–500, default 100, returns `{conversations, hasMore}` — the **only** offset-paginated core list); `GET /api/conversations/:id/messages` returns **last 150 only**, no paging/before-cursor, and **marks the conversation read + enqueues a reconciliation job as a side effect** of a GET; `POST /api/conversations/:id/messages` `{text(1-4096), quotedMessageId?, forwardedFromMessageId?, isAiGenerated?}` → inserts row with temp `whatsapp_message_id = direct-<uuid>`, enqueues `send.reply` (`lib/whatsapp-send.ts`); react/delete/forward/star/pin/presence/read/transcribe; `POST /api/conversations/:id/media` multipart (`file` + `caption` field, 25 MB, written to local `MEDIA_DIR`); `POST /api/conversations/bulk-delete {ids[≤500]}` **hard-deletes** conversations+messages; `GET /api/inbox/briefing`, `GET /api/inbox/sync-status`; `/:id/analyze|summarize|followup|ask` proxy to intelligence. Suggestions: `GET /api/suggestions/pending`, `GET /api/messages/:messageId/suggestions`, `POST /api/suggestions/:id/approve|dismiss`, `POST /api/messages/:messageId/regenerate`. Team: assign/lock/unlock/notes. | JWT |
| Contacts/CRM | `contacts.ts` (1,474), `leads.ts`, `connections.ts`, `privacy.ts`, `sales-erp.ts` (ledger) | `GET /api/contacts` — **hard `LIMIT 500`, no paging/filters**, excludes groups/archived/merged; `GET /api/contacts/:id` (rich detail); CRUD; `DELETE` = soft (`archived_at`); `PATCH /api/contacts/bulk`, `POST /api/contacts/bulk-import`; tags, tasks, activities, context pins, insights, documents (human uploads), events, clocks, `GET /:id/messages`, `/business-timeline`, `/duplicates`, `/:id/merge` (sets `merged_into_id`). Leads: `GET /api/leads`, `PATCH /api/leads/:id/stage|score`. | JWT |
| Relationships | `relationships.ts`, `goals.ts` (per-relationship), `opportunities.ts`, `predictions.ts` | `GET /api/relationships[/:contactId[/health-history|clocks|goals]]`, `POST /api/relationships/analyze-all`; `GET /api/predictions/:type/:subjectId` → `{prediction}` | JWT |
| Proactive | `proactive.ts` | `GET /api/proactive` (pending, LIMIT 50), `PATCH /:id`, `POST /:id/send|regenerate`, `/recommendations`, `/brief` | JWT + `automation` |
| Advisor | `advisor.ts` (25 endpoints) | sessions CRUD, `POST /api/advisor/sessions/:id/messages` (sync AI turn; returns assistant msg + `assistantState`/`memorySuggestion`), profile, memories, action requests (`approve/execute/cancel`), watch, companion-feed, automation-grants + audit log | JWT |
| Calendar | `calendar.ts` | `GET /api/calendar/events` (events + promises, each `LIMIT 500`, no date-range params), CRUD, promises | JWT |
| Notifications | `notifications.ts` | `GET /api/notifications` (`LIMIT 100`, no paging), `PATCH /:id/read`, `PATCH /read-all` | JWT |
| Goals / reflection | `goal-profiles.ts`, `reflection.ts`, `milestones.ts` | goal CRUD + link/progress/check-price-conflict; `GET /api/reflection/latest|timeline` (≤200 rows). `milestones.ts` is **mock data, unauthenticated** | JWT / none |
| Documents | `documents.ts` (1,870), `business-profile(s).ts`, `recurring-documents.ts`, `signatures.ts` | see §6 | JWT + public share routes |
| Catalog/ERP | `products.ts`, `services.ts`, `product-families.ts`, `inventory-locations.ts`, `suppliers.ts`, `purchase-orders.ts`, `sales-erp.ts`, `studio.ts`, `action-bundles.ts`, `business-feed.ts`, `business-facts.ts`, `content-generations.ts` | products CRUD, stock movements (location-aware, transfer), reserve, variants, BOM, co-purchases; pricing tiers/capacity/workflow; families/attributes; suppliers + supplier-products; PO create/approve/receive; sales orders, receivables aging, `/api/contacts/:id/financial-ledger`; Studio insights/financial-overview/customers/preset/catalog PDF export; action bundles `GET ?status&contactId`, `PATCH`; business feed (**cursor-paginated** `?cursor&limit&eventType&status`) | JWT + `business_os` (+marketing gate) |
| Deals / projects | `deals.ts`, `projects.ts` (25 endpoints) | deals `GET ?contactId&stage&openOnly`, `POST`, `PATCH`, start-project; projects CRUD + tasks/reorder/milestones/time-entries(start/stop timer, 409 if running)/documents/templates/interviews/communications/lessons | JWT (+`business_os` for projects) |
| Career | `career-*.ts` (11 files + entry factory) | profile; 9 entry tables `/api/career/{employment-history,education,certifications,skill-groups,awards,volunteer-work,memberships,publications,references}[/:id]`; CVs (sections/project-links whole-list PUT, versions/restore, duplicate, **`GET /api/career/cvs/:id/pdf` server-rendered stream**, health, ats-score); career documents (resume/cover-letter/upload multipart/letters/reference-sheet/portfolio-pdf); opportunities (+apply, introduction-path, readiness, company-intel, matching); interviews; radar; job discovery (`POST /run` async → `{runId}`, `GET /run/:runId` poll, 3/day cap) | JWT + per-feature gates |
| Analytics | `analytics.ts` (2,059) | 20 read-only dashboards (`/api/analytics/*`) | JWT + `analytics` |
| Billing / membership | `subscription-plans.ts`, `billing.ts`, `promotions.ts`, `byok.ts` | `GET /api/subscription-plans`, `POST /api/subscriptions/checkout` (`{planKey/billingPeriod/useOwnApiKey/promoCode/referralCode}`), `POST .../checkout/:paymentRequestId/confirm` (multipart screenshot), `GET /api/subscriptions/me`; usage-summary, timeline; referrals/gifts/student verification; BYOK keys/settings/AI logs | JWT |
| WhatsApp | `whatsapp.ts` | `POST /api/whatsapp/connect` (202; QR arrives via socket `whatsapp:qr`), `DELETE /connect`, `POST /request-link-code {phoneNumber}` (code via socket `whatsapp:link_code`), `GET /status` → `{connected,status,...}`, `/service-health`, catalog products (`?limit&cursor`), test-message | JWT |
| Companion | `companion.ts` | see §8 | JWT |
| Search | `search.ts`, `documents.ts` | `POST /api/search/ask` (NL → structured query), `GET /api/documents/search?q` | JWT |
| Agents / automation | `agents.ts`, `settings.ts`, `broadcasts.ts`, `statuses.ts` | agents CRUD/assignments/memories/performance/corrections, knowledge-base, escalations; auto-response settings/exclusions/inclusions/rules; broadcasts + consent; WA statuses | JWT (+`automation`) |
| Knowledge | `knowledge.ts` (25) | KB CRUD, upload (multipart), add-url/note, search/chat, suggestions, graph, chunks | JWT |
| Marketing | `social-accounts.ts`, `social-posts.ts`, `content-generations.ts` | | JWT + marketing |
| Org/team/enterprise | `organization.ts`, `team.ts`, `enterprise.ts` | org/members/teams/audit logs; webhooks, api-keys (unused), data retention, whitelabel, CRM connect | JWT + `teams`/`enterprise_api` |
| Privacy / memory / export | `privacy.ts`, `memory.ts` | `GET /api/export/contacts.csv`, `/conversations.csv`, `/full-workspace` (JSON). **`full-workspace` selects columns that don't exist on `documents` (`doc_type, doc_number, total_amount`) and `contacts` (`is_active`, `role`) — likely 500s; verify before relying on it.** Account deletion request/cancel. | JWT |
| Diagnostics | `diagnostics.ts` | ai-pipeline, intelligence-health, token-usage, queue-health, advisor-logs | JWT/admin |
| Admin | `admin*.ts` | ~40 endpoints; `GET /api/admin/setup-status` & `POST /api/admin/setup` reachable without admin | admin |
| Feedback / reviews / media | `feedback.ts`, `reviews.ts`, `media.ts` | **no preHandler**; `media.ts` serves files publicly (token optional) | public |

---

## A.3. Sync-readiness assessment

### A.3.1 What exists
- **Pagination:** essentially only `GET /api/conversations` (offset/limit + `hasMore`), `GET /api/business-feed` (cursor), `GET /api/whatsapp/catalog/products` (cursor), some admin/agents/broadcasts/byok/career-job-discovery offset params. Everything else returns a **hard-capped "latest N"**: contacts 500, documents 100 (latest-version leaves only), notifications 100, proactive 50, calendar events 500 + promises 500, messages-per-conversation 150, stock movements 50, reflection timeline 200, contact business-timeline 100. Data beyond the cap is unreachable by any list endpoint.
- **Delta queries:** **none.** No `updated_since`/`since`/`modifiedSince` param anywhere (grep across `routes/`). No ETag / `If-None-Match` / `If-Modified-Since` support.
- **`updated_at` columns:** present on `users, contacts, conversations, relationships, documents, products, projects, project_milestones, deals, events, calendar_events, calendars, career_*` (profiles/cvs/opportunities), `goal_profiles, business_profiles, suppliers, proactive_queue, suggested_replies, recurring_documents, business_facts, advisor_sessions, opportunities, contact_tasks`. **Absent** on `messages` (!), `project_tasks`, `project_time_entries`, `notifications`, `action_bundles`, `business_events`, `advisor_messages`, `contact_insights`, `stock_movements`, `message_reactions`, `inventory_locations`, `document_templates`. Crucially, **there are no `updated_at` triggers in any of the 131 migrations** — `updated_at` is only bumped when app code remembers `updated_at = NOW()`, and the Python intelligence service and WhatsApp service write many of these tables directly. It is therefore *not* a trustworthy sync cursor until a `BEFORE UPDATE` trigger is added per synced table.
- **Soft deletes / tombstones:** mixed. `contacts.archived_at` + `merged_into_id` (soft), `messages.is_deleted` + `deleted_for_user_ids`, `documents` archived via status (but **drafts are hard-deleted**), `conversations` **hard-deleted** by bulk-delete, products hard-deleted when unreferenced, most child rows (tasks, milestones, time entries, pricing tiers, notes, memories, signatures…) hard-deleted. No tombstone table → a client cannot learn about deletions except by full re-list.
- **Idempotency:** none. No `Idempotency-Key` header or client-generated id accepted on any create. `POST /api/conversations/:id/messages` generates a random temp WA id each call → a retried send after a network timeout **sends the WhatsApp message twice**. `POST /api/documents` assigns a new sequential document number each call (`assignDocumentNumber`, `FOR UPDATE` on `business_profiles.numbering`) → retries burn numbers and create duplicate invoices. Companion relay has the same issue (§8). BullMQ jobs dedupe by `msg_<messageId>` jobId only (`lib/queue.ts:33-37`), which doesn't help HTTP retries.
- **Bulk endpoints:** `PATCH /api/contacts/bulk`, `POST /api/contacts/bulk-import`, `POST /api/conversations/bulk-delete`, `POST /api/knowledge/suggestions/bulk`, whole-list PUTs (CV sections/project-links, workflow stages), `POST /api/projects/:id/tasks/reorder`, `PATCH /api/notifications/read-all`. No generic batch/mutation-queue endpoint.
- **Existing sync/export:** (a) Socket.io **missed-event replay** (`lib/event-buffer.ts`): `publishInboxEvent()` stores each inbox event in a Redis ZSET `events:buffer:{userId}` with a per-user `seq`; client emits `sync:request {lastSeenSeq}` → `sync:replay {missed, latestSeq}` + `sync:complete`. **TTL 5 minutes, max 500 events** — fine for a socket blip, useless for an app offline for hours. Only events that go through `publishInboxEvent()` are buffered (not the WhatsApp/intelligence-service publishes). (b) CSV/JSON exports in `privacy.ts` (see bug above). (c) `GET /api/memory/export`.

### A.3.2 Entity-by-entity: pullable today vs needs new endpoints
| Entity | Today | Needed for offline-first |
|---|---|---|
| Conversations | offset paging, ordered by pinned/unread/last_message_at (unstable for paging while new messages arrive) | `?updated_since` + stable `(updated_at,id)` cursor; tombstones for bulk-delete |
| Messages | last 150 per conversation, GET has side effects | `GET /api/conversations/:id/messages?before=<ts|id>&limit` and `?after=`; a global `GET /api/messages/changes?since=` (needs `messages.updated_at` + trigger, since status/reactions/edits/deletes mutate rows); split "mark read" out of GET |
| Contacts | 500 cap | cursor + since; include archived/merged as tombstones in delta |
| Documents | 100 latest leaves | cursor + since; tombstone for hard-deleted drafts |
| Products/inventory | full list (no cap on `GET /api/products`? it filters by status) | since + cursor; stock ledger `?after=` |
| Projects/tasks/milestones/time | full list per project | `updated_at` on tasks/time entries + triggers |
| Calendar | 500 cap, no range | `?from&to` + since |
| Notifications | 100 cap | cursor + since; `updated_at` (is_read changes) |
| Proactive / suggestions / action bundles | pending-only lists | fine as "live queues" (online-only), no offline need |
| Advisor / analytics / AI routes | online-only by nature | none (show cached last response) |

**Recommended minimum new surface:** a generic `GET /api/sync/changes?since=<opaque cursor>&entities=contacts,conversations,messages,documents,…&limit=` returning `{changes:[{entity,id,op:'upsert'|'delete',data,version}], nextCursor, hasMore}`, backed by (1) `updated_at` triggers on synced tables, (2) a `sync_tombstones(user_id, entity, entity_id, deleted_at)` table (written by triggers on DELETE / archive), and (3) an `Idempotency-Key` header (or client-supplied UUID PK / `client_mutation_id` unique index) honoured on every create and on message send. Plus `POST /api/sync/mutations` batch endpoint if the app queues offline writes.

---

## A.4. Real-time

- Setup: `services/api/src/lib/socket.ts`; Socket.io server on the API's HTTP server (same port; nginx proxies `/socket.io/` with Upgrade, `nginx.prod.conf:56-61`). Transports `websocket, polling`. CORS origin from env (irrelevant for native).
- **Auth:** not in the handshake. Client connects anonymously, then emits `authenticate` with the raw Zuri JWT string; server verifies with `app.jwt.verify` (`index.ts`), joins room `user:{userId}`, emits `authenticated {userId}` or `auth_error` + disconnect. Unauthenticated sockets are allowed to linger (no timeout). Kotlin: `io.socket:socket.io-client` works; emit `authenticate` on every (re)connect.
- Replay: `sync:request {lastSeenSeq}` → `sync:replay`/`sync:complete`/`sync:error` (5-min Redis buffer, §3).
- Event delivery path: any service `PUBLISH <event>:<userId>` → `lib/redis-subscriber.ts` psubscribe → `io.to('user:'+userId).emit(event, payload)` where `event` = channel minus last segment. **Payload is emitted as the raw JSON *string*** (not parsed). Payloads from `publishInboxEvent()` are wrapped `{seq, event, payload, timestamp}`; payloads published directly by the WhatsApp/intelligence services are unwrapped domain JSON (inconsistent — client must handle both).
- psubscribed patterns (`redis-subscriber.ts:15-50`): `whatsapp:*` (qr, link_code, connected, disconnected), `message:new:*`, `suggestion:ready:*`, `suggestion:failed:*`, `byok:error:*`, `history:progress:*`, `history:sync:trigger:*` (internal, not forwarded), `presence:update:*`, `message:status:update:*`, `notification:new:*`, `agent:default-updated:*`, `bundle:ready:*`, `advisor.reply_received:*`, `advisor.narration_ready:*`, `reality.resolved:*`, `career.job_discovery.progress:*`.
- **Bug — published but never subscribed (silently dropped live):** `conversation:upsert` (published by both `services/whatsapp/src/lib/message-handler.ts:151,411` and API `publishInboxEvent` ×6), `conversation:read`, `conversation:assigned`, `conversation:locked`, `conversation:unlocked`, `conversation:note_added`, `message:delete`, `message:reaction`, `status:new` (session-manager). The web app (`apps/web/src`) listens for most of these, so they only arrive via `sync:replay` after a reconnect. Fix = add `'conversation:*'`, `'message:delete:*'`, `'message:reaction:*'`, `'status:new:*'` to the psubscribe list. Worth fixing before the Android client depends on them.
- **No push notifications:** no FCM/APNs/device-token table or code anywhere (grep for fcm/firebase/push_token/device_token: none). `notifications` rows + `notification:new` socket event only reach a foregrounded client. Android needs: `device_tokens` table, `POST/DELETE /api/devices` (register FCM token), and a fan-out where `notification:new` / `message:new` / `suggestion:ready` are published (or a Redis subscriber in the API that forwards to FCM when the user has no live socket).

---

## A.5. File storage

- **Document PDFs:** local disk on the API container, `DOC_STORAGE_DIR` (default `/app/doc-storage`, shared Docker volume `doc_storage` with intelligence), path `{DOC_STORAGE_DIR}/{userId}/{documentId}.pdf` (`lib/pdf/render.ts:127-131`); `documents.storage_path` holds the absolute path; API exposes `hasPdf`.
  - `GET /api/documents/:id/pdf` — accepts `Authorization: Bearer` **or `?token=<JWT>`** (JWT in URL → ends up in proxy logs; for Android use the header).
  - `GET /api/documents/shared/:token` — public, `share_token` (UUID on `documents`) → PDF, increments view count, may flip status → `viewed`.
  - `document_shares` table (separate tokens) used by `send-whatsapp` and the public pages `GET/POST /api/documents/public/:token/{details,sign,action,comments,pay}`, `POST /api/documents/shares/:token/{accept,pay}`; those links point to the **web app** (`${CORS_ORIGIN}/shared/<token>`), so a shared link opens the Next.js page.
- **Brand assets:** `POST /api/business-profile/assets` / `POST /api/business-profiles/:id/assets` (multipart), served by `GET /api/documents/assets/:profileId/:type` (Bearer or `?token`).
- **WhatsApp media:** inbound media uploaded by `services/whatsapp/src/lib/supabase-storage.ts` to Supabase Storage public bucket `chat-media` → `messages.media_url` is a public Supabase URL (no auth needed; Android loads directly with Coil/Glide). Fallback (no Supabase creds) = local `wa_media` volume + `GET /api/media/:filename` — **no auth required** (token optional; `media.ts:29-41`), supports Range requests. Outbound media from `POST /api/conversations/:id/media` is written to local `MEDIA_DIR` only.
- **Uploads:** `@fastify/multipart` global, limit 25 MB / 1 file (`app.ts`). Multipart routes: conversation media, knowledge upload, career resume upload, payment-confirm screenshot, student verification, business-profile assets, contact documents. `render-complete` takes a **raw `application/pdf` body** (custom content-type parser in `app.ts`), not multipart.
- Note: local-disk storage ties PDFs/media to the single GCP VM volume — fine today, but means no signed-URL/CDN path for mobile downloads.

---

## A.6. Document generation (top mobile priority)

### A.6.1 Endpoints (`services/api/src/routes/documents.ts` unless noted)
- `GET /api/document-templates` → `{templates:[{id,name,layoutKey,category,applicableTo,isSystem}]}` (8 business layouts: minimal, modern, classic, corporate, elegant, compact, creative, executive).
- `GET /api/documents?type&status&contactId` → `{documents:[formatDocument]}` (latest version leaves, `LIMIT 100`). `formatDocument` (`:154-196`): `id, documentType, documentCategory, documentNumber, title, status, structuredData, currency, subtotalCents, discountCents, taxCents, totalCents, version, sourceDocumentId, aiGenerated, aiReasoning, aiSummary, hasPdf, shareToken, viewCount, businessProfileId, contactId, dealId, opportunityId, conversationId, projectId, supplierId, templateId, contact{id,name,avatarUrl}, createdAt, updatedAt, sentAt, viewedAt, paidAt`.
- `GET /api/documents/:id` → `{document, events:[{eventType,metadata,occurredAt}]}`.
- `POST /api/documents` (`:340`) body (`createBody`, `:67-87`): `{contactId? | manualContact{name,company?,email?,phone?}, documentType ∈ PHASE_0_TYPES (quotation, invoice, receipt, purchase_order, delivery_note, credit_note, debit_note, catalog, price_sheet, proposal, contract, statement_of_work, service_agreement, nda, msa, account_statement, expense_report, expense_claim), title?, currency?(3, default ZMW), items[{productId?, description, quantity, unitPriceCents, discountPct?, taxPct?}], sections[{heading,body}], structuredData?, notes?, terms?, validUntil?, dueDate?, templateId?, businessProfileId?, signatureId?, dealId?, opportunityId?, conversationId?, projectId?}` → 201 `{document}`, status `draft`, **no PDF yet**. Totals computed server-side (`computeTotals`, integer cents). Numbering per brand profile (`assignDocumentNumber`). Note: category hard-coded `'sales'` here (vs `DOCUMENT_CATEGORY` map in ai-generate).
- `PATCH /api/documents/:id` — drafts edited in place; `contactId`/`businessProfileId`/`signatureId` nullable to clear.
- `POST /api/documents/ai-generate` (`:601-740`) `{contactId (required), documentType, instruction(3-2000), dealId?, opportunityId?, conversationId?, projectId?}`. If the instruction mentions catalog products, builds items deterministically (no AI); otherwise consumes a `documents_remaining_today` credit (402 if exhausted) and calls intelligence `POST /internal/documents/generate`. Writes AI insights to `contact_insights`. Returns 201 `{document}` (draft, no PDF). **No manual-contact path** (contactId required).
- Rendering — three options:
  - `POST /api/documents/:id/generate` → server render via `renderAndSaveDocument()` (`services/document-render.ts:94`) using `@zuri/pdf-templates` + `@react-pdf/renderer` in Node; writes file, `draft→generated`, logs event, fire-and-forget summarize. → `{ok, status}`. **This is the simplest path for Android** (then download via `/pdf`).
  - `GET /api/documents/:id/render-context` → `{documentType, templateKey, document, business, contact}` (data-only, pre-formatted money/dates) — 400 for career types.
  - `POST /api/documents/:id/render-complete` (raw `application/pdf` body) → `persistRenderedPdf()` (same bookkeeping). Lets a client that rendered locally upload the bytes. No content validation beyond non-empty.
  - `POST /api/documents/internal/:id/render` — internal (x-internal-secret), not for clients.
- Lifecycle: `POST /:id/status {status ∈ sent|accepted|rejected|paid|archived}` (paid triggers Reality Engine + business feed); `POST /:id/convert` (quotation→invoice→receipt); `POST /:id/revise` (clone forward as new draft v+1); `GET /:id/versions`; `POST /:id/duplicate`; `DELETE /:id` (hard-delete drafts, else archive).
- Delivery: `POST /:id/send {caption?}` → `sendDocumentViaWhatsApp()` (`:198`) — enqueues `send.reply` with `mediaPath` = PDF (actual PDF attachment) and a `PUBLIC_API_URL/api/documents/shared/<token>` link; `POST /:id/send-whatsapp` → renders, creates `document_shares` token, POSTs to WhatsApp service **`/api/whatsapp/send-message`, a route that does not exist** in `services/whatsapp/src/routes/sessions.ts` (only `/internal/sessions/:userId/send` etc.); `fetch` doesn't throw on 404 so the doc is marked `sent` without anything being sent. Same dead URL at `:1342`, `:1429`; `workers/dunning-reminder-worker.ts:119` calls nonexistent `/api/messages/send`. **Use `/send`, not `/send-whatsapp`, from Android until fixed.**
- AI helpers: `POST /:id/quality-check`, `GET|POST /:id/chat {instruction}` (per-document assistant), `GET /api/documents/search?q` (semantic), `POST /api/documents/insights`, `POST /api/documents/packs/:packKey/run {contactId, instruction?}` (Automatic Business Packs, server-rendered), analytics `GET /api/documents/analytics/summary`, `GET /:id/analytics`.
- Brand profiles: `business-profile.ts` (default profile: `GET/PUT/PATCH /api/business-profile`, assets) and `business-profiles.ts` (named profiles CRUD + `set-default` + assets). Update body = `businessProfileUpdateBody` (`business-profile.ts:10-47`: company/contact/tax/bank/mobile-money/theme/footer/terms/currency/tax rate/defaultTemplateId/watermark/banners).
- Recurring: `GET/POST/PATCH/DELETE /api/recurring-documents` — create `{contactId, documentType, items[min 1], notes?, terms?, recurrence, dayOfPeriod, autoSend?}`; PATCH only toggles `isActive`. Executed by `workers/recurring-documents-worker.ts` (server-side render).
- Signatures: `GET/POST/PATCH/DELETE /api/signatures`. Purchase orders: `routes/purchase-orders.ts`. Project-scoped: `POST /api/projects/:id/documents`. Career documents: separate endpoints (§2), CV PDF `GET /api/career/cvs/:id/pdf` streams a fresh server render each call.

### A.6.2 Can `packages/pdf-templates` be reused on Android?
No, not natively — they are React components for `@react-pdf/renderer` (JS + yoga layout + pdfkit); Kotlin cannot execute them. Options:
1. **Server render (recommended default).** `POST /api/documents/:id/generate` then `GET /api/documents/:id/pdf` (Bearer). Zero duplication, pixel-identical with web; requires connectivity. For a "preview while editing" UX, add a stateless `POST /api/documents/preview` that renders from an unsaved body and streams bytes without persisting (doesn't exist yet). CPU cost lands on the e2-standard-2 VM — consider a render concurrency limit.
2. **Embedded JS engine/WebView.** Bundle `@zuri/pdf-templates` + `@react-pdf/renderer` browser build into a local HTML/JS asset loaded in a headless `WebView`, feed it `/render-context` JSON (or locally-built context when offline), get the Blob back via `JavascriptInterface`, upload via `/render-complete`. Works offline and stays template-identical; cost = a JS bundle (~1–2 MB) + WebView plumbing; react-pdf in WebView is workable but slower on low-end devices.
3. **Native re-implementation** (Android `PdfDocument`/Canvas, or a Kotlin PDF lib). Full offline, fastest, but 8 business + 7 career templates would drift from the web versions — high maintenance.
Practical combo: server render when online; WebView-bundled templates only if offline document creation is a hard requirement. Offline creation also needs idempotent create + deferred numbering (numbers are assigned server-side at create; an offline draft has no number until synced).

---

## A.7. Service-to-service

- **Intelligence service** (`INTELLIGENCE_SERVICE_URL`, prod `http://intelligence:8000`, Docker-internal `expose` only): plain `fetch` from ~27 API files to `/internal/*` routes (advisor ask, conversations ask/summarize/followup/analyse-history-sync, documents generate/summarize/chat/quality-check/search/insights/packs, career resume/cover-letter/cv-assistant/job-discovery/scraper/company-intel/introduction-draft/matching, knowledge chat/search/reindex, studio ask/auto-extract, search ask, predictions, proactive regenerate, relationship-health, content generate, goals next-step, auto-reply parse). **No auth header on most of these calls**; security relies on network isolation. Intelligence → API callback: `document_render_client.py` → `POST /api/documents/internal/:id/render` with `x-internal-secret`.
- **WhatsApp service** (`WHATSAPP_SERVICE_URL`, prod `http://whatsapp:3001`, internal): `/internal/sessions/connect|disconnect|request-link-code|status/:userId|:userId/presence|:userId/test-ping|:userId/catalog/products|:userId/status|:userId/send|:userId/resync-contacts`, `/session/:userId/profile-picture/:jid`, `/health`. Broken callers noted in §6.1.
- **BullMQ** (`lib/queue.ts`, Redis): queues the API produces to: `messages.incoming` (consumed by intelligence), `analysis.message`, `analysis.contact_profile`, `proactive.generate_daily`, `send.reply` (consumed by WhatsApp service — the actual outbound send, `SendReplyJob` in `packages/shared-types/src/queue.ts`, supports text/quote/reaction/delete/media), `reconciliation.verify_chat`. Default jobId `msg_<messageId>`, 3 attempts exponential backoff.
- Redis pub/sub for realtime (§4). Mobile clients never talk to Redis/intelligence/WhatsApp directly — everything goes through the API, which is good.

---

## A.8. Companion endpoint (`apps/companion` ↔ `POST /api/companion/message`)

- Server: `services/api/src/routes/companion.ts`. Auth: `authenticate` (Zuri JWT). Body (Zod): `{senderName: string(1-255), message: string(1-4096), timestamp: int ms epoch (positive), source?: 'whatsapp'|'whatsapp_business' (default 'whatsapp')}`. Response **202 `{ok:true, messageId}`**.
- Behaviour: upserts a contact with pseudo-JID `companion_<sendername-slug>@c.us` (keyed on `(user_id, whatsapp_jid)`), ensures a `relationships` row, upserts a conversation (`whatsapp_chat_id` = pseudo-JID, unread+1), inserts `messages` row (`sender_type='contact'`, `message_type='text'`, `whatsapp_message_id = companion_<ts>_<random>`), enqueues `messages.incoming`. Does **not** publish `message:new`/`conversation:upsert`, so the inbox isn't live-updated.
- Client: `apps/companion/.../ApiClient.kt` — OkHttp, `Authorization: Bearer <token>`, JSON `{senderName, message, timestamp, source}` to `${apiUrl}/api/companion/message`; `ZuriNotificationService.kt` takes `EXTRA_TITLE` as senderName, `EXTRA_TEXT` as message, `sbn.postTime` as timestamp. `TokenManager.kt` stores `apiUrl` + `authToken` in EncryptedSharedPreferences, **entered by hand in `MainActivity`** (user pastes a JWT) — no login flow, and the token silently dies after 30 days.
- Issues for a new Android app that absorbs the companion role: (a) **no dedup** — random message id means every repeated/updated WhatsApp notification (Android re-posts grouped notifications) creates a duplicate message and a duplicate AI analysis; should key on `(sender, text, postTime)` or the notification key; (b) pseudo-JID `@c.us` never matches Baileys' real `@s.whatsapp.net`/`@lid` JIDs → companion chats are separate contacts from Baileys-synced ones (and group notifications' "Group: Sender" titles become fake contacts); (c) `source` is parsed but discarded; (d) no realtime publish; (e) text only (no media/group awareness).

---

## A.9. Risks & recommendations (summary)
1. **Auth:** build `POST /api/auth/clerk-exchange` verifying Clerk session JWTs (JWKS); never ship `INTERNAL_API_SECRET`; rotate that secret (it's in CLAUDE.md); add refresh/revocation (`jti`/token version, logout); unify claims across login paths; fix null-hash login 500; consider per-user (not per-IP) auth rate limits.
2. **Sync:** add `updated_at` triggers, tombstones, cursor pagination + `updated_since` (or a single `/api/sync/changes` feed), message history paging, and idempotency keys on message send / document create / companion relay. Remove side effects from `GET /api/conversations/:id/messages`.
3. **Realtime:** fix missing psubscribe patterns (`conversation:*`, `message:delete:*`, `message:reaction:*`, `status:new:*`); normalise payload wrapping; move socket auth into the handshake (`auth: {token}`); add FCM device registration + push fan-out.
4. **Documents:** use `/generate` + `/pdf` (server render) first; fix `send-whatsapp`'s dead WhatsApp URL (and dunning worker); consider a stateless preview-render endpoint; JWT-in-query on `/pdf` and asset routes is a log-leak risk.
5. **Contracts:** no OpenAPI and empty `packages/contracts`/`packages/events` — generating an OpenAPI spec from the Zod schemas would let the Kotlin client codegen DTOs instead of hand-mirroring ~600 endpoints.
6. Public/unauthenticated surfaces worth reviewing before wider exposure: `GET /api/media/:filename` (no auth), `milestones.ts` (mock, no auth), `feedback.ts`/`reviews.ts`, `POST /api/admin/setup`.

---

## A.10. Appendix — every route by file, with preHandlers
(Extracted mechanically from `services/api/src/routes/*.ts`; "gate" = the file's `const gate` array shown. Entry-table routes for `career-profile-entries.ts` are generated by `lib/career-entry-crud.ts`: `GET/POST /api/career/<path>`, `PATCH/DELETE /api/career/<path>/:id` for paths employment-history, education, certifications, skill-groups, awards, volunteer-work, memberships, publications, references — gate `[authenticate, requireFeature('career_os')]`.)

#### action-bundles.ts — auth: [authenticate, requireMarketingAccess]   
```
GET /api/action-bundles
PATCH /api/action-bundles/:id
```
#### admin-payments.ts — auth: authenticateAdmin   
```
GET /api/admin/payments
POST /api/admin/payments/:id/approve
POST /api/admin/payments/:id/reject
```
#### admin-promotions.ts — auth: authenticateAdmin   
```
GET /api/admin/promo-codes
POST /api/admin/promo-codes
PATCH /api/admin/promo-codes/:id
DELETE /api/admin/promo-codes/:id
GET /api/admin/gifts
GET /api/admin/student-verifications
POST /api/admin/student-verifications/:id/approve
POST /api/admin/student-verifications/:id/reject
```
#### admin-revenue.ts — auth: authenticateAdmin   
```
GET /api/admin/revenue
POST /api/admin/payments/match
GET /api/admin/plans
POST /api/admin/users/:userId/adjust-subscription
```
#### admin.ts — auth: authenticate  authenticateAdmin   
```
GET /api/admin/setup-status
POST /api/admin/setup
GET /api/admin/stats
GET /api/admin/users
GET /api/admin/users/:id
PATCH /api/admin/users/:id
GET /api/admin/sessions
DELETE /api/admin/sessions/:userId
GET /api/admin/queues
GET /api/admin/queues/failed
POST /api/admin/queues/retry-failed
DELETE /api/admin/queues/failed
GET /api/admin/features
PUT /api/admin/features
POST /api/admin/history-sync/start
GET /api/admin/history-sync/status
POST /api/admin/history-sync/cancel
POST /api/admin/history-sync/resume
GET /api/admin/logs
GET /api/admin/billing
GET /api/admin/reviews
PATCH /api/admin/reviews/:id
DELETE /api/admin/reviews/:id
GET /api/admin/feedback
PATCH /api/admin/feedback/:id
DELETE /api/admin/feedback/:id
```
#### advisor.ts — auth: authenticate   
```
GET /api/advisor/sessions
POST /api/advisor/sessions
GET /api/advisor/sessions/:id/messages
POST /api/advisor/sessions/:id/messages
PATCH /api/advisor/sessions/:id
GET /api/advisor/profile
PATCH /api/advisor/profile
GET /api/advisor/memories
POST /api/advisor/memories
DELETE /api/advisor/memories/:id
POST /api/advisor/memories/:id/correct
DELETE /api/advisor/sessions/:id
GET /api/advisor/actions
POST /api/advisor/actions/:id/approve
POST /api/advisor/actions/:id/cancel
POST /api/advisor/actions/:id/execute
POST /api/advisor/watch
GET /api/advisor/watch
DELETE /api/advisor/watch/:id
GET /api/advisor/companion-feed
POST /api/advisor/companion-feed/:id/dismiss
POST /api/advisor/automation-grants
GET /api/advisor/automation-grants
POST /api/advisor/automation-grants/:id/revoke
GET /api/advisor/automation-grants/:id/audit-log
```
#### agents.ts — auth: gate   (gate = [authenticate, requireFeature('automation')])
```
GET /api/agents/metrics
POST /api/agents/test-draft
GET /api/agents
POST /api/agents
GET /api/agents/:id
PATCH /api/agents/:id
GET /api/agents/default
PATCH /api/agents/default
DELETE /api/agents/:id
GET /api/agents/:id/actions
GET /api/agents/:id/assignments
GET /api/agents/:id/memories
DELETE /api/agents/:id/memories/:memoryId
POST /api/agents/:id/assignments
DELETE /api/agents/:id/assignments/:assignmentId
GET /api/knowledge-base
POST /api/knowledge-base
GET /api/knowledge-base/:id
DELETE /api/knowledge-base/:id
GET /api/escalations
GET /api/agents/:id/performance
POST /api/agents/:id/corrections
PATCH /api/escalations/:id
```
#### analytics.ts — auth: [authenticate, requireMarketingAccess, requireFeature('analytics')]  gate   (gate = [authenticate, requireFeature('analytics')])
```
GET /api/analytics/executive
GET /api/analytics/sales
GET /api/analytics/customers
GET /api/analytics/conversations
GET /api/analytics/operations
GET /api/analytics/opportunities
GET /api/analytics/predictions
GET /api/analytics/health
GET /api/analytics/roi
GET /api/analytics/timeline
GET /api/analytics/team
GET /api/analytics/overview
GET /api/analytics/funnel
GET /api/analytics/suggestions
GET /api/analytics/revenue
POST /api/analytics/funnel/stage
POST /api/analytics/revenue
GET /api/analytics/campaigns
POST /api/analytics/campaigns/recommendations
GET /api/analytics/health-rollup
```
#### auth.ts — auth: authenticate   
```
POST /api/auth/clerk-sync
POST /api/auth/register
POST /api/auth/login
POST /api/auth/onboarding-complete
GET /api/auth/me
PATCH /api/users/me
GET /api/users/me/stats
```
#### billing.ts — auth: authenticate   
```
GET /api/billing/usage-summary
GET /api/billing/timeline
```
#### broadcasts.ts — auth: authenticate   
```
GET /api/broadcasts
POST /api/broadcasts
GET /api/broadcasts/:id
PATCH /api/broadcasts/:id
DELETE /api/broadcasts/:id
POST /api/broadcasts/:id/send
POST /api/broadcasts/:id/cancel
GET /api/consent
POST /api/consent
GET /api/consent/:contactId
```
#### business-facts.ts — auth: authenticate   
```
GET /api/business-facts
POST /api/business-facts
PATCH /api/business-facts/:id
POST /api/business-facts/:id/approve
POST /api/business-facts/:id/reject
```
#### business-feed.ts — auth: [authenticate, requireMarketingAccess, requireFeature('business_os')]   
```
GET /api/business-feed
POST /api/business-feed/:id/dismiss
```
#### business-profile.ts — auth: authenticate   
```
GET /api/business-profile
PUT /api/business-profile
PATCH /api/business-profile
POST /api/business-profile/assets
GET /api/documents/assets/:profileId/:type
```
#### business-profiles.ts — auth: authenticate   
```
GET /api/business-profiles
POST /api/business-profiles
PATCH /api/business-profiles/:id
PUT /api/business-profiles/:id
DELETE /api/business-profiles/:id
POST /api/business-profiles/:id/set-default
POST /api/business-profiles/:id/assets
```
#### byok.ts — auth: authenticate   
```
GET /api/byok/providers
GET /api/byok
GET /api/byok/keys
POST /api/byok/keys
DELETE /api/byok/keys/:provider
POST /api/byok/test
GET /api/byok/settings
PUT /api/byok/settings
GET /api/ai/analytics
GET /api/ai/logs
GET /api/ai/health
```
#### calendar.ts — auth: authenticate   
```
GET /api/calendar/events
POST /api/calendar/events
PATCH /api/calendar/events/:id
DELETE /api/calendar/events/:id
POST /api/calendar/promises
PATCH /api/calendar/promises/:id/fulfill
DELETE /api/calendar/promises/:id
```
#### career-cv-assistant.ts — auth: gate   (gate = [authenticate, requireFeature('cv_studio')])
```
POST /api/career/cv-assistant/rewrite
POST /api/career/cv-assistant/suggest-metric
POST /api/career/cv-assistant/suggest-skill-grouping
```
#### career-cv-matching.ts — auth: gate   (gate = [authenticate, requireFeature('cv_studio')])
```
GET /api/career/opportunities/:id/match/:cvId
GET /api/career/opportunities/:id/tailoring-suggestions
```
#### career-cvs.ts — auth: gate   (gate = [authenticate, requireFeature('cv_studio')])
```
GET /api/career/cvs
GET /api/career/cvs/:id
POST /api/career/cvs
PATCH /api/career/cvs/:id
DELETE /api/career/cvs/:id
PUT /api/career/cvs/:id/sections
PUT /api/career/cvs/:id/project-links
GET /api/career/cvs/:id/versions
POST /api/career/cvs/:id/versions/:versionNumber/restore
POST /api/career/cvs/:id/duplicate
GET /api/career/cvs/:id/pdf
GET /api/career/cvs/:id/health
POST /api/career/cvs/:id/ats-score
```
#### career-documents.ts — auth: gate   (gate = [authenticate, requireFeature('cv_studio')])
```
GET /api/career/documents
POST /api/career/resume
POST /api/career/cover-letter
POST /api/career/resume/upload
POST /api/career/resume/:id/score
POST /api/career/resume/:id/match
POST /api/career/resume/:id/generate
POST /api/career/letters/compose
POST /api/career/reference-sheet
POST /api/career/portfolio-pdf
```
#### career-interviews.ts — auth: gate   (gate = [authenticate, requireFeature('interview_coach')])
```
GET /api/career/opportunities/:id/interviews
POST /api/career/opportunities/:id/interviews
PATCH /api/career/interviews/:id
DELETE /api/career/interviews/:id
GET /api/career/interview-patterns
```
#### career-job-discovery.ts — auth: gate   (gate = [authenticate, requireFeature('job_search')])
```
GET /api/career/job-discovery/status
POST /api/career/job-discovery/run
GET /api/career/job-discovery/run/:runId
GET /api/career/scraped-jobs
GET /api/career/scraper-status
```
#### career-opportunities.ts — auth: gate   (gate = [authenticate, requireFeature('job_search')])
```
GET /api/career/activity
GET /api/career/opportunities
GET /api/career/opportunities/:id
POST /api/career/opportunities
PATCH /api/career/opportunities/:id
POST /api/career/opportunities/:id/apply
GET /api/career/opportunities/:id/introduction-path
GET /api/career/opportunities/:id/readiness
GET /api/career/opportunities/:id/resume-match
GET /api/career/opportunities/:id/company-intelligence
DELETE /api/career/opportunities/:id
POST /api/career/opportunities/:id/create-project
GET /api/career/opportunities/:id/match-analysis
GET /api/career/opportunities/:id/manual-readiness
PATCH /api/career/opportunities/:id/manual-readiness
```
#### career-profile-entries.ts — auth: NONE (public/own check) 
```
```
#### career-profile.ts — auth: gate   (gate = [authenticate, requireFeature('career_os')])
```
GET /api/career/profile
PATCH /api/career/profile
```
#### career-radar.ts — auth: gate   (gate = [authenticate, requireFeature('job_search')])
```
GET /api/career/radar
```
#### companion.ts — auth: authenticate   
```
POST /api/companion/message
```
#### connections.ts — auth: authenticate   
```
GET /api/connections
POST /api/connections
PATCH /api/connections/:id
```
#### contacts.ts — auth: authenticate   
```
GET /api/contacts
GET /api/contacts/:id
POST /api/contacts
PATCH /api/contacts/:id
DELETE /api/contacts/:id
PATCH /api/contacts/bulk
POST /api/contacts/bulk-import
GET /api/contacts/:id/activities
POST /api/contacts/:id/activities
GET /api/contacts/:id/promises
GET /api/contacts/:id/clock
POST /api/contacts/:id/recalculate-health
POST /api/contacts/:id/tags
DELETE /api/contacts/:id/tags/:tag
PUT /api/contacts/:id/clock/:clockType
GET /api/contacts/:id/tasks
POST /api/contacts/:id/tasks
PATCH /api/contacts/:id/tasks/:taskId
DELETE /api/contacts/:id/tasks/:taskId
GET /api/contacts/:id/context
POST /api/contacts/:id/context
DELETE /api/contacts/:id/context/:pinId
DELETE /api/contacts/:id/insights/:insightId
PATCH /api/contacts/:id/profile
GET /api/contacts/:id/documents
POST /api/contacts/:id/documents
DELETE /api/contacts/:id/documents/:docId
POST /api/contacts/:id/events
DELETE /api/contacts/:id/events/:eventId
GET /api/contacts/:id/messages
GET /api/contacts/:id/business-timeline
GET /api/contacts/duplicates
POST /api/contacts/:id/merge
POST /api/contacts/:id/refresh-avatar
```
#### content-generations.ts — auth: [authenticate, requireMarketingAccess]   
```
GET /api/products/:id/generations
POST /api/products/:id/generate
```
#### conversations.ts — auth: authenticate   
```
GET /api/conversations
POST /api/conversations/bulk-delete
GET /api/inbox/sync-status
POST /api/inbox/sync-cancel
GET /api/conversations/:id/messages
POST /api/conversations/:id/messages
POST /api/conversations/:id/messages/:messageId/react
DELETE /api/conversations/:id/messages/:messageId
GET /api/conversations/:id/participants
POST /api/conversations/:id/forward
GET /api/inbox/briefing
GET /api/conversations/:id/context
POST /api/conversations/:id/analyze
POST /api/conversations/:id/summarize
POST /api/conversations/:id/followup
GET /api/conversations/:id/ask/messages
POST /api/conversations/:id/ask
PATCH /api/conversations/:id
POST /api/conversations/:id/read
POST /api/conversations/:id/media
POST /api/conversations/simulate-test-message
POST /api/conversations/messages/:id/transcribe
PATCH /api/conversations/messages/:id/star
PATCH /api/conversations/messages/:id/pin
PATCH /api/conversations/:id/pin
GET /api/conversations/starred
POST /api/conversations/:id/presence
DELETE /api/conversations/notes/:noteId
```
#### deals.ts — auth: authenticate   
```
GET /api/deals
POST /api/deals
PATCH /api/deals/:id
POST /api/deals/:id/start-project
```
#### diagnostics.ts — auth: authenticate  authenticateAdmin   
```
GET /api/diagnostics/ai-pipeline
GET /api/diagnostics/intelligence-health
GET /api/diagnostics/token-usage
POST /api/diagnostics/token-usage/cost-rates
GET /api/system/queue-health
GET /api/diagnostics/advisor-logs
```
#### documents.ts — auth: authenticate   
```
GET /api/document-templates
GET /api/documents
GET /api/documents/:id
POST /api/documents
PATCH /api/documents/:id
POST /api/documents/:id/duplicate
POST /api/documents/:id/generate
GET /api/documents/:id/render-context
POST /api/documents/:id/render-complete
POST /api/documents/internal/:id/render
POST /api/documents/ai-generate
POST /api/documents/:id/send-whatsapp
POST /api/documents/:id/quality-check
GET /api/documents/:id/pdf
POST /api/documents/:id/status
POST /api/documents/:id/convert
POST /api/documents/:id/revise
GET /api/documents/:id/versions
POST /api/documents/:id/send
GET /api/documents/:id/chat
POST /api/documents/:id/chat
DELETE /api/documents/:id
GET /api/documents/shared/:token
POST /api/documents/shares/:token/accept
POST /api/documents/shares/:token/pay
GET /api/documents/search
POST /api/documents/insights
POST /api/documents/packs/:packKey/run
GET /api/documents/public/:token/details
POST /api/documents/public/:token/sign
GET /api/documents/analytics/summary
GET /api/documents/:id/analytics
POST /api/documents/public/:token/action
GET /api/documents/public/:token/comments
POST /api/documents/public/:token/comments
POST /api/documents/public/:token/pay
```
#### enterprise.ts — auth: gate   (gate = [authenticate, requireFeature('enterprise_api')];)
```
GET /api/webhooks
POST /api/webhooks
PATCH /api/webhooks/:id
DELETE /api/webhooks/:id
GET /api/webhooks/:id/deliveries
POST /api/webhooks/:id/test
GET /api/api-keys
POST /api/api-keys
DELETE /api/api-keys/:id
GET /api/data-retention
PUT /api/data-retention
GET /api/whitelabel
PUT /api/whitelabel
GET /api/crm
POST /api/crm/connect
DELETE /api/crm/:provider
```
#### feedback.ts — auth: NONE (public/own check) 
```
POST /api/feedback
```
#### goal-profiles.ts — auth: authenticate   
```
GET /api/goal-profiles
GET /api/goal-profiles/:id
POST /api/goal-profiles
PATCH /api/goal-profiles/:id
DELETE /api/goal-profiles/:id
POST /api/goal-profiles/:id/link
DELETE /api/goal-profiles/:id/link/:linkId
POST /api/goal-profiles/:id/progress
POST /api/goal-profiles/check-price-conflict
```
#### goals.ts — auth: authenticate   
```
GET /api/goals
POST /api/goals
PATCH /api/goals/:id
```
#### health.ts — auth: NONE (public/own check) 
```
GET /health
```
#### inventory-locations.ts — auth: [authenticate, requireMarketingAccess, requireFeature('business_os')]   
```
GET /api/inventory-locations
POST /api/inventory-locations
PATCH /api/inventory-locations/:id
DELETE /api/inventory-locations/:id
GET /api/products/:id/stock-by-location
```
#### knowledge.ts — auth: authenticate   
```
GET /api/knowledge
GET /api/knowledge/documents
GET /api/knowledge/stats
GET /api/knowledge/health
GET /api/knowledge/:id
PATCH /api/knowledge/:id
DELETE /api/knowledge/:id
POST /api/knowledge/add-url
POST /api/knowledge/add-note
POST /api/knowledge/documents
POST /api/knowledge/upload
POST /api/knowledge/:id/reindex
POST /api/knowledge/search
POST /api/knowledge/chat
GET /api/knowledge/suggestions
POST /api/knowledge/suggestions/:id/approve
POST /api/knowledge/suggestions/:id/reject
POST /api/knowledge/suggestions/bulk
GET /api/knowledge/graph
GET /api/knowledge/duplicates
POST /api/knowledge/duplicates/:id/merge
GET /api/knowledge/analytics
GET /api/knowledge/documents/:id/chunks
PUT /api/knowledge/chunks/:id
POST /api/knowledge/reindex
```
#### leads.ts — auth: authenticate   
```
GET /api/leads
PATCH /api/leads/:id/stage
PATCH /api/leads/:id/score
```
#### media.ts — auth: NONE (public/own check) 
```
GET /api/media/:filename
```
#### memory.ts — auth: authenticate   
```
GET /api/memory/export
POST /api/memory/clear-all
```
#### milestones.ts — auth: NONE (public/own check) 
```
GET /api/milestones
POST /api/milestones/unlock
```
#### notifications.ts — auth: authenticate   
```
GET /api/notifications
PATCH /api/notifications/:id/read
PATCH /api/notifications/read-all
```
#### opportunities.ts — auth: authenticate   
```
GET /api/opportunities
PATCH /api/opportunities/:id
```
#### organization.ts — auth: gate   (gate = [authenticate, requireFeature('teams')];)
```
GET /api/organization/me
PATCH /api/organization/me
GET /api/organization/members
POST /api/organization/invite
PATCH /api/organization/members/:memberId
DELETE /api/organization/members/:memberId
GET /api/organization/teams
POST /api/organization/teams
GET /api/organization/audit-logs
POST /api/organization/create
GET /api/organization/teams/:teamId/members
POST /api/organization/teams/:teamId/members
DELETE /api/organization/teams/:teamId/members/:targetUserId
PATCH /api/organization/teams/:teamId
DELETE /api/organization/teams/:teamId
```
#### predictions.ts — auth: authenticate   
```
GET /api/predictions/:predictionType/:subjectId
```
#### privacy.ts — auth: authenticate   
```
GET /api/privacy/assistant
POST /api/privacy/bulk-apply
PUT /api/contacts/:id/privacy-settings
GET /api/export/contacts.csv
GET /api/export/conversations.csv
GET /api/export/full-workspace
POST /api/privacy/delete-account-request
POST /api/privacy/cancel-account-deletion
GET /api/privacy/account-status
```
#### proactive.ts — auth: gate   (gate = [authenticate, requireFeature('automation')])
```
GET /api/proactive
PATCH /api/proactive/:id
POST /api/proactive/:id/send
POST /api/proactive/:id/regenerate
GET /api/proactive/recommendations
GET /api/proactive/brief
```
#### product-families.ts — auth: [authenticate, requireMarketingAccess, requireFeature('business_os')]   
```
GET /api/product-families
POST /api/product-families
PATCH /api/product-families/:id
DELETE /api/product-families/:id
GET /api/product-families/:id/attributes
GET /api/product-families/:id/effective-attributes
POST /api/product-families/:id/attributes
PATCH /api/product-attribute-definitions/:id
DELETE /api/product-attribute-definitions/:id
```
#### products.ts — auth: [authenticate, requireMarketingAccess, requireFeature('business_os')]  [authenticate, requireMarketingAccess]   
```
GET /api/products
GET /api/products/:id/variants
POST /api/products/:id/generate-variants
POST /api/products
PATCH /api/products/:id
DELETE /api/products/:id
POST /api/products/:id/stock-movements
GET /api/products/:id/stock-movements
GET /api/products/:id/contacts
GET /api/products/:id/co-purchases
POST /api/products/:id/reserve
POST /api/products/:id/contacts
GET /api/products/:id/bom
POST /api/products/:id/bom
DELETE /api/products/:id/bom/:componentId
```
#### projects.ts — auth: [authenticate, requireMarketingAccess, requireFeature('business_os')]   
```
GET /api/projects
GET /api/projects/:id
POST /api/projects
PATCH /api/projects/:id
DELETE /api/projects/:id
POST /api/projects/:id/tasks
PATCH /api/projects/:id/tasks/:taskId
DELETE /api/projects/:id/tasks/:taskId
POST /api/projects/:id/tasks/reorder
POST /api/projects/:id/documents
POST /api/projects/:id/milestones
PATCH /api/projects/:id/milestones/:milestoneId
DELETE /api/projects/:id/milestones/:milestoneId
POST /api/projects/:id/time-entries
POST /api/projects/:id/time-entries/start
POST /api/projects/:id/time-entries/:entryId/stop
PATCH /api/projects/:id/time-entries/:entryId
DELETE /api/projects/:id/time-entries/:entryId
POST /api/projects/:id/apply-template
POST /api/projects/:id/interviews
PATCH /api/projects/:id/interviews/:interviewId
DELETE /api/projects/:id/interviews/:interviewId
POST /api/projects/:id/communications
DELETE /api/projects/:id/communications/:commId
POST /api/projects/:id/lessons-learned
```
#### promotions.ts — auth: authenticate   
```
GET /api/referrals/me
POST /api/gifts
GET /api/gifts/mine
POST /api/gifts/redeem/:code
GET /api/student-verification/me
POST /api/student-verification
```
#### purchase-orders.ts — auth: [authenticate, requireMarketingAccess, requireFeature('business_os')]   
```
POST /api/purchase-orders
POST /api/purchase-orders/:id/approve
POST /api/purchase-orders/:id/receive
```
#### recurring-documents.ts — auth: authenticate   
```
GET /api/recurring-documents
POST /api/recurring-documents
PATCH /api/recurring-documents/:id
DELETE /api/recurring-documents/:id
```
#### reflection.ts — auth: [authenticate]   
```
GET /api/reflection/latest
GET /api/reflection/timeline
```
#### relationships.ts — auth: authenticate   
```
GET /api/relationships
GET /api/relationships/:contactId
GET /api/relationships/:contactId/health-history
GET /api/relationships/:contactId/clocks
PATCH /api/relationships/:contactId/clocks/:clockId
GET /api/relationships/:contactId/goals
POST /api/relationships/analyze-all
```
#### reviews.ts — auth: NONE (public/own check) 
```
GET /api/reviews
POST /api/reviews
```
#### sales-erp.ts — auth: authenticate   
```
GET /api/studio/sales/orders
POST /api/studio/sales/orders
POST /api/studio/sales/orders/:id/status
GET /api/studio/catalog/:id/ledger
GET /api/studio/receivables/aging
GET /api/contacts/:id/financial-ledger
```
#### search.ts — auth: authenticate   
```
POST /api/search/ask
```
#### services.ts — auth: [authenticate, requireMarketingAccess, requireFeature('business_os')]   
```
GET /api/products/:id/pricing-tiers
POST /api/products/:id/pricing-tiers
PATCH /api/products/:id/pricing-tiers/:tierId
DELETE /api/products/:id/pricing-tiers/:tierId
GET /api/products/:id/capacity
PUT /api/products/:id/capacity
POST /api/products/:id/capacity-movements
GET /api/products/:id/capacity-movements
GET /api/products/:id/workflow-stages
PUT /api/products/:id/workflow-stages
POST /api/products/:id/start-project
```
#### settings.ts — auth: authenticate   
```
GET /api/settings/auto-response
PUT /api/settings/auto-response
GET /api/settings/auto-response/exclusions
POST /api/settings/auto-response/exclusions
DELETE /api/settings/auto-response/exclusions/:id
GET /api/settings/auto-response/inclusions
POST /api/settings/auto-response/inclusions
DELETE /api/settings/auto-response/inclusions/:id
GET /api/settings/privacy/exclusions
POST /api/settings/privacy/exclusions
DELETE /api/settings/privacy/exclusions/:id
POST /api/settings/auto-response/exclusion-rules
DELETE /api/settings/auto-response/exclusion-rules/:id
GET /api/settings/auto-response/exclusion-rules/preview
POST /api/settings/auto-response/exclusions/parse
```
#### signatures.ts — auth: authenticate   
```
GET /api/signatures
POST /api/signatures
PATCH /api/signatures/:id
DELETE /api/signatures/:id
```
#### social-accounts.ts — auth: [authenticate, requireMarketingAccess]   
```
GET /api/social-accounts
POST /api/social-accounts
DELETE /api/social-accounts/:id
```
#### social-posts.ts — auth: [authenticate, requireMarketingAccess]   
```
GET /api/social-posts
POST /api/social-posts
PATCH /api/social-posts/:id
DELETE /api/social-posts/:id
POST /api/social-posts/:id/schedule
POST /api/social-posts/:id/cancel
```
#### statuses.ts — auth: NONE (public/own check) 
```
GET /api/statuses
POST /api/statuses
POST /api/statuses/:id/reply
POST /api/statuses/:id/analyze
```
#### studio.ts — auth: [authenticate, requireMarketingAccess, requireFeature('business_os')]  [authenticate, requireMarketingAccess]   
```
GET /api/studio/insights
GET /api/studio/financial-overview
GET /api/studio/customers
POST /api/studio/customers
GET /api/studio/preset
PATCH /api/studio/preset
POST /api/studio/auto-extract
POST /api/studio/catalog/export-pdf
```
#### subscription-plans.ts — auth: authenticate   
```
GET /api/subscription-plans
POST /api/subscriptions/checkout
POST /api/subscriptions/checkout/:paymentRequestId/confirm
GET /api/subscriptions/me
```
#### suggestions.ts — auth: authenticate   
```
GET /api/suggestions/pending
GET /api/messages/:messageId/suggestions
POST /api/suggestions/:id/approve
POST /api/messages/:messageId/regenerate
POST /api/suggestions/:id/dismiss
```
#### suppliers.ts — auth: gate   (gate = [authenticate, requireFeature('business_os')])
```
GET /api/suppliers
POST /api/suppliers
PATCH /api/suppliers/:id
DELETE /api/suppliers/:id
GET /api/suppliers/:id/products
GET /api/products/:id/suppliers
PUT /api/suppliers/:id/products/:productId
DELETE /api/suppliers/:id/products/:productId
```
#### team.ts — auth: gate   (gate = [authenticate];)
```
GET /api/team
POST /api/team
GET /api/team/inbox
POST /api/conversations/:id/assign
POST /api/conversations/:id/lock
POST /api/conversations/:id/unlock
GET /api/conversations/:id/notes
POST /api/conversations/:id/notes
```
#### whatsapp.ts — auth: [authenticate, requireMarketingAccess]  authenticate   
```
POST /api/whatsapp/connect
DELETE /api/whatsapp/connect
POST /api/whatsapp/request-link-code
GET /api/whatsapp/service-health
GET /api/whatsapp/status
GET /api/whatsapp/catalog/products
POST /api/products/:id/whatsapp-catalog
POST /api/whatsapp/test-message
```

---

# Part B — Database (`db/migrations`)

Read-only audit of `db/migrations/` (138 files, 0001–0131) as of 2026-11-24. Column-level facts below were extracted by parsing every `CREATE TABLE` and `ALTER TABLE ... ADD COLUMN`. (The per-table column dump used for this section was generated by a throwaway parser over the migration files and is not committed.)

## B.0. Migration numbering

- 138 files. Numbers run 0001–0131 with **no gaps**, but **7 prefixes are duplicated**: 0026 (agent_workforce / knowledge_base_enhancements), 0032 (advisor_conversation_link / content_generations), 0101 (career_os_enrichment / production_maturity_upgrade), 0112 (fix_byok_schema / knowledge_base_system_overhaul), 0116 (temporal_intelligence_upgrade / whatsapp_disconnect_alerts), 0117 (data_portability_and_account_deletion / rich_event_metadata), 0118 (calendar_enum_and_fallbacks / fix_byok_not_null_api_key_encrypted).
- The runner (`db/migrate.js`) keys on the **full filename** in `_migrations`, applies files in lexical order, one transaction per file. Duplicate numbers are therefore harmless at runtime; they only make ordering implicit (alphabetical within a number).
- 0112_fix_byok_schema runs **before** 0112_knowledge_base... and recreates the user_ai_keys unique indexes (it uses `CREATE UNIQUE INDEX` without IF NOT EXISTS, after a drop).
- 0131 is a hotfix for 0130: 0130 moved sync_phase to `importing`, but 0096's CHECK did not allow it. Every new sync_jobs insert failed and history batches were dropped. Any environment that has 0130 but not 0131 is broken.
- I can't see which migrations have been applied in prod from the repo. The newest ones (0120–0131) are the most likely to still be pending somewhere.
- **No triggers or functions are defined in any migration.** `updated_at` is maintained only by the application. There is **no `deleted_at` column anywhere**.
- `docs/SCHEMA.md` is 106 lines, covers migrations up to 0115, and details only 3 domains. Treat it as stale.
- CLAUDE.md mentions a `byok_keys` table, but **no migration creates it**. BYOK keys live in `user_ai_keys` (0019, then 0111/0112/0118/0119).
- Totals: 188 tables were ever created; `auto_reply_rules` was dropped in 0052, leaving **187 live tables**. Only **6 pgvector columns** exist, all `vector(1536)`: message_analyses.embedding, context_snapshots.embedding, kb_chunks.embedding, agent_memories.embedding, documents.embedding, scraped_jobs.embedding.

## B.1. Tables by domain

Column legend: user_id / org_id = the column is present. created/updated = created_at / updated_at present (Y/N). FKs: (C) = ON DELETE CASCADE, (N) = SET NULL, nothing = NO ACTION/RESTRICT.
Caveat: a "N" for created_at sometimes means the table uses a different timestamp name (e.g. action_bundles.detected_at, reflection_summaries period cols, document_events.occurred_at-style columns). Check the migration files for exact column lists.

### B.Core / users / subscriptions / WhatsApp session

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| users | Account (Clerk-linked); mode business/personal/hybrid; current_organization_id; scheduled_deletion_at | 0002_core | N | N | Y/Y | [scheduled_deletion_at] | [] | [current_organization_id>organizations(N)] |
| whatsapp_instances | Per-user Baileys session status/phone/QR; session_data TEXT | 0002_core | Y | N | Y/Y | [status] | [] | [user_id>users(C)] |
| whatsapp_lid_map | @lid JID -> phone-number JID mapping per user (PK user_id,lid_jid) | 0130_history_sync_pipeline | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| whatsapp_statuses | WhatsApp Status/stories, 24h, unique (user_id, whatsapp_status_id) | 0123_whatsapp_statuses | Y | N | Y/N | [expires_at] | [] | [user_id>users(C), contact_id>contacts(C)] |
| sync_jobs | History-sync job tracking/progress (phase indexing..importing..analysing..complete) | 0025_history_sync | Y | N | Y/Y | [status] | [] | [user_id>users(C), current_conversation_id>conversations(N)] |
| system_config | Global key->JSONB config (feature flags, cost rates) | 0015_admin_role | N | N | N/Y | [] | [] | [updated_by>users(N)] |
| personas | User reply personas / voice | 0005_intelligence | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| user_communication_profiles | User writing-style profile (1/user) | 0005_intelligence | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| gemini_user_caches | Provider context-cache handles per user | 0096_advanced_caching_and_resume | Y | N | Y/Y | [expires_at] | [] | [user_id>users(C)] |
| user_feedback_loops | Learning signals from user edits per contact | 0096_advanced_caching_and_resume | Y | N | Y/N | [] | [] | [user_id>users(C), contact_id>contacts(C)] |

### B.Organizations / teams (multi-user)

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| organizations | Clerk orgs (0114) | 0114_clerk_organizations_and_teams | N | N | Y/Y | [] | [] | [owner_user_id>users(N)] |
| organization_members | Org membership + role | 0114_clerk_organizations_and_teams | Y | Y | Y/Y | [status] | [] | [organization_id>organizations(C), user_id>users(C)] |
| organization_teams | Departments in org | 0114_clerk_organizations_and_teams | N | Y | Y/Y | [] | [] | [organization_id>organizations(C), lead_user_id>users(N)] |
| organization_team_members | Dept membership | 0114_clerk_organizations_and_teams | Y | N | Y/N | [] | [] | [team_id>organization_teams(C), user_id>users(C)] |
| organization_audit_logs | Org action audit | 0114_clerk_organizations_and_teams | N | Y | Y/N | [] | [] | [organization_id>organizations(C), actor_user_id>users(C)] |
| teams | Legacy 0019 enterprise teams (owner_user_id) | 0019_enterprise | N | N | Y/Y | [] | [] | [owner_user_id>users(C)] |
| team_members | Legacy team membership | 0019_enterprise | Y | N | N/N | [] | [] | [team_id>teams(C), user_id>users(C)] |
| conversation_assignments | Assign conversation to team/user, lock | 0019_enterprise | N | N | Y/Y | [status] | [] | [conversation_id>conversations(C), team_id>teams(N), assigned_to>users(N), assigned_by>users(N), locked_by>users(N)] |
| conversation_notes | Legacy internal notes (0019) | 0019_enterprise | N | N | Y/N | [] | [] | [conversation_id>conversations(C), author_id>users(C)] |
| conversation_internal_notes | Internal notes per conversation (0125, organization_id no FK) | 0125_conversation_internal_notes | N | Y | Y/N | [] | [] | [conversation_id>conversations(C), author_id>users(C)] |

### B.Contacts & relationships

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| contacts | WhatsApp contact/CRM row; UNIQUE(user_id, whatsapp_jid); is_group; CRM fields; archived_at/is_active/merged_into_id | 0003_contacts | Y | Y | Y/Y | [archived_at, is_active, merged_into_id] | [] | [user_id>users(C), source_product_id>products(N), source_social_post_id>social_posts(N), merged_into_id>contacts(N), organization_id>organizations(N)] |
| contact_group_members | Group membership (reserved, unused) | 0003_contacts | N | N | Y/N | [] | [] | [group_contact_id>contacts(C), member_contact_id>contacts(C)] |
| relationships | Per-contact relationship (type, tier, health_score) UNIQUE(user_id,contact_id) | 0003_contacts | Y | N | Y/Y | [] | [] | [user_id>users(C), contact_id>contacts(C)] |
| relationship_health_logs | Append-only health history | 0003_contacts | N | N | N/N | [] | [] | [relationship_id>relationships(C)] |
| contact_tags | Tags | 0003_contacts | Y | N | Y/N | [] | [] | [user_id>users(C), contact_id>contacts(C)] |
| contact_tasks | Per-contact to-dos | 0023_contact_tasks | Y | N | Y/Y | [] | [] | [user_id>users(C), contact_id>contacts(C)] |
| contact_context_pins | Pinned facts | 0023_contact_tasks | Y | N | Y/Y | [] | [] | [user_id>users(C), contact_id>contacts(C)] |
| contact_documents | Human-uploaded files per contact | 0024_ai_profile_fields_documents | Y | N | Y/N | [] | [] | [user_id>users(C), contact_id>contacts(C), generated_document_id>documents(N)] |
| contact_life_events | Detected life events | 0039_products_life_events_network_value | Y | N | Y/N | [] | [] | [user_id>users(C), contact_id>contacts(C)] |
| contact_products | Contact<->product relation (mentioned/quoted/purchased) | 0039_products_life_events_network_value | Y | N | Y/Y | [] | [] | [user_id>users(C), contact_id>contacts(C), product_id>products(C)] |
| contact_promises | Promises made by/to contact (0116) | 0116_temporal_intelligence_upgrade | Y | N | Y/Y | [status] | [] | [user_id>users(C), contact_id>contacts(C), conversation_id>conversations(N), source_message_id>messages(N)] |
| relationship_clocks | Cadence clocks per contact | 0012_relationship_clocks | Y | N | Y/Y | [is_active] | [] | [user_id>users(C), contact_id>contacts(C)] |
| relationship_connections | Contact<->contact graph edges | 0038_opportunities_and_connections | Y | N | Y/Y | [is_active] | [] | [user_id>users(C), contact_a_id>contacts(C), contact_b_id>contacts(C)] |
| relationship_goals | Per-relationship goals | 0041_relationship_goals | Y | N | Y/Y | [status] | [] | [user_id>users(C), contact_id>contacts(C)] |
| relationship_memory | Long-term relationship memory blob | 0028_memory_engine_phase1 | Y | N | Y/Y | [] | [] | [user_id>users(C), contact_id>contacts(C)] |
| privacy_exclusions | Contacts excluded from AI | 0099_privacy_and_auto_reply_inclusions | Y | N | Y/N | [] | [] | [user_id>users(C), contact_id>contacts(C)] |
| consent_records | Consent per contact | 0019_enterprise | Y | N | Y/N | [status] | [] | [user_id>users(C), contact_id>contacts(C)] |

### B.Conversations & messages

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| conversations | Chat thread; UNIQUE(user_id, whatsapp_chat_id); archived/muted/pinned; SLA | 0004_conversations | Y | Y | Y/Y | [is_archived] | [] | [user_id>users(C), contact_id>contacts(C), organization_id>organizations(N)] |
| messages | Messages; UNIQUE(conversation_id, whatsapp_message_id); NO user_id, NO updated_at | 0004_conversations | N | N | Y/N | [is_deleted, deleted_for_user_ids] | [] | [conversation_id>conversations(C), quoted_message_id>messages] |
| message_reactions | Emoji reactions (0120) | 0120_message_reactions | Y | N | Y/N | [] | [] | [message_id>messages(C), user_id>users(C)] |
| suggested_replies | AI reply drafts per message | 0004_conversations | N | N | Y/Y | [status] | [] | [message_id>messages(C)] |
| suggestion_outcomes | Outcome analytics for suggestions | 0018_analytics | Y | N | Y/N | [] | [] | [suggestion_id>suggested_replies(C), user_id>users(C)] |

### B.AI intelligence

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| message_analyses | Per-message sentiment/intent/entities + embedding vector(1536) | 0004_conversations | N | N | Y/N | [] | [embedding] | [message_id>messages(C)] |
| contact_profiles | Psych profile per contact (1/contact) | 0005_intelligence | Y | N | Y/Y | [] | [] | [contact_id>contacts(C), user_id>users(C), preferences>TEXT] |
| contact_insights | Atomic AI observations (deactivated not deleted) | 0005_intelligence | Y | N | Y/N | [is_active] | [] | [contact_id>contacts(C), user_id>users(C), superseded_by>contact_insights, source_document_id>documents(N)] |
| context_snapshots | Compressed summaries + embedding (never written) | 0005_intelligence | Y | N | Y/N | [] | [embedding] | [contact_id>contacts(C), user_id>users(C)] |
| business_facts | Business knowledge facts | 0029_business_facts | Y | N | Y/Y | [is_active] | [] | [user_id>users(C)] |
| ai_model_usage | DashScope free-tier rotation counter | 0027_ai_model_usage | N | N | Y/N | [] | [] | [] |
| token_usage_logs | Per-call token/cost log | 0072_token_usage_tracking | Y | N | Y/N | [] | [] | [user_id>users(N), team_id>teams(N)] |
| user_ai_keys | BYOK provider keys (encrypted) | 0019_enterprise | Y | N | Y/Y | [is_active, status, status] | [] | [user_id>users(C), team_id>teams(C), team_id>teams(C)] |
| user_ai_settings | Per-user model prefs | 0111_byok_production_system | Y | N | Y/Y | [] | [] | [user_id>users(C), team_id>teams(C)] |
| ai_connection_logs | BYOK connection test logs | 0111_byok_production_system | Y | N | N/N | [] | [] | [user_id>users(C), team_id>teams(C)] |

### B.Proactive / temporal

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| events | AI-extracted life/appointment events | 0006_proactive | Y | N | Y/Y | [] | [] | [user_id>users(C), contact_id>contacts(C), source_message_id>messages] |
| proactive_queue | Nudge/draft queue (status enum incl auto_resolved) | 0006_proactive | Y | N | Y/Y | [status, expires_at] | [] | [user_id>users(C), contact_id>contacts(C), event_id>events, business_event_id>business_events(N)] |
| auto_response_settings | Auto-reply config (1/user) | 0025_history_sync | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| auto_reply_exclusions | Contacts excluded from auto-reply | 0052_auto_reply_agents_unification | Y | N | Y/N | [] | [] | [user_id>users(C), contact_id>contacts(C)] |
| auto_reply_exclusion_rules | Rule-based exclusions | 0052_auto_reply_agents_unification | Y | N | Y/N | [] | [] | [user_id>users(C)] |
| auto_reply_inclusions | Allow-list mode (0099) | 0099_privacy_and_auto_reply_inclusions | Y | N | Y/N | [] | [] | [user_id>users(C), contact_id>contacts(C)] |
| auto_reply_rules | DROPPED in 0052 | 0006_proactive | Y | N | Y/Y | [is_active] | [] | [user_id>users(C), contact_id>contacts(C), persona_id>personas] |

### B.Calendar

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| calendars | User calendars | 0007_calendar | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| calendar_events | User-facing events | 0007_calendar | Y | N | Y/Y | [status] | [] | [calendar_id>calendars(C), user_id>users(C), source_event_id>events] |
| calendar_event_attendees | Attendees | 0007_calendar | N | N | Y/N | [status] | [] | [calendar_event_id>calendar_events(C), contact_id>contacts] |
| calendar_reminders | Reminders | 0007_calendar | N | N | Y/N | [] | [] | [calendar_event_id>calendar_events(C)] |

### B.Advisor / companion

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| advisor_sessions | Advisor chat sessions | 0008_advisor | Y | N | Y/Y | [is_archived] | [] | [user_id>users(C), contact_id>contacts, conversation_id>conversations(N), active_contact_id>contacts(N), active_conversation_id>conversations(N)] |
| advisor_messages | Advisor chat turns (no user_id) | 0008_advisor | N | N | Y/N | [] | [] | [session_id>advisor_sessions(C)] |
| advisor_user_profiles | User persona/emotional/spiritual prefs (1/user) | 0066_advisor_user_profiles | Y | N | Y/Y | [] | [] | [user_id>users(C), tone_preferences>JSONB, advice_preferences>JSONB, spiritual_preferences>JSONB] |
| advisor_memories | Memories about the user | 0067_advisor_memories_and_companion | Y | N | Y/N | [is_active] | [] | [user_id>users(C), session_id>advisor_sessions(N), source_message_id>advisor_messages(N)] |
| advisor_action_requests | Approval log for advisor actions/watches | 0068_advisor_action_requests | Y | N | Y/N | [status, expires_at] | [] | [user_id>users(C), session_id>advisor_sessions(C), message_id>advisor_messages(N)] |
| advisor_automation_grants | Scoped auto-send grants | 0070_scoped_automation | Y | N | Y/N | [status, expires_at] | [] | [user_id>users(C), conversation_id>conversations(C), session_id>advisor_sessions(N)] |
| advisor_automation_audit_log | Audit of scoped auto-send | 0070_scoped_automation | Y | N | Y/N | [] | [] | [grant_id>advisor_automation_grants(C), user_id>users(C), conversation_id>conversations(C), message_id>messages(N)] |
| advisor_curiosity_prompts | Curiosity questions asked | 0071_curiosity_engine | Y | N | Y/N | [status] | [] | [user_id>users(C), session_id>advisor_sessions(N), target_contact_id>contacts(C)] |
| gossip_worthy_events | Detected gossip items | 0069_proactive_companion | Y | N | Y/N | [status] | [] | [user_id>users(C), contact_id>contacts(C)] |
| proactive_interest_chats | Proactive companion deliveries + engagement | 0069_proactive_companion | Y | N | Y/N | [] | [] | [user_id>users(C), session_id>advisor_sessions(N)] |

### B.Neural layer

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| emotional_signals | Polymorphic affect vectors (valence/arousal) | 0062_emotional_signals | Y | N | Y/N | [] | [] | [user_id>users(C), contact_id>contacts(N)] |
| goal_profiles | Cross-module goals | 0063_goal_profiles | Y | N | Y/Y | [status] | [] | [user_id>users(C)] |
| goal_memories | Goal memories | 0063_goal_profiles | N | N | Y/N | [] | [] | [goal_id>goal_profiles(C)] |
| goal_progress | Goal progress points | 0063_goal_profiles | N | N | N/N | [] | [] | [goal_id>goal_profiles(C)] |
| goal_events | Goal timeline | 0063_goal_profiles | N | N | Y/N | [] | [] | [goal_id>goal_profiles(C)] |
| goal_linked_entities | Polymorphic goal links | 0063_goal_profiles | N | N | Y/N | [] | [] | [goal_id>goal_profiles(C)] |
| reflection_summaries | Weekly/monthly reflections | 0064_reflection_summaries | Y | N | N/N | [] | [] | [user_id>users(C)] |
| knowledge_graph_edges | AI-inferred polymorphic edges | 0065_knowledge_graph_edges | Y | N | Y/N | [] | [] | [user_id>users(C)] |

### B.Business workspace / documents

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| business_profiles | Brand profiles (multi, one default) | 0043_business_workspace_phase0 | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| brand_signatures | Signatures per brand profile | 0110_brand_signatures | Y | N | Y/Y | [] | [] | [user_id>users(C), business_profile_id>business_profiles(C)] |
| document_templates | PDF templates | 0043_business_workspace_phase0 | Y | N | Y/N | [] | [] | [user_id>users(C)] |
| documents | Quotes/invoices/CVs/etc; embedding; share_token; status lifecycle | 0043_business_workspace_phase0 | Y | Y | Y/Y | [status, expires_at] | [embedding] | [user_id>users(C), contact_id>contacts(N), deal_id>deals(N), opportunity_id>opportunities(N), conversation_id>conversations(N), agent_id>agents(N), template_id>document_templates(N), source_document_id>documents(N), supplier_id>suppliers(N), project_id>projects(N), business_profile_id>business_profiles(N), signature_id>brand_signatures(N), organization_id>organizations(N)] |
| document_events | Document lifecycle log | 0043_business_workspace_phase0 | N | N | N/N | [] | [] | [document_id>documents(C)] |
| document_chat_messages | Per-document AI chat | 0045_business_workspace_phase3 | N | N | Y/N | [] | [] | [document_id>documents(C)] |
| recurring_documents | Scheduled docs | 0045_business_workspace_phase3 | Y | N | Y/Y | [is_active] | [] | [user_id>users(C), contact_id>contacts(C), last_document_id>documents(N)] |
| document_pack_runs | Auto business packs | 0046_business_workspace_phase4 | Y | N | Y/N | [] | [] | [user_id>users(C), contact_id>contacts(C)] |
| document_signatures | E-signatures | 0104_esignatures_and_dunning_reminders | N | N | N/N | [] | [] | [document_id>documents(C)] |
| document_dunning_schedules | Invoice reminders | 0104_esignatures_and_dunning_reminders | Y | N | Y/N | [status] | [] | [document_id>documents(C), user_id>users(C), contact_id>contacts(C)] |
| document_comments | Client portal comments | 0106_client_portal_and_payments | N | N | Y/N | [] | [] | [document_id>documents(C)] |
| payment_receipts | Customer payments against invoices | 0113_business_erp_sales_engine | Y | N | Y/N | [] | [] | [user_id>users(C), contact_id>contacts(N), invoice_id>documents(N)] |

### B.Studio / ERP

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| products | Products/services catalog (status active/secondary/archived/discontinued) | 0031_marketing_access_products | Y | Y | Y/Y | [status] | [] | [user_id>users(C), supplier_id>suppliers(N), replacement_product_id>products(N), family_id>product_families(N), parent_product_id>products(C), organization_id>organizations(N)] |
| product_families | Hierarchical product types | 0056_product_families_attributes | Y | N | Y/Y | [] | [] | [user_id>users(C), parent_id>product_families(C)] |
| product_attribute_definitions | Custom attribute schema | 0056_product_families_attributes | Y | N | Y/N | [] | [] | [user_id>users(C), family_id>product_families(C)] |
| product_bom_components | Bill of materials | 0109_bill_of_materials | Y | N | Y/Y | [] | [] | [user_id>users(C), parent_product_id>products(C), component_product_id>products(C)] |
| suppliers | Suppliers | 0049_studio_erp_improvements | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| supplier_products | Per-supplier cost/lead time | 0057_purchase_orders | N | N | Y/Y | [] | [] | [supplier_id>suppliers(C), product_id>products(C)] |
| stock_movements | Append-only stock ledger | 0055_stock_movements | Y | N | Y/N | [] | [] | [user_id>users(C), product_id>products(C), location_id>inventory_locations(N)] |
| inventory_locations | Warehouses | 0058_inventory_locations | Y | N | Y/N | [] | [] | [user_id>users(C)] |
| product_stock_by_location | Per-location stock | 0058_inventory_locations | N | N | N/Y | [] | [] | [product_id>products(C), location_id>inventory_locations(C)] |
| inventory_forecasts | Stockout forecasts (no user_id) | 0061_inventory_forecasts | N | N | N/N | [] | [] | [product_id>products(C)] |
| service_pricing_tiers | Service packages/milestones | 0074_services_management | Y | N | Y/N | [] | [] | [user_id>users(C), product_id>products(C)] |
| service_capacity | Capacity per period | 0074_services_management | Y | N | Y/Y | [] | [] | [user_id>users(C), product_id>products(C)] |
| service_capacity_movements | Capacity ledger | 0074_services_management | Y | N | Y/N | [] | [] | [user_id>users(C), capacity_id>service_capacity(C), contact_id>contacts(N), project_id>projects(N)] |
| service_workflow_stages | Service workflow template | 0074_services_management | Y | N | Y/N | [] | [] | [user_id>users(C), product_id>products(C)] |
| sales_orders | Sales orders (0113) | 0113_business_erp_sales_engine | Y | N | Y/Y | [status] | [] | [user_id>users(C), contact_id>contacts(N), quotation_id>documents(N), invoice_id>documents(N), receipt_id>documents(N)] |
| sales_order_items | Order lines | 0113_business_erp_sales_engine | N | N | Y/N | [] | [] | [sales_order_id>sales_orders(C), product_id>products(N)] |

### B.Deals / opportunities / projects

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| deals | Sales deals | 0037_deals | Y | Y | Y/Y | [] | [] | [user_id>users(C), contact_id>contacts(C), linked_opportunity_id>opportunities(N), organization_id>organizations(N)] |
| deal_stage_history | Stage transitions | 0043_business_workspace_phase0 | N | N | N/N | [] | [] | [deal_id>deals(C)] |
| opportunities | Relationship/commercial opportunities | 0038_opportunities_and_connections | Y | N | N/Y | [status, expires_at] | [] | [user_id>users(C), contact_id>contacts(C), linked_deal_id>deals(N)] |
| projects | Projects | 0060_projects | Y | N | Y/Y | [status] | [] | [user_id>users(C), contact_id>contacts(N), deal_id>deals(N), career_opportunity_id>career_opportunities(N)] |
| project_tasks | Tasks | 0060_projects | N | N | Y/N | [status] | [] | [project_id>projects(C)] |
| project_milestones | Milestones | 0075_project_management_expansion | N | N | Y/Y | [status] | [] | [project_id>projects(C)] |
| project_time_entries | Time tracking | 0075_project_management_expansion | Y | N | Y/N | [] | [] | [project_id>projects(C), task_id>project_tasks(N), user_id>users(C)] |
| project_events | Dedup markers | 0075_project_management_expansion | N | N | Y/N | [] | [] | [project_id>projects(C)] |
| project_communications | Career-OS project comms (0103) | 0103_career_os_three_workspaces | N | N | Y/N | [] | [] | [project_id>projects(C)] |
| project_interviews | Project interviews (0103) | 0103_career_os_three_workspaces | N | N | Y/Y | [status] | [] | [project_id>projects(C)] |
| project_lessons_learned | Lessons learned (0103) | 0103_career_os_three_workspaces | N | N | Y/Y | [] | [] | [project_id>projects(C)] |
| revenue_events | Revenue attribution | 0018_analytics | Y | N | Y/N | [] | [] | [user_id>users(C), conversation_id>conversations(N), contact_id>contacts(N)] |

### B.Business events / action bundles

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| business_events | Durable log of detected business signals | 0076_business_events | Y | N | Y/N | [status] | [] | [user_id>users(C), contact_id>contacts(N), conversation_id>conversations(N), message_id>messages(N), bundle_id>action_bundles(N)] |
| action_bundles | Multi-action approval cards (JSONB actions) | 0059_action_bundles | Y | N | N/N | [status] | [] | [user_id>users(C), contact_id>contacts(N), conversation_id>conversations(N)] |

### B.Career / CV

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| career_profiles | Professional identity (incl passport_or_nrc, nationality) | 0078_career_growth_engine | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| career_opportunities | Unified opportunity engine | 0078_career_growth_engine | Y | N | Y/Y | [status] | [] | [user_id>users(C), contact_id>contacts(N), source_message_id>messages(N), business_event_id>business_events(N), project_id>projects(N)] |
| career_interviews | Interview rounds | 0078_career_growth_engine | Y | N | Y/Y | [] | [] | [user_id>users(C), career_opportunity_id>career_opportunities(C), calendar_event_id>calendar_events(N)] |
| career_employer_categories | Static reference (global) | 0080_career_employer_taxonomy | N | N | Y/N | [] | [] | [] |
| career_job_discovery_manual_runs | Manual run rate-limit log | 0091_job_discovery_manual_runs | Y | N | Y/N | [] | [] | [user_id>users(C)] |
| career_job_discovery_runs | Run progress | 0095_career_os_living_companion | Y | N | N/N | [status] | [] | [user_id>users(C)] |
| career_employment_history | Entries | 0081_cv_studio_phase1 | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| career_education_entries | Entries | 0081_cv_studio_phase1 | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| career_certifications | Entries | 0081_cv_studio_phase1 | Y | N | Y/Y | [] | [] | [user_id>users(C), upload_document_id>documents(N)] |
| career_skill_groups | Entries | 0081_cv_studio_phase1 | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| career_awards | Entries | 0081_cv_studio_phase1 | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| career_volunteer_work | Entries | 0081_cv_studio_phase1 | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| career_memberships | Entries | 0081_cv_studio_phase1 | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| career_publications | Entries | 0081_cv_studio_phase1 | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| career_references | Referees (third-party PII) | 0081_cv_studio_phase1 | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| career_cvs | CV object | 0081_cv_studio_phase1 | Y | N | Y/Y | [] | [] | [user_id>users(C), career_opportunity_id>career_opportunities(N), source_cv_id>career_cvs(N)] |
| career_cv_sections | CV section config | 0081_cv_studio_phase1 | N | N | Y/Y | [] | [] | [cv_id>career_cvs(C)] |
| career_cv_project_links | CV<->projects | 0081_cv_studio_phase1 | N | N | Y/N | [] | [] | [cv_id>career_cvs(C), project_id>projects(C)] |
| career_cv_versions | CV snapshots | 0081_cv_studio_phase1 | N | N | Y/N | [] | [] | [cv_id>career_cvs(C)] |
| scraped_jobs | Global scraped job pool + embedding | 0094_scraped_jobs | N | N | N/N | [expires_at] | [embedding] | [canonical_job_id>scraped_jobs(N)] |
| scraper_runs | Scraper run log | 0094_scraped_jobs | N | N | N/N | [] | [] | [] |

### B.Marketing

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| content_generations | AI marketing content | 0032_content_generations | Y | N | Y/N | [] | [] | [user_id>users(C), product_id>products(C)] |
| social_accounts | Social accounts (tokens) | 0033_social_publishing | Y | N | Y/Y | [status] | [] | [user_id>users(C)] |
| social_posts | Social posts | 0033_social_publishing | Y | N | Y/Y | [status] | [] | [user_id>users(C), product_id>products(N), social_account_id>social_accounts(C)] |
| broadcasts | Broadcast campaigns | 0019_enterprise | Y | N | Y/Y | [status] | [] | [user_id>users(C)] |
| broadcast_recipients | Recipients | 0019_enterprise | N | N | N/N | [status] | [] | [broadcast_id>broadcasts(C), contact_id>contacts(C)] |

### B.Agents / automation / knowledge base

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| agents | AI agents | 0017_agents | Y | N | Y/Y | [is_active] | [] | [user_id>users(C)] |
| agent_assignments | Agent<->contact | 0017_agents | N | N | Y/N | [] | [] | [agent_id>agents(C), contact_id>contacts(C)] |
| agent_actions | Agent action log | 0017_agents | N | N | Y/N | [] | [] | [agent_id>agents(C), conversation_id>conversations(N), contact_id>contacts(N)] |
| agent_corrections | Corrections | 0026_agent_workforce | Y | N | Y/N | [] | [] | [agent_action_id>agent_actions(N), agent_id>agents(C), user_id>users(C), contact_id>contacts(N)] |
| agent_memories | Agent memories + embedding | 0030_agent_memories | Y | N | Y/Y | [is_active] | [embedding] | [agent_id>agents(C), user_id>users(C), contact_id>contacts(C), superseded_by>agent_memories] |
| agent_performance_daily | Daily metrics | 0026_agent_workforce | Y | N | Y/N | [] | [] | [agent_id>agents(C), user_id>users(C)] |
| agent_proactive_cadences | Agent cadences (0126) | 0126_agent_workforce_enhancements | Y | N | Y/N | [status] | [] | [agent_id>agents(C), user_id>users(C), contact_id>contacts(C), conversation_id>conversations(C)] |
| escalations | Escalations | 0017_agents | N | N | Y/N | [status] | [] | [agent_id>agents(C), conversation_id>conversations(C), contact_id>contacts(N), resolved_by>users(N)] |
| orchestrator_decisions | Routing decisions | 0026_agent_workforce | Y | N | Y/N | [] | [] | [user_id>users(C), conversation_id>conversations(C), message_id>messages(C), agent_id>agents(N)] |
| kb_documents | KB docs | 0017_agents | Y | N | Y/Y | [status, is_active] | [] | [user_id>users(C), agent_id>agents(N)] |
| kb_chunks | KB chunks + embedding | 0017_agents | Y | N | Y/N | [] | [embedding] | [document_id>kb_documents(C), user_id>users(C)] |
| knowledge_duplicates | KB dup detection | 0112_knowledge_base_system_overhaul | Y | N | Y/N | [status] | [] | [user_id>users(C)] |
| knowledge_suggestions | KB suggestions | 0112_knowledge_base_system_overhaul | Y | N | Y/Y | [status] | [] | [user_id>users(C)] |
| knowledge_health_snapshots | KB health | 0112_knowledge_base_system_overhaul | Y | N | Y/N | [] | [] | [user_id>users(C)] |

### B.Billing / membership

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| subscriptions | User subscription | 0002_core | Y | N | Y/Y | [status] | [] | [user_id>users(C), plan_id>subscription_plans] |
| subscription_plans | Plan catalog (global) | 0073_subscription_plans_and_payments | N | N | Y/Y | [is_active] | [] | [] |
| subscription_events | Append-only lifecycle | 0083_membership_platform | Y | N | Y/N | [] | [] | [user_id>users(C)] |
| payment_requests | Manual mobile-money payments (payer phone, screenshot) | 0073_subscription_plans_and_payments | Y | N | Y/N | [status] | [] | [user_id>users(C), subscription_id>subscriptions(C), plan_id>subscription_plans, reviewed_by>users] |
| promo_codes | Promo codes (global) | 0086_promotion_engine | N | N | Y/N | [is_active] | [] | [] |
| promo_code_redemptions | Redemptions | 0086_promotion_engine | Y | N | Y/N | [] | [] | [promo_code_id>promo_codes(C), user_id>users(C), payment_request_id>payment_requests(N)] |
| referral_codes | Referral codes | 0086_promotion_engine | Y | N | Y/N | [] | [] | [user_id>users(C)] |
| referral_redemptions | Referral uses | 0086_promotion_engine | N | N | Y/N | [status] | [] | [referral_code_id>referral_codes(C), referred_user_id>users(C)] |
| gift_memberships | Gifts | 0086_promotion_engine | N | N | Y/N | [status] | [] | [gifter_user_id>users(C), plan_id>subscription_plans, payment_request_id>payment_requests(N), redeemed_by_user_id>users(N)] |
| student_verifications | Student verification | 0086_promotion_engine | Y | N | Y/N | [status] | [] | [user_id>users(C), reviewed_by>users(N)] |

### B.Notifications

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| notifications | In-app notifications | 0009_notifications | Y | N | Y/N | [expires_at] | [] | [user_id>users(C)] |
| notification_preferences | Prefs | 0009_notifications | Y | N | Y/Y | [] | [] | [user_id>users(C)] |

### B.Analytics / admin / enterprise / feedback

| table | purpose | migration | user_id | org_id | created/updated | soft-delete/status | vector | FKs (C=cascade,N=set null, none=no action) |
|---|---|---|---|---|---|---|---|---|
| analytics_events | Raw analytics events | 0018_analytics | Y | N | Y/N | [] | [] | [user_id>users(C)] |
| analytics_snapshots | Daily snapshots | 0018_analytics | Y | N | Y/N | [] | [] | [user_id>users(C)] |
| conversation_funnel_stages | Funnel stages | 0018_analytics | Y | N | N/N | [] | [] | [user_id>users(C), conversation_id>conversations(C), contact_id>contacts(N)] |
| admin_audit_log | Admin actions | 0015_admin_role | N | N | Y/N | [] | [] | [admin_user_id>users(C)] |
| api_keys | Public API keys | 0019_enterprise | Y | N | Y/N | [expires_at, is_active] | [] | [user_id>users(C)] |
| api_key_usage | Usage | 0019_enterprise | N | N | Y/N | [] | [] | [api_key_id>api_keys(C)] |
| webhooks | Webhooks (secret) | 0019_enterprise | Y | N | Y/Y | [is_active] | [] | [user_id>users(C)] |
| webhook_deliveries | Deliveries | 0019_enterprise | N | N | Y/N | [] | [] | [webhook_id>webhooks(C)] |
| crm_integrations | External CRM creds | 0019_enterprise | Y | N | Y/Y | [is_active] | [] | [user_id>users(C)] |
| data_retention_policies | Retention policy | 0019_enterprise | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| whitelabel_config | White label | 0019_enterprise | Y | N | Y/Y | [] | [] | [user_id>users(C)] |
| user_reviews | Testimonials | 0128_reviews_and_feedback | Y | Y | Y/Y | [] | [] | [organization_id>organizations(C), user_id>users(C)] |
| platform_feedback | Feedback | 0128_reviews_and_feedback | Y | Y | Y/Y | [status] | [] | [organization_id>organizations(C), user_id>users(C)] |

Unclassified: []
## B.2. Ownership model

- **Everything is user-scoped, by `user_id` → users(id) ON DELETE CASCADE.** 151 FKs reference users (140 CASCADE). Most domain tables carry user_id directly.
- Child tables reach the owner **only through their parent**:
  - **messages** (via conversations), message_analyses, suggested_replies
  - advisor_messages, document_events / document_chat_messages / document_signatures / document_comments
  - project_tasks / milestones / events, goal_*, deal_stage_history, product_stock_by_location, inventory_forecasts
  - supplier_products, career_cv_*, broadcast_recipients, calendar_reminders / attendees, contact_group_members, relationship_health_logs, agent_actions / assignments, escalations

  On mobile, either denormalise user_id/workspace_id onto these rows or always sync them inside their parent's scope.
- **Global (unscoped) tables:** subscription_plans, promo_codes, system_config, career_employer_categories, scraped_jobs, scraper_runs, ai_model_usage. Treat these as read-only reference caches on device.
- **Organizations (0114/0115) are the multi-user layer.**
  - Tables: organizations (Clerk org) + organization_members (owner/admin/member/viewer) + organization_teams + organization_team_members + organization_audit_logs.
  - `users.current_organization_id` selects the active org.
  - 0115 added a nullable `organization_id` to **only 5 tables**: conversations, contacts, documents, products, deals. It was backfilled from the user's current org. conversation_internal_notes (0125), user_reviews and platform_feedback (0128) also have it.
  - At runtime, `services/api/src/lib/org-scope.ts::getEffectiveScope()` resolves a member to the **org owner's user_id** (`ownerUserId`), and queries filter by that. So data is still physically owned by one user_id, and org members act on the owner's rows.
- **Legacy `teams` / `team_members` (0019)** still exist. They are used by BYOK (user_ai_keys / user_ai_settings / ai_connection_logs.team_id), token_usage_logs.team_id, conversation_assignments.team_id, and seat limits. This is two parallel team concepts.
- **There is no multi-workspace concept per user.** A user = one data space (optionally shared into one active org). business_profiles (0092, multi + one `is_default`) are **brand profiles for document numbering and branding, not workspaces**. Nothing else is scoped by business_profile_id; only documents.business_profile_id and brand_signatures reference it.
- **Personal vs business** is not a partition:
  - `users.mode` (0014; default changed to 'hybrid' in 0020) is a **UI mode** for the whole account.
  - Per contact there are only soft signals: contacts.customer_status ('contact' / 'customer' / ...), contacts.is_business, relationships.relationship_type (default 'acquaintance'), relationships.relationship_category (default 'professional', 0101), relationships.analysis_mode, privacy_level, and contacts.privacy_settings JSONB (0101).
  - advisor_user_profiles.personal_mode_enabled gates companion features.
  - career_profiles.career_mode is career-only.
  - **Mobile "workspace isolation" therefore has no server column to key on.** A personal/business split would need to be derived from these fields, or added as a new column.

## B.3. Identifiers and dedup

- **UUID PKs everywhere** (gen_random_uuid). Exception: whatsapp_lid_map uses a composite PK (user_id, lid_jid); `_migrations` uses SERIAL. Room can mirror UUID strings. Client-generated UUIDv4 / v7 are compatible with the server PK type, but the current API lets the server assign ids.
- **Natural keys usable for dedup:**
  - `contacts`: UNIQUE(user_id, whatsapp_jid). JIDs look like `<num>@s.whatsapp.net`, `<id>@g.us` for groups, or `<id>@lid`. `phone_number` is not unique.
  - `whatsapp_lid_map` (0130) maps @lid → phone JID. The WhatsApp service canonicalises JIDs through it (`message-handler.ts::canonicalJid`). History sync can merge a lid conversation into the phone-number one: `history-sync-pipeline.ts` does `UPDATE messages SET conversation_id = ...`. **So conversation_id of existing messages can change.**
  - `conversations`: UNIQUE(user_id, whatsapp_chat_id), where chat id = JID.
  - `messages`: UNIQUE(conversation_id, whatsapp_message_id). For inbound and echoed messages, whatsapp_message_id = Baileys `msg.key.id` (`transport/baileys.ts`). Inserts use `ON CONFLICT DO NOTHING`. The key is per-conversation, not per-user.
  - whatsapp_statuses: UNIQUE(user_id, whatsapp_status_id). documents: UNIQUE(user_id, document_number) and share_token.
- **Dedup hazards for an Android notification ingester:**
  1. **Android notifications do not expose the WhatsApp message key id.** A phone-side message cannot be matched by whatsapp_message_id. You need a fuzzy key such as (canonical JID or contact, normalized body hash, timestamp ± a few seconds, sender_type).
  2. **Notifications also usually lack the JID.** They give a display name, or a phone number for unsaved contacts.
  3. **The current companion route creates duplicates by design.** `services/api/src/routes/companion.ts` invents a pseudo-JID `companion_<name>@c.us` and a random `companion_<ts>_<rand>` message id. That produces separate contacts and conversations from the Baileys ones, and never dedupes.
  4. **Outbound messages sent via the API** (`lib/whatsapp-send.ts`, documents.ts, proactive.ts, conversations.ts media) insert with a temporary `direct-<uuid>` / `direct-media-<uuid>` id. I found no code that rewrites it to the real key.id. When Baileys echoes the fromMe message under its real key.id, the UNIQUE key does not collide, so there is a **likely duplicate**. Worth confirming before relying on whatsapp_message_id for outbound messages.
- whatsapp_timestamp (TIMESTAMPTZ NOT NULL) is the WhatsApp-side time; created_at is the ingest time.

## B.4. Sync suitability

- **No `updated_at` triggers exist anywhere.** updated_at is set by hand in UPDATE statements, so it is only as reliable as each code path.
- **`messages` has no updated_at and no user_id, yet it is mutable:**
  - transcription
  - message_type / body set to 'deleted'
  - deleted_for_user_ids (0121), is_starred / is_pinned / pinned_at (0124), delivery_status (0097)
  - quoted_message_id fix-ups, conversation_id reassignment (lid merge)

  Cursor sync on messages would need a new `updated_at` (+ trigger) or a change log.
- Other tables with neither created_at nor updated_at (by parser): action_bundles (has detected_at/resolved_at), broadcast_recipients, career_job_discovery_runs, conversation_funnel_stages, deal_stage_history, document_events, document_signatures, goal_progress, inventory_forecasts, relationship_health_logs, scraped_jobs, scraper_runs, team_members, reflection_summaries, product_stock_by_location (updated_at only), opportunities (updated_at only).
- **Append-only / log-shaped tables** (good for created_at / id cursor sync):
  - relationship_health_logs, stock_movements, service_capacity_movements, subscription_events, business_events (status mutates), emotional_signals (memory_weight mutated nightly)
  - document_events, deal_stage_history, goal_events, token_usage_logs, analytics_events, admin_audit_log, organization_audit_logs
  - advisor_automation_audit_log, agent_actions, message_reactions (insert + delete)
- **Mutable with updated_at:** users, contacts, conversations, relationships, contact_profiles, deals, documents, products, projects, proactive_queue, career_*, advisor_sessions, advisor_user_profiles, etc.
- **Soft-delete vocabulary is inconsistent.** There is no deleted_at. Instead:
  - contacts.archived_at / is_active / merged_into_id; conversations.is_archived; messages.is_deleted + deleted_for_user_ids
  - status enums (documents archived, products archived/discontinued, proactive auto_resolved / expired, etc.)
  - is_active flags (contact_insights, advisor_memories, agents, kb_documents, business_facts)
- **Hard deletes exist with deep CASCADE:**
  - Contacts are referenced by 57 FKs (39 CASCADE, 16 SET NULL, 2 NO ACTION).
  - Conversations: 19 FKs (10 CASCADE). Messages: 10 FKs (4 CASCADE).
  - Deleting a conversation (e.g. the recent Inbox bulk delete, commit 401bb23; `conversations.ts`) silently removes messages, analyses, suggestions and reactions with no tombstone.
  - Draft documents and unreferenced products hard-delete.
  - **Deletes need an explicit tombstone/outbox table for propagation to devices.**
- **NO ACTION FKs that can block deletes:**
  - messages.quoted_message_id → messages
  - events.source_message_id → messages
  - proactive_queue.event_id → events
  - calendar_events.source_event_id → events
  - calendar_event_attendees.contact_id → contacts
  - advisor_sessions.contact_id → contacts
  - contact_insights.superseded_by, agent_memories.superseded_by (self)
  - payment_requests.reviewed_by → users
  - subscriptions / payment_requests / gift_memberships.plan_id → subscription_plans

  The API already nulls quoted_message_id before deletes (conversations.ts:128).
- Denormalised server-computed caches should be treated as **server-authoritative, read-only on device**: relationships.health_score / emotional_signals_summary / network_value / career_signals, products.stock / available / reserved, conversations.unread_count / last_message_*.

## B.5. Sensitive data (highest first)

1. **Message content.** messages.body / transcription / media_url (Supabase public URLs!), whatsapp_statuses, conversation_internal_notes/notes, relationship_memory, message_analyses (emotions, entities, promises), contact_promises.
2. **Psychological and emotional profiling.**
   - emotional_signals (valence / arousal per message / advisor turn)
   - contact_profiles (personality_summary, emotional_patterns, known_triggers, mood_baseline), contact_insights, contact_life_events (incl. losses)
   - gossip_worthy_events, relationships.emotional_signals_summary
3. **Advisor / companion data about the user.** advisor_messages, advisor_memories, and advisor_user_profiles: spiritual_preferences (religion), current_emotional_state, emotional_baseline, boundaries, gossip_style, motivational_style.
4. **Identity documents.** career_profiles.passport_or_nrc, nationality, phone, location, driving_licence (0081, plain nullable columns), plus career_references (third-party PII).
5. **Secrets and credentials.**
   - user_ai_keys.encrypted_key / api_key_encrypted (BYOK), whatsapp_instances.session_data / qr_code
   - webhooks.secret, api_keys (hash), crm_integrations, social_accounts (tokens), users.password_hash (legacy)
6. **Payments.** payment_requests (payer_phone_number, payment_screenshot_path; 0084), payment_receipts, business_profiles.bank_details, business_facts (category 'bank_details'), documents (invoice amounts, client details incl. manualContact JSON).

Recommendation: on-device, encrypt the Room DB (SQLCipher). Do not sync categories 4 and 5 or emotional/advisor data to the device unless needed. Respect contacts.privacy_settings / privacy_exclusions locally.

## B.6. Recent migrations (0116–0131)

- 0116_temporal_intelligence_upgrade: new `contact_promises`; conversations SLA columns (sla_status, last_incoming_at, sla_due_at); proactive_queue.snoozed_until; events WA-reminder columns.
- 0116_whatsapp_disconnect_alerts: whatsapp_instances.disconnected_at / disconnect_alert_sent_at.
- 0117_data_portability_and_account_deletion: users.scheduled_deletion_at (7-day purge grace). 0117_rich_event_metadata: events and contact_promises gain location / meeting_link / deal_value / tags / action_items / metadata.
- 0118_calendar_enum_and_fallbacks: event_type enum gains meeting / follow_up / reminder. 0118_fix_byok_not_null: api_key_encrypted made nullable. 0119: user_ai_keys.updated_at.
- 0120_message_reactions: `message_reactions` (message_id, user_id, emoji; unique triple) and messages.is_forwarded.
- 0121: contacts.avatar_last_fetched_at, messages.deleted_for_user_ids UUID[] ("delete for me"), indexes on contact_group_members.
- 0122: messages.is_ai_generated.
- 0123_whatsapp_statuses: Status/stories table, 24h expires_at, UNIQUE(user_id, whatsapp_status_id).
- 0124: messages.is_starred / is_pinned / pinned_at; conversations.is_pinned / pinned_at.
- 0125: `conversation_internal_notes` (organization_id without FK, author_id).
- 0126: agents safety / working-hours / tools columns plus `agent_proactive_cadences`.
- 0127: kb_documents.is_active.
- 0128: `user_reviews`, `platform_feedback`.
- 0129: Claude 5.5 cost rates merged into system_config.cost_per_1k_tokens.
- **0130_history_sync_pipeline:**
  - sync_jobs gains source ('manual' default), wa_progress, batches_received, analysis_queued.
  - New `whatsapp_lid_map(user_id, lid_jid PK, pn_jid)` so @lid and phone JIDs resolve to one contact and conversation.
  - Backs `services/whatsapp/src/lib/history-sync-pipeline.ts`.
- **0131_sync_phase_importing:** replaces the sync_phase CHECK with indexing / downloading / importing / analysing / complete / cancelled (fixes the 0130 insert failures).

Taken together, the recent work is WhatsApp-client parity (reactions, stars, pins, statuses, delete-for-me, forwarded, AI flag) plus a reworked history import with LID canonicalisation. **All of it mutates `messages` rows, which still have no updated_at.**

## B.7. Implications for Room + sync design

- Mirror the natural keys locally: contacts(user_id, whatsapp_jid), conversations(user_id, whatsapp_chat_id), messages(conversation_id, whatsapp_message_id), plus a local lid_map.
- Phone-ingested messages need a provisional id and a reconciliation key (JID-or-name + body hash + time window). The server should stop minting companion pseudo-JIDs and instead accept phone-side messages for reconciliation.
- Server additions needed for incremental sync:
  - updated_at + trigger on messages, and ideally a generic trigger for all synced tables
  - a tombstone / change_log table to capture hard deletes and CASCADEs
  - possibly a per-user monotonically increasing change sequence instead of trusting app-set updated_at
- Ownership key on device: user_id (= effective owner user_id when in an org). Add organization_id to the 5 org-scoped tables. A personal/business split needs a new explicit column if workspace isolation is required.

---

# Part C — Intelligence, WhatsApp service, companion app, React Native app

---

## C.1. AI client architecture (`services/intelligence/app/ai/`)

| File | Lines | Role |
|---|---|---|
| `client.py` | 498 | `AIClient` singleton (`get_ai_client()`). Public: `complete_json`, `complete_text`, `extract_image_text`, `embed`. All take `service`/`feature`/`user_id` tags. |
| `claude.py` | 288 | Native Anthropic SDK path (not LiteLLM). Aliases `haiku/sonnet/opus` → `claude-*-5-5`. Converts OpenAI-shaped messages in, returns an OpenAI-shaped adapter (`ClaudeResponse.choices[0].message.content`, `.usage`). JSON mode = appended instruction (no response_format). Refusal → `ClaudeRefusalError`. Server-side refusal fallback beta for Sonnet/Opus only. `CLAUDE_FEATURE_MODELS` env JSON maps feature→model. |
| `model_router.py` | 146 | Redis-backed pool rotation. Pools: `text` = qwen-max → qwen-plus → qwen-turbo → gemini-3.5-flash; `vision`; `ocr` (qwen-vl-ocr); `translation` (qwen-mt-flash). 1M-token budget per model, `force_advance` on hard error. |
| `token_usage.py` | 117 | `log_usage()` fire-and-forget into `token_usage_logs`; cost map from `system_config.cost_per_1k_tokens`, 5-min cache, char/4 fallback estimate. |
| `byok_resolver.py` | 202 | Resolves a user's own API key (`user_ai_keys`); BYOK used first, 15-min cooldown on 429. |
| `providers.py` | 229 | BYOK provider catalog metadata (UI copy, model lists). No logic. |
| `privacy_detector.py` | 117 | Heuristic + LLM suggestion of personal contacts to exclude. |
| `embeddings.py` | 12 | `embed_text()` → np.float32 array via `AIClient.embed`. |
| `encryption.py` | 74 | BYOK key encryption. |
| `prompts.py` | 1236 | All prompt templates (51 constants). |

**Call order in `_call_with_failover`** (`client.py`): BYOK key (if any, not cooled-down) → Claude (if explicit Claude model, per-feature override, or `DEFAULT_AI_MODEL` is Claude and pool=='text') → LiteLLM pool loop with dashscope custom-endpoint rewrite → Gemini fallback after 3 consecutive hard failures. Whole thing wrapped in `asyncio.wait_for` (15 s for `reply_generation`, 90 s default). `complete_json` = temp 0.3, max 2048 tokens; `complete_text` = temp 0.7, max 1024. `extract_image_text` goes straight to the `ocr` pool (no Claude, no failover). `embed()` **returns None unless `OPENAI_API_KEY` is set**.

**[CORRECTION]** `config.py:31` default is `dashscope/qwen-max`; Claude is only primary if the env sets `DEFAULT_AI_MODEL=anthropic/claude-haiku-5-5` (CLAUDE.md says prod does). The CLAUDE.md "required prod keys" list does not include `OPENAI_API_KEY` — if it's truly absent in prod, **every embedding is NULL** (message_analyses, documents, agent_memories, kb_chunks), silently disabling semantic search/matching. Verify on the VM.

### C.1a. Prompt inventory (name → purpose → output → size → on-device suitability)

Size = raw template chars (excl. filled variables). "Small model" = plausible on a 1–4B local model (Qwen2.5-3B / Llama-3.2-3B / Gemma-3-4B / Phi-3.5) with JSON-schema-constrained decoding (GBNF / llama.cpp grammar, MLC JSON mode). "Frontier" = needs a capable remote model.

**Message-level perception (the on-device core)**
| Prompt | Purpose | Output keys | Size | On-device? |
|---|---|---|---|---|
| `UNIFIED_SINGLE_PASS_COGNITION` (L1189) | **The live per-message prompt** (analyser.py). Analysis JSON in `<intelligence>`, optional 3 replies in `<response>` | full MessageAnalysis (§3) + `suggestions[]` | 3.8k + injected context | Too wide for 3B in one shot (20 top-level fields, 10 nested arrays). **Split it**: (a) core small schema, (b) business/career extractors gated by a cheap keyword/classifier pre-check. Replies are a separate small generation. |
| `ANALYSE_MESSAGE` (L1) | Older two-pass version of the same analysis, with long per-field guidance | same as above minus replies | 9.6k | **Imported but unused** in analyser.py. Its per-field rules are the best spec to port to on-device (good few-shot material). 9.6k tokens of instructions is too long for a 3B context budget per message — compress. |
| `CLASSIFY_EMOTION` (L511) | 6-emotion vector for a text | `{emotions:{joy..love}}` | 1.0k | Yes — ideal. Could even be a fine-tuned classifier (no LLM). |
| `GENERATE_REPLIES` (L92) | 3 voice-matched replies | `{suggestions:[{text,tone,reasoning}]}` | 0.6k | Yes for short casual replies (drop `reasoning`). Quality depends on voice profile + contact summary being local. |
| `NARRATE_REPLY` (L614) | Watch-mode narration + 2–3 replies | `{narration, suggested_replies[]}` | 1.4k | Yes. |
| `CLASSIFY_SCOPED_AUTOMATION` (L730) | Is this candidate reply within user-stated scope / high risk | `{in_scope,is_high_risk,reasoning}` | 1.2k | Borderline — safety gate; keep remote or be conservative locally (default to "not in scope"). |
| `CLASSIFY_ADVISOR_TURN` (L529) | Advisor intent (18 values) + optional memory suggestion | `{intent,needs_clarification,memory_suggestion}` | 2.0k | Yes (enum classification). |
| `CLASSIFY_CURIOSITY_ANSWER` (L767) | Does user text answer a pending question; extract value | `{answers_question,extracted_value,confidence}` | 1.2k | Yes. |
| `PARSE_EXCLUSION_INSTRUCTION` (L489) | NL → exclusion rule/contact | `{type,contactId,ruleType,ruleValue}` | 1.3k | Yes (with contact list injected). |
| `ASK_ANYTHING` (L1166) | NL question → `{entityType,filters[],sort}` over fixed schema | as named | 1.7k | Yes — excellent fit for on-device search over a local SQLite DB. |
| `LIVE_SEARCH_CONTEXT` (L317) | Summarize web results answering a contact's factual question | text | 0.3k | Model small OK, but needs web search → server/online. |

**User-level cognition (needs history; could run on-device over a local DB, quality-sensitive)**
| Prompt | Purpose | Output | Size | On-device? |
|---|---|---|---|---|
| `EXTRACT_CONTACT_INSIGHTS` (L117) | ≤12 insights w/ verbatim quotes from a transcript | `{insights:[{key,value,confidence,supporting_text}]}` | 1.9k + transcript | 3–4B can do it on ~30–50 message windows; long transcripts need chunking. |
| `BUILD_CONTACT_PROFILE` (L153) | Personality/communication/buying profile | ~13 fields + `structured_attributes` | 3.3k + transcript | Possible at 4B with chunked map-reduce; better at 7–8B or remote. Speaker-attribution errors are the main risk (prompt warns heavily about it). |
| `BUILD_USER_VOICE_PROFILE` (L230) | User's writing style from outbound msgs | 11 fields | 1.0k | Yes — and arguably *should* be local (privacy). |
| `GENERATE_CONTEXT_SNAPSHOT` (L194) | ≤300-word relationship summary | text | 0.6k | Yes. **Unused in code** (context_snapshots never written). |
| `GENERATE_TEMPORAL_NUDGE` (L210) | Reconnect nudge + draft from cadence stats | `{suggestion_type,title,body,draft_message,priority}` | 0.8k | Yes. |
| `GENERATE_PROACTIVE_SUGGESTION` (L328) | Daily proactive nudge | same shape | 0.8k | Yes. |
| `GENERATE_GOAL_NEXT_STEP` (L347) | Next step for a relationship goal | `{next_step}` | 1.0k | Yes. |
| `ANALYZE_CHAT_TURN` (L566) | Evidence/my-read/alt-read/what-I'd-do over a transcript | 6 keys | 1.5k + transcript | Frontier preferred (nuanced interpretation, policy-heavy). |
| `CONVERSATION_TURN` (L595) | Plain advisor answer over transcript | text | 0.9k | 4B usable for simple Qs; frontier for advice. |
| `RELATIONSHIP_ADVICE_POLICY` (L553) | Static safety policy block | — | 1.1k | Include in any local advisor prompt. |
| `GENERATE_CURIOSITY_QUESTION` (L752) | Ask about a knowledge gap | `{question}` | 0.7k | Yes. |
| `GENERATE_MOTIVATIONAL_NUDGE` (L674), `GENERATE_DEVOTIONAL` (L661), `GENERATE_CAREER_COACH_NUDGE` (L712) + `CAREER_COACH_TONE_POLICY` | Short companion messages from SQL-detected signals | `{message}` | 0.6–1.0k | Yes (generation of 1–3 sentences). Devotional quality (scripture accuracy) is a hallucination risk on small models. |
| `DRAFT_INTRODUCTION_REQUEST` (L703) | Draft intro ask | `{draft}` | 0.5k | Yes. |

**Server-side / frontier**
| Prompt | Purpose | Why server |
|---|---|---|
| `GENERATE_DOCUMENT_DATA` (L368, 2.7k) | Instruction + catalog → line items/sections/terms | Could run at 4B with grammar (structured), but tied to server catalog/pricing/numbering. Medium. |
| `DOCUMENT_AI_SUMMARY`, `DOCUMENT_QUALITY_CHECK`, `DOCUMENT_CHAT`, `DOCUMENT_INSIGHTS` | Business-doc summary/QA/edit/insights | Small-ish; server because docs live there. |
| `MATCH_NEWS_TO_CONTACT`, `GENERATE_WORLD_EVENT_NUDGE`, `GENERATE_INTEREST_NUDGE` | News/interest matching | Needs web search. |
| `SYNTHESIZE_AGENT_PATTERNS` | Nightly agent-memory consolidation | Multi-agent server feature. |
| `GENERATE_RESUME_DATA`, `GENERATE_COVER_LETTER_DATA`, `SCORE_RESUME`, `EXPLAIN_JOB_MATCH`, `SUGGEST_CV_TAILORING`, `EXTRACT_JOB_REQUIREMENTS`, `REWRITE_CV_TEXT`/`REWRITE_OPERATION_INSTRUCTIONS`/`CV_STUDIO_NEVER_INVENT_POLICY`, `SUGGEST_METRIC_PROMPT`, `SUGGEST_SKILL_GROUPING` | Career/CV | Rewrite ops (`REWRITE_CV_TEXT`, `SUGGEST_METRIC_PROMPT`) are small enough for 3–4B; scoring/tailoring better remote. |
| `PLAN_JOB_SEARCHES` (3.7k), `EXTRACT_JOB_LISTING` (2.6k), `SYNTHESIZE_COMPANY_INTELLIGENCE` | Job discovery | Web search + batch volume → server. |

Rule of thumb: every prompt that returns ≤6 flat keys or a single short text is small-model-viable with constrained JSON decoding. The two hard ones for on-device are the 20-field unified analysis (split it) and long-transcript profiling (chunk it).

---

## C.2. Engine / service inventory

Classification: **P** = message-level perception (can run on-device on notification text), **C** = user-level cognition (needs history; on-device over a local DB is feasible), **S** = server-only (web search, multi-user, billing, WA send, scraping, documents/ERP that live server-side).
Trigger: **MW** = per-message `messages.incoming` worker; time = UTC scheduler; **HTTP** = `/internal/...` route called by API; **Q** = BullMQ queue job.

### C.app/services
| File | What | Trigger | LLM? | Writes | Class |
|---|---|---|---|---|---|
| `analyser.py` | Unified single-pass analysis + optional replies; inserts `message_analyses` (+embedding); also an **auto-quote** side effect (keyword "price/quote/how much" from contact → drafts a quotation from the 3 most recent products + `proactive_queue` row, no LLM) | MW | Yes (`single_pass_cognition`), + web search for factual Qs | message_analyses, documents, proactive_queue | **P** (auto-quote is S) |
| `event_extractor.py` | analysis.events_detected → `events` with dedup window | MW | No | events | P |
| `business_facts.py` | fact candidates with confidence/evidence reinforcement | MW | No | business_facts | P→C |
| `opportunities.py` | opportunity candidates w/ shelf-life expiry | MW | No | opportunities | P |
| `connections.py` | person-to-person connections, name-matched to contacts | MW | No | relationship_connections | P (+ local contact list) |
| `contact_products.py` | product mentions matched to catalog (single ILIKE match) | MW | No | contact_products | P + catalog |
| `life_events.py` | life events w/ recent-window dedup | MW | No | contact_life_events | P |
| `action_bundles.py` | order intent/new product/supplier/career mention → one approval bundle w/ `dependsOn`; may auto-execute "safe" bundles ≥0.85 | MW (live only) | No | action_bundles, products, stock_movements, calendar_events | P→S (execution against ERP) |
| `business_events.py` | generic detection log | called by others | No | business_events | — |
| `reality_engine.py` | L1: outbound user msg resolves pending nudges; L2 hourly contradictions; L3 daily expiry sweep | MW / hourly / 19:00 | No | proactive_queue, business_events, action_bundles, gossip_worthy_events, opportunities | C (L1 is P-adjacent) |
| `orchestrator.py` | route to agent vs suggestion | MW | No | orchestrator_decisions | S (agents) |
| `reply_gen.py` | Save single-pass suggestions or run `GENERATE_REPLIES`; auto-send gate via `auto_response.check_eligibility` + scoped grants; notifications | MW | Yes (`reply_generation`), web search | suggested_replies, notifications | P (generation) / S (send) |
| `auto_response.py` | Eligibility (hours, exclusions, keywords, groups) + enqueue send | MW | No | — (enqueues `messages.send`) | S |
| `scoped_automation.py` | Time-boxed grant check per reply | MW / advisor | Yes | advisor_automation_grants/audit_log | S |
| `health.py` | Deterministic relationship health: 6 normalized signals (recency, frequency, sentiment, responsiveness, pipeline velocity, documents), category-weighted (personal vs professional), BASE ± SCALE; trend ±3; also recomputes emotional_signals_summary | MW every 5th msg (20 historical) / HTTP | No | relationships, relationship_health_logs, notifications | **C (pure SQL, easy port)** |
| `network_value.py`, `lead_score.py`, `career_signals.py` | JSONB relationship value / heuristic lead score / professional signals (+ employer category lookup) | MW every 5th | No | relationships, contacts | C |
| `cadence_learner.py` | Learns avg/stddev gap, peak hours/DOW per contact; tier defaults (3/7/14/30/60 days) | Q `temporal.clock_check` (per contact, every 5th msg) | No | relationship_clocks | **C (easy port)** |
| `relationship_memory.py` | Aggregates promises/topics/events (no LLM) | same Q | No | relationship_memory | C |
| `clock_engine.py` | Fires nudges when cadence breached; product replacement checks | temporal scheduler every 15 min | Yes (`GENERATE_TEMPORAL_NUDGE`) | proactive_queue, relationship_clocks | C |
| `profiler.py` | Insights + profile from transcript | Q `analysis.contact_profile` (1st msg, every 10th; 25 historical) | Yes | contact_insights, contact_profiles | C |
| `voice_builder.py` | User voice profile from outbound msgs | Q `analysis.user_profile` (every 20 outbound) | Yes | user_communication_profiles | C |
| `user_memory.py` | Mines suggestion approve/edit/dismiss into preferences | (daily) | No | user_communication_profiles | C |
| `proactive.py` | Daily proactive suggestions | 07:00 | Yes | proactive_queue, notifications | C |
| `interest_matcher.py`, `news_indexer.py` | News→contact interest nudges | world-knowledge every 2 h | Yes + web | proactive_queue | S |
| `interest_companion.py` | User-interest web finds → advisor message | every 6 h | Yes + web | proactive_interest_chats | S |
| `spiritual_companion.py` | Daily devotional | 13:00 | Yes | proactive_interest_chats | C (gen only) |
| `motivational_detector.py` | Stale contacts/promises/stuck deals nudge | 14:00 | Yes (phrasing) | proactive_interest_chats | C |
| `gossip_detector.py` | 5 SQL aggregations (tone shift, ghosting, sudden interest, life event, reciprocity drop) | 12:00 | No | gossip_worthy_events | **C (pure SQL)** |
| `curiosity_engine.py` | Knowledge-gap questions (inline 20%/turn; proactive 25%/user/day) | 16:00 + advisor turns | Yes | advisor_curiosity_prompts, contacts, relationships, contact_insights, advisor_user_profiles | C |
| `advisor_companion.py` (846 lines) | Advisor orchestrator: classify turn, retrieve profile/memories/emotion, prompt assembly, analysis, watch/narration, action requests, boundary risk | HTTP `/internal/advisor/ask`, `/internal/conversations/:id/ask`; MW (watch) | Yes (4 features) | advisor_* tables | C (frontier preferred) |
| `advisor_memory_learner.py` | Nightly tone learning / disliked-advice / weak-memory decay | 15:00 | No | advisor_memories, advisor_user_profiles | C |
| `companion_delivery.py` | Writes initiated messages into advisor session; engagement rate | helper | No | advisor_messages, advisor_sessions | — |
| `business_context_service.py` | Shared business context block + `answer()` | HTTP (studio ask) | Yes | — | S |
| `business_manager.py`, `business_manager_insights.py`, `business_feed_detectors.py`, `business_memory_maintenance.py`, `project_progress.py`, `document_followups.py`, `pricing_benchmarks.py`, `inventory_forecast.py`, `analytics_engine.py` | ERP/business deterministic detectors and nudges | 18:00, 21:00, 22:00, 19:00(sweep), 17:00, 08:00, 09:00, 10:00, — | No | proactive_queue, business_events, project_events, inventory_forecasts, business_facts, analytics_snapshots | S (ERP lives server-side) |
| `document_generator.py`, `document_packs.py`, `document_render_client.py`, `resume_studio.py`, `cv_assistant.py`, `cv_matching.py` | Docs/career (see §9) | HTTP | Mixed | documents, document_events, … | S |
| `job_discovery.py`, `job_scraper.py` (+`scrapers/`), `company_intelligence.py`, `career_coach.py`, `career_networking.py` | Career OS | 05:00 / 04:30,10:30,16:30,22:30 / 20:00 / HTTP | Yes + web/scraping | career_opportunities, scraped_jobs, … | S (career_coach phrasing is C) |
| `agent_engine.py` (743), `agent_memory.py`, `consolidation.py`, `knowledge_retriever.py` | Autonomous agents, KB chunk/embed/OCR, nightly consolidation | Q `agent.handle_message`, KB worker, 03:00 | Yes | agent_*, kb_*, escalations, … | S |
| `credits.py` | Atomic daily credit decrement (`subscriptions`) | MW | No | subscriptions | S |
| `exclusion_parser.py`, `ask_anything.py` | NL parsers | HTTP | Yes | — | P-class prompts, server today |
| `web_search.py` | Tavily/SERP client | — | — | — | S |

### C.app/neural
| File | What | Trigger | LLM | Class |
|---|---|---|---|---|
| `emotion.py` | `record_from_message_analysis` (valence/arousal from analysis emotions, no LLM) → `emotional_signals`; `record_advisor_turn` (CLASSIFY_EMOTION); nightly `reconsolidate()` (memory_weight decay, 30-day baseline); `emotional_congruence()` pure fn | MW / advisor / 04:00 | Only advisor turns | P (message path) + C |
| `prediction.py` | stockout / renewal_due / churn_risk adapters + purchase_likelihood heuristic | HTTP | No | C/S |
| `reflection.py` | Weekly/monthly/quarterly threshold highlights | Mon 11:00, 1st 11:00, quarter 11:00 | No | C (pure SQL; personal parts portable) |
| `knowledge_graph.py` | co-purchasers / inferred_neighbors | called | No | S |
| `policy_enforcer.py` | Check outgoing text vs business rules | called | Yes | S/P |

### C.app/memory
- `conversation_memory.py`: Redis key `memory:conversation:{id}`, TTL 3 days; state `{current_topic, unanswered_questions[≤10], pending_promises[≤10], latest_sentiment, recent_decisions[≤10]}` updated deterministically from MessageAnalysis (question from contact → unanswered; user reply pops oldest; promises appended). **P — trivially portable to on-device (a small table).**
- `retrieval_service.py`: all context fetchers (`get_contact_summary`, `get_recent_messages`, `format_transcript`, `get_user_voice`, `get_relationship_memory`, `get_business_facts`, `get_kb_chunks`, `get_agent_memories`, `get_conversation_state`, `get_relevant_catalog`, `get_co_purchases`, `find_mentioned_catalog_item`, `get_open_opportunities`, `get_project_status`, `get_invoice_aging`, `get_deal_pipeline_summary`, formatters). This is the de facto **context-assembly API**; an on-device port would reimplement the contact/voice/memory/conversation-state ones against SQLite.

### C.HTTP routes (`app/routes/`, all `/internal/*`, called only by services/api)
conversations (`summarize`, `followup`, `ask`, `analyse-history`, `analyse-history-sync`), advisor `ask`, studio `ask`/`auto-extract`, documents (summarize/generate/quality-check/chat/search/insights/packs), career (≈20 endpoints), goals `next-step`, predictions `/{type}`, proactive `/{id}/regenerate`, knowledge (search/chat/chunk edit), relationship-health (recalculate, recalculate-all, privacy-assistant), auto-reply `parse-exclusion`, content generate/recommendations, search `ask`, `/health`.
**Remote consumption by Android**: none of these are internet-facing; Android must go through `services/api` (JWT). The API already proxies most of them (advisor, conversation ask, documents, predictions, search/ask, career).

---

## C.3. Per-message pipeline (`workers/message_worker.py`, queue `messages.incoming`)

Job payload (from whatsapp `message-handler.ts` / api `companion.ts`): `{userId, conversationId, messageId, contactId, senderType, messageType, body, whatsappTimestamp, isHistorical}`; jobId `msg_{messageId}`, 3 attempts.

1. Skip if `message_analyses` row exists (idempotent).
2. Skip if contact in `privacy_exclusions`; skip if `contacts.is_group`.
3. Live only: `try_consume_credit(user,'message')` else skip.
4. Acquire per-conversation Redis lock (FIFO), then `MessageAnalyser.analyse(generate_reply = not historical)`:
   - loads body, sender_type, contact name, relationship_type, user name, last 5 messages;
   - if generating replies: voice profile, contact summary, Redis conversation memory, relationship memory, **web search** if factual-question keywords, KB chunks (vector), business facts, catalog (30 items) + co-purchases;
   - one `complete_text` with `UNIFIED_SINGLE_PASS_COGNITION`; parse `<intelligence>` (strip code fences); pydantic `MessageAnalysis`; `embed_text(body)`; upsert `message_analyses` (`analysis_model` records the *configured* default, not the model actually used);
   - auto-quote side effect (see §2);
   - parse `<response>` suggestions.
   - `EventExtractor.extract_from_analysis` → `events`.
5. Fan-out writers (historical too): business_facts, opportunities, connections, contact_products, life_events, **EmotionEngine.record_from_message_analysis** → `emotional_signals`.
6. Live only:
   - `update_conversation_memory` (Redis);
   - action bundles if order intent (contact only) / new products / suppliers / career opps;
   - if sender=user: Reality Engine L1 resolves pending check_in/follow_up/reconnect nudges;
   - if sender=contact: active **watch** → publish `advisor.reply_received`, `generate_reply_narration` (NARRATE_REPLY), insert advisor_messages, publish `advisor.narration_ready`; then **orchestrator** → agent queue or (credit `ai_reply`) save/generate suggestions (+ auto-send eligibility inside reply_gen).
7. Maintenance counters (in-process dict `_msg_counter`, **resets on restart, not shared across replicas**): every 5th (20 hist) msg → health, network value, lead score, career signals; every 5th/1st → `temporal.clock_check` (cadence + relationship memory); 1st and every 10th (25 hist) → `analysis.contact_profile`; outbound 1st and every 20th (50 hist) → `analysis.user_profile`.

**Bug found**: on LLM failure/timeout `analyser.py` substitutes a hard-coded fallback JSON whose `intent` is `{"category":"general","confidence":0.5}` — but `IntentAnalysis.primary` is required (`models.py`), so `MessageAnalysis(**analysis_dict)` raises ValidationError and the job fails (retried 3x) instead of degrading gracefully. Also `ANALYSE_MESSAGE` is imported but unused.

### C.MessageAnalysis model (`services/intelligence/app/models.py`)
```
sentiment: str (positive|negative|neutral|mixed)
sentiment_score: float 0..1
emotions: {joy,sadness,anger,fear,surprise,love} floats
intent: {primary: question|request|statement|expression|acknowledgment|farewell|greeting, details: str}
topics: [str]
entities: [{text, type: person|date|time|place|organization|product|event}]
importance_score: float 0..1
requires_response: bool
response_urgency: low|medium|high|urgent
promises_detected: [{text, type: commitment|deadline|offer|plan}]
events_detected: [{title, type, date: YYYY-MM-DD|null, is_recurring}]
business_facts_mentioned: [{key, value, category}]
opportunities_mentioned: [{opportunity_type, title, description, estimated_value_cents?, confidence}]
connections_mentioned: [{other_person_name, connection_type, confidence, supporting_text}]
products_mentioned: [{product_name, relation_type, quantity, replacement_interval_days?, confidence}]
order_intent_mentioned: [{product_name, quantity, confidence}]
life_events_mentioned: [{event_type, title, date?}]
new_products_mentioned: [{name, category?, estimated_price?, currency?, is_one_off, confidence, evidence}]
suppliers_mentioned: [{company, confidence, evidence}]
career_opportunities_mentioned: [{title, company_or_org?, category, is_remote?, confidence, evidence}]
```
Suggested on-device split: **Tier A (every message, ~3B, ~300 output tokens)**: sentiment, sentiment_score, emotions, intent, topics, entities, importance_score, requires_response, response_urgency, promises_detected, events_detected (relative-date resolution — supply today's date; consider doing date resolution in code, not the LLM). **Tier B (only when a cheap pre-filter fires — currency/number/product words, names, "hiring", "bought from")**: business facts, opportunities, connections, products, order intent, life events, new products, suppliers, career opps. Persist the same JSON so it can be uploaded and consumed by the server fan-out writers unchanged.

---

## C.4. Embeddings
- Model: `text-embedding-3-small` (`config.py:42`, OpenAI via LiteLLM), **1536-dim**, all pgvector columns `vector(1536)` (migrations 0004 messages/message_analyses, 0005, 0017 kb, 0030 agent_memories, 0043 documents, 0094 scraped_jobs).
- Inputs truncated to 8192 chars (2000 for docs/CV).
- Only produced when `OPENAI_API_KEY` set (else None everywhere).
- Local compatibility: no small on-device model produces vectors in the OpenAI-3-small space; vectors are not interchangeable. Options: keep a separate on-device index (e.g. MiniLM/bge-small/EmbeddingGemma 384–768-d) used only locally; or compute server embeddings on upload. `text-embedding-3-small` supports `dimensions` truncation (Matryoshka) but still needs the OpenAI model. Don't mix.

---

## C.5. Schedulers (`workers/daily_worker.py`, started in `main.py` lifespan; all UTC, all in one process)
| Time | Job |
|---|---|
| every 15 min | temporal clock check (all users) |
| every 1 h | Reality Engine hourly sweep |
| every 2 h | world knowledge refresh |
| every 6 h | interest companion |
| 03:00 | agent memory consolidation |
| 04:00 | emotion reconsolidation |
| 04:30, 10:30, 16:30, 22:30 | job scraper |
| 05:00 | job discovery (+ stale archive) |
| 07:00 | proactive daily suggestions |
| 08:00 | document follow-ups |
| 09:00 | pricing benchmarks |
| 10:00 | inventory forecast |
| 11:00 Mon / 1st of month / 1st of Jan-Apr-Jul-Oct | reflection weekly / monthly / quarterly |
| 12:00 | gossip detection |
| 13:00 | spiritual devotional |
| 14:00 | motivational nudge |
| 15:00 | advisor memory learner |
| 16:00 | curiosity proactive |
| 17:00 | project progress |
| 18:00 | business manager |
| 19:00 | Reality Engine daily sweep |
| 20:00 | career coach |
| 21:00 | business manager insights |
| 22:00 | business feed detectors |
That's 26 scheduler tasks + 30 BullMQ workers in one process. Schedulers are `asyncio.sleep` loops (not cron) — restart-sensitive, no catch-up of a missed run, single-instance assumption.

---

## C.6. services/whatsapp (Baileys)
- Files: `src/transport/baileys.ts` (961), `src/lib/history-sync-pipeline.ts` (771), `src/lib/session-manager.ts` (552), `src/lib/message-handler.ts` (429), `reply-consumer.ts`, `reconciliation-worker.ts`, `supabase-storage.ts`, `routes/sessions.ts`.
- `NormalisedMessage` (`transport/types.ts`): `{waMessageId, jid, fromMe, displayName(pushName), messageType, body, timestampMs, mediaUrl, mediaMimeType, quotedWaMessageId, groupSenderName, groupSenderJid}`. MessageType enum: text, image, audio, video, document, sticker, location, contact_card, reaction, deleted, system.
- Live: `messages.upsert` only when `type === 'notify'`; skips protocol/senderKey/reaction messages; `syncFullHistory: true`. LID↔PN hints captured from `key.senderPn`/`participantPn` and history `phoneNumberToLidMappings`.
- **JID handling**: `MessageHandler.canonicalJid` maps `@lid` → phone JID via `whatsapp_lid_map` (5-min cache). Skips `@newsletter`, broadcasts; `status@broadcast` → `whatsapp_statuses`. Contact keyed by `(user_id, whatsapp_jid)`; `phone_number` only for `@s.whatsapp.net` JIDs; `is_group` from `@g.us`. Conversation keyed `(user_id, whatsapp_chat_id=jid)`. Message unique `(conversation_id, whatsapp_message_id)`, `ON CONFLICT DO NOTHING` (that's the only dedup key).
- History sync: `messaging-history.set` batches → pipeline serialises per user under one `sync_jobs` row, set-based inserts (500/chunk), names contacts by rank (saved name > business > push), settles 90 s (20 s at 100%), then queues AI analysis for at most 50 1:1 chats active in last 30 days, last 30 messages each, concurrency 5. Progress on `history:progress:{userId}`.
- Media: live media downloaded and uploaded to Supabase `chat-media`; **[CORRECTION]** CLAUDE.md says it falls back to local disk `wa_media` — current code (`baileys.ts` ~L811–826) logs a warning and sets `mediaUrl = null` (no local write). Historical media is never downloaded. No audio transcription anywhere.
- Reconciliation worker can `fetchRecentMessages(jid)` for gap healing.

### C.Dedup with Android notifications (design notes)
- Server message identity is `whatsapp_message_id` (WA key id) — **notifications don't expose it**. Notifications expose: package, `sbn.key`/tag/id, `postTime`, `EXTRA_TITLE`, `EXTRA_TEXT`, `EXTRA_CONVERSATION_TITLE`, `EXTRA_IS_GROUP_CONVERSATION`, `EXTRA_MESSAGES` (MessagingStyle bundle with per-message `text`, `time`, `sender`/`sender_person`), and `notification.shortcutId` / `getLocusId()` — on recent WhatsApp builds the shortcut id is commonly the chat JID (e.g. `2609…@s.whatsapp.net` / `…@g.us`) — **verify on device**; if true it's the join key to `conversations.whatsapp_chat_id`.
- Proposed key when both sources exist: `(chat_jid, sender, normalized_body_hash, timestamp ±N s)`; mark notification-origin rows `source='notification'` with a synthetic id and reconcile/merge when the Baileys row with the real id arrives. Watch for: WhatsApp re-posts the same notification with accumulated `EXTRA_MESSAGES` (each update repeats earlier messages), "N new messages" summaries, edited/deleted messages, media placeholders ("📷 Photo"), truncated long text, and @lid vs phone JIDs.
- The current API endpoint (`services/api/src/routes/companion.ts`) does **none** of this: it creates a pseudo-JID contact `companion_{slugified senderName}@c.us` (so a notification message never joins the real Baileys contact/conversation; same-name contacts collide; group messages land in a contact named after the group title), uses a random `whatsapp_message_id` (`companion_{ts}_{rand}`) → no idempotency, always `sender_type='contact'`, `message_type='text'`, and `unread_count+1`. It does enqueue `messages.incoming` so the full AI pipeline runs (without `isHistorical`).

---

## C.7. apps/companion (Kotlin) — read in full (555 lines incl. XML)
- Files: `app/build.gradle.kts`, `gradle/libs.versions.toml`, `AndroidManifest.xml`, `MainActivity.kt` (74), `ZuriNotificationService.kt` (88), `ApiClient.kt` (63), `TokenManager.kt` (35), `BootReceiver.kt` (16), layout/values/xml.
- SDK: compileSdk 35, targetSdk 35, minSdk 26, Java/JVM 17, AGP 8.5.2, Kotlin 2.0.21. Deps: core-ktx, appcompat, material, coroutines 1.9, OkHttp 4.12, Gson, security-crypto 1.1.0-alpha06 (EncryptedSharedPreferences, now deprecated upstream), lifecycle, activity. Views/XML, no Compose, no DI, no Room, no WorkManager, no tests.
- Behaviour: `NotificationListenerService` filters `com.whatsapp` and `com.whatsapp.w4b`; reads only `EXTRA_TITLE` as sender and `EXTRA_TEXT` as message; skips group summaries and text <2 chars; fires a coroutine POST to `{apiUrl}/api/companion/message` with `{senderName, message, timestamp: sbn.postTime, source}` and `Authorization: Bearer <token>`.
- Auth: user manually pastes API URL and a Zuri JWT into the settings screen (JWT is 30-day, `services/api/src/routes/auth.ts`) — no login, no refresh; stored in EncryptedSharedPreferences.
- Problems:
  1. **Won't build as-is**: manifest references `@mipmap/ic_launcher`/`ic_launcher_round` but there is no `mipmap` resource dir; no Gradle wrapper (`gradlew`, `gradle-wrapper.properties`) committed.
  2. **Crash risk on Android 14+ (targetSdk 35)**: `startForeground()` called from `onCreate` of the listener service without a `foregroundServiceType` in the manifest or a `FOREGROUND_SERVICE_*` type permission → `MissingForegroundServiceTypeException`. A NotificationListenerService is bound by the system and doesn't need to be a foreground service at all.
  3. Parsing is naive: ignores `EXTRA_MESSAGES`/MessagingStyle, so it relays the *latest* line only, re-relays on every notification update (duplicates), relays "N messages from M chats" and "Checking for new messages"/call/missed-call notifications, can't tell group vs 1:1 (title is group name or "Group: Sender"), no `fromMe`, no chat id/shortcut id, no media typing.
  4. No offline queue/retry/backoff — a failed POST is lost; no batching; no dedup on device.
  5. `BootReceiver` is a no-op; `POST_NOTIFICATIONS` declared but never requested at runtime (needed on 13+ for the ongoing notification).
  6. Privacy: sends every WhatsApp notification text to the server with no exclusion list.
- Reusable: essentially only the skeleton (package filter, EncryptedSharedPreferences token storage idea, OkHttp client). Worth rewriting rather than extending; ~150 lines of real logic.

---

## C.8. apps/mobile (React Native / Expo)
- Expo SDK 51, RN 0.74.5, React 18.2, react-navigation 6, expo-secure-store, socket.io-client. Single scaffold commit (`90e713c feat(phase-8): React Native mobile app scaffold`), never touched since. Excluded from root workspaces.
- `src/`: 944 lines total — `LoginScreen`, `InboxScreen`, `ConversationScreen`, `RelationshipsScreen`, `ProactiveScreen`, `navigation/index.tsx`, `lib/api.ts`, `lib/socket.ts`, `lib/storage.ts`, `hooks/useAuth.ts`.
- Auth uses email/password `POST /api/auth/login` (exists in API) while the product uses Clerk SSO; some called endpoints don't exist in the API (e.g. `GET /api/messages/:id/suggestions`); `assets/` dir referenced by `app.json` (icon/splash) doesn't exist; types diverge from web.
- Verdict: not worth keeping as a foundation — trivial amount of code, stale SDK, wrong auth model, no notification access (Expo can't do NotificationListenerService without a native module anyway). If the Android app needs a notification listener + on-device LLM (llama.cpp / MediaPipe LLM Inference / MLC), a native Kotlin (Compose) app is the more natural base; at most reuse the screen list/API shapes as a checklist.

`apps/worker`: empty directory.

---

## C.9. Document generation (Python)
- `document_generator.py`:
  - **AI**: `generate_document_data()` → `GENERATE_DOCUMENT_DATA` returns `{items:[{productId,description,quantity,unitPriceCents,discountPct,taxPct}], sections:[{heading,body}], notes, terms, validUntil, dueDate, reasoning, insights:[{key,value,confidence}]}` given an instruction + product catalog + business defaults + pricing benchmark. `summarize_document()` (`DOCUMENT_AI_SUMMARY`, plain text) + embedding; `chat_about_document()` (`DOCUMENT_CHAT`, returns edited items/sections/notes/terms + `reply`); `compute_document_insights()` (`DOCUMENT_INSIGHTS`); quality check via route (`DOCUMENT_QUALITY_CHECK` → `{score,issues,recommendation}`).
  - **Deterministic**: `compute_totals()` (line totals/discount/tax/total in cents), `assign_document_number()` (per-type sequence in business_profiles), `create_document_row()`, `format_money`, `summarize_content`, `search_documents()` (vector), `send_document_whatsapp()`; insights written to `contact_insights` from the AI `insights` array. Prices for catalog-matched items must come from catalog (prompt rule, not code-enforced — worth noting).
  - Stored `documents.structured_data` = `{items (with computed totals), sections, notes, terms, validUntil, dueDate}`; PDF rendered by Node (`@react-pdf`), Python only calls `/api/documents/internal/:id/render` via `document_render_client.py`.
- `document_packs.py`: pack definitions are code constants; new-customer/kickoff packs call `generate_document_data` per doc type then create/render + a templated (non-AI) follow-up draft; renewal pack is a deterministic clone of the last accepted/paid invoice.
- `resume_studio.py`: AI `GENERATE_RESUME_DATA` → `{headline, summary, experience[{title,company,location,startDate,endDate,current,bullets}], education[], skills[], certifications[], languages[]}`; `GENERATE_COVER_LETTER_DATA` → `{recipientName, companyName, body, signOff}`; `SCORE_RESUME` → five 0–100 scores + overall + `suggestions[{issue,fix,example}]` (clamped in code). Deterministic: pdfplumber text extraction, storage path, document row insert, cosine-similarity matching (resume↔opportunities, capped 20). CV Studio's newer flow is rewrite-only (`cv_assistant.py`) and assembles CV text in Node.
- On-device relevance: low. Only the rewrite-style prompts (`REWRITE_CV_TEXT`, `SUGGEST_METRIC_PROMPT`) and maybe `DOCUMENT_AI_SUMMARY` are small-model-friendly; generation needs server catalog/numbering/render.

---

## C.10. Key takeaways for an Android app
1. **Remote consumption** is straightforward via `services/api` with a Zuri JWT (advisor, conversation ask, proactive queue, suggestions approve, documents, predictions, search/ask). The intelligence service itself is internal-only.
2. **Ingest path** for notification-captured messages must be rebuilt: the existing `/api/companion/message` creates pseudo-contacts and has no idempotency; it should accept a chat JID (from shortcut id), sender, isGroup, fromMe, per-message time from `EXTRA_MESSAGES`, a client-generated idempotency key, and reconcile with Baileys rows.
3. **On-device perception** = port `MessageAnalysis` (split into Tier A/Tier B schemas), `conversation_memory` update rules, emotion valence/arousal derivation (`neural/emotion.py` `record_from_message_analysis` math), event extraction, and reply generation using a locally cached voice profile + contact summary. Everything downstream (fan-out writers) can stay server-side by uploading the analysis JSON.
4. **On-device cognition** that is pure SQL/heuristic and easy to port to SQLite: `health.py`, `cadence_learner.py`, `relationship_memory.py`, `gossip_detector.py`, `reflection.py` (personal highlights), `lead_score.py`, `advisor_memory_learner.py`, `curiosity_engine.py` gap detection, Reality Engine L1. LLM-backed cognition needing chunking or a bigger model: `profiler.py`, advisor analysis.
5. **Server-only**: web search/news/interest/job discovery/scraping, agents/KB/consolidation, auto-send/WhatsApp send, credits/billing, ERP/business/document engines, multi-user schedulers.
6. Embeddings: 1536-d OpenAI; on-device would need its own index, and prod may not be producing embeddings at all (check `OPENAI_API_KEY`).
