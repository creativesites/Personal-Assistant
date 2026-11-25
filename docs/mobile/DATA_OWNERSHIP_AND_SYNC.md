# Zuri Android — Data Ownership, Cloud Connection and Sync

> Part of the Zuri Android initial engagement, 2026-11-24. **Status: proposed.**
> - Everything marked **(G-x)** depends on a backend RFC that is not yet approved (`IMPLEMENTATION_PLAN.md` §4).
> - Everything else works against the backend as it exists today.
> - Grounded in `BACKEND_API_MAP.md` §A.3 (sync readiness) and §B.4 (schema sync suitability).

## 1. Principles

1. **The phone is useful forever without the cloud.** Connecting adds data and capabilities; disconnecting removes cloud access, not local data.
2. **Six separate permissions**, each with its own explanation, toggle and revocation (brief §5):

   | # | Permission | Grants | Default |
   |---|---|---|---|
   | P1 | Connect Zuri account | Sign in; read cloud data on demand (read-through) | Off |
   | P2 | Import cloud history | One-time, category-selected copy of cloud records into the phone | Off (asked after P1) |
   | P3 | Ongoing sync | Incremental pull, and push of *cloud-bound* edits | Off (asked after P2) |
   | P4 | Upload local data | Push device-originated data (captured messages, local memories, local documents) to the cloud, per category and source | Off, per category |
   | P5 | Cloud backup | Encrypted backup of local-only data to the Zuri cloud (future; needs a server RFC) | Off; not in v1 |
   | P6 | Remote AI processing | Send content to cloud AI, per purpose and workspace (PrivacyGate) | Off, per purpose |

   P1 never implies P4 or P6. A connected user can stay on local models only.
3. **Server authority where the server computes.** Cached aggregates are read-only on the device: health score, network value, stock levels, unread counts, subscription state.
4. **No silent destruction.** Deletes propagate only for authorised categories. Financial and document conflicts always go to the user.

## 2. Data ownership matrix

**Owner** is the system of record. **Direction** shows what moves with P3/P4 enabled.

| Entity (device) | Server table(s) | Owner | Direction | Conflict policy | Notes |
|---|---|---|---|---|---|
| Workspace | — (G9 proposes) | Device | — (metadata only until G9) | n/a | D-04 |
| Person (identity) | `contacts` (identity part) | Shared | ⇅ | Field-level last-writer-wins (LWW) on name/notes; identifiers merged as a union | `whatsapp_jid` unique key on the server |
| Relationship (per workspace) | `contacts` CRM fields + `relationships` | Shared | ⇅ (cloud-bound workspaces) | Field-level LWW; `health_score`, `trend`, `network_value` server-authoritative | Server caches read-only |
| Device contact link | — | Device | never | — | Never uploaded |
| Conversation (cloud WhatsApp) | `conversations` | Cloud | ⇣ | Server wins; local pin/mute is a device preference | |
| Message (cloud WhatsApp) | `messages` | Cloud | ⇣ (G3 for deltas: messages lack `updated_at`) | Server wins | Import by paging (G3) |
| Conversation / message (phone-captured) | `conversations`/`messages` via G5 | Device | ⇡ only with P4 per source | Reconciliation (§6) | Provisional until matched |
| Message analysis (server) | `message_analyses` | Cloud | ⇣ | Server wins | Not recomputed locally |
| Memory item (device-derived) | `contact_insights` / `business_facts` / `advisor_memories` (by kind) | Device | ⇡ only with P4 "memories" | Device wins for its own items; server items imported read-only with provenance `CLOUD` | Keeps origin labels |
| Commitment | `contact_promises` | Shared | ⇅ | Status: furthest-progressed state wins (fulfilled > open); text LWW | |
| Task | `contact_tasks`, `project_tasks` | Shared | ⇅ (`project_tasks` needs `updated_at`, G3) | Field LWW; completion is sticky | |
| Event / calendar entry | `events`, `calendar_events` | Shared | ⇅ | Field LWW | Device-calendar mirror is device-only |
| Goal (+links, events) | `goal_profiles`, `goal_*` | Shared | ⇅ | Field LWW; events append-only | |
| Recommendation | `proactive_queue` | Both (separate) | ⇣ cloud items | Status from server; local items stay local | Local and cloud recommendations shown together, labelled |
| Deal / pipeline | `deals`, `deal_stage_history` | Cloud for cloud-bound, device for local-only | ⇅ | Stage moves are an append-only history; current stage = latest event by server time | |
| Project, milestone, time entry | `projects`, `project_*` | as above | ⇅ | Field LWW; time entries append-only | Running timer unique per user (server 409) |
| Product / service | `products`, `service_*` | as above | ⇅ | Field LWW; price changes create a history entry | |
| Stock levels / movements | `products.stock`, `stock_movements` | **Cloud** (cloud-bound) | ⇣ levels; ⇡ movements via outbox (G4) | Ledger: movements append-only; levels server-computed | Never edit stock levels directly |
| Supplier, PO, sales order | `suppliers`, `documents(purchase_order)`, `sales_orders` | Cloud | ⇅ via API | Server validates | |
| Brand profile | `business_profiles` | Shared | ⇅ | Field LWW; numbering JSON server-authoritative (cloud-bound) | |
| Document (cloud-bound) | `documents`, `document_events` | Cloud | ⇅ | **Never auto-merge** financial fields; conflict → user (§7) | Numbering D-10 |
| Document (local-only workspace) | — | Device | ⇡ only with P4 "documents" | Device wins | Device numbering |
| Rendered PDF/DOCX | `documents.storage_path` | Derived | regenerate, don't sync bytes | n/a | Server renders its own |
| Knowledge note/doc | `kb_documents` / `kb_chunks` | Shared (by origin) | ⇅ with P4 | LWW on notes | Embeddings never uploaded; the server embeds its own |
| Embeddings | pgvector columns | Each side its own | never | n/a | Incompatible spaces (F7) |
| Advisor sessions | `advisor_sessions/messages` | Cloud (cloud advisor) / Device (local Ask) | ⇣ cloud; local Ask uploaded only with P4 | n/a | |
| Voice profile | `user_communication_profiles` | Device | ⇣ import once; ⇡ only with P4 | Device wins | |
| Emotional signals | `emotional_signals` | Server (cloud) / Device (local) | ⇣ summary only | Server-authoritative summary | Sensitive: not imported by default |
| Career profile & CV entries | `career_*` | Cloud | ⇅ | Field LWW; CV versions append-only | |
| Subscription, plans, credits | `subscriptions`, … | Cloud | ⇣ | Server | Read-only |
| Notifications (cloud) | `notifications` | Cloud | ⇣ | Server (read state ⇡) | `notifications` lacks `updated_at` (G3) |
| Consents, PrivacyGate ledger, model installs, app lock | — | Device | never | n/a | |
| Secrets (BYOK keys, tokens) | `user_ai_keys` (cloud BYOK) | Each side its own | never cross | n/a | |

