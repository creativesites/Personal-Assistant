# Zuri Android — Risks and Open Questions

> Part of the Zuri Android initial engagement, 2026-11-24.
> **Risks:** likelihood/impact are High/Med/Low, each with an owner suggestion and a mitigation.
> **Open questions:** each needs a product-owner answer. Where the architecture assumes a default, the default is stated and recorded in `DECISIONS.md`.

## 1. Risk register

| ID | Risk | L | I | Mitigation | Where handled |
|---|---|---|---|---|---|
| R-01 | **Notification coverage is lower than users expect.** No history; nothing for open or muted chats; Signal hides content; Gmail gives snippets only; Android 15+ redacts OTP-bearing messages. | High | High | Honest per-source coverage indicator; "content unavailable" states; history only through the cloud WhatsApp link or WhatsApp chat-export import; never promise completeness in copy | ARCHITECTURE §5, DESIGN_REVIEW |
| R-02 | **OEM battery killers unbind the listener** (Xiaomi, Oppo, Vivo, Huawei, some Samsung) | High | High | Listener-health heartbeat; `requestRebind`; per-OEM guidance screen; Diagnostics shows "last captured" | ARCHITECTURE §5.6 |
| R-03 | **Small local models extract unreliably** (missed or invented commitments, wrong dates) | Med | High | Split schema (core / gated); constrained JSON decoding where the runtime supports it; strict validation; confidence + provenance on every item; dates resolved in code; user confirm/correct loop; eval harness with labelled fixtures before release | ARCHITECTURE §6, IMPLEMENTATION_PLAN M3–M4 |
| R-04 | **Device fragmentation**: many target users (Zambia-first) have 3–4 GB RAM phones that can't run a 2B model well | High | High | Three capability tiers; the deterministic intelligence (health, cadence, reminders, rule-based commitment detection) works with **no model**; optional cloud AI with explicit consent | ARCHITECTURE §6.3 |
| R-05 | **Backend changes (auth, sync, idempotency, reconciliation) are not approved or get deprioritised** by the web/backend track | Med | High | Local-only product ships value independently (M1–M6); cloud milestones gated; RFCs written as small, additive, non-breaking changes | IMPLEMENTATION_PLAN §Backend RFCs |
| R-06 | **Conflicts with the concurrent web/backend agent** (shared `main`, auto-deploy) | High | Med | Android lives in `apps/android` (new path); backend RFCs land as separate, reviewed changes coordinated with the backend owner; Android never edits existing routes or migrations itself | DECISIONS D-02 |
| R-07 | **Duplicate data** between phone-captured and server-ingested WhatsApp messages | High | Med | Fingerprint reconciliation (chat key + sender + normalised body hash + time window); server endpoint G5; phone-captured rows stay `provisional` until merged; user-visible merge review for ambiguous matches | DATA_OWNERSHIP_AND_SYNC §6 |
| R-08 | **Cross-workspace leakage** (business A context reaching business B prompts) | Med | High | Workspace id on every row; retrieval filtered at the DAO layer (not in prompts); prompt assembler refuses mixed-scope context unless the user explicitly widens scope; tests that assert isolation | ARCHITECTURE §8, SECURITY_AND_PRIVACY §5 |
| R-09 | **Silent remote processing** of private content | Low | Critical | Single `PrivacyGate` through which *every* network AI call passes (embeddings included); default deny; per-purpose consent; "What leaves my phone" ledger; architecture test forbidding direct HTTP from AI modules | SECURITY_AND_PRIVACY §4 |
| R-10 | **Play policy rejection**: notification-access disclosure, READ_CONTACTS declaration (2027-01-27), FGS declaration video, AI-content reporting | Med | High | Prominent-disclosure screens; contact picker alternative; no FGS except user-initiated work; in-app "Report response"; Data Safety answers split by sync on/off | ANDROID_FEASIBILITY §3, IMPLEMENTATION_PLAN M15 |
| R-11 | **WhatsApp ToS**: automated messaging from the user's account | Med | High | Phone never auto-sends; every send is a user tap; cloud scoped automation stays an explicitly approved existing feature with its audit log | DECISIONS D-11 |
| R-12 | **Play Payments policy vs mobile-money subscription checkout.** Selling digital subscriptions in-app generally requires Google Play Billing [K — verify for Zambia and current alternative-billing programmes]. The web's manual Airtel/MTN flow likely cannot be offered inside the Play app as-is. | High | High | Open question Q-09. Options: no in-app purchase (account managed on web), Play Billing, or an eligible alternative-billing programme | RISKS Q-09 |
| R-13 | **MeetingMind licence/ownership unclear** (public repo, no LICENSE) | Low | High | Confirm ownership before copying; `PROVENANCE.md` per copied file | Q-03 |
| R-14 | **LiteRT-LM / model artifact availability** (gated downloads, format churn, MediaPipe deprecation) | Med | Med | Runtime behind `LanguageModel` seam; catalog is data, not code; llama.cpp fallback adapter evaluated in the M0 spike | ARCHITECTURE §6 |
| R-15 | **Android 17 per-app memory limiter** kills a 2–3 GB inference process | Med | Med | Inference in a separate `:llm` process; model sized by measured headroom; `am memory-limiter` testing on API 37 | ARCHITECTURE §6.5 |
| R-16 | **WebView document rendering** is slow or memory-heavy on low-end devices | Med | Med | M0 spike measures render time for invoice/proposal on a 4 GB device; fallback to server render when connected; native simple layout as last resort | DECISIONS D-09 |
| R-17 | **Untracked `docs/mobile/` and `design/mobile/` are swept into an auto-deploying commit** by the other agent's `git add -A` | Med | Low | Documentation only; the product owner decides when and how to commit them (separate commit, or a branch exception) | Q-14 |
| R-18 | **Sensitive data at rest on a lost/stolen phone** | Med | High | SQLCipher + Keystore-wrapped key; app lock; biometric vault for sensitive categories; remote session revoke (needs G1 revocation); exclusion from backups | SECURITY_AND_PRIVACY |
| R-19 | **Exposed production secret** (`INTERNAL_API_SECRET` in CLAUDE.md) used to mint tokens for any account | High | Critical | Rotate now (not Android work); Android never uses it | AUDIT §5 |
| R-20 | **Scope size**: full parity across ~60 working web pages is a multi-quarter effort | High | Med | Milestones deliver a usable product early (local personal intelligence by M6); parity-heavy CLOUD screens reuse shared list/detail scaffolding; online-only BI screens are thin | IMPLEMENTATION_PLAN |
| R-21 | **Third-party data**: messages from people who never consented to Zuri | Med | Med | Data stays on device by default; upload of captured messages is a separate, explicit permission; per-conversation exclusion; retention limits | SECURITY_AND_PRIVACY §7 |

