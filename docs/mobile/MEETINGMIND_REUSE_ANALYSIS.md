# Zuri Android — MeetingMind Reuse Analysis

> Part of the Zuri Android initial engagement (audit phase). Read-only audit of `/Users/winstonzulu/Documents/GitHub/MeetingMind` at `48da219` (`release/1.0-paid-launch`, v51), 2026-11-24. No files modified, no Gradle run. Paths are relative to `app/src/main/java/com/craftflowtechnologies/meetingmind/` unless they begin with `app/`, `docs/`, `gradle/`.

## Verdict (principal architect)

1. **Copy-and-own** ~1.5–2k lines of MeetingMind's AI infrastructure into a new Zuri `:core-ai` module (and optionally `:core-docs`), with a `PROVENANCE.md` recording the source commit. Not a shared library or submodule — MeetingMind is a single-module shipping app with in-flight branches.
2. **Most valuable:** model catalog + resumable/SHA-256-verified downloader + WorkManager download worker; the `LanguageModel` seam; `LanguageModelFactory`/`ResilientLanguageModel` (one place that picks a model, records which model actually ran); the hybrid retriever design; the lenient-parse/strict-validate JSON pattern; the block-model DOCX/PDF exporters.
3. **Must change on the way in:**
   - the runtime adapter moves from MediaPipe LLM Inference (deprecated for mobile, see `ANDROID_FEASIBILITY.md` §5) to **LiteRT-LM** behind the same seam;
   - a real on-device embedder (EmbeddingGemma or similar), with vectors versioned by model+dimension (MeetingMind's 64-d/256-d mix scores 0);
   - **one `PrivacyGate`** that every network AI call passes through, embeddings included (MeetingMind decides per screen and has an open "summaries still go to Gemini" bug);
   - SQLCipher-encrypted Room, Keystore-wrapped secrets (MeetingMind stores API keys in plain DataStore and leaves `files/models/` in Auto Backup);
   - thermal/battery gating; a separate `:llm` process for native inference (copy the `:diarizer` pattern).
4. **Leave behind:** speech stack (unless voice-note transcription is approved — then sherpa-onnx + Whisper/Omnilingual for Bemba/Nyanja in a separate `:core-speech`), meeting/faith/learning engines, Circles/Firebase, RevenueCat, the Rive mascot.
5. **Blocker to resolve first:** MeetingMind's public repo has **no LICENSE file**. Confirm the same legal owner before copying (see `RISKS_AND_OPEN_QUESTIONS.md`).
6. Note the model-licence tension: MeetingMind avoided gated Gemma downloads; Gemma 4 (Apache 2.0) may remove that obstacle — verify that the chosen `.litertlm` artifacts are downloadable without click-through.

---

Repo: `/Users/winstonzulu/Documents/GitHub/MeetingMind` (remote `github.com/creativesites/MeetingMind`).
Paths below are relative to `app/src/main/java/com/craftflowtechnologies/meetingmind/` unless they start with `app/`, `docs/`, `gradle/` etc.

## 0. Repo state and the sibling worktree

- Main checkout is on branch **`release/1.0-paid-launch`** (head `48da219`, v51), with **uncommitted edits** (MainActivity, PostSessionAutopilot, companion, MeetMindDatabase...). AGENTS.md names a different "designated" branch (`claude/meetingmind-mvp-planning-7dgowm`), but `agents/STATUS.md` says the shipping branch is `release/1.0-paid-launch`. Extract from that branch.
- **`/Users/winstonzulu/Documents/GitHub/mm-wt-sync`** is a git worktree on branch **`wt-release-sync`**, head `5404774 "WIP merge: release/1.0-paid-launch + wt-aitext (does not compile yet)"`. It differs from the release branch in 79 files (+3355/-1481), mostly Circles, integrations and AI-text work, with staged and unstaged changes. **Don't extract from it.** It doesn't compile, and the AI-text changes it brings in aren't finished.
- Process rules in this repo: CLAUDE.md is 4 lines and points to AGENTS.md. Only one Gradle session at a time, on an 8 GB Mac. Merge, never rebase.
- **Naming collision:** MeetingMind already has a Rive mascot companion called **"Zuri"** (`core/companion/CompanionModel.kt`, `CompanionForm.ZURI`, `docs/mvp/ZURI_EXPERIENCE.md`, `ZURI_RIVE_BRIEF.md`). This is a UI mascot, not AI. It's only a branding note.

## 1. Build setup

| Item | Value | Source |
|---|---|---|
| AGP | 9.1.1 | `gradle/libs.versions.toml` |
| Kotlin | 2.2.10 (Compose compiler plugin) | same |
| KSP | 2.3.5 (Room compiler) | same |
| Compose BOM | 2024.09.00 (old; Rive is excluded on purpose so Compose stays at 1.7, see the comment in `app/build.gradle.kts`) | same |
| compileSdk / targetSdk / minSdk | 36 (minor 1) / 36 / **24** | `app/build.gradle.kts` |
| Modules | **one `:app` module** (`settings.gradle.kts`: `include(":app")`) | |
| DI | **None.** Manual construction, `object` singletons (`LlmEngineManager`, `SherpaEngineManager`, `MeetMindDatabase.getInstance`), and default constructor arguments. No Hilt, Koin or Dagger anywhere. | grep |
| Room | 2.7.0, DB version **32**, `exportSchema=true` (`app/schemas/`) | `core/database/MeetMindDatabase.kt` |
| WorkManager | 2.11.2 | |
| OkHttp | 4.12.0 (all cloud calls are hand-written REST/SSE/WebSocket, with no Google or OpenAI SDK) | |
| On-device LLM | `com.google.mediapipe:tasks-genai:0.10.35` | |
| Speech / VAD / diarization | `k2-fsa:sherpa-onnx:1.13.6@aar`, pulled from **GitHub Releases through a custom ivy repository** in `settings.gradle.kts` (not on Maven) | |
| Other notable | commons-compress (unpacks a .tar.bz2 model), java-diff-utils, pdfbox-android 2.0.27, ML Kit doc scanner + text recognition, Firebase BOM 34.17 (auth, firestore, messaging, appcheck-recaptcha), Credential Manager + googleid, RevenueCat 10.28, Media3 1.11, Rive 11.12, biometric 1.1.0 | |
| Native libs | Nothing in-repo (`jniLibs`/`cpp` don't exist). All native code comes from AARs: MediaPipe GenAI (`libllm_inference_engine_jni`), sherpa-onnx JNI + `libonnxruntime.so`, Rive. Native libraries are about 58 MB uncompressed. Debug builds set `useLegacyPackaging` to stay under GitHub's 100 MB limit. | `app/build.gradle.kts` (end) |
| llama.cpp / LiteRT-LM / ONNX GenAI / whisper.cpp | **Not used.** Whisper runs as ONNX through sherpa-onnx. Gemini Nano through AICore is probed **by reflection only**, and its SDK isn't a dependency (`ai/llm/AiCoreLanguageModel.kt`). | |
| Tests | 505 test files under `app/src/test` (JVM + Robolectric + Roborazzi screenshots). README says 870+ tests. | |

**THIRD_PARTY_NOTICES.md** lists Parakeet (CC-BY-4.0, attribution required), Silero (MIT), pyannote seg-3.0 (MIT), 3D-Speaker CAM++ (Apache-2.0), **Qwen2.5-1.5B (Apache-2.0)**, MediaPipe (Apache-2.0), sherpa-onnx (Apache-2.0), commons-compress, AndroidX/Firebase/OkHttp/Coil (Apache), fonts (OFL), Spurgeon (PD), Unsplash photos, and the Bible API.
**Gaps in the notices:** Qwen2.5-0.5B, DeepSeek-R1-Distill-Qwen-1.5B, Phi-4-mini, Whisper Turbo/Large-v3, Omnilingual ASR, Rive and pdfbox-android are in the catalog or dependencies but missing from the notices. Their licenses (Apache, MIT, Apache, MIT, Apache, MIT, Apache) are all permissive, so it's only a documentation gap. Zuri should write its own complete notices file.
**There's no LICENSE file in the MeetingMind repo** and the GitHub repo is public. Legally, code with no license is "all rights reserved". If craftflowtechnologies / the same founder owns both apps, copying is fine. Confirm that ownership before copying, and preferably add a LICENSE or an internal note.

## 2. Local LLM execution

**Runtime:** MediaPipe LLM Inference (`LlmInference`) runs `.task` bundles from `litert-community` on Hugging Face.

- `ai/llm/MeetingIntelligenceEngine.kt` (lines 1–60) defines **`interface LanguageModel`**:
  - `suspend generate(prompt, maxOutputTokens): AiResult<String>`
  - `generateStructured(prompt, responseSchema, ...)`: by default it just calls `generate`. Only the cloud backends enforce the schema.
  - `generateStream(...): Flow<AiStreamEvent>`: by default it wraps `generate` as one delta plus Completed. `AiStreamEvent` lives in `ai/cloud/GeminiTransport.kt`, an awkward dependency on the cloud package.
- `ai/llm/MediaPipeLanguageModel.kt` (69 lines) is the local implementation:
  1. Checks the model is installed (`ModelStorage`), finds its catalog entry, and checks the file exists.
  2. Sets the context budget to `contextLengthTokens` from the catalog (the KV-cache size of that `.task` build).
  3. Runs a RAM gate, `LocalModelFit.fits()`: the model file must be no more than half of total RAM, otherwise it returns `InsufficientMemory`. This exists because a native OOM is fatal and can't be caught.
  4. Runs on `Dispatchers.Default` through `LlmEngineManager.withEngine { engine.generateResponse(prompt) }`, which is a **blocking, synchronous** call.
  5. Maps `OutOfMemoryError`/`LinkageError`/`Exception` to typed `AiResult` failures.
- `ai/modelmanagement/LlmEngineManager.kt` (89 lines) is a process-wide singleton holding **at most one** native engine:
  - A coroutine `Mutex` makes it one generation at a time.
  - It reuses the engine when the model ID is unchanged, and closes the old one before loading a different model.
  - `release()` is **deferred-safe**: if a generation is running it sets `releasePending` and the holder closes the engine afterwards. Closing during generation is a native crash.
  - Options: `setModelPath`, `setMaxTokens(contextTokens)`, `setPreferredBackend(CPU)`. CPU is hard-coded, with no GPU/NPU selection.
- `ai/llm/AiCoreLanguageModel.kt` probes Gemini Nano through AICore by reflection (`com.google.mlkit.genai.prompt.Generation`). The ML Kit GenAI dependency isn't in the build, so **in practice this never runs**. It's a design hook only.

**Missing from the local runtime:**
- **No streaming.** `generateResponseAsync` isn't used.
- **No sampling parameters.** No temperature/topK/topP; no `LlmInferenceSession`, so there's no session reuse or KV-cache reuse across turns.
- **No grammar-constrained or JSON-mode decoding** on device.
- **No real cancellation.** Cancelling the coroutine can't interrupt `generateResponse`; the mutex is held until native generation ends.
- **No tokenizer access.** Context fitting uses a fixed **3.5 characters per token** estimate (`ai/llm/TranscriptChunker.kt`, `RealMeetingIntelligenceEngine.kt` around line 424), with 700 tokens reserved each for prompt overhead and output.
- Context sizes are small: 4096 tokens for the 1.5B/3.8B models and **1280** for the 0.5B. Everything is chunked map-then-reduce (`RealMeetingIntelligenceEngine`: chunk extraction, then a synthesis pass, then a title).

**Strategic risk:** Google has been steering on-device LLM work from the MediaPipe LLM Inference API to **LiteRT-LM** (as I understand it, MediaPipe GenAI is now in maintenance or deprecated). Verify this before building on it. For Zuri, keep the `LanguageModel` seam but plan the runtime adapter for LiteRT-LM, or llama.cpp/GGUF if you need GBNF grammar-constrained JSON. Grammar constraints matter for reliable extraction on 1–4B models.

## 3. Model management

**Catalog:** `ai/modelmanagement/ModelCatalog.kt` (468 lines), with types in `core/model/MeetingModels.kt:652-700`:
- `ModelFileSpec(fileName, downloadUrl, sha256, sizeBytes, downloadSizeBytes?, archiveEntryPath?)`
- `ModelTier { LIGHTWEIGHT, RECOMMENDED, HIGH_QUALITY }`
- `AiModelInfo(id, name, capability:Set<ModelCapability>, files, minimumRamMb, recommendedRamMb, version, quantization, contextLengthTokens?, tier)`
- `ModelCapability` is in `core/model/Enums.kt:45`. It's meeting-flavoured: TRANSCRIPTION, VOICE_ACTIVITY, SUMMARIZATION, DIARIZATION, EMBEDDINGS (never used by any catalog entry), TRANSCRIPT_CLEANUP, EXTRACTION, SYNTHESIS, ASK_MEETING, DIARIZATION_RECONCILIATION.

Every entry is pinned by SHA-256 and exact byte size. Most were verified by downloading the file and hashing it.

LLM entries (all MediaPipe `.task`, q8, from `huggingface.co/litert-community/...`):

| id | Size | Context | Min / recommended RAM | Tier | License |
|---|---|---|---|---|---|
| `llm_qwen2_5_0_5b_instruct` | 547 MB | 1280 | –/2560 MB | LIGHTWEIGHT | Apache-2.0 |
| `llm_qwen2_5_1_5b_instruct` | 1.60 GB | 4096 | 3072/4608 MB | RECOMMENDED | Apache-2.0 |
| `llm_deepseek_r1_distill_qwen_1_5b` | 1.83 GB | 4096 | –/4608 MB | HIGH_QUALITY | MIT |
| `llm_phi_4_mini_instruct` | 3.91 GB | 4096 | –/8192 MB | HIGH_QUALITY | MIT |

Gemma was ruled out on purpose: the HF repositories are gated and an unattended download can't accept the terms (comment around `ModelCatalog.kt:266`). Speech entries (Silero, Parakeet, Omnilingual 300M/1B, Whisper Turbo/Large-v3, pyannote + CAM++) are irrelevant to Zuri unless voice notes are in scope.

**Download pipeline:**
- `ai/modelmanagement/ModelDownloader.kt` → `OkHttpModelDownloader`:
  - Streams to disk in 64 KB chunks.
  - Resumes with HTTP **Range** from an existing `.part` file.
  - Retries up to 3 times with exponential backoff (1 s, 2 s, 4 s).
  - Calls `ensureActive()` between chunks for coroutine cancellation.
  - Reports progress through a callback.
- `core/repository/Repositories.kt:907-1155` → `ModelRepository.installModel`:
  - **Storage pre-check** through `DeviceCapabilityDetector.getAvailableStorageMb()` (StatFs), which also budgets for the temporary archive.
  - Checks each file in turn, skipping files that are already complete and verified.
  - Downloads to `<file>.part`, optionally extracts with `ArchiveExtractor` (tar.bz2), verifies with **`Sha256ModelVerifier`**, then renames into place.
  - Finally `LocalModelStorage.markInstalled()` writes a `.installed` marker file.
  - Also mirrors model state into Room (`AiModelEntity`, `aiModelDao`). This is the coupling point: the repository takes the whole `MeetMindDatabase`.
- `ai/modelmanagement/ModelDownloadWorker.kt` → WorkManager `CoroutineWorker`:
  - Unique work per model (`KEEP`), so a download is never started twice.
  - Constraints: UNMETERED when the Wi-Fi-only setting is on, else CONNECTED, plus `setRequiresStorageNotLow`.
  - Exponential backoff from 20 s, up to 8 attempts.
  - Shows a foreground notification with **`FOREGROUND_SERVICE_TYPE_DATA_SYNC`**, falling back to a plain worker when started from the background on Android 12+.
  - Pausing cancels the work, which keeps the `.part` file. Progress goes to `setProgress`, throttled to 700 ms. Uses `runBlocking` inside the progress callback, which is a minor smell.
  - Coupled to `AppNotifications` and `MeetMindDatabase`.
- `ai/modelmanagement/ModelStorage.kt`: `filesDir/models/<modelId>/` (app-private), the `.installed` marker, size and delete.
- Deletion goes through `ModelRepository.deleteModel`.
- `ai/modelmanagement/LlmModelResolver.kt`: when the user's selected model has been deleted, it picks the best installed model by capability; it also offers `resolveSmallestInstalled` and `resolveForModeOrNull(preferredTier)`. It never downloads anything or swaps models silently.

**Hardware detection:**
- `core/common/DeviceCapabilityDetector.kt`: total/available RAM (ActivityManager), first ABI, an arm64 flag, a RAM-based tier label (≥8 GB "High", ≥5.5 GB "Standard", else "Entry"), the recommended LLM (0.5B if RAM is below the 1.5B's recommended 4608 MB), the recommended ASR model, and free storage through StatFs.
- `ai/llm/LocalModelFit.kt`: the "model ≤ RAM/2" runtime gate.
- **No SoC, GPU or NPU detection** and no thermal checks. "Tiering" means only the three `ModelTier` levels plus the RAM threshold.

**Backup bug to avoid in Zuri:** `app/src/main/res/xml/data_extraction_rules.xml` excludes `meetings/`, the DB and credentials, but **not `files/models/`**. Multi-GB model files are therefore eligible for Auto Backup. Auto Backup has a 25 MB quota, and going over it can stop app backups entirely. Zuri should exclude its model directory, or store models in `noBackupFilesDir`.

## 4. Embeddings and retrieval

- `ai/embeddings/EmbeddingEngine.kt`: `interface EmbeddingEngine { embed, embedQuery, embedBatch, cosineSimilarity }`.
- `LocalEmbeddingEngine` is **not a neural model**. It's a deterministic 64-dimensional signed feature-hashing projection (word unigrams + bigrams + character 3-grams), L2-normalised. It's cheap and fully offline but semantically weak.
- `ai/embeddings/NeuralEmbeddingEngine.kt` calls the **cloud** Gemini `gemini-embedding-001`:
  - 256-dimensional, truncated MRL vectors with RETRIEVAL_QUERY/DOCUMENT task types.
  - LRU memory cache plus a disk cache keyed by SHA-256.
  - Batch requests through `batchEmbedContents`.
  - Falls back to `LocalEmbeddingEngine`.
  - **Bug:** the fallback produces 64-dimensional vectors while cached cloud vectors are 256-dimensional. `cosine()` returns 0 when sizes differ, so mixed corpora quietly lose semantic ranking.
- **There is no on-device neural embedding model** (the EMBEDDINGS capability is unused). Zuri has to add one, for example EmbeddingGemma-300M, a MiniLM/bge-small ONNX through ONNX Runtime (already present as a transitive dependency of sherpa-onnx), or MediaPipe TextEmbedder.
- **Vector store:** Room `EmbeddingEntity` (`core/database/Entities.kt:241`, table `embeddings`) stores `vectorData` as a **comma-separated string**, and search is a brute-force cosine scan. There's no sqlite-vec and no ANN index. FTS4/5 tables exist for notes, tasks, transcript segments and document pages (`SearchDao`).
- **Hybrid retrieval:**
  - `ai/retrieval/TranscriptRetriever.kt` (218 lines) does deterministic query-intent parsing (speaker filter, time window, keywords), then combines semantic and keyword scores (`keywordWeight=0.4`), top-K, then pulls in neighbouring segments. This design is good and reusable.
  - `core/repository/Repositories.kt:707` `SearchRepository.searchHybrid` does FTS first, then embeddings.
- **RAG orchestration:**
  - `ai/assistant/AskEverything.kt`, `ScopedAsk.kt` and `Assistant.kt` (790 lines) handle cross-source "ask everything".
  - The flow: on-phone FTS finds the sources, an optional cloud re-rank runs only in INTERNET mode when no result is confidential (`feature/search/SearchScreen.kt:262-280`), and the LLM answers from cited passages.
  - Chunking is transcript-segment based (`TranscriptChunker`). There's no generic text or document chunker.

## 5. Provider abstraction and privacy routing

- **Seam:** `LanguageModel`, with implementations `MediaPipeLanguageModel`, `AiCoreLanguageModel`, `GeminiLanguageModel` (cloud, through `GeminiTransport`) and `UnavailableLanguageModel`.
- `ai/routing/LanguageModelFactory.kt` (222 lines) is **the one place a model is chosen**:
  - `resolve(profile, capability, tier)`: INTERNET with a configured key goes to Gemini; otherwise the best local model (`LlmModelResolver`), then AICore; otherwise null, which the caller must report honestly.
  - `resolveWithFallback` wraps cloud in **`ResilientLanguageModel`**: cloud first, then local on failure (including streams that fail before any text arrives). It records `lastActualModelId` and `lastRanLocally` so each result shows which model produced it.
  - `resolveLocal()` never touches the network. The fallback runs **one way only**, cloud to local.
  - Returns `ResolvedLanguageModel(languageModel, modelId, contextLengthTokens, isCloud)`. Zuri should copy this shape directly.
- `ai/routing/AiModelRouter.kt`: the `AiRoute` enum plus `ModelRoute(modelId, requiresNetwork)`. `routesFor(ProcessingProfile)` returns sets in which OFFLINE simply has no cloud route; the code calls this "privacy is structural". All cloud model ID strings live only in `DefaultAiModelRouter`.
- Other cloud providers:
  - `ai/cloud/DeepSeek.kt` (436 lines) is a DeepSeek chat client with a monthly usage meter, a proxy, and `FallbackTransport` (Gemini → DeepSeek, with the schema injected into the prompt).
  - `ai/cloud/GeminiRoute.kt` → `GeminiRoutes.resolve`: the user's own key (BYOK, gated by billing), then the managed proxy (`server/gemini-proxy`, `X-Install-Id`/`X-RC-User` headers), then a tester key built into the build.
  - There's **no Claude or OpenAI client**.
- **Privacy controls:**
  - `ProcessingProfile` OFFLINE is the default, and an unreadable setting falls back to OFFLINE (README, `docs/DATA_SAFETY.md`).
  - Per-meeting/project confidentiality comes from `WorkPrivacy.forMeeting` and the `confidential` flag on people.
  - `app/src/test/.../PrivacyNoCloudPathTest.kt` pins the rule that the pipeline's defaults are local.
- **Weaknesses:**
  1. **Embeddings bypass the factory.** Each screen does its own `if (profile==INTERNET) NeuralEmbeddingEngine else Local` (`feature/assistant/AssistantHost.kt:339`, `feature/meetingdetail/MeetingDetailScreen.kt:199`, `feature/search/SearchScreen.kt:174`). So the guarantee depends on each caller remembering it, and isn't structural.
  2. `agents/STATUS.md` lists an open bug: "summaries still go to Gemini after a switch to the phone".
  3. The Gemini user key is stored in plain DataStore (`ai/cloud/GeminiCredentialStore.kt`), not encrypted, though it is excluded from backup.

For Zuri, make "may this payload leave the device?" a single policy object that gates **every** network AI call, embeddings included, rather than a per-screen check.

## 6. Structured output

- **On device there is no schema or grammar enforcement.** The prompt describes the JSON, and the model output is then post-processed.
- `ai/llm/MeetingIntelligenceJsonParser.kt` (221 lines):
  - `extractJsonObject()` strips the ```` ```json ```` fences and takes the substring from the first `{` to the last `}`. That's the whole "repair".
  - It parses with `org.json`, keeps only items whose required fields are present, falls back to a default for unknown enums, and **cross-checks cited `sourceSegmentIds` against the IDs the model was actually shown**, dropping invented citations.
  - Any exception yields `ChunkExtraction.EMPTY`.
  - There's no retry with a correction prompt, no partial-JSON or trailing-comma repair, and no kotlinx.serialization (`org.json` throughout).
- Similar per-feature parsers exist: `ai/tools/ToolResultJson.kt` (persists tool results), note-polish JSON replies (`ai/notes/*`), and the devotional contract (`ai/devotional/DevotionalContract.kt`).
- Cloud: `generateStructured` passes `responseSchema` to Gemini's schema mode. The DeepSeek fallback appends the schema to the prompt and sets `json=true`.

**Reusable pattern:** "parse leniently, validate strictly, drop citations to sources the model wasn't shown, never invent". Generalise it into a `JsonExtractor` with a schema-validation step, and add (a) one repair retry and (b) grammar-constrained decoding if the runtime supports it.

## 7. Background execution

- **WorkManager is used throughout:**
  - `ai/pipeline/MeetingProcessingWorker.kt` (327 lines): a foreground worker (**`FOREGROUND_SERVICE_TYPE_DATA_SYNC`**) plus a `PARTIAL_WAKE_LOCK` ("MeetingMind:processing") and stage-based progress.
  - `ai/pipeline/AiToolWorker.kt`, `ai/notes/NoteAiJobs.kt`: persisted AI jobs (`AiJobEntity`, `NoteAiJobDao`) that survive process death.
  - `ProcessingScheduler.kt`, `ModelDownloadWorker`, plus backup, devotional and reminders.
- Manifest (`app/src/main/AndroidManifest.xml`):
  - FGS types used: `microphone` (recording), `mediaPlayback`, `dataSync` (the WorkManager `SystemForegroundService`).
  - `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`.
- **Diarization runs in a separate process** (`android:process=":diarizer"`, `ai/diarization/DiarizationService.kt`, `IsolatedSpeakerDiarizer.kt`), so a native crash can't take down the app. This pattern is worth copying for an LLM runner.
- **Thermal:** `PowerManager.getCurrentThermalStatus` and thermal listeners are used nowhere. PowerManager appears only for the wake lock and in recording code. There's no battery-level or charging gating on AI jobs beyond the WorkManager constraints. Zuri needs to add this.
- **Targeting Android 15+:** a `dataSync` FGS is limited to about 6 hours per day and is under scrutiny. For long-running local inference, consider the `shortService` type or plain non-expedited workers. Zuri's notification ingestion should use `NotificationListenerService`, which MeetingMind doesn't have.

## 8. Database

- `core/database/MeetMindDatabase.kt` (1002 lines):
  - Room, version 32, about 60 entities across many domains: meetings, notes, learning, faith, work inbox, growth.
  - Hand-written `Migration` objects 1→32, plus `DatabaseGuard.copyBeforeMigration` (backs up the DB file before migrating) and `LegacyMarkMigration`.
  - A singleton `getInstance` and a `setInstanceForTest` seam.
- **No encryption:** no SQLCipher, no `openHelperFactory`. The DB is plain, protected only by the app sandbox and backup exclusion.
- `core/database/PeopleTasks.kt` (404 lines):
  - `PersonEntity`: name, relationship, notes, `kind` (PERSON/ORG), orgId, emails/phones/aliases as JSON, preferredChannel, isSelf, **confidential**, lastSeenAt, space, domains/urls/properties JSON.
  - `TaskEntity`: due/remind, repeat rules, person, note, meeting/timestamp provenance, `waitingOn`, `ownerSpeakerId`, `sourceItemId`, priority, subtasks, sections.
  - Labels, `NotePersonCrossRef`, and FTS tables.
- `core/database/Items.kt`, `Signals.kt`, `Inbox.kt`, `Briefs.kt` form the "Work Inbox" signal and commitment model. `MeetingIntelligenceJsonParser.parseSignals` produces commitments with who, to-whom and when.
- These are conceptually close to Zuri's contacts, commitments and tasks, but are tied to meeting and segment IDs. Treat them as **schema inspiration**, not code to lift.
- "Companion model" (`core/companion/*`): a pure-Kotlin state machine for the Rive mascot (forms ZURI/NAS/WREN/PAGE, moments, milestones). It isn't an AI model, so leave it behind.

## 9. Security, auth, sync

- **Keystore:** `core/integrations/IntegrationCredentialStore.kt` uses an AES-GCM key in `AndroidKeyStore`, with a fallback for JVM tests, to protect OAuth tokens for integrations. It's small and reusable.
- **Biometric app lock:** `core/applock/AppLockAuthenticator.kt`, `BiometricPromptAuthenticator.kt`, `feature/applock/AppLockGate.kt` (androidx.biometric 1.1.0).
- **Screenshot protection:** `MainActivity.kt:209-218` toggles `FLAG_SECURE`, and on newer APIs a recents-only screenshot mode.
- **Encrypted preferences:** no EncryptedSharedPreferences. Plain DataStore is used, and the Gemini/DeepSeek keys are stored in the clear inside the sandbox.
- **Auth:** `core/firebase/FirebaseManagers.kt`: Credential Manager → Google ID token → `FirebaseAuth.signInWithCredential`; anonymous sign-in for Circles; App Check with reCAPTCHA.
- **Sync:**
  - Firestore is used **only for Circles**, the shared group content (`core/circles2/FirestoreCirclesData.kt`, plus a Cloudflare Worker at `server/circles-api`).
  - Personal notes stay local by product rule. There's no personal-data sync engine to reuse.
  - Backup: `core/backup/BackupManager.kt`, `BackupScheduler`, `MarkdownVaultExporter` (local export).
- **Billing:** RevenueCat with feature gates (`core/billing`), coupled into `GeminiRoutes`.

Zuri's cloud backend uses a Zuri JWT from a Clerk sync, so the Firebase auth pieces are irrelevant to it.

## 10. Document export

- `core/export/ExportDocument.kt` defines a **format-neutral block model**:
  - `ExportDocument(title, blocks, template, theme, ...)`.
  - `ExportBlock`: Heading, Paragraph (`RichText`), ListItem (bullet/numbered/checklist), Quote, Scripture, Excerpt, Image, Recording, Facts (key/value), **Table**, Callout, Code, Math, TranscriptTurn, ActionItems, Decisions, Divider, PageBreak.
- Three renderers consume it:
  - `DocxDocumentRenderer.kt` (413 lines): **a hand-written OOXML zip with no library**. Real styles, numbering, hyperlinks, embedded images, page-number footer, A4.
  - `PdfDocumentRenderer.kt` (892 lines): Android `PdfDocument` + `StaticLayout`, so Android-only, with `PdfFontRegistry` fonts.
  - `MarkdownDocumentRenderer`.
- `ExportManager.kt` dispatches to them. `ExportPrivacyPolicy.kt` controls what may be exported. `MeetingExportMapper` and `NoteExporter` map meetings and notes to the block model.
- **Reuse for Zuri's mobile document engine:**
  - The block model + DOCX + PDF renderers are the most portable code in the repo. Their only internal dependencies are `core/notes/RichText` and `InlineStyle`, plus `RecordingType`/Scripture for a few block types.
  - Invoices and quotations need a Table block with column alignment and totals, and a header/letterhead with a logo. These are close enough to extend.
  - Note that the Zuri web backend renders business documents with `@react-pdf/renderer` templates. A native renderer would duplicate that template system, so decide whether mobile documents should be server-rendered (`/render-context`) or native.

## 11. Code quality, testing, coupling

- **Quality is high.**
  - Typed `AiResult` with honest failure variants (`ai/common/AiTypes.kt`, 77 lines, no Android dependencies).
  - Extensive docs on every decision.
  - Unit tests exist for nearly every piece worth extracting: `MediaPipeLanguageModelTest`, `LocalModelFitTest`, `TranscriptChunkerTest`, `MeetingIntelligenceJsonParserTest`, `OkHttpModelDownloaderTest` (MockWebServer), `ModelVerifierTest`, `ModelRepositoryTest`, `ModelCatalogTest`, `LlmModelResolverTest`, `NeuralEmbeddingEngineTest`, `TranscriptRetrieverTest`, `AiAvailabilityTest`, `PrivacyNoCloudPathTest`.
- **Coupling** (what extraction has to cut):
  1. The `LanguageModel` interface is defined inside `MeetingIntelligenceEngine.kt`, next to meeting types, and imports `AiStreamEvent` from `ai/cloud/GeminiTransport.kt`.
  2. `AiModelInfo`, `ModelFileSpec`, `ModelTier` and `ModelCapability` live in `core/model` (`MeetingModels.kt`/`Enums.kt`), mixed with meeting models. The capability enum is meeting-specific.
  3. `ModelCatalog` is a hard-coded `object` (it can't be injected) and is referenced statically by `MediaPipeLanguageModel`, `LlmModelResolver`, `ModelDownloadWorker` and `DeviceCapabilityDetector`.
  4. `ModelRepository` sits in the 1155-line `Repositories.kt`, depends on `MeetMindDatabase`, and calls `DeviceCapabilityDetector` statically.
  5. `ModelDownloadWorker` depends on `AppNotifications` and `MeetMindDatabase`. `OkHttpModelDownloader` uses `core.net.Net.base`.
  6. `LanguageModelFactory` depends on `ProcessingProfile` (core.model), `GeminiTransport`/`GeminiLanguageModel`/`GeminiLog`. `GeminiRoutes` reaches into billing (`TieringModeStore`, `FeatureGate`, RevenueCat `Billing.gateway`).
  7. `NeuralEmbeddingEngine` depends on `BuildConfig.GEMINI_PROXY_URL` and `GeminiCredentialStore`.
  8. Everything uses static singletons, with no DI.
- **Monoliths not to copy:** `MeetingProcessingPipeline.kt` (1704 lines; already hit the JVM 64 KB method limit, per `agents/STATUS.md`), `Assistant.kt` (790), `LearningAiEngine.kt` (936), `PostSessionAutopilot.kt` (783).

## 12. Recommendation

### Mechanism: **copy and own into a new `:core-ai` module in the Zuri repo.** No shared library and no git submodule.

Why:
- MeetingMind is a single-module app with no published artifacts, no DI and no module boundaries. Making it a library means refactoring a shipping app (with in-flight WIP branches, a non-compiling sync worktree and one-Gradle-at-a-time rules) only to serve a second consumer.
- The reusable core is small, about **1,500–2,000 lines** of well-tested code. Copy-and-own lets Zuri change the parts that need to change (the runtime adapter, generic capabilities, the embedding model) without coordinating releases.
- A git submodule pointing at an app module (and a no-LICENSE public repo) gives the worst of both: tight coupling and none of the benefits.
- **Do in phase 2, if both apps keep evolving the same layer:** pull `:core-ai` out into its own repo published to a private Maven (GitHub Packages), and have MeetingMind migrate onto it later. Record the source commit (`48da219` on `release/1.0-paid-launch`) in a `PROVENANCE.md` in the new module so fixes can be ported in both directions.

### Extract (with the refactor each needs)

| Source | Into `:core-ai` | Refactor needed |
|---|---|---|
| `ai/common/AiTypes.kt` | `AiResult`, `AiAvailability` | None. Rename the package. |
| `ai/llm/MeetingIntelligenceEngine.kt` (`LanguageModel` only, lines ~1–60) + `AiStreamEvent` from `ai/cloud/GeminiTransport.kt:28` | `llm/LanguageModel.kt`, `llm/StreamEvent.kt` | Split out of the meeting file. Make `StreamEvent` provider-neutral; FunctionCalls becomes a generic ToolCall. Add `GenerationParams` (temperature, topK, stop, seed) and a real `cancel()`. |
| `ai/llm/MediaPipeLanguageModel.kt` + `ai/modelmanagement/LlmEngineManager.kt` | `runtime/mediapipe/*` (optional adapter) | Take the catalog entry and storage by injection, not from the static `ModelCatalog`. Add streaming (`generateResponseAsync`) and session reuse. **Plan a LiteRT-LM adapter (and/or llama.cpp for grammar JSON) behind the same seam**, keeping the engine-manager mutex and deferred-release pattern. Consider running the runner in a `:llm` process, like `:diarizer`. |
| `ai/llm/LocalModelFit.kt`, `core/common/DeviceCapabilityDetector.kt` | `device/DeviceProfile.kt` | Remove the ASR and catalog references, and make the recommendation a function of an injected catalog. Add the SoC (`Build.SOC_MODEL`, API 31+), GPU/NPU probe, thermal status and charging state. |
| `core/model/MeetingModels.kt:652-700` (`ModelFileSpec`, `ModelTier`, `AiModelInfo`), `core/model/Enums.kt:45` | `models/ModelSpec.kt` | Move them out of meeting models. Replace `ModelCapability` with Zuri's own (EXTRACTION, SUMMARIZE, REPLY_DRAFT, DOC_DRAFT, EMBED, CLASSIFY, ...). Add `runtime` (mediapipe/litert-lm/gguf), `license`, `minSdk`/`abi`. |
| `ai/modelmanagement/ModelCatalog.kt` | `models/ModelCatalog` **as an interface** + a JSON-backed implementation | Turn the hard-coded object into data (bundled JSON, optionally refreshed from the Zuri backend). Keep only the LLM entries (Qwen2.5 0.5B/1.5B, Phi-4-mini) and add an on-device embedding model. |
| `ai/modelmanagement/ModelDownloader.kt`, `ModelVerifier.kt`, `ModelStorage.kt`, `ArchiveExtractor.kt` | `models/download/*` | Inject the `OkHttpClient` (drop `core.net.Net`). Move storage to `noBackupFilesDir` or exclude it from backup. |
| `ModelRepository.installModel/deleteModel` (`core/repository/Repositories.kt:907-1155`) | `models/ModelInstaller.kt` | Cut the Room `AiModelEntity` mirror and use the filesystem plus the `.installed` marker as the source of truth (optionally a tiny DataStore). Inject the free-space provider. |
| `ai/modelmanagement/ModelDownloadWorker.kt` | `models/download/ModelDownloadWorker.kt` | Inject a notification factory and installer (WorkManager `WorkerFactory`). Keep the constraints, backoff, unique work and dataSync FGS. |
| `ai/modelmanagement/LlmModelResolver.kt` | `routing/LocalModelResolver.kt` | Depends on the catalog interface. Otherwise unchanged. |
| `ai/routing/LanguageModelFactory.kt` (+ `ResilientLanguageModel`), `ai/routing/AiModelRouter.kt` | `routing/*` | Replace `ProcessingProfile`/Gemini with a `CloudProvider` interface (the Zuri backend `services/intelligence`, BYOK Gemini, Claude) and a **single `PrivacyPolicy` gate** consulted by every network path, embeddings included. Keep the one-way cloud→local fallback and the provenance tracking (`lastActualModelId`). |
| `ai/embeddings/EmbeddingEngine.kt` (interface + `LocalEmbeddingEngine` as a last-resort fallback) | `embeddings/*` | Add a real on-device neural embedder. Fix the dimension-mismatch fallback bug: version the vectors by model and dimension. Don't carry over `NeuralEmbeddingEngine`'s Gemini/BuildConfig coupling. If you want cloud embeddings, call Zuri's own backend, which already has pgvector. |
| `ai/retrieval/TranscriptRetriever.kt` | `retrieval/HybridRetriever.kt` | Generalise from `TranscriptSegment` to a `Passage(id, text, ts, actorId, sourceKind)`. Keep the intent filters (person, time window), keyword + semantic fusion and neighbour expansion. Store vectors as BLOB (`FloatArray` bytes), or adopt sqlite-vec, instead of comma-separated strings. |
| `ai/llm/TranscriptChunker.kt` | `text/TokenBudgetChunker.kt` | Generalise to any passage list. Use the runtime's tokenizer where available, else the 3.5 chars/token estimate. |
| `ai/llm/MeetingIntelligenceJsonParser.kt` (`extractJsonObject`, `mapItemsNotNull`, `toValidIds` pattern) | `structured/JsonExtractor.kt` | Strip the meeting domain. Add schema validation (kotlinx.serialization), one repair-retry prompt, and citation-ID validation as a generic helper. |
| `core/export/ExportDocument.kt`, `DocxDocumentRenderer.kt`, `PdfDocumentRenderer.kt`, `PdfFontRegistry.kt`, `ImageInfo.kt`, `ExportPrintAdapter.kt`, `core/notes/RichText` | a separate **`:core-docs`** module | Remove the Scripture, Recording, TranscriptTurn and Decisions blocks or make them optional. Add business blocks (line-item table with totals, letterhead). First decide native versus the server's react-pdf templates. |
| `core/integrations/IntegrationCredentialStore.kt` (Keystore AES-GCM) | `security/SecretStore.kt` | Generalise. Use it for BYOK keys and the Zuri JWT, which MeetingMind leaves in the clear. |
| `core/applock/*`, the `FLAG_SECURE` toggle in `MainActivity.kt:209` | `:core-security` (optional) | Small and useful for an app holding WhatsApp content. |
| Tests listed in §11 | Copy alongside each class | Adjust the packages and the injected catalog. |

### Leave behind
- The whole speech stack (sherpa-onnx ASR/VAD/diarization, `ai/asr`, `ai/vad`, `ai/diarization`, `ai/transcript`, `ai/transcription`, `SherpaEngineManager`, `AsrModelResolver`). Revisit only if Zuri transcribes WhatsApp voice notes on device; then `SherpaEngineManager` + Whisper/Omnilingual (good for Bemba/Nyanja) is the piece to take, in a separate `:core-speech` module.
- The meeting, learning, faith, devotional, notes, synthesis and automation engines; the Gemini Live/voice/TTS code; `MeetingProcessingPipeline`; the Rive companion; Circles and Firebase; RevenueCat billing; `GeminiRoutes`; `DeepSeek.kt`; the `AiCoreLanguageModel` reflection stub (rewrite against the real ML Kit GenAI SDK if you want Nano).
- The Room schema and migrations. Use them only as inspiration for People/Tasks/Signals.

### Licensing
- MeetingMind code: **no LICENSE file in a public repo.** Confirm the same entity owns both apps before copying, and record provenance.
- Models: Qwen2.5 (Apache-2.0) and Phi-4-mini and DeepSeek-R1-Distill (MIT) are fine to download at runtime with attribution in the notices. Avoid gated Gemma for unattended downloads, as MeetingMind found. Parakeet is CC-BY-4.0, which requires attribution.
- Runtimes (MediaPipe, LiteRT, sherpa-onnx, ONNX Runtime, OkHttp) are all Apache-2.0. llama.cpp would be MIT.
- Write a complete THIRD_PARTY_NOTICES for Zuri. MeetingMind's own omits several catalog models.
