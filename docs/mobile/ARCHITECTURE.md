# Zuri Android — Architecture

> Part of the Zuri Android initial engagement (deliverable 2 of 3), 2026-11-24. **Status: proposed, awaiting product-owner approval.** Grounded in the audit (`AUDIT.md` and companions). Decisions are referenced as D-xx (`DECISIONS.md`), backend dependencies as G-x (`BACKEND_API_MAP.md` summary).
>
> Companion documents: `DATA_OWNERSHIP_AND_SYNC.md` (auth, import, sync, conflicts, ownership), `SECURITY_AND_PRIVACY.md` (threat model, controls), `SCREEN_MAP.md` (navigation, screens), `IMPLEMENTATION_PLAN.md` (milestones).

## Contents
1. Product architecture
2. Feature and navigation structure
3. Technology architecture and module graph
4. Database architecture
5. Notification ingestion
6. Local AI architecture
7. MeetingMind reuse
8. Context engine and the on-device Neural Layer
9. Cloud integration (summary)
10. Document Engine
11. Background processing
12. Testing strategy
13. Build and release
14. Migration and compatibility with the web platform

---

## 1. Product architecture

Zuri Android is a **local-first intelligence client** with an optional cloud binding. It follows the brief's pipeline (OBSERVE → UNDERSTAND → REMEMBER → RELATE → REASON → PREDICT → RECOMMEND → ACT → LEARN), mapped onto concrete components:

```
 OBSERVE      NotificationListener → Source adapters → Raw capture (encrypted)
              Device contacts / calendar (consented) · Share-sheet imports · Cloud import
 UNDERSTAND   Perception pipeline: normaliser → identity resolution → rule pre-filter
              → local LLM extraction (Tier A core / Tier B gated) → validation
 REMEMBER     Memory store: facts, commitments, tasks, events, preferences, insights
              (each with provenance + confidence + workspace) · Embedding index
 RELATE       People graph: Person (global) ↔ Relationship (per workspace) ↔ Conversations
              Health · cadence · relationship memory (deterministic, ported from server)
 REASON       Ask Zuri (scoped RAG) · Business queries (NL → structured query) · Advisor
 PREDICT      Cadence breaches · due commitments · follow-up windows · (cloud predictions)
 RECOMMEND    Daily Brief · recommendations queue · reply drafts · document suggestions
 ACT          Tap-to-send reply (RemoteInput) · calendar intent · document generate/share
              · cloud actions via API (outbox, idempotent)
 LEARN        Corrections & confirmations feed back: confidence tuning, voice profile,
              dismissed-suggestion suppression (local; synced only if allowed)
```

**Three operating states** (each fully supported, never a degraded "error" mode):

| State | What works |
|---|---|
| **Local only** (no account) | Everything in OBSERVE→LEARN over device data; local documents; local business workspaces |
| **Connected, online** | Plus cloud records (imported or read-through), cloud-only modules (ERP execution, BI, Career, agents), cloud WhatsApp send, server AI (with consent) |
| **Connected, offline** | Local everything, plus cached cloud data read-only and an outbox of queued writes (once G4 exists) |

**Key invariants**

- **I-1:** No data leaves the device without passing `PrivacyGate` or the sync engine's consent checks (D-13, D-16).
- **I-2:** Every derived item has provenance (the source record ids, extractor, model id and version) and confidence (D-20).
- **I-3:** Every domain row has a `workspace_id`, and reads are scope-filtered at the repository layer (D-04).
- **I-4:** Money, dates, numbering and scores are computed by code (D-20).
- **I-5:** The phone never sends a message without a user tap (D-11).

---

## 2. Feature and navigation structure

### 2.1 Information architecture

Primary navigation is a **Material 3 navigation bar with five destinations**. Business destinations appear only when the active context includes a business workspace.

| Tab | Personal context | Business context |
|---|---|---|
| 1 | **Today** (Daily Brief) | **Today** (business brief) |
| 2 | **Inbox** | **Inbox** |
| 3 | **People** | **Studio** (CRM, pipeline, projects, catalog, inventory) |
| 4 | **Ask** (Ask Zuri) | **Ask** (business-scoped) |
| 5 | **More** (Goals, Timeline, Calendar, Knowledge, Memory, Documents, Career, Settings) | **Documents** (Document Studio) |

- **Top app bar** on every root screen:
  - the context chip (workspace name, tinted), which opens the switcher bottom sheet
  - global search
  - the capture status dot (green = listening; amber = degraded; grey = paused)
- **Hybrid** context shows the Personal tab set, plus a Studio shortcut row on Today.

Rationale: the web has about 30 nav items in 4 hubs and a 4-tab mobile bar. Android consolidates by *intent* (what do I need today / talk / who / ask / make), not by web page. Each web feature in the parity matrix has a home here (`SCREEN_MAP.md` gives the full tree and every route).