**Not imported by default** (sensitive, opt-in per category on the Import screen):
- emotional signals and contact psychological profiles
- advisor memories and companion preferences (religion, emotional state)
- career identity documents (`passport_or_nrc`)
- payment records

## 3. Account connection (P1) (G1)

```
Settings → Cloud → Connect Zuri account
  1. Explainer sheet: what connecting does / doesn't do (no upload, no remote AI)
  2. Clerk Android SDK sign-in (email OTP, Google via Credential Manager, passkeys)
  3. App obtains Clerk session token → POST /api/auth/clerk-exchange (G1)
     ← { token (Zuri JWT), user{ id, mode, planFamily, isAdmin, organization } }
  4. Store Zuri JWT (Tink AEAD, Keystore-wrapped); store account_binding
  5. Show account summary: plan, organization, cloud WhatsApp status, record counts
     (counts via existing list endpoints / GET /api/users/me/stats)
  6. Offer next step: "Bring your Zuri history to this phone?" (P2) — skippable
```

- **Token refresh:** on a 401, re-exchange with a fresh Clerk token. If the Clerk session has expired, show re-auth UI; local data stays usable.
- **Revocation (G1):** a `jti`/token version lets the user sign out this device remotely (from the web or another device).
- **Organizations:** a member's data is the owner's scope on the server (`org-scope.ts`). The device shows the organization name and the member's role, and respects viewer read-only (403 from `requireWritePermission`).

## 4. Initial historical import (P2)

### 4.1 Workflow

1. **Discover:** fetch category counts and date ranges, from existing endpoints where possible:
   - `GET /api/users/me/stats`
   - list endpoints
   - G3 adds `GET /api/sync/manifest` for exact counts and sizes
2. **Explain and select:** categories with counts, an estimated size and a sensitivity badge. The user picks categories and a time window for messages ("last 90 days" default). A sample preview shows the first 5 items per category where practical.
3. **Map to workspaces** (D-04): rules preview ("312 contacts marked customer → Business: Mwila Agro; 1,041 others → Personal"), with a review list for ambiguous items. Mapping is editable later.
4. **Plan:** the import planner orders categories by dependency: people → conversations → messages → memories → goals/calendar → business entities → documents.
5. **Download:**
   - Batches with cursors via WorkManager. Constraints: network, plus unmetered if the user chose Wi-Fi only.
   - `import_checkpoint` per category stores the cursor and the last id.
   - Resumable after kill, reboot or network loss.
