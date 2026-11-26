# Zuri Android — Architecture Decision Log

> Part of the Zuri Android initial engagement, 2026-11-24.
>
> **Status values**
> - **PO-APPROVAL**: the product owner must approve before implementation.
> - **ARCHITECT**: the principal architect's decision, recorded for review and reversible on request.
> - **BACKEND-RFC**: needs approval *and* coordination with the web/backend owner.
>
> Nothing in this log is approved yet. Silence is not approval.

## Summary

| ID | Decision | Status |
|---|---|---|
| D-01 | Native Kotlin/Compose app; supersede `apps/companion` and `apps/mobile` | PO-APPROVAL |
| D-02 | Lives at `apps/android` in this monorepo; never edits existing code paths | ARCHITECT |
| D-03 | Technology stack | ARCHITECT |
| D-04 | Device workspaces: Personal + N Business, hard-isolated; optional server `workspace_id` | Device part accepted 2026-11-24 (default), built in M5; BACKEND-RFC G9 for the server part |
| D-05 | Local-first ownership model | PO-APPROVAL |
| D-06 | Clerk Android SDK + new `/api/auth/clerk-exchange` | BACKEND-RFC |
| D-07 | Import first, then change-feed sync with outbox + idempotency | BACKEND-RFC |
| D-08 | On-device AI: LiteRT-LM, Gemma 4 E2B/E4B, EmbeddingGemma; Gemini Nano optional | ARCHITECT (pending M0 spike) |
| D-09 | Documents render with the same `@zuri/pdf-templates` inside a sandboxed WebView | PO-APPROVAL (pending M0 spike) |
| D-10 | Offline document numbering policy | PO-APPROVAL |
| D-11 | The phone never auto-sends; replies are user taps; Accessibility never used | ARCHITECT (policy) |
| D-12 | Admin console and marketing site excluded from Android | PO-APPROVAL |
| D-13 | Remote AI off by default; single PrivacyGate; per-purpose consent | PO-APPROVAL |
| D-14 | Voice-note on-device transcription deferred | PO-APPROVAL |
| D-15 | SDK levels, ABI, device tiers | ARCHITECT |
| D-16 | Upload of captured notification messages off by default, per-source opt-in | PO-APPROVAL |
| D-17 | MeetingMind: copy-and-own into `:core-ai` / `:core-docs` | PO-APPROVAL (ownership) |
| D-18 | Design language: Material 3 adaptation of the Zuri design system, context tint | PO-APPROVAL (via design review) |
| D-19 | No Kotlin Multiplatform | ARCHITECT |
| D-20 | Deterministic engines ported to Kotlin; LLM never computes money, dates or scores | ARCHITECT |
| D-22 | On-phone auto-replies, opt-in per chat, with hold-back rules (amends D-11) | PO-APPROVED 2026-11-26 |

---

## D-01 — Native Kotlin/Compose app; supersede the companion and RN scaffolds
**Context.**
- `apps/companion` won't build, would crash on Android 14+, and duplicates data on the server.
- `apps/mobile` is a stale Expo scaffold with the wrong auth model. It can't host a NotificationListenerService or run on-device LLMs without native modules.

**Decision.** Build Zuri Android as a new native app. Leave both old apps untouched until Zuri Android reaches notification-ingestion parity (M2) and cloud auth (M7). Then propose their removal in a separate change.

**Consequence.** No React Native code reuse; the RN screen list serves only as a checklist.

## D-02 — Location and coordination
**Decision.**
- The project lives at `apps/android/`, a Gradle project outside the npm workspaces, so it never affects `npm install` or Turborepo.
- Android work never edits existing web, API, intelligence or migration files.
- Backend needs are written as RFCs (`IMPLEMENTATION_PLAN.md` §4). They are implemented only after approval, in commits coordinated with the backend owner.
- A CI workflow for Android is path-filtered to `apps/android/**`.

**Why.** Another agent develops on `main` and commits there, and `main` auto-deploys.

## D-03 — Technology stack
- Kotlin 2.2+, Jetpack Compose (Material 3, adaptive layouts), Navigation Compose with type-safe routes, Hilt.
- Room with SQLCipher (`net.zetetic:sqlcipher-android`), DataStore + Tink (not the deprecated `security-crypto`).
- WorkManager, Coroutines/Flow.
- OkHttp + Retrofit (or Ktor) with kotlinx.serialization; Socket.IO client for realtime; FCM (once G7 exists).
- Clerk Android SDK for account connection.
- LiteRT-LM runtime; MeetingMind-derived `:core-ai`.

