# Zuri Android — Implementation Plan

> Part of the Zuri Android initial engagement (deliverable 2 of 3), 2026-11-24.
> **Status: proposed. No implementation begins until the product owner explicitly approves this plan and the design (`DESIGN_REVIEW.md`).**
>
> **Complexity:** S ≈ 1–2, M ≈ 3–5, L ≈ 6–10, XL ≈ 10+ engineer-weeks. These are planning estimates for one experienced Android engineer working with AI assistance, not commitments. They will be re-estimated after the M0 spikes.

## 0. Progress log

| Date | Event |
|---|---|
| 2026-11-24 | Product owner approved the plan and design ("approved, you can get started"), and required light and dark modes for every screen. Proposed defaults in `DECISIONS.md` and `RISKS_AND_OPEN_QUESTIONS.md` are treated as accepted unless revised. |
| 2026-11-24 | Backend session completed G2: `INTERNAL_API_SECRET` rotated and scrubbed. It built a Clerk JWT verifier (G1 groundwork) and agreed the `clerk-exchange`/logout contract with per-device revocation (`device_sessions`). Q-09 resolved: no billing UI on Android, only a global 402 handler. |
| 2026-11-24 | **M1 started** in `apps/android` (see `apps/android/README.md`). |
| 2026-11-25 | **M1 complete** (commit `32a8d17`): 51 tests, 14 light/dark screenshot baselines, APK verified to have no INTERNET permission. |
| 2026-11-25 | Product owner decision D-21: with sync on, chats mirror WhatsApp (media, replies, reactions, exact order). Real-device testing on the owner's Galaxy S20 over wireless debugging is available on request. |
| 2026-11-25 | **M0 notification spike, first result** (Galaxy S20, Android 13, WhatsApp): the WhatsApp notification `shortcutId` **is the chat JID**: `<digits>@g.us` for groups, `<digits>@lid` (WhatsApp's privacy id, not `@s.whatsapp.net`) for one-to-one chats. Zuri's `chat_key` is therefore the JID. Cloud reconciliation (DATA_OWNERSHIP_AND_SYNC §6) needs the server's `@lid` ↔ phone mapping. |
| 2026-11-25 | **Security incident, fixed (`aab62e5`).** Since M1 the database was keyed with 32 zero bytes: SQLCipher keeps a reference to the key array, which DataModule zeroed after building the database. Found while investigating slow connections, and verified on the S20. The fix: a raw 256-bit key owned by SQLCipher, a one-off in-place rekey of existing databases (data kept), and Privacy Center now proves the file rejects blank and zero keys. On-device tests cover it. |
| 2026-11-25 | **M3 started.** Q-03 resolved: the official `litert-community/gemma-4-E2B-it-litert-lm` is not gated and is Apache-2.0 (2.59 GB, sha256 published). Runtime: LiteRT-LM 0.20.0 (structured JSON output, embeddings and benchmark built in). |
| 2026-11-25 | **M3 first on-device run** (Galaxy S20, Exynos 990, 7.8 GB, CPU backend, LiteRT-LM 0.20): Gemma 4 E2B downloaded (2.59 GB, SHA-256 verified, survived a pause and a real network drop) and answered correctly. It loads in 10 s the first time and 1.0 s with the runtime cache, starts answering in 1.4 s, decodes about 9–10 tokens/s (about 7 words/s), and uses about 1.7 GB of RAM. |
| 2026-11-25 | Backend shipped **G3 messaging slice** (`7151b67`, `docs/SYNC_FEED.md`): the change feed, exact history paging and D-21 fields (order, quotes, media, reactions, deletes, edits). M9 can build against it once M7 (sign-in, G1) exists. |
| 2026-11-25 | **M2 built**: `:engine:ingest`, `:feature:sources`, `:feature:inbox`, database v2. Acceptance on real devices (M0 notification spike, 7-day dogfood, callback timing) is still owed. |

**M0 note:** the M0 runtime, notification and render spikes need physical reference devices, which this environment doesn't have. They remain prerequisites for M2/M3/M11 and are scheduled before those milestones. M1 does not depend on them. The storage spike (SQLCipher + Room) is folded into M1.

**M1 deviations:**
- None on SDK levels: compileSdk 37.2 (Compose 1.13 requires at least 37.1), targetSdk 36, minSdk 29, as planned.
- M1 ships with **no INTERNET permission** (stronger than planned).
- Workspaces and the context switcher landed early (they were M5); full scope enforcement remains M5.

**M2 deviations:**
- Ingest runs in-process: a single conflated consumer instead of WorkManager `OneTimeWork`. The bound listener keeps the process alive, and pending rows survive a kill and are processed on the next start.
- No generic adapter: listing arbitrary apps needs `QUERY_ALL_PACKAGES` (Play-restricted). The nine supported apps are declared in `<queries>`.
- Identity resolution is minimal: each message stores the sender's name and key. The `person` table arrives with M4/M6.
- When a sender deletes a message, Zuri drops the text and its edit history instead of keeping it.
- Golden fixtures are synthetic until the M0 spike supplies real, anonymised captures.

## 1. Sequencing principles

1. **A useful local product first.**
   - M1–M6 deliver a complete local-first personal intelligence app with no backend change.
   - Cloud milestones (M7–M9) are gated on backend RFCs and can be re-ordered without blocking local work.
2. **The brief's order is respected, with dependencies made explicit:**
   - Workspaces (brief item 11) move earlier, to M5. Every row needs `workspace_id` from the first schema, and Business Studio, documents and import mapping all depend on the context engine.
   - The Document Engine can start in parallel after M5, because local documents need no cloud.
3. **Every milestone ships behind tests** and ends in a usable internal build.
4. **No edits to existing web/backend code from the Android track.** Backend work is RFC → approval → coordinated implementation (§4).

## 2. Dependency graph

```
M0 Approvals & spikes
 └─ M1 Foundation ──┬─ M2 Notification ingestion ─┐
                    ├─ M3 Local AI runtime ────────┼─ M4 Local Neural Layer ─ M5 Context & workspaces ─┬─ M6 Personal intelligence
                    │                              │                                                  ├─ M11 Document Engine (local) ──┐
                    │                              │                                                  │                                 │
                    └─ (G1) ─ M7 Cloud account ─── (G3) ─ M8 Historical import ─ (G3,G4,G5,G7) ─ M9 Incremental sync & push       │
                                                                     │                                       │                      │
                                                                     └──────────── M10 Business Studio ──────┴── M11 (cloud parts) ─┤
                                                                                         └─ M12 Business Intelligence               │
                                                                                                    └─ M13 Remaining parity ─ M14 Mobile-native ─ M15 Hardening & release
```

## 3. Milestones

### M0 — Approvals, prerequisites and technical spikes
- **Scope.**
  - Product-owner review of the audit, architecture and design.
  - Answers to the open questions (Q-01…Q-17).
  - MeetingMind ownership confirmed (Q-03).
  - Backend RFC approvals (G1, G3, G4, G5, G7; G6 and G9 optional).
  - Four time-boxed spikes in a throwaway repo, not `apps/android`:
    1. **Runtime spike:** LiteRT-LM with Gemma 4 E2B/E4B and EmbeddingGemma on the three reference devices. Measure load time, tokens/s, peak memory, and structured-output reliability on 50 labelled WhatsApp-style messages.
    2. **Notification spike:** capture real notifications from WhatsApp, WA Business, Telegram, Signal, Messenger, Gmail and Google Messages. Record extras shapes; confirm whether `shortcutId` equals the chat JID; observe OTP redaction and the re-post behaviour.
    3. **Render spike:** bundle `@zuri/pdf-templates` and react-pdf into an offline WebView. Render an invoice and a 6-page proposal on a 4 GB device and measure time and memory.
    4. **Storage spike:** Room with SQLCipher and FTS5 on Room 2.7+/3.x bundled-driver path, plus a re-key and a migration.
- **Affected modules.** None (spikes are throwaway).
- **Deliverables.**
  - A spike report with numbers.
  - Updated D-08, D-09 and the device tiers.
  - Signed-off decisions.
- **Acceptance.**
  - Each spike has a go/no-go recorded.
  - Every PO-APPROVAL decision is approved or amended.
- **Risks.** Runtime or model availability (R-14); WebView performance (R-16).
- **Complexity.** M.
- **Blockers.** Product-owner availability; reference devices.

### M1 — Foundation
- **Scope.**
  - `apps/android` Gradle project, version catalog, convention plugins and module skeleton (ARCHITECTURE §3).
  - Hilt, Navigation, Compose design system (`:core-ui` tokens from the approved design), light and dark themes.
  - App shell: navigation bar, top bar with context-chip placeholder, adaptive scaffold.
  - Encrypted Room (SQLCipher) with the common columns, plus the `workspace` table and a single Personal workspace.
  - Tink DataStore; Keystore key hierarchy; app lock; FLAG_SECURE and recents protection.
  - Backup exclusion rules; redacting logger.
  - Architecture tests (module graph, no HTTP in AI modules).
  - CI workflow `android.yml`, path-filtered.
  - Local onboarding skeleton: welcome, privacy explanation, local vs cloud choice.
- **Affected modules.** `:app`, `:core-ui`, `:core-security`, `:core-common`, `:data:local`, `:domain`, `:feature:onboarding`, `:feature:settings`, `:feature:privacy`.
- **Prerequisites.** M0 approvals (D-01, D-02, D-03, D-15, D-18).
- **Deliverables.** An installable internal build that opens behind app lock, with an empty Today screen and a Privacy Center skeleton.
- **Tests.**
  - DB open, re-key and migration tests.
  - Key-hierarchy tests (instrumented).
  - Backup-rules test.
  - Redaction tests.
  - Screenshot tests of the design-system components.
  - Module-graph check.
- **Acceptance.**
  - A cold start under 1.2 s on the Standard reference device.
  - The DB file is unreadable without the key (verified).
  - `adb backup` and device transfer contain no DB, DataStore or key material.
  - CI is green and path-filtered.
- **Risks.** SQLCipher and Room driver compatibility (resolved by the M0 storage spike).
- **Complexity.** L.
- **Blockers.** None after M0.

### M2 — Notification ingestion
- **Scope.**
  - NotificationListenerService.
  - Source registry and adapters (WhatsApp, WA Business, Telegram, Signal, Messenger, Slack, Gmail, Google/Samsung Messages, generic).
  - Capture writer (encrypted `capture_raw`); ingest worker (normaliser, chat-key resolver, identity resolver, dedup, placeholder detection).
  - Exclusions, retention and workspace assignment rule (Personal only, until M5).
  - Prominent-disclosure flow and source-selection screen; listener health and OEM guidance.
  - Inbox list and conversation detail (read-only), with provenance and coverage badges.
  - Selective deletion.
- **Affected modules.** `:engine:ingest`, `:feature:sources`, `:feature:inbox`, `:data:local`.
- **Prerequisites.** M1; M0 notification spike.
- **Deliverables.** Real messages appear in the Zuri Inbox from user-selected apps, deduplicated, with honest coverage states.
- **Tests.**
  - Golden-notification fixtures per adapter (from the spike, anonymised).
  - Fuzzed bundles.
  - Dedup tests on cumulative re-posts, edits and deletes.
  - Exclusion and retention tests.
  - Listener rebind instrumented test.
- **Acceptance.**
  - Across a 7-day dogfood: ≥ 99% of notifications from enabled sources stored exactly once.
  - Zero captures from non-enabled packages.
  - Callback p95 < 5 ms.
  - The OTP-redacted placeholder is shown, not a parse error.
- **Risks.** R-01, R-02, adapter drift.
- **Complexity.** L.
- **Blockers.** None.

### M3 — Local AI runtime
- **Scope.**
  - `:core-ai` copied from MeetingMind (PROVENANCE.md) and refactored: catalog as data, LiteRT-LM adapter in the `:llm` process, installer, downloader and verifier, DeviceProfile and benchmark, embeddings with versioning, AiRouter, JsonExtractor.
  - PrivacyGate and the egress ledger (remote provider stubbed off).
  - Model library, download, compatibility, model settings, AI processing preferences, and "What leaves my phone" screens.
  - Essential-tier fallbacks: rules-only extraction and extractive summary.
- **Affected modules.** `:core-ai`, `:core-ai:remote` (gated stub), `:feature:models`, `:feature:privacy`.
- **Prerequisites.** M1; M0 runtime spike; Q-03.
- **Deliverables.** Install a model, run a benchmark, see the compatibility verdict, and see the device's AI tier.
- **Tests.**
  - Ported MeetingMind tests (verifier, downloader with MockWebServer, resolver, JSON extractor).
  - PrivacyGate tests (default deny, ledger written, SECRET never allowed).
  - Konsist test: no HTTP outside `:core-ai:remote` and `:data:remote`.
  - On-device benchmark instrumented test.
- **Acceptance.**
  - Resumable download survives a kill and airplane-mode toggling.
  - A corrupted file is rejected.
  - No network AI call is possible without a GateToken (test-proven).
  - Engine crashes in `:llm` don't crash the app.
- **Risks.** R-14, R-15.
- **Complexity.** L.
- **Blockers.** Q-03 (licence).

### M4 — Local Neural Layer (perception, memory, Ask Zuri)
- **Scope.**
  - Perception pipeline: Tier A batch extraction, Tier B gated, validators, date resolution, confidence.
  - Writers for memories, commitments, tasks, events and life events.
  - Conversation state updater (port of the server's Redis rules).
  - Emotion derivation; voice profile; reply drafts; conversation summary.
  - Memory Inspector: list, filter, source, confirm/edit/reject, delete.
  - Commitments list.
  - Ask Zuri (scoped hybrid retrieval with citations; NL query port of `ASK_ANYTHING`).
  - Reply sheet with RemoteInput tap-to-send.
  - Learning loop (feedback rows).
- **Affected modules.** `:engine:perception`, `:engine:retrieval`, `:feature:memory`, `:feature:ask`, `:feature:inbox`.
- **Prerequisites.** M2, M3.
- **Deliverables.** The "What did I promise Chanda?" journey works fully offline, with a source link to the original message.
- **Tests.**
  - The extraction eval harness: labelled fixtures, precision and recall per field. Thresholds set in M0, e.g. commitments P ≥ 0.85, R ≥ 0.7 on the Standard tier.
  - Grounding validator tests (rejects invented ids and quotes).
  - Date-resolution tests.
  - Retrieval scope tests.
  - Reply-sheet instrumented test with a fake notification.
- **Acceptance.**
  - Every memory shows provenance and confidence.
  - No memory is created without a valid source id.
  - The Essential tier still produces commitments via rules.
  - Answers cite sources or say they don't know.
- **Risks.** R-03.
- **Complexity.** XL.
- **Blockers.** Eval fixtures (need labelled data: synthetic plus the owner's consented samples).

### M5 — Context and workspaces
- **Scope.**
  - Workspace model (Personal + N Business); Person/Relationship split; conversation → workspace rules and reassignment.
  - ContextScope enforcement in repositories, the retriever and the prompt assembler.
  - Context switcher (bottom sheet) and tinted chrome; Hybrid view selection.
  - Explicit "widen scope" with a banner and a ledger entry.
  - Business destinations appear when a business workspace is active.
  - Workspace brand profile (local).
- **Affected modules.** `:domain`, `:data:local`, `:engine:retrieval`, `:feature:*` (chrome).
- **Prerequisites.** M4; D-04 approved.
- **Deliverables.** Two business workspaces plus Personal, with proven isolation.
- **Tests.**
  - Property-based isolation tests (randomised multi-workspace data; assert no out-of-scope record appears in any assembled prompt, search result or document).
  - Reassignment moves derived memories.
- **Acceptance.** The isolation suite passes, and a manual red-team checklist (10 cross-context prompts) shows no leakage.
- **Risks.** R-08.
- **Complexity.** L.
- **Blockers.** D-04.

### M6 — Personal intelligence
- **Scope.**
  - People list and Person profile (personal tabs).
  - Relationship detail with health and cadence (Kotlin ports of `health.py`, `cadence_learner.py`, `relationship_memory.py`, verified against server golden outputs).
  - Daily Brief (local), recommendations queue (local temporal nudges, Reality Engine L1 auto-resolve).
  - Goals and goal detail; Life Timeline (reflection port); Calendar (device calendar read with disclosure, plus local events and commitments).
  - Knowledge (notes and imported files with on-device embeddings).
  - Device contacts with the Play-compliant declaration path, or the Contact Picker.
  - Notifications screen (local).
- **Affected modules.** `:engine:relate`, `:engine:brief`, `:feature:today`, `:feature:people`, `:feature:goals`, `:feature:timeline`, `:feature:calendar`, `:feature:knowledge`.
- **Prerequisites.** M5.
- **Deliverables.** A complete local personal intelligence app: the first dogfoodable release.
- **Tests.**
  - Parity tests for the health/cadence ports (same inputs produce the same score as the server's Python on fixtures).
  - Brief generation tests.
  - Calendar permission-flow tests.
- **Acceptance.**
  - The brief is built by 07:00 local time with no network.
  - A recommendation auto-resolves when the user replies.
  - All personal screens work in airplane mode.
- **Risks.** R-04 (low-end devices: deterministic features must carry them).
- **Complexity.** XL.
- **Blockers.** None.

### M7 — Cloud account connection
- **Scope.**
  - Clerk Android SDK; the G1 exchange; token storage and re-exchange; account binding.
  - Connect flow and account summary; 401/402 handling (`upgradeRequired`/`readOnly`).
  - Read-through browsing of cloud modules with caching (contacts, conversations, documents, projects, deals, career, BI); "may be out of date" labelling.
  - Cloud WhatsApp status and linking (QR/link code via the existing endpoints and socket).
  - Foreground socket (with the G6 fixes if available).
  - Disconnect flow.
- **Affected modules.** `:data:remote`, `:core-sync` (cache), `:feature:sync`, `:feature:settings`.
- **Prerequisites.** M1; **G1 implemented**.
- **Deliverables.** Sign in, see cloud data, disconnect, and keep local data.
- **Tests.**
  - Contract tests against recorded fixtures.
  - Token-expiry and re-exchange tests.
  - 402 handling tests.
  - Disconnect retains data.
- **Acceptance.**
  - `INTERNAL_API_SECRET` appears nowhere in the APK (CI grep).
  - Disconnect followed by airplane mode leaves all local data intact.
- **Risks.** R-05.
- **Complexity.** M.
- **Blockers.** G1.

### M8 — Historical cloud import
- **Scope.**
  - Import discovery, category selection with sensitivity badges, workspace mapping review, import planner, batched resumable workers, checkpoints, identity resolution, provenance, and the summary screen.
  - "Recent snapshot" mode if G3 paging is not yet available.
- **Affected modules.** `:core-sync`, `:feature:sync`.
- **Prerequisites.** M5, M7; G3 paging (full mode).
- **Deliverables.** Journey 7 (import existing cloud history).
- **Tests.**
  - Resume after kill at random points (fault injection).
  - Dedup idempotency: re-running the import creates zero duplicates.
  - Mapping rules tests.
- **Acceptance.**
  - The import of a seeded 10k-message, 1k-contact account completes on the Standard device in under 15 minutes on Wi-Fi.
  - Zero duplicates after a forced re-run.
- **Risks.** R-07.
- **Complexity.** L.
- **Blockers.** G3 (full mode).

### M9 — Incremental sync, outbox, conflicts, push
- **Added by D-21 (2026-11-25):** with sync on, chats mirror WhatsApp: full cloud thread, media (encrypted local cache, Wi-Fi-only download by default), replies, reactions, and exact WhatsApp ordering (WhatsApp timestamp, then server sequence). Phone captures are reconciled into cloud rows; unmatched ones are marked "approximate time". Needs the G3 change feed to carry ordering, quote, reaction and media metadata.
- **Scope.**
  - Change-feed client; outbox with idempotency; conflict policies and resolver UI; tombstones.
  - Pause and resume; sync status and history.
  - Device-message reconciliation (G5) with a duplicate-review queue.
  - Upload consents (P4) per source and category.
  - FCM registration and data-message-triggered pull (G7).
  - Cloud send (WhatsApp via the cloud session), once G4 is live.
- **Affected modules.** `:core-sync`, `:data:remote`, `:feature:sync`, `:feature:inbox`.
- **Prerequisites.** M8; **G3, G4, G5, G7**.
- **Deliverables.** Journeys 8 and 9 (configure sync; disconnect while retaining data), plus live two-way sync.
- **Tests.**
  - Fault-injection suite (drop, duplicate and reorder responses; concurrent web edits).
  - Idempotency end-to-end (a retried send results in exactly one WhatsApp message on a test number).
  - Conflict policy tests for each class.
- **Acceptance.**
  - A 72-hour soak with concurrent web edits shows no divergence: a checksum of synced entities matches.
  - No duplicate sends.
- **Risks.** R-05, R-07.
- **Complexity.** XL.
- **Blockers.** G3, G4, G5, G7.

### M10 — Business Studio
- **Scope.**
  - Studio home and dashboard; CRM (contacts, companies, customers with LTV); leads.
  - Opportunity pipeline board and detail; projects, project detail, tasks, milestones and native timer.
  - Products/services/catalog (families, variants, pricing tiers); inventory (movements, locations; cloud-ledger aware); suppliers and POs; sales orders.
  - Business feed and "Zuri Noticed"; action bundles (local detection, cloud execution).
  - Business knowledge and rules; brand profiles and signatures.
  - Local-only workspaces get full local CRUD; cloud-bound workspaces use the API and outbox.
- **Affected modules.** `:feature:studio`, `:data:*`, `:engine:perception` (Tier B → bundles).
- **Prerequisites.** M5; M9 for cloud write parity (read parity possible after M7).
- **Deliverables.** Journeys 10 (switch to business) and 14 (review a recommendation, business variant).
- **Tests.**
  - Repository tests per entity.
  - Stock ledger invariants (levels never edited directly).
  - Timer uniqueness (server 409 mirrored locally).
  - Screenshot tests.
- **Acceptance.** Every Business Studio row in the parity matrix is reachable and functional for both local-only and cloud-bound workspaces.
- **Risks.** R-20 (scope).
- **Complexity.** XL.
- **Blockers.** None for local; G4 for cloud writes.

### M11 — Document Engine
- **Scope.**
  - Type registry (18 business types plus career passthrough); document model; deterministic calculator with server-parity golden tests; numbering per D-10.
  - Context selection; AI drafting (local, or gated cloud); the missing-information workflow.
  - Template selector; WebView PDF renderer with versioned template asset built from `packages/pdf-templates`; DOCX export; HTML preview.
  - Validation panel; provenance inspector; version history (revise, duplicate, convert quotation → invoice → receipt); status lifecycle.
  - Share sheet; cloud send (`/send`); signatures.
  - Document Studio home.
- **Affected modules.** `:engine:docs`, `:core-docs`, `:feature:documents`.
- **Prerequisites.** M5 (local), M3 (AI drafting), M0 render spike; M9 for cloud-bound finalisation and numbering (G4).
- **Deliverables.** Journeys 12 and 13: create a client proposal from business context, then edit, validate and export it.
- **Tests.**
  - Calculator parity: thousands of randomised line sets compared with the server's `computeTotals` outputs, produced by a Node script in CI.
  - Render snapshot tests for all 8 business templates.
  - The missing-info workflow never fills unknown values (test: the AI draft omits a field, so the field stays empty and blocks finalisation).
  - Numbering uniqueness under retries.
- **Acceptance.**
  - Every figure in an exported PDF is computed by code (verified by test).
  - PDF output is pixel-equivalent to web output for the same `render-context` (tolerance threshold).
  - Offline creation and export work in a local-only workspace.
- **Risks.** R-16; numbering (D-10).
- **Complexity.** XL.
- **Blockers.** D-09, D-10.

### M12 — Business Intelligence
- **Scope.**
  - BI screens composed for mobile: executive summary, sales, customers, conversations, operations, opportunities, predictions, health score, ROI, timeline, campaigns. These are online, cached, and every chart has an "explain this" evidence sheet.
  - Natural-language business questions: local `ASK_ANYTHING` over local tables first; cloud `/api/search/ask` with consent.
  - Evidence-backed insight cards: every insight cites its source query or records.
- **Affected modules.** `:feature:bi`, `:feature:ask`.
- **Prerequisites.** M7 (online), M10.
- **Deliverables.** Journey 11 (ask a business intelligence question).
- **Tests.** DTO contract tests per analytics endpoint; NL→query tests over fixture DBs.
- **Acceptance.**
  - No metric is shown without a source.
  - Offline shows the last snapshot with its timestamp.
  - No fabricated zero-fallbacks: the web's zero-valued fallback-on-error pattern is **not** copied; errors are shown as errors.
- **Complexity.** L.
- **Blockers.** None beyond M7.

### M13 — Remaining web parity
- **Scope.** Every remaining in-scope row in the parity matrix:
  - Career OS (home, opportunities, CV Studio wizard, templates, health/ATS, documents). The mocked AI Suite is not ported.
  - Advisor companion parity: modes, memories, watch/narration, approval cards, automation grants (view and revoke).
  - Agents, escalations, broadcasts, knowledge brain (cloud KB), auto-response settings.
  - Organization and team; billing status (Q-09); BYOK management.
  - Settings parity: only the real toggles.
  - Voice-note transcription via cloud (consent).
  - Media send.
- **Prerequisites.** M7–M9.
- **Tests.** Contract and screenshot tests per screen.
- **Acceptance.** Every parity-matrix row is marked done, or explicitly deferred with product-owner sign-off.
- **Complexity.** XL.
- **Blockers.** The web's own broken endpoints (automation rules, enterprise tab, agent corrections) follow the web fixes.

### M14 — Mobile-native capabilities
- **Scope.**
  - Today widget (Glance); Quick Settings tile (pause capture).
  - Share-sheet import (WhatsApp "Export chat" .txt into a conversation with dedup; PDFs and images into Knowledge).
  - App shortcuts; Gemini Nano foreground rewrite (where available).
  - Optional on-device transcription (if Q-08 is approved).
- **Complexity.** M.

### M15 — Hardening, compliance, release
- **Scope.**
  - Threat-model verification; external penetration test; vault DB; encrypted export.
  - Accessibility audit; performance (baseline profiles, macrobenchmarks); battery study.
  - Localisation readiness.
  - Play compliance pack: disclosures, Data Safety, Contacts declaration, FGS video, AI content reporting, privacy policy.
  - Internal → closed → production tracks.
  - Retirement proposal for `apps/companion` and `apps/mobile`.
- **Acceptance.**
  - No High findings open from the penetration test.
  - Crash-free sessions ≥ 99.5% in the closed track.
  - Play review passed.
- **Complexity.** L.

## 4. Backend RFCs required (for approval and scheduling by the backend owner)

Each RFC is additive and backwards-compatible, and touches no existing behaviour except where it fixes a defect.

| RFC | Content | Needed by | Size | Notes |
|---|---|---|---|---|
| **G1 — Mobile auth** | `POST /api/auth/clerk-exchange` (verify the Clerk session JWT via JWKS, `azp` check; extract clerk-sync's find-or-create into a shared function); `jti`/token-version claim; `POST /api/auth/logout`; unified claims across login paths | M7 | S | Also: rotate `INTERNAL_API_SECRET` (independent, urgent) |
| **G2 — Secret rotation** | Rotate the exposed secret; remove it from CLAUDE.md | now | S | Not Android-specific |
| **G3 — Change feed** | Triggers maintaining `updated_at` plus a per-user `change_seq` on synced tables; add `updated_at`/`user_id` to `messages`; `sync_tombstones` via delete triggers; `GET /api/sync/manifest`, `GET /api/sync/changes`; cursor paging and `?before=` for messages; a side-effect-free message GET | M8 (paging), M9 | L | Trigger cost on hot tables (messages) needs measuring |
| **G4 — Idempotency** | `idempotency_keys` table; `Idempotency-Key` honoured on message send, document create, stock movements, PO actions; `POST /api/sync/mutations` | M9, cloud writes | M | Fixes the double-send defect |
| **G5 — Device messages** | `POST /api/device/messages:batch` with fingerprint matching against Baileys rows, `source='device'`, publishes `conversation:upsert`; optional upload of device analysis JSON | M9 | M | Supersedes `/api/companion/message` for Zuri Android |
| **G6 — Realtime fixes** | Add the missing psubscribe patterns; consistent payload envelope; handshake auth | M7 (nice), M9 | S | Fixes web too |
| **G7 — Push** | `device_tokens` table, `POST/DELETE /api/devices`, FCM fan-out for `notification:new`, `suggestion:ready`, `bundle:ready`, sync tickles (data messages contain no content) | M9 | M | |
| **G8 — Contracts** | OpenAPI generated from Zod via `@fastify/swagger`, published to `packages/contracts` | M7+ (optional) | M | Reduces DTO drift |
| **G9 — Workspaces** | `workspace_id` on workspace-scoped tables; default workspace per user; API filter | Later (optional) | L | D-04: not required for the device model |

Each RFC will be written as its own document (`docs/mobile/rfc/G*.md`) after approval of this plan. None is implemented by the Android track without explicit approval.

## 5. Cross-cutting quality gates (every milestone)

- Unit plus screenshot tests green; module-graph and Konsist architecture tests green.
- No new network path outside `:data:remote` and `:core-ai:remote`.
- Strings externalised; light and dark themes; font scale 200%; TalkBack pass on new screens.
- Docs updated: `FEATURE_INVENTORY` and parity status moved to "Android: done" only when it works end-to-end on a reference device.
- Clearly distinguish implemented from planned in release notes.

## 6. What is explicitly not in this plan

- iOS.
- Kotlin Multiplatform.
- Re-implementing server-only engines on device: web search, job scraping, agents' autonomous execution, ERP execution against server ledgers.
- Changing web behaviour.
- Any auto-send from the phone.