6. **Write:**
   - Upsert by `remote_id`.
   - Identity resolution links cloud contacts to existing local persons by `whatsapp_jid` ↔ phone ↔ device contact.
   - Collisions go to a "Possible same person" review.
7. **Provenance:** every imported row has `origin = IMPORT`, `remote_id`, `imported_at`, and the source endpoint version.
8. **Finish:** a summary (imported, skipped, needs review) and an offer of ongoing sync (P3).

### 4.2 What works today vs needs G3

| Category | Endpoint today | Limitation | With G3 |
|---|---|---|---|
| Contacts | `GET /api/contacts` | Hard cap 500 | Paged cursor |
| Conversations | `GET /api/conversations?limit&offset` | Offset paging is unstable while new messages arrive | Cursor by `(updated_at,id)` |
| Messages | `GET /api/conversations/:id/messages` | **Last 150 only; GET marks read** (side effect) | `?before=` paging, side-effect free |
| Documents | `GET /api/documents` | Latest 100 leaves | Paged + versions |
| Calendar | `GET /api/calendar/events` | 500 cap, no range | `?from&to` |
| Goals, projects, deals, products | list endpoints | Mostly uncapped | Cursor + since |
| Notifications | `GET /api/notifications` | 100 cap | Cursor |

**Until G3 lands**, M8 ships a **"recent snapshot" import**: contacts ≤ 500, the last 150 messages per conversation, the latest 100 documents. It is clearly labelled as partial. The message-import GET side effect (marking read) is disclosed and requires G3's side-effect-free variant before it is enabled by default.

## 5. Ongoing sync (P3) (G3, G4)

### 5.1 Proposed server surface (RFC)

```
GET  /api/sync/changes?cursor=<opaque>&entities=contacts,relationships,conversations,messages,
                                         documents,deals,projects,tasks,goals,calendar,…&limit=500
  → { changes: [ { entity, id, op: "upsert"|"delete", version, updatedAt, data } ],
      nextCursor, hasMore }
POST /api/sync/mutations           (batch; each mutation has idempotencyKey + baseVersion)
  → { results: [ { idempotencyKey, status: "applied"|"conflict"|"rejected", entity, id,
                   version, serverData? , error? } ] }
```

Backed by:
1. `BEFORE UPDATE` triggers maintaining `updated_at` plus a per-user monotonic `change_seq` (bigint from a sequence) on synced tables. **This adds `updated_at` and `user_id` (denormalised) to `messages`.**
2. `sync_tombstones(user_id, entity, entity_id, deleted_at, change_seq)`, written by `AFTER DELETE` triggers. This covers cascades: child-table triggers fire per row.
3. An `idempotency_keys(user_id, key, request_hash, response, created_at)` table honoured by `POST /api/sync/mutations` *and* by direct creates via an `Idempotency-Key` header. It covers message send and document create first.

The cursor is `change_seq`, not `updated_at`, so app-set timestamps can't cause missed changes.

### 5.2 Client

- **Pull:**
  - Triggered by a periodic worker (15 min), an FCM data message (G7), app foreground, or a connectivity change.
  - Applies changes in `change_seq` order in transactions of ≤ 500.
  - Tombstones delete locally, or mark `deleted_at` for categories the user keeps ("keep my local copy" option for messages).
- **Push:**
  - The outbox drains in FIFO order per entity, respecting dependencies (a person before its relationship).
  - Each item carries an `idempotencyKey` (UUIDv7) and a `baseVersion`.
  - Retries use exponential backoff and are safe because of idempotency.
- **Status UI:**
  - per category: last pull, last push, pending count, errors
  - a global pause/resume
  - "Sync now"

### 5.3 Before G3/G4 exist

Ongoing sync is **not offered**. Cloud data is read-through and cached, and writes go directly to existing endpoints **only for operations that are naturally idempotent or user-confirmed**:
- PATCH of fields
- status changes
- approve/dismiss

Message send and document create are **online-only, one-shot, with a visible "sending…" state and no automatic retry** until G4 exists.

## 6. Phone-captured message reconciliation (P4) (G5)

**Problem.** The phone sees WhatsApp messages via notifications, without the WhatsApp message id. The cloud may see the same messages through Baileys with the real id (F3).

### 6.1 Device side

1. Each captured message has a `fingerprint` (ARCHITECTURE §5.3) and a `chat_key`. The `chat_key` is the JID if the M0 spike confirms `shortcutId` = JID; otherwise it is normalised title + isGroup.
2. When cloud messages are imported or synced, the reconciler matches device-captured rows to cloud rows by:
   1. chat match (JID, or person ↔ contact link)
   2. sender match
   3. normalised text equality (or ≥ 0.95 similarity for edited/truncated text)
   4. `|t_device − t_cloud| ≤ 120 s`