### 2.2 Adaptive layout

- **Window size classes:**
  - Compact (phones): single pane.
  - Medium (foldables, small tablets): list-detail for Inbox, People and Documents.
  - Expanded: navigation rail plus a three-pane Inbox (list / thread / intel), mirroring the web's desktop inbox.
- **Compose adaptive scaffolds:** `NavigationSuiteScaffold`, `ListDetailPaneScaffold`.

---

## 3. Technology architecture and module graph

### 3.1 Layering

```
 :app                      Activity, NavHost, DI graph root, theming, app lock gate
   │
 :feature:*                Compose UI + ViewModels (one module per area)
   today · inbox · people · ask · studio · documents · bi · career · goals · timeline
   calendar · knowledge · memory · sources · models · sync · settings · privacy · onboarding
   │
 :domain                   Pure Kotlin: entities, use cases, ContextScope, policies (no Android)
   │
 :data:*                   Repositories; local (Room) + remote (API) sources; mappers
   data:local (Room/SQLCipher, DAOs, migrations) · data:remote (Retrofit/Socket.IO DTOs)
   │
 :engine:*                 Intelligence & processing (Android-light, testable on JVM)
   engine:ingest   (notification adapters, normaliser, identity resolution, fingerprints)
   engine:perception (extraction pipeline, validators, date resolution)
   engine:relate   (health, cadence, relationship memory — ported from services/intelligence)
   engine:brief    (Daily Brief, recommendations, reflection highlights)
   engine:retrieval (hybrid retriever, chunker, scope filter)
   engine:docs     (document model, calculations, numbering, validation, missing-info)
   │
 :core-ai                  LanguageModel seam, LiteRT-LM adapter, model catalog/download/
                           install/compat, embeddings, router, JsonExtractor (from MeetingMind)
 :core-ai:remote           Remote providers (Zuri API, device BYOK) — only reachable via PrivacyGate
 :core-docs                Block model, DOCX renderer, WebView PDF renderer host, JS asset
 :core-security            Keystore, Tink, SQLCipher key management, app lock, FLAG_SECURE helpers
 :core-sync                Outbox, change-feed client, conflict resolution, import planner
 :core-ui                  Design system (theme, tokens, components), previews
 :core-common              Result types, dispatchers, clock, logging (redacting), ids (UUIDv7)
```

**Dependency rules** (enforced by a Gradle module-graph check in CI):
- `:feature:*` → `:domain`, `:core-ui`. Never `:data` directly; data is reached through use cases.
- `:engine:*` → `:domain`, `:core-ai`, `:core-common`. No `:feature`.
- Nothing except `:core-ai:remote` and `:data:remote` may depend on the HTTP stack. `:core-ai:remote` requires a `GateToken` (D-13).
- `:domain` has no Android dependencies, which keeps the D-19 KMP door open.

### 3.2 Runtime processes

| Process | Hosts | Why separate |
|---|---|---|
| main | UI, NotificationListenerService, WorkManager workers, Room | Normal |
| `:llm` | LiteRT-LM engine, embedding model; bound service with an AIDL/Messenger interface | A native OOM or crash can't kill the app or the listener. The Android 17 memory limiter attributes usage per process. Pattern from MeetingMind's `:diarizer`. |
| `:render` | Offline WebView for PDF rendering (D-09) | Isolates JS and WebView memory; network blocked |

### 3.3 Cross-cutting

- **DI:** Hilt with a `@WorkspaceScoped` qualifier for scoped repositories.
- **Logging:** a redacting logger with no message bodies, names or numbers in logs or crash reports. Crash reporting is opt-in.
- **Ids:**
  - UUIDv7 for locally created rows: time-ordered and compatible with the server's `uuid` PK type.
  - The server id is stored alongside once known (`remote_id`).
- **Time:** an injectable `Clock`; all timestamps stored as UTC epoch millis plus the source time zone where relevant.

---

## 4. Database architecture

### 4.1 Store choices

| Store | Contents | Protection |
|---|---|---|
| Room (SQLCipher) `zuri.db` | All domain data, memories, captured messages, outbox, sync state, ledger | AES-256 (SQLCipher); key = random 256-bit DEK wrapped by a Keystore AES-GCM key (StrongBox when available) |
| Room (SQLCipher) `zuri-vault.db` (optional, M15) | User-flagged "vault" categories (identity numbers, health, finances) | Separate DEK whose Keystore key requires user authentication; unlocked per session |
| Vector index | Embeddings as `BLOB` (float32/int8) with `model_id` and `dim` columns; brute-force cosine within scope first, sqlite-vec adoption evaluated in M4 if corpora exceed ~50k chunks | Inside SQLCipher DB |
| FTS5 virtual tables | Messages, memories, documents, notes | Inside SQLCipher DB (FTS5 availability verified in the M0 spike; FTS4 fallback) |
| DataStore + Tink | Preferences, consents, tokens | Tink AEAD keyset wrapped by Keystore |
| Files (`noBackupFilesDir`) | Model weights, rendered PDFs/DOCX cache, imported attachments | Models: integrity via SHA-256 (not secret). Documents: encrypted with Tink streaming AEAD. |