A version catalog pins everything. No version is chosen here beyond these families. Exact versions are fixed in M1 against the then-current stable releases.

## D-04 — Workspaces and context isolation *(most important product decision)*
**Context.**
- The server has a single owner `user_id`.
- `users.mode` is an account-wide UI mode, and `business_profiles` are brand profiles.
- The brief requires that Personal, Business and Hybrid contexts are explicit, and that Business A's data never becomes knowledge for Business B.

**Decision (proposed).**
1. **On the device:**
   - Every domain row carries `workspace_id`.
   - Workspaces are `PERSONAL` (exactly one) and `BUSINESS` (zero or more, user-created).
   - **Hybrid is a view, not a workspace:** a user-selected union of Personal plus specific business workspaces, used for reading and for explicitly widened reasoning.
2. **People:**
   - A *Person* is a global identity (phone numbers, handles, device-contact link).
   - Per-workspace *Relationship* records hold everything contextual: notes, memories, health, deals, documents.
   - The same human can be a friend in Personal and a client in Business A, with no shared memories unless the user links them.
3. **Conversations:** assigned to exactly one workspace by rule (for example, WhatsApp Business → a chosen business workspace), or by the user. Reassignment moves the derived memories with them, after confirmation.
4. **Enforcement:**
   - Retrieval is filtered by workspace in the DAO/repository layer, never only in prompts.
   - The prompt assembler takes a `ContextScope` and rejects records outside it.
   - Widening the scope is an explicit, logged user action ("Use Personal context for this question").
5. **Cloud:**
   - A connected Zuri account binds to the device as a *cloud source*.
   - Imported records are mapped to workspaces by rules (e.g. `customer_status`, `relationship_category`, document `business_profile_id`), with a review screen for unmapped items.
   - Until the server has a workspace column (RFC G9), the device keeps the mapping locally and pushes records to the single cloud scope, labelled with their device workspace in metadata where a field exists.

**Needs approval:**
- Q-01 (model).
- G9 (server column). Recommended later, not as a precondition.

**Alternatives considered.**
- Use `business_profiles` as workspaces: rejected. Only documents reference them.
- Mirror the server's single scope: rejected. It fails the isolation requirement.

## D-05 — Local-first ownership
**Decision.**
- The device database is the **system of record** for data the device creates: captured notifications, locally derived memories, local workspaces, local documents in local-only workspaces, model settings.
- The Zuri backend is the system of record for data it creates or that only exists there: ERP, server documents, agents, subscriptions, analytics, cloud WhatsApp history.
- Bidirectional entities have per-entity rules (`DATA_OWNERSHIP_AND_SYNC.md`).
- Disconnecting the account never deletes local data unless the user asks.

## D-06 — Account authentication
**Decision.**
- Sign in with the Clerk Android SDK.
- Exchange the Clerk session token at a new `POST /api/auth/clerk-exchange`, which verifies the token against Clerk's JWKS and reuses clerk-sync's find-or-create logic. It returns the Zuri JWT.
- The Zuri JWT is stored encrypted (Tink AEAD with a Keystore-wrapped key). On a 401, the app re-exchanges using the Clerk session.
- The RFC adds a `jti`/token-version claim and logout for per-device revocation.
- `INTERNAL_API_SECRET` is never present on the device.

**Status.** BACKEND-RFC (G1).

## D-07 — Sync strategy
**Decision.** Three stages, each usable on its own:
1. **Read-through cache (M7).** Online browsing of cloud data with existing endpoints, cached locally, read-only offline. No backend change beyond G1.
2. **Historical import (M8).** Category-selected, batched, resumable, deduplicated import into local tables with provenance. Needs paging endpoints (part of G3).
3. **Incremental sync (M9).**
   - `GET /api/sync/changes?cursor=` backed by triggers and a tombstone table (G3).
   - A client outbox with idempotency keys (G4).
   - A device-message reconciliation endpoint (G5).
   - FCM tickles (G7).

**Rejected.** Syncing via the 5-minute socket replay buffer: wrong tool. CRDT replication of the whole schema: disproportionate. The server is relational and mostly single-writer.

## D-08 — On-device AI
**Decision.**
- **Runtime:** LiteRT-LM behind the `LanguageModel` seam.
- **Models:**
  - Default generative model: Gemma 4 E2B (≥6 GB RAM). E4B on 8 GB+ devices.
  - Embeddings: EmbeddingGemma (Matryoshka 256-d stored).
  - Fallback catalog entries: Qwen 2.5/3 small models.