3. **Matches are merged:**
   - the cloud row becomes canonical (`server_message_id` set)
   - device-derived memories are re-pointed to the canonical message
   - the device row is tombstoned locally
4. **Ambiguous matches** (several candidates) go to a "Review possible duplicates" queue. Never auto-merge them.

### 6.2 Server side (G5)

A new endpoint replaces `/api/companion/message` for Zuri Android:

```
POST /api/device/messages:batch
  { deviceId, items: [ { clientId, source: "whatsapp"|"whatsapp_business"|…, chatKey,
                         chatKeyKind: "jid"|"title", isGroup, senderKey, senderName,
                         fromMe, text, placeholderKind?, sentAt, fingerprint } ] }
  → { results: [ { clientId, status: "matched"|"created"|"skipped", messageId?, conversationId? } ] }
```

- Idempotent on `(user, clientId)`.
- Matches existing Baileys messages by the same fingerprint rules.
- Creates `source = 'device'` rows otherwise, never pseudo-JIDs.
- Publishes `conversation:upsert`.
- Optionally queues server analysis. This is off when the device already analysed the message, and the device may upload its Tier A/B JSON instead.

## 7. Conflict resolution

| Class | Entities | Policy |
|---|---|---|
| Server-authoritative caches | health score, network value, stock levels, unread counts, subscription, credits | Server always wins; local edits impossible |
| Append-only logs | stage history, stock/capacity movements, goal/document events, time entries, health logs | Union by id; no conflicts |
| Simple fields | names, notes, tags, contact CRM fields, task text, goal text | Field-level LWW using server `version`; the losing value is kept in `conflict` history for 30 days (undo) |
| Sticky state | task completion, commitment fulfilment, archived flags | The most-progressed state wins (e.g. done beats open) unless the user explicitly reopens |
| Financial documents | document lines, totals, currency, status, numbering | **No automatic merge.** Mutation rejected with `conflict` → the device shows a side-by-side resolver (keep mine as a new version / take theirs / merge lines manually); never silently overwritten |
| Deletes vs edits | any | A delete on one side plus an edit on the other produces a user prompt ("Restore edited item?"); the default keeps the edit for documents and the delete for messages |
| Identity merges | person/contact merges (`merged_into_id`) | Follow server merges; local-only merges are pushed as merge mutations when supported, else kept local |

## 8. Deletion propagation

- **Cloud → device:** tombstones (G3) delete local copies of cloud-origin records. For messages and documents, the user may choose "keep local copy" per category at Import/Sync setup.
- **Device → cloud:** deletes of cloud-bound records push as delete mutations, only for categories where P3 is on. Phone-captured data deleted locally is deleted remotely only if it was uploaded (P4).
- **Account deletion** (`/api/privacy/delete-account-request`, 7-day grace) is a separate, explicit flow. It does not wipe the phone unless chosen.
- **Hard deletes on the server today leave no trace.** Without G3, the device can only notice deletions by full re-listing. M7/M8 therefore show "may be out of date" timestamps on cached cloud data.

## 9. Attachments and media

- **Cloud WhatsApp media:** public Supabase URLs (`messages.media_url`). Downloaded on demand and cached encrypted with an LRU size cap. Note: these URLs are public. This is a server-side privacy issue, recorded in SECURITY_AND_PRIVACY §8.
- **Document PDFs:** never synced as bytes. Re-rendered on the device from structured data and the same templates. Server PDFs are fetched via `GET /api/documents/:id/pdf` with the Bearer header (never `?token=`).
- **Phone-captured media:** placeholders only (notifications don't carry media).

## 10. Pause, disconnect, device change

- **Pause sync:** stops pull and push. The outbox keeps accumulating and the cache stays readable.
- **Disconnect account:**
  1. A confirmation sheet with three choices:
     - keep all data on this phone (default)
     - keep only device-originated data
     - remove all cloud-origin data
  2. Revoke the token (G1 logout).
  3. Clear the account binding.
  4. Pending outbox items are listed for export or discard.
- **New phone:**
  - With an account: reconnect and import.
  - Without an account: an encrypted export file (`.zuribackup`, password-derived key via Argon2id), user-initiated, from Privacy Center.
  - Android Auto Backup is disabled for sensitive data (SECURITY_AND_PRIVACY §3.10).

## 11. Sync observability (user-facing)

The Sync screen shows:
- connection state and last success
- per-category counts (local / cloud / pending / conflicts)
- the conflict queue
- recent sync history (time, pulled, pushed, errors)
- "What has been uploaded" per category, with a delete-from-cloud action where the API allows

The "What leaves my phone" ledger (PrivacyGate) is separate: it covers AI egress, not data sync.