Backups: `dataExtractionRules` exclude all of the above from cloud backup and device transfer (`SECURITY_AND_PRIVACY.md` §3.10). Device migration happens through the Zuri account (sync) or an encrypted export file.

### 4.2 Core schema (outline)

All tables share a common column set:
- `id` (UUIDv7 text PK)
- `workspace_id`, except global identity tables
- `created_at`, `updated_at`
- `origin` (`DEVICE` | `CLOUD` | `IMPORT`)
- `remote_id` (nullable)
- `sync_state` (`LOCAL_ONLY` | `PENDING_PUSH` | `SYNCED` | `CONFLICT`)
- `deleted_at` (tombstone)

| Group | Tables | Notes |
|---|---|---|
| Identity & context | `workspace`, `account_binding`, `context_preference` | `workspace(kind PERSONAL/BUSINESS, name, accent, cloud_binding_id?)` |
| People | `person` (global), `person_identifier` (phone, wa_jid, handle, email, device_contact_lookup_key), `relationship` (per workspace: type, category, tier, health_score, trend), `company` | Mirrors server `contacts`+`relationships`; `person` has no workspace (identity only, no content) |
| Sources & capture | `source_app` (package, enabled, adapter version), `capture_raw` (encrypted notification snapshot, retention-bound), `capture_exclusion` | Raw kept only for the retention window (default 7 days) for reprocessing |
| Conversations | `conversation` (workspace, source, chat_key, title, is_group), `message` (conversation, sender person, direction, text, placeholder_kind, sent_at, fingerprint, provenance, `server_message_id?`) | `fingerprint` = hash(chat_key, sender_key, normalised_text, minute bucket) for dedup and reconciliation |
| Perception & memory | `extraction_run` (model_id, prompt_version, input message ids, timings), `memory_item` (kind FACT/PREFERENCE/INSIGHT/LIFE_EVENT, subject person/workspace, text, value_json, confidence, status ACTIVE/SUPERSEDED/REJECTED/CONFIRMED), `memory_source` (memory ↔ message/document/import ids, quote span) | The Memory Inspector reads these directly |
| Commitments & tasks | `commitment` (who→whom, text, due_at, due_precision, status, source), `task`, `event` (extracted), `reminder` | Mirrors `contact_promises`, `contact_tasks`, `events` |
| Relate | `health_log`, `cadence_clock`, `relationship_memory` | Port of server deterministic engines |
| Brief & recommendations | `recommendation` (kind, payload, status, expires_at, reason, evidence), `brief_snapshot` | Mirrors `proactive_queue` semantics including `auto_resolved` |
| Knowledge | `note`, `knowledge_doc`, `chunk` (text, embedding blob, model_id, dim) | |
| Goals & timeline | `goal`, `goal_link`, `goal_event`, `timeline_entry` | |
| Business | `deal`, `deal_stage_history`, `project`, `project_task`, `milestone`, `time_entry`, `product`, `product_variant`, `stock_movement` (cloud mirror), `supplier`, `purchase_order` (cloud mirror), `business_event`, `action_bundle` | Local-only workspaces use them natively; cloud-bound workspaces treat ERP ledgers as server-authoritative mirrors |
| Documents | `brand_profile`, `document` (type, status, number, provisional_number, currency, totals in minor units, structured_json, template_key, version, source_document_id), `document_line`, `document_section`, `document_event`, `document_source` (provenance), `numbering_sequence` | Shapes mirror server `documents.structured_data` so import/export is lossless |
| AI | `model_install`, `model_benchmark`, `consent`, `egress_ledger` | |
| Sync | `outbox` (op, entity, entity_id, payload, idempotency_key, attempts, state), `sync_cursor` (per entity stream), `import_job`, `import_checkpoint`, `conflict` | |