- **Optional:** Gemini Nano (ML Kit GenAI) for *foreground* rewrite/proofread/summarise where available.
- **Grammar:** a llama.cpp adapter is evaluated in M0 only for grammar-constrained JSON if LiteRT-LM's structured output proves insufficient.

**Pending.** The M0 benchmark on three reference devices. Model choices are data in the catalog, not code, so they can change without a release.

## D-09 — Document rendering
**Decision.**
- Bundle `packages/pdf-templates` and `@react-pdf/renderer`'s browser build into a versioned JS asset produced at Android build time from the monorepo package.
- Render inside an offline, sandboxed WebView: no network, JS bridge limited to a byte-array return.
- Output is identical to web and server PDFs.
- DOCX comes from the native block exporter (MeetingMind `:core-docs`).
- Server render (`POST /api/documents/:id/generate`) is used for documents that are cloud-owned when online.

**Fallback if the M0 spike fails** (render > 5 s or OOM on a 4 GB reference device): server render online; a single native "Zuri Standard" layout offline, labelled as such.

## D-10 — Offline document numbering
**Decision (proposed).**
- **Local-only workspace:** the device owns the numbering sequence per brand profile and type (the same scheme as the server's `numbering` JSON).
- **Cloud-bound workspace:**
  - Drafts carry provisional ids `DRAFT-…`.
  - Finalising (`generated`/`sent`) requires an online round-trip that assigns the official number.
  - Finalising offline is allowed only if the server has reserved a number block for the device (future RFC).
- **Never** two documents with the same official number; never a gap caused by retries (needs G4).

## D-11 — Sending and automation from the phone
**Decision.**
- **Replies from the phone** go through the source notification's RemoteInput action, only while that notification is live, and always on a user tap. No unattended send. *Amended by D-22: auto-replies the owner turns on per chat.*
- **Accessibility:** never used.
- **Cloud auto-send** (the existing scoped automation / auto-response through the server's Baileys session) remains a server feature the user can view and revoke from Android.

## D-12 — Exclusions
**Proposed.** The public marketing site, the admin console and admin bootstrap stay web-only. Everything else is in scope (`WEB_ANDROID_PARITY_MATRIX.md` §9).

## D-13 — Remote AI and the PrivacyGate
**Decision.**
1. **One gate:** all network AI traffic goes through `PrivacyGate.authorize(purpose, payloadClass, provider)`. This includes chat, extraction, embeddings, transcription and document drafting.
2. **Default deny.** Consent is per purpose (e.g. "Ask Zuri may use cloud AI", "Document drafting may use cloud AI") and per workspace.
3. **No silent fallback:** if no local model is available, features degrade and say so, unless consent exists.
4. **Ledger:** every authorised egress is logged in a "What leaves my phone" ledger, showing time, purpose, provider and size. Content is not stored unless the user enables it.
5. **Architecture test:** AI modules cannot depend on the HTTP client directly; only `:core-ai:remote` can, and it requires a gate token.

## D-14 — Voice notes
**Proposed.** No on-device transcription in v1. Cloud transcription is used only with consent. Revisit with sherpa-onnx (Whisper/Omnilingual for Bemba/Nyanja) after M15.

## D-15 — SDK levels, ABI, device tiers
- `compileSdk 37`, `targetSdk 36` (Play requirement since 2026-08-31; plan for 37 and its Contacts policy), `minSdk 29`.
- arm64-v8a only; 16 KB-aligned native libraries.
- Device tiers:

| Tier | Typical device | AI capability |
|---|---|---|
| **Essential** | <6 GB RAM, or model not installed | Deterministic engines, rules-based extraction, optional cloud AI with consent |
| **Standard** | 6–8 GB | E2B-class model + embeddings |
| **Pro** | ≥8 GB with good GPU/NPU | E4B-class model, longer context, larger batch |

## D-16 — Upload of captured messages
**Proposed.** Off by default. Each source has its own opt-in, separate from "Connect account", "Import", "Sync" and "Remote AI" (brief §5).

## D-17 — MeetingMind reuse
**Decision.**
- Copy-and-own the listed classes into `:core-ai` (and `:core-docs`) from commit `48da219`, with `PROVENANCE.md` per module.
- No submodule and no shared library for now.
- **Precondition:** ownership confirmed (Q-03).

## D-18 — Design language
**Decision (subject to design review).**
- Material 3 components and Android interaction patterns, styled with the Zuri brand:
  - indigo primary
  - large radii
  - tinted, restrained elevation
- **Context tint:** the active workspace colours the top app bar band and the context chip. Personal = teal, Business = indigo, plus a workspace accent.
- Light and dark themes.
- No web dashboards squeezed onto a phone. See `DESIGN_REVIEW.md`.

## D-19 — No Kotlin Multiplatform
**Decision.** Pure Android. Domain and sync logic sit in platform-free Kotlin modules (`:domain`, `:sync-core`), so KMP could be adopted later for iOS without a rewrite.

## D-20 — Deterministic code owns facts
**Decision.**
- Money (integer minor units), totals, tax, numbering, date resolution, health/cadence scores and validation are computed in Kotlin.
- LLM output is proposals with provenance and confidence. It is never the stored value of a computed field.

## D-21 — With sync on, conversations mirror WhatsApp
**Decision** (product owner, 2026-11-25).
- When the user opts into syncing conversations with their Zuri cloud account, a WhatsApp chat on the phone should look and feel like the chat in WhatsApp:
  - the full thread the cloud holds, not only what notifications showed;
  - media (photos, video, voice notes with playback, documents);
  - replies and quotes, and reactions.
- **Order is exact.** Messages show in WhatsApp's own sequence:
  - The sort key is the WhatsApp message timestamp the cloud recorded, with the server's ingest sequence as tie-breaker, then the local id. Capture time and sync time are never used for ordering.
  - Phone captures that only have an approximate time (notification post time) are replaced by the cloud copy when the reconciler matches them (DATA_OWNERSHIP_AND_SYNC §6).
  - Unmatched phone captures keep their own time and show an "approximate time" marker. They are never silently moved.
- **Consent and cost.**
  - It is part of the sync consent (D-16), not a new silent behaviour.
  - Media download has its own switch, with Wi-Fi only on by default, because it is large.
- **Media at rest.**
  - Downloaded media is encrypted on the phone (Tink streaming AEAD) in `noBackupFilesDir`.
  - The cache has a size cap with least-recently-used eviction.
  - Deleting a message or chat deletes its media files.
- **Without sync**, conversations stay as M2 builds them: notification text with honest placeholders.

**Consequences.**
- **Backend (G3):** the change feed must carry the WhatsApp timestamp and a stable server sequence per message. It must also carry the quoted-message id, reactions and media metadata (type, size, duration, file name). Media comes from the existing authenticated `GET /api/messages/:id/media`.
- **Android:** M9 adds `server_seq`, `quoted_message_id`, a `message_reaction` table and a `media_item` table (database migration with tests). The conversation screen gains media bubbles, a voice-note player and reply quotes.
- **Testing:** real-device checks on the product owner's Galaxy S20 (wireless debugging), comparing the Zuri thread with the same WhatsApp chat side by side.

## D-22 — Auto-replies from the phone (amends D-11)
**Decision (product owner, 2026-11-26):** "we need to also be able to enable auto-replies...i will enable it per contact and test it with my own number and one or 2 contacts till i'm satisfied its working well... i should be able to set the delay range in minutes for the auto-replies too."

- **Opt-in per chat**, off by default, never for groups. A global pause stops all auto-replies at once.
- **Same channel as tapped replies:** the source notification's reply action, only while that notification is live. No Accessibility, no other send path.
- **Timing:** a random delay in the owner's range (0–60 minutes, default 2–5). A newer incoming message restarts the wait, so Zuri answers once the other person pauses. When the phone is asleep, Android may run the reply later than the range.
- **Drafting:** the on-device model only (no reply without one), from the whole recent chat, open promises, requests and events, what Zuri knows about the person, and the owner's voice profile. The auto prompt agrees to nothing new: no payments, prices, meetings, dates or favours not already agreed in the chat.
- **Hold-back rules (nothing is sent):** the messages being answered mention money, codes or passwords, or serious news (illness, emergency, death); they are media only; the draft mentions money or codes, or contains a number not in the chat; the owner replied meanwhile; more than 3 auto-replies in that chat in an hour, 15 a day, or 40 a day across all chats.
- **Transparency:** every decision is logged per chat (sent, held for you, not needed, couldn't send, with the reason and the text). Auto-sent messages are marked "Auto-reply" in the chat and in the message's source sheet.
- **Rollout:** the owner tests with their own second number and one or two contacts before using it more widely.