## 2. Open questions for the product owner

Each question lists the **default the plan assumes** if unanswered. Defaults are proposals, not approvals.

| ID | Question | Why it matters | Default assumed |
|---|---|---|---|
| Q-01 | **Workspace model.** Should Android introduce multiple business workspaces, each isolated, plus Personal? And should the server gain a `workspace_id` (RFC G9)? | Server has no partition; the brief requires isolation | Device workspaces: 1 Personal + N Business. Cloud account data maps into workspaces by rule plus user review. Server RFC proposed but not required for M1–M9. |
| Q-02 | **Remote AI provider for Android.** When the user allows cloud AI, should it go only through the Zuri backend (`services/api` → intelligence), or may the phone call a BYOK provider directly? | Privacy boundary, key handling, cost | Zuri backend only, plus optional device BYOK (key in Keystore), both behind PrivacyGate and per-purpose consent |
| Q-03 | Confirm **MeetingMind is owned by the same entity** and may be copied into Zuri | Licence | Assume yes after confirmation; nothing copied before |
| Q-04 | **Minimum device.** Support phones without a usable local model (≤4 GB RAM)? | Market reach (Zambia-first) vs quality | Yes: "Essential" tier with deterministic intelligence and optional cloud AI. minSdk 29. |
| Q-05 | Are **captured notification messages ever uploaded** to the Zuri cloud? If so, which sources? | Third-party data, Data Safety, server load | Off by default. Per-source opt-in. WhatsApp only in the first release of upload. |
| Q-06 | **Offline document numbering.** Device-reserved number ranges, provisional numbers until sync, or local-only numbering for local-only workspaces? | Invoices must not collide or skip | Local-only workspace: device numbering. Cloud-bound workspace: provisional `DRAFT-…` until finalised online. Finalise offline only if a reserved block exists (needs server RFC). |
| Q-07 | **Document rendering.** Approve the WebView rendering of `@zuri/pdf-templates` (identical to web) over a native re-implementation? | Fidelity vs runtime cost | WebView (pending the M0 performance spike) |
| Q-08 | **Voice notes.** On-device transcription (sherpa-onnx + Whisper/Omnilingual for Bemba/Nyanja)? | Large models, privacy, value | Not in v1; cloud transcription only with consent |
| Q-09 | **Billing in the Play app.** Hide purchase flows, adopt Play Billing, or pursue alternative billing? | Play Payments policy | Hide purchase in-app; show plan status; manage on the web (verify policy fit, R-12) |
| Q-10 | **Admin console and marketing site excluded** from Android? | Parity requirement | Exclude (D-12) |
| Q-11 | **App identity**: name "Zuri" is a placeholder (and MeetingMind already has a mascot named Zuri). Package name? Play developer account? | Play listing, package id is permanent | Working package `app.zuri.android` (placeholder); do not publish until confirmed |
| Q-12 | **Distribution for beta.** Play internal testing (recommended) vs sideloaded APK? | Android 13+ "restricted settings" blocks notification access for sideloaded apps without extra user steps | Play internal testing track |
| Q-13 | **Group chats.** The server analyses no groups. Should the phone analyse group notifications locally? | Volume, privacy, value | Capture and display groups; no AI extraction by default; per-group opt-in |
| Q-14 | How should the new `docs/mobile/` and `design/mobile/` files be **committed**, given main auto-deploys? | Avoid surprise deploys | Owner commits them, or instructs Claude to |
| Q-15 | **Backend RFC ownership**: will the web/backend agent implement G1–G9, or should the Android track implement them in coordinated, separate commits after approval? | Conflict avoidance | Android track drafts RFCs; backend owner approves and schedules |
| Q-16 | **Cloud scoped automation from the phone.** Should Android expose the existing cloud auto-send grants (server sends via Baileys)? | ToS and trust | Yes, read and revoke; creating grants requires a confirmation step |
| Q-17 | **Device contacts write-back.** Should Zuri create or edit Android contacts? | Play policy: WRITE_CONTACTS ends for API 38+ targets | No. Use `ACTION_INSERT` intents only. |

## 3. Assumptions made independently (recorded, low risk)

- Kotlin + Jetpack Compose + Material 3 + Hilt + Room/SQLCipher + WorkManager + Coroutines/Flow; **no Kotlin Multiplatform** (no concrete benefit today; the domain modules are kept platform-free so it could be revisited).
- `compileSdk 37`, `targetSdk 36` (Play requirement since 2026-08-31), `minSdk 29`, arm64-v8a only, 16 KB-aligned native libraries.
- The Android app lives in this monorepo under `apps/android` and does not join the npm workspace.
- English first. Strings externalised from day one (MeetingMind has localisation work to learn from).