**Migrations:**
- Room auto-migrations where possible.
- Hand-written migrations with tests (`MigrationTestHelper`) for every version.
- Exported schema JSON in `apps/android/data/local/schemas/`.
- A pre-migration DB copy is kept for one launch (MeetingMind's `DatabaseGuard` pattern).

---

## 5. Notification ingestion

### 5.1 Pipeline

```
NotificationListenerService.onNotificationPosted(sbn)        [main process, < 5 ms budget]
  ├─ package allowed?  (source_app.enabled, user consent)      else drop, no read
  ├─ skip: group summaries, ongoing/call/progress, our own
  ├─ SourceAdapter(package).parse(sbn) → List<RawItem>
  │    (MessagingStyle messages, title/text fallbacks, conversation key candidates)
  └─ CaptureWriter: encrypt + insert capture_raw, enqueue "ingest" unique work (debounced)

IngestWorker (WorkManager, expedited when app in foreground, else normal)
  ├─ Normaliser: text cleanup, placeholder detection (media, "deleted", OTP-redacted,
  │              "New message" hidden-content), emoji/reaction lines
  ├─ ChatKeyResolver: shortcutId/LocusId → conversation title+isGroup → stable chat_key
  ├─ IdentityResolver: sender → person (phone/JID/handle/name, device contacts lookup)
  ├─ Dedup: fingerprint vs existing messages (handles re-posted cumulative MessagingStyle)
  ├─ Exclusion check: conversation/person excluded? → keep raw only if user chose "store but don't analyse"
  ├─ Workspace assignment: conversation rule → workspace_id
  ├─ Insert message rows (provenance = source package + sbn key + post time)
  └─ Enqueue perception (batch) → §8
```

### 5.2 Source adapters

Interface: `SourceAdapter { val packages: Set<String>; fun parse(sbn, ctx): List<RawItem>; val capabilities: SourceCapabilities }`. `capabilities` declares what the source can supply (history? sender identity? group awareness? reply action?), and the UI uses it to show coverage honestly.

| Adapter | Packages | Notes (from `ANDROID_FEASIBILITY.md` §2) |
|---|---|---|
| WhatsApp | `com.whatsapp`, `com.whatsapp.w4b` | MessagingStyle; group via `conversationTitle`; skip "N messages from M chats". **M0 spike verifies whether `shortcutId` is the chat JID.** If so it is the join key to cloud `whatsapp_chat_id`. |
| Telegram | `org.telegram.messenger`, `org.thunderdog.challegram` | MessagingStyle |
| Signal | `org.thoughtcrime.securesms` | Often content-hidden; mark accordingly |
| Messenger | `com.facebook.orca` | MessagingStyle |
| Slack | `com.Slack` | Channel in title; DMs/mentions only |
| Gmail | `com.google.android.gm` | Sender + subject + snippet; inbox-style lines |
| SMS apps | `com.google.android.apps.messaging`, `com.samsung.android.messaging` | OTP redaction expected |
| Generic | any user-enabled package | Title/text only, flagged low-fidelity |

Adapters are versioned. A **golden-notification fixture suite** (anonymised `Bundle` snapshots per app and version) runs in CI. Adapters must tolerate unknown shapes and emit a parse-failure metric rather than crash.

### 5.3 Deduplication

- WhatsApp re-posts a chat's notification with the accumulated message list. Dedup therefore keys on `fingerprint`, not on `sbn.key`.
- `fingerprint = H(chat_key ‖ sender_key ‖ normalise(text) ‖ floor(time/60s))`, with a ±1 bucket check.
- Edited messages (same sender, same time bucket, different text, tagged by the adapter) update the row and keep the edit history.
- Deleted messages ("This message was deleted") mark the row deleted. Derived memories are flagged for review, not silently removed.

### 5.4 Selective processing and retention

- **Per source:** enabled, "analyse" vs "store only", retention days.
- **Per conversation and person:** exclude entirely (not even stored), store without analysis, or analyse.
- **Groups:** stored and displayed; analysis off by default (Q-13).
- **Retention:** `capture_raw` defaults to 7 days. Messages and memories persist until the user's retention setting. Selective deletion is available per message, per conversation, per source, or by date range. Deleting a message cascades to derived memories after a confirmation that lists them.

### 5.5 Replies

`ReplyAction` captures the notification's `RemoteInput` action while it is live. The Reply sheet offers it only when it is still active, and uses Send only on a user tap (D-11). When unavailable, the sheet offers:
- open the conversation in the source app (deep link via the content intent)
- send through the cloud WhatsApp session, if connected and G4 exists

### 5.6 Listener reliability

- `requestRebind` on disconnect and on app start.
- A heartbeat (`last_connected_at`, `last_captured_at`) with a Sources-screen health card.
- A per-OEM guidance flow (battery optimisation, autostart).
- A "Capture paused" Quick Settings tile (M14).
- No foreground service is needed to listen.

---

## 6. Local AI architecture

### 6.1 Components (`:core-ai`)

```
LanguageModel (interface)          generate / generateStructured(schema) / stream / cancel
  ├─ LiteRtLmLanguageModel         (default; runs in :llm process via LlmService binder)
  ├─ GeminiNanoLanguageModel       (optional; foreground-only interactive tasks)
  ├─ LlamaCppLanguageModel         (optional; only if M0 shows grammar JSON is required)
  └─ RemoteLanguageModel           (:core-ai:remote; Zuri API / device BYOK; needs GateToken)
EmbeddingModel (interface)         EmbeddingGemma via LiteRT; versioned (model_id, dim)
ModelCatalog (data: bundled JSON, refreshable)  → ModelSpec(id, runtime, files[sha256,size],
                                   capabilities, min/rec RAM, context, license, tier)
ModelInstaller / Downloader / Verifier / DownloadWorker   (from MeetingMind, de-coupled)
DeviceProfile                      RAM, SoC, ABI, GPU/NPU probe, thermal headroom, storage
AiRouter                           task → (model, params, scope) decision; records provenance
PrivacyGate                        authorise remote use per purpose/workspace; writes ledger
JsonExtractor                      lenient parse → schema validate → one repair retry → drop
Benchmark                          on-device micro-benchmark; stores tokens/s per model
```

### 6.2 Task routing

| Task | Default local route | Output budget | Fallbacks |
|---|---|---|---|
| Tier A message extraction (sentiment, intent, entities, commitments, events, urgency, requires_response) | Standard/Pro model, batched 5–20 messages per prompt | ≤ 300 tokens per batch item | Rules-only extractor (Essential tier) → cloud only with consent |
| Tier B extraction (business facts, opportunities, products/orders, suppliers, career, life events, connections) | Gated by cheap keyword/number pre-filter | ≤ 200 tokens | Skip (Essential) |
| Conversation summary | Local model, map-reduce over chunks | ≤ 250 tokens | Extractive summary (no model) |
| Reply drafts (2–3) | Local model with local voice profile + relationship summary | ≤ 120 tokens each | Templates; Gemini Nano rewrite in foreground |
| Ask Zuri | Scoped hybrid retrieval → local model with citations | ≤ 400 tokens | Retrieval-only answer ("here's what I found") |
| NL business query (`ASK_ANYTHING` port) | Local model → structured query JSON → Kotlin query builder | ≤ 150 tokens | Keyword search |
| Document drafting | Local model proposes sections/line descriptions; code fills money | ≤ 800 tokens | Template sections |
| Embeddings | EmbeddingGemma 256-d | — | FTS only |

Prompts are ported from `services/intelligence/app/ai/prompts.py`. They are compressed for small models, versioned (`prompt_version` stored in each `extraction_run`), and paired with the server's Pydantic shapes, so extracted JSON can later be uploaded and consumed by the server's fan-out writers unchanged (the Tier A/B split mirrors `MessageAnalysis`, BACKEND_API_MAP §C.3).

### 6.3 Device tiers

Device tiers are defined in D-15. The router reads `DeviceProfile` and the benchmark results, never only the RAM figure. Capability is re-evaluated after OS updates or model changes.

### 6.4 Structured output reliability

1. **Prompting:** schema-first, with few-shot examples taken from the server's long-form `ANALYSE_MESSAGE` guidance.
2. **Constrained decoding** where the runtime supports it. Otherwise the JsonExtractor runs: lenient parse → kotlinx schema validation → one repair attempt with the validator's error message → drop the item.
3. **Grounding validators:**
   - every commitment and fact must cite a message id that was in the prompt (MeetingMind's `toValidIds` pattern)
   - quoted spans must exist in the source text
   - dates are resolved in code from relative phrases plus the message timestamp, never trusted from the model
4. **Confidence:**
   - model self-report is combined with validator signals
   - items below threshold become "Suggestions to confirm", not memories
5. **Evaluation harness:** labelled fixture conversations (synthetic and consented), measuring precision/recall per field. It gates releases and model or prompt changes.

### 6.5 Resource management

- **Scheduling:** inference runs in WorkManager workers bound to the `:llm` process.
- **Constraints:**
  - Large batches: `requiresBatteryNotLow`, preferring charging and idle.
  - Small foreground tasks (Ask Zuri, reply drafts) run immediately while the app is visible.
- **Thermal:** `PowerManager.getThermalHeadroom` before each batch; back off at moderate throttling.
- **Engine lifecycle:**
  - one engine kept warm while the app is in the foreground, released after 60 s idle
  - deferred release during generation (MeetingMind pattern)
  - checkpointed batches, so a killed worker resumes
- **Memory:** model size is checked against measured available memory, not "≤ RAM/2". The app is tested against the Android 17 memory limiter.

### 6.6 Remote AI

`RemoteLanguageModel` exists only behind `PrivacyGate` (D-13). Providers:
- **Zuri cloud:** through existing `services/api` routes (advisor, conversation ask, documents ai-generate, search/ask). These already apply server-side BYOK and credits.
- **Device BYOK** (optional, Q-02): key held in Keystore.

The gate presents the purpose, workspace, payload class and provider. It records an `egress_ledger` row, and never falls back silently.

---

## 7. MeetingMind reuse

`MEETINGMIND_REUSE_ANALYSIS.md` §12 holds the class-by-class table. In summary:
- **Mechanism:** copy-and-own from `48da219` into `:core-ai` and `:core-docs`, with `PROVENANCE.md`.
- **Refactors on the way in:**
  - catalog as data
  - DI instead of singletons
  - the LiteRT-LM adapter
  - versioned embeddings
  - a single PrivacyGate
  - storage in `noBackupFilesDir`
  - Room decoupled from the installer
- **Tests travel with the code:** `ModelVerifierTest`, `OkHttpModelDownloaderTest`, `LlmModelResolverTest`, `LocalModelFitTest`, JSON parser tests, `PrivacyNoCloudPathTest` (re-targeted at PrivacyGate).
- **Precondition:** ownership confirmed (Q-03).

---

## 8. Context engine and the on-device Neural Layer

### 8.1 ContextScope

```kotlin
data class ContextScope(
  val workspaces: Set<WorkspaceId>,      // never empty
  val persons: Set<PersonId>? = null,    // optional narrowing
  val conversations: Set<ConversationId>? = null,
  val documents: Set<DocumentId>? = null,
  val sources: Set<SourceId>? = null,
  val maxSensitivity: Sensitivity = Sensitivity.NORMAL,
  val purpose: Purpose,                  // ASK, DRAFT_REPLY, DRAFT_DOCUMENT, BRIEF, BI_QUERY…
  val widenedByUser: Boolean = false,    // true only via explicit UI action, logged
)
```

- **Enforcement points:**
  - Repositories require a `ContextScope` for every query returning content.
  - The retriever filters candidate chunks by scope **before** ranking.
  - The prompt assembler validates that every record's `workspace_id` is in scope and throws otherwise.
- **Tests:** property tests generate multi-workspace data and assert that no out-of-scope record ever appears in an assembled prompt.

### 8.2 Default scopes

| Surface | Default scope |
|---|---|
| Today, Inbox, People, Ask | Active context (Personal, a business workspace, or Hybrid's chosen union) |
| Conversation, person, document screens | That entity's workspace only |
| Document drafting | The document's workspace + its client relationship + its brand profile; never Personal unless widened |
| Cross-context question | Ask shows "Also look in Personal?" as a one-tap widen with a visible banner; logged |

### 8.3 Sensitivity

Memories carry a `sensitivity` field:
- `NORMAL`
- `PERSONAL` (health, family, emotional)
- `SECRET` (identity numbers, credentials, financial account numbers)

SECRET items are excluded from prompts unless the purpose requires them (e.g. filling a document's bank details from the brand profile). Remote AI never receives SECRET items (gate rule).

### 8.4 Neural Layer engines on device

| Server engine | Android counterpart | Port type |
|---|---|---|
| Message analysis (`analyser.py`) | `engine:perception` Tier A/B | Prompt port + Kotlin validators |
| Conversation memory (Redis rules) | `ConversationStateUpdater` | Direct logic port (pure rules) |
| Event extraction, life events, connections, products, opportunities writers | `engine:perception` writers | Logic port |
| Emotion valence/arousal derivation (`neural/emotion.py`) | `EmotionDerivation` | Math port (no LLM) |
| Health (`health.py`) | `engine:relate.HealthCalculator` | Direct SQL→Kotlin port, same weights |
| Cadence (`cadence_learner.py`), clocks | `engine:relate.Cadence` | Direct port |
| Relationship memory | `engine:relate.RelationshipMemory` | Direct port |
| Reflection (personal highlights) | `engine:brief.Reflection` | Direct port |
| Proactive daily suggestions, temporal nudges | `engine:brief.Recommendations` | Rules + small prompt (`GENERATE_TEMPORAL_NUDGE`) |
| Reality Engine L1 (outbound reply resolves nudges) | `engine:brief.Resolver` | Direct port |
| Voice profile | `engine:perception.VoiceProfile` | Prompt port; stays local |
| Profiler (insights/profile) | `engine:perception.Profiler` | Chunked map-reduce; Pro tier, or cloud with consent |
| Advisor companion, gossip/spiritual/motivational crons, curiosity | Cloud (ONLINE) in M13; local curiosity gaps later | — |
| Web-search engines, job discovery, agents, ERP execution | Cloud only | — |

When connected and allowed, the server's own analyses for cloud-ingested messages are **imported**, not recomputed. Device-derived memories for phone-captured messages are uploaded only with D-16 consent.

### 8.5 Learning loop

User corrections (confirm, edit, reject a memory; dismiss a recommendation; edit a reply draft) are stored as `feedback` rows. They:
- adjust per-extractor confidence calibration
- suppress repeat suggestions
- update the voice profile

All local; synced only with consent.

---

## 9. Cloud integration (summary)

Full design in `DATA_OWNERSHIP_AND_SYNC.md`. In brief:
- **Auth:** Clerk SDK → `clerk-exchange` (G1).
- **Read-through:** Retrofit clients for existing endpoints, with a uniform 401/402 handler (`upgradeRequired` vs `readOnly`).
- **Realtime:** Socket.IO in the foreground (authenticate-after-connect today; handshake auth after G6); FCM for background (G7).
- **Import:** a category planner, batched paging, checkpoints, dedup, provenance.
- **Sync:** change feed + outbox + idempotency + tombstones + conflict queue.

Separate consents, as required by brief §5: Connect, Import, Ongoing sync, Upload local data, Cloud backup, Remote AI.

---

## 10. Document Engine

### 10.1 Model

```
DocumentTypeRegistry   type → {category, required fields, sections, numbering prefix,
                               allowed templates, validation rules, AI drafting recipe}
                       (mirrors server PHASE_0_TYPES + career types; data-driven)
Document               header (type, number|provisional, status, dates, currency,
                       brand_profile, client party, workspace), lines[], sections[],
                       notes, terms, variables{}, totals (derived), version chain
Party                  from relationship/company or manual (server's manualContact shape)
Template               key ∈ @zuri/pdf-templates set (8 business + 7 career) + DOCX style
```

### 10.2 Creation flow

1. **Intent:** natural language ("Proposal for Mwila Farms, 3-month irrigation maintenance, use last quote's rates") or type picker.
2. **Context selection:** workspace (pre-filled), client relationship, related conversation/deal/project, prior documents, catalog items. Shown as removable chips, so the user sees exactly what the AI may read.
3. **Drafting:**
   - The local model (or cloud with consent) proposes `{sections[], line descriptions, product references, variables needed}`.
   - **Prices come only from** the catalog, prior documents or user input. The model may reference a `productId`; code resolves the price.
4. **Missing-information sheet:** every required field the system cannot source (client address, tax number, quantities, validity date, payment terms) becomes a question card. Nothing is invented. Unknowns stay visibly empty and block finalisation.
5. **Calculation:** deterministic integer-minor-unit totals (line = qty × unit − discount, tax per line, rounding rule identical to the server's `computeTotals`). Shared golden tests are run against the server's TypeScript implementation's outputs.
6. **Validation:**
   - Rule-based: required fields, date order (issue ≤ due/valid-until), totals consistency, currency, tax ranges, client identity present, numbering unique.
   - Optional AI quality check (server `DOCUMENT_QUALITY_CHECK` or a local equivalent).
7. **Provenance inspector:** each section and line shows its sources (message, prior document, catalog item, user-entered, AI-drafted).
8. **Preview and export:** PDF via WebView templates (D-09), DOCX via `:core-docs`, HTML preview (the same render engine's DOM).
9. **Finalise:** numbering per D-10. A status lifecycle mirrors the server (`draft → generated → sent → viewed → accepted/rejected/expired/paid → archived`).
10. **Share:** Android share sheet (PDF/DOCX), cloud send via `POST /api/documents/:id/send` (not `/send-whatsapp`, which is broken), or a share link (web page).
11. **Versions:** editing a non-draft creates a new version (the server's `revise` semantics). Version history with diff of fields and lines.

### 10.3 Cloud alignment

- Device `structured_json` uses the server `documents.structured_data` shape.
- Line items map to the server `items[]`.
- Import and push are lossless.
- Cloud-owned documents (created on web) open read-only offline. They are editable online through the API, or through the outbox once G4 exists.

### 10.4 Signatures

Brand signatures sync from `/api/signatures`. Native capture uses a Compose signature pad (pressure-smoothed strokes exported as SVG/PNG).

---

## 11. Background processing

| Work | Mechanism | Constraints | Notes |
|---|---|---|---|
| Capture | NotificationListenerService | none | Minimal work in the callback |
| Ingest | Unique `OneTimeWork` (debounced 2 s), expedited when foregrounded | — | Cheap, no LLM |
| Perception batch | Periodic + triggered `CoroutineWorker` in `:llm` | battery not low; prefer charging/idle for large batches; thermal check | Checkpointed; Android 16 job quotas respected; no FGS by default |
| User-initiated "Process backlog now" | WorkManager `setForeground` (dataSync type) | user-initiated only | Within Android 15's 6 h/day dataSync budget |
| Model download | User-initiated data transfer job (API 34+) / WorkManager FGS fallback | unmetered if Wi-Fi-only | Resumable, SHA-256 verified |
| Daily Brief build | Periodic work ~06:00 local + on app open | — | Local time zone (the server uses fixed UTC hours; Android uses local) |
| Relate recompute | After ingest batches (every N messages per person) | — | Mirrors the server's counters, persisted (not in-memory) |
| Sync pull/push | Periodic (15 min min), FCM-triggered, on connectivity change | network | Exponential backoff |
| Retention cleanup | Daily | idle | |

---

## 12. Testing strategy

| Layer | Tests | Tooling |
|---|---|---|
| Domain & engines | Unit + property tests (scope isolation, money maths, date resolution, fingerprints, health/cadence parity with the server via golden fixtures) | JUnit5, Kotest property, Turbine |
| Adapters | Golden notification fixtures per app/version; fuzzed bundles | Robolectric |
| AI | Extraction eval harness (precision/recall per field) on labelled fixtures; JSON robustness; prompt regression | JVM harness + on-device instrumented benchmark |
| Data | DAO tests, migration tests for every schema version, SQLCipher open/rekey tests | Room testing, MigrationTestHelper |
| Sync | Contract tests against recorded API fixtures; a fault-injection suite (drop, duplicate, reorder, conflict); idempotency tests | MockWebServer |
| Documents | Calculation parity with the server `computeTotals`; render snapshot tests (PDF page images); validation rules | Paparazzi/Roborazzi, pdf→bitmap |
| UI | Screenshot tests (light/dark, font scale, compact/expanded); critical-path UI tests | Roborazzi, Compose UI test |
| Security | Architecture tests (no HTTP outside allowed modules); logging redaction tests; backup-rule tests; FLAG_SECURE presence | Konsist |
| Performance | Macrobenchmark (startup, inbox scroll); inference benchmarks per device tier; battery tests | Macrobenchmark |
| Accessibility | TalkBack labels, touch targets ≥ 48 dp, contrast | Accessibility Test Framework |

Reference devices for the M0 spike and CI device farm:
- one 4 GB Android 13 device (Essential tier)
- one 6–8 GB mid-range Android 15 device (Standard)
- one 12 GB flagship Android 16/17 device (Pro)

---

## 13. Build and release

- **Gradle:** version catalog, convention plugins, module graph check, R8 full mode, baseline profiles.
- **Variants:**
  - `dev` (staging API, debug tooling)
  - `prod` (`https://34-13-48-134.sslip.io`, to be replaced by a real domain; certificate validation standard)
- **ABI:** arm64-v8a only; 16 KB page alignment verified in CI.
- **CI:** GitHub Actions workflow `android.yml`, path-filtered to `apps/android/**` and `packages/pdf-templates/**` (template asset build). Runs build, unit tests, screenshot tests, lint, dependency audit and license report. It never touches the existing deploy workflow.
- **Signing:** Play App Signing; upload key in GitHub Actions secrets.
- **Distribution:**
  - Play internal testing → closed → production (Q-12).
  - Sideloaded builds are discouraged, because Android 13+ restricted settings block notification access.
- **Play compliance pack (M15):**
  - prominent disclosures
  - Data Safety form (sync on/off variants)
  - Contacts declaration (target 37)
  - FGS declaration video (dataSync, user-initiated)
  - AI-generated content reporting
  - privacy policy update covering notification data
- **Model delivery:** own CDN or Hugging Face URLs pinned by SHA-256. Play AI packs evaluated in M3.

---

## 14. Migration and compatibility with the web platform

- **No breaking changes to existing APIs.** All backend additions are new endpoints or additive columns and triggers (`IMPLEMENTATION_PLAN.md` §4).
- **DTOs:**
  - Android maps the existing camelCase response shapes.
  - Unknown fields are ignored (lenient JSON).
  - Contract tests pin the shapes Android depends on, so the web/backend track sees breakage in CI.
  - Proposed: generate OpenAPI from Zod (G8) to remove hand-mirroring.
- **Shared semantics:** status vocabularies (documents, proactive, deals), money in minor units, `structured_data` shapes, and `MessageAnalysis` JSON are treated as shared contracts and documented in `packages/contracts` (currently empty) when the backend RFCs land.
- **Companion retirement:** once Android M2 ships, `/api/companion/message` stays for old installs. The new reconciliation endpoint (G5) replaces it for Zuri Android.
- **Templates:** `packages/pdf-templates` remains the single source. The Android build consumes it, so template changes on the web reach Android in its next build. The template asset is versioned and recorded in each rendered document's metadata.
- **Feature flags:** Android reads the session's `planFamily` and server flags (`FREE_TESTING_MODE` effects) like the web, and handles 402 uniformly.
