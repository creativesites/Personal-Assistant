# Zuri Android — Android & Google Play Feasibility

> Part of the Zuri Android initial engagement (audit phase). Status: **audit finding, not a decision.** Decisions derived from this are recorded in `DECISIONS.md`.
> Research date 2026-11-24. Every claim carries a confidence tag: **[V]** verified against an official Android/Play page on the research date, **[S]** secondary source, **[K]** background knowledge not re-verified. Re-verify every **[K]** item before building on it.

## What this means for Zuri (principal architect's reading)

| Brief expectation | Feasible? | Consequence for the design |
|---|---|---|
| Read WhatsApp/Telegram/Signal/Slack/Gmail/SMS-app notifications | **Yes, partially** | Only what the source app *posts*. No history, nothing for open/muted chats, snippets only for Gmail, often nothing for Signal, OTP-bearing messages redacted on Android 15+. Coverage must be shown honestly per source. |
| Backfill messaging history from the phone | **No** | History comes only from (a) the existing cloud WhatsApp linked-device sync (Baileys) after the user connects an account, or (b) a user-initiated WhatsApp "Export chat" file import. |
| Read the SMS database | **No (Play policy)** | Only as default SMS handler; out of scope. SMS is read through the SMS app's notifications. |
| Use Accessibility to read chats or press Send | **No — prohibited** | Never. Risk of developer-account termination. |
| Reply from Zuri | **Yes, constrained** | Via the notification's RemoteInput action while that notification is live; user taps Send every time. No unattended auto-send to WhatsApp from the phone. |
| Background local LLM extraction | **Yes, with our own runtime** | Gemini Nano (AICore) is foreground-only. Use LiteRT-LM (or llama.cpp) in WorkManager jobs, batched, charging-preferred, resumable. |
| Local models 1–4B | **Yes on ~6 GB+ RAM devices** | Device gating at runtime; small structured outputs; a "no local model" mode must still be useful (deterministic features + optional cloud). |
| Read device contacts | **Yes, with declaration** | From 2027-01-27 (targetSdk 37+) READ_CONTACTS needs a Play declaration; CRM/personal-assistant are allowed uses. Offer Contact Picker path too. |
| Model download from our CDN | **Yes (interpretation)** | Weights are data; runtime native libs ship in the AAB; verify SHA-256. Play AI packs are an alternative. |

---


---

## 0. Hard constraints (TL;DR)

1. **OTP redaction blocks part of the content.** On Android 15+, an untrusted NotificationListenerService gets redacted content for any notification in which the system detects a one-time password (OTP). The bypass permission (`RECEIVE_SENSITIVE_NOTIFICATIONS`) is role|signature, so a Play app cannot get it. Plan for "Sensitive notification content hidden" placeholders. **[V]**
2. **Gemini Nano can't do the background work.** ML Kit GenAI (Gemini Nano / AICore) only runs inference when the app is the top foreground app. Calls from the background, including from a foreground service, fail with `BACKGROUND_USE_BLOCKED`. Gemini Nano can serve interactive in-app features only, not background extraction from notifications. Background extraction needs a self-hosted runtime (LiteRT-LM, llama.cpp, etc.). **[V]**
3. **READ_CONTACTS gets a new gate.** Apps targeting API 37+ may request READ_CONTACTS only if the Contact Picker is not sufficient, and must file a Play Console declaration. Compliance becomes mandatory **2027-01-27**. "CRM" and "personal assistants" are listed as allowed examples. **[V]**
4. **Target SDK.** New apps and updates must target **API 36 (Android 16)** from 2026-08-31. No dated requirement for API 37 had been found as of today. Building against API 37 is advisable anyway. **[V]**
5. **Notifications only, no history.** The app sees only what other apps choose to post as notifications. There is no chat history, nothing for chats that are open or muted, and only snippets for some apps. A listener cannot backfill. **[V/K]**
6. **No Accessibility workaround.** The Accessibility API must not be used to scrape chat content. Only genuine disability tools may set `isAccessibilityTool`, and misuse risks suspension or developer-account termination. **[V]**
7. **SMS.** READ_SMS is limited to the default SMS handler plus a short list of exceptions, and none of them clearly fits this app. Read SMS through the SMS app's notifications instead. **[V/S]**
8. **dataSync foreground services** have a combined 6-hour cap per 24 hours on Android 15+. Android 16 also applies job runtime quotas to jobs that run alongside a foreground service. Long background LLM runs must be chunked, run while charging, and be resumable. **[V]**
9. **Model files.** Playing native code (.so/dex) from outside Play is prohibited. Model weights are data, which is generally treated as acceptable, but the inference runtime's native libraries must ship inside the APK/AAB. **[V]** for the rule; how it applies to weight files is my interpretation **[K]**.
10. **Generative AI reporting.** If the app shows AI-generated content such as chat or drafts, Play requires in-app reporting or flagging of offensive output. **[V]**

---

## 1. NotificationListenerService (NLS)

### 1.1 What you get
- `onNotificationPosted(StatusBarNotification)` delivers `sbn.packageName`, `sbn.key`, `sbn.groupKey`, `sbn.postTime`, `sbn.notification` (with `extras`), `isGroup`, and `getOverrideGroupKey`. `onNotificationRemoved(sbn, rankingMap, reason)` reports the removal reason, for example `REASON_APP_CANCEL` or `REASON_CLICK`. `getActiveNotifications()` provides a snapshot at connect time. **[K]**
- Common `extras` keys are `EXTRA_TITLE`, `EXTRA_TEXT`, `EXTRA_BIG_TEXT`, `EXTRA_SUB_TEXT`, `EXTRA_SUMMARY_TEXT`, `EXTRA_TEXT_LINES` (inbox style), `EXTRA_CONVERSATION_TITLE`, `EXTRA_IS_GROUP_CONVERSATION`, `EXTRA_MESSAGING_PERSON`, `EXTRA_MESSAGES`, and `EXTRA_HISTORIC_MESSAGES`. **[K]**
- **MessagingStyle**
  - `NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)` returns the message list. Each `MessagingStyle.Message` carries text, a timestamp, a sender `Person` (name, optional key/URI, icon), and an optional data MIME type plus URI for images. **[V]** ([Android Auto messaging doc](https://developer.android.com/training/cars/messaging))
  - Apps usually include only the *recent unread* messages in the notification, typically capped at a handful of entries. **[K]**
  - `Person.key` and `Person.uri` are app-defined. Many apps leave them empty or opaque, so contact matching usually has to rely on display-name heuristics. **[K]**
- Conversation notifications (API 30+) can carry `shortcutId`/`getShortcutId()` and `LocusId`, which give a **stable per-chat ID** when the posting app sets them. `NotificationListenerService.getNotificationChannels` and conversation APIs require a companion-device association. Android 16 and 17 added `createConversationNotificationChannelForPackage` and `deleteConversationNotificationChannel`, which are companion-gated APIs. **[V]** (API diffs: [36](https://developer.android.com/sdk/api_diff/36/changes/android.service.notification.NotificationListenerService), [37](https://developer.android.com/sdk/api_diff/37/changes/android.service.notification.NotificationListenerService)); details of the companion gating are **[K]**

### 1.2 Grouping, summaries, and updates
- Messaging apps post one child notification per chat plus a group summary such as "N messages from M chats". The summary has `FLAG_GROUP_SUMMARY` set. Skip summaries and parse the children. **[K]**
- **Updates repost the same key** with an expanded or changed message list. Dedupe on (package, conversation, sender, timestamp, text-hash), not on notification key alone. **[K]**
- **Android 16 forces all of an app's notifications into one group** ([Android Authority](https://androidauthority.com/android-16-force-group-notifications-3565400)). Android 16 QPR1+ adds AI "notification organizer" bundles on some devices ([Android Authority](https://androidauthority.com/android-16-bundled-notifications-3508409)). These system bundles can override grouping keys and add the dismissal reason `REASON_BUNDLE_DISMISSED` (API 36.1/37). Don't rely on `groupKey` semantics. **[S]**/[V for constant]

### 1.3 Cases where the listener sees nothing or degraded content
- **Chat open in the foreground.** Most messengers don't post a notification for the chat you're viewing, so those messages are never seen. **[K]**
- **Muted chats or channels.** Often no notification is posted at all. If the user blocked the channel, nothing reaches the listener. **[K]**
- **User or app content hiding.** "Hide contents" settings inside the app (Signal's default options, WhatsApp's "show preview" off) make the posted notification *itself* generic, for example "New message". The listener gets the generic text. **[K]**
- **Lock-screen "hide sensitive content".** This only changes the public version shown on the lock screen. The listener still receives the full private notification. **[K]**
- **OTP redaction (Android 15+).** "Android will stop untrusted apps that implement a NotificationListenerService from reading unredacted content from notifications where an OTP has been detected. Trusted apps such as companion device manager associations are exempt." ([Android 15 behavior changes](https://developer.android.com/about/versions/15/behavior-changes-all))
  - The bypass permission `RECEIVE_SENSITIVE_NOTIFICATIONS` is `role|signature`. It is available to system-signed apps and certain role holders, reportedly including companion-device watch/glasses roles. Detection is performed by Android System Intelligence. **[S]** ([Android Authority](https://www.androidauthority.com/android-15-sensitive-notifications-3416414), [KDE bug](https://bugs.kde.org/show_bug.cgi?id=495146))
  - Reports describe the whole text being replaced with "Sensitive notification content hidden" rather than only the code. Expect false positives on ordinary messages that happen to contain a short number. **[S]**
  - Effect on Zuri: a minority of messages will arrive blank. Detect the placeholder string and mark the message "content unavailable". Don't treat it as a parse error.
- **Screen sharing (Android 15+).** Notification content is hidden during screen-share. This affects only the display, not the listener. **[V]**
- **Low-RAM devices.** Listeners "cannot get notification access or be bound" on low-RAM (Go) devices. Work-profile listeners are ignored. **[V]** ([NLS reference](https://developer.android.com/reference/android/service/notification/NotificationListenerService))
- **Private Space (Android 15+).** Apps in a locked private space post no notifications, and listeners in the main profile can't see private-profile notifications. **[V/K]**
- **Restricted Settings.** Since Android 13, sideloaded APKs cannot have notification access enabled without the user explicitly allowing restricted settings in App info. Android 15's CDD tightened this. Play installs are not affected. This matters for internal/beta APK distribution. **[S]** ([Kaspersky](https://kaspersky.com/blog/android-restricted-settings/49991), [9to5Google](https://9to5google.com/2024/09/12/android-15-sideloaded-apps-restrictions/))

### 1.4 Lifecycle and survival
- The system binds the listener while access is granted and rebinds it after process death or reboot. It is not a foreground service and needs none to receive callbacks. **[K]**
- Wait for `onListenerConnected()` before calling APIs. After `onListenerDisconnected()`, only `requestRebind(ComponentName)` is safe. **[V]** (NLS reference)
- Listeners can silently stay unbound after an app update, a force-stop, or an OEM kill. Common mitigations **[K/S]**:
  - Call `requestRebind` from `onListenerDisconnected` and from app start.
  - Toggle the component's enabled state as a last resort.
  - Show a "listener health" indicator: store the last-connected time and alert if it's stale.
  - Use `NotificationManager.isNotificationListenerAccessGranted(cn)` (API 27+).
- **Force-stop (Android 15).** The app stays stopped and all pending intents are cancelled until the user relaunches it. A force-stopped app won't receive listener callbacks. **[V]** (Android 15 behavior changes)
- **OEM battery killers** (Xiaomi/MIUI-HyperOS, Huawei, Oppo/ColorOS, Vivo, some Samsung "deep sleeping apps") can kill or not rebind the listener. Guide users per OEM to disable battery optimization or enable autostart (dontkillmyapp.com is the usual reference). `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is policy-restricted on Play: only use it if the app's core function qualifies, and otherwise deep-link to settings. **[K]**
- **Keep `onNotificationPosted` cheap.** Write the raw notification to an encrypted queue and do LLM work later, in WorkManager. Never run inference inside the callback. **[K]**

### 1.5 Replying through RemoteInput
- **Technically feasible.** Find the `Notification.Action` that has `RemoteInput`s (for example `SEMANTIC_ACTION_REPLY`), fill it with `RemoteInput.addResultsToIntent`, and call `actionIntent.send(context, 0, fillIn)`. Android Auto and Wear use this same mechanism. **[V]** ([Android Auto messaging](https://developer.android.com/training/cars/messaging))
- **Limitations** **[K]**:
  - Replies are only possible while that chat's notification is still active. Once it's dismissed or read elsewhere, the action is gone.
  - You can't start a new conversation.
  - Some apps don't expose a reply action, or expose it only for some chat types.
  - Since Android 14 there are restrictions on background activity launches from PendingIntents, but reply PendingIntents are usually broadcast/service intents, so this is generally fine.
- **Policy.** I found no Play policy that bans RemoteInput replies from a listener, and many auto-reply apps on Play use them **[K]**. Risks:
  - Play's User Data / deceptive-behavior rules apply. Every send must be user-initiated or explicitly user-configured and disclosed.
  - **WhatsApp's own terms prohibit automated or bulk messaging and non-user-initiated automation.** That is a risk to the user's WhatsApp account, not a Play rule. **[K]**
  - Recommendation: user taps Send on each reply. No unattended auto-send for WhatsApp in v1.
- **Not allowed:** using the Accessibility API to type or press Send (see §3a).

---

## 2. Source-specific notes (all **[K]** — verify on real devices; app behavior changes with versions)

| Source | Format | Caveats |
|---|---|---|
| **WhatsApp / WA Business** | MessagingStyle per chat. 1:1 chat: title is the contact name, or the phone number if the contact isn't saved. Group chat: `conversationTitle` is the group name and the sender is the `Person`. Older or flattened formats show "Sender @ Group" in the title. Group summary reads "N messages from M chats" (skip it). | Media appears as placeholders ("📷 Photo", "🎤 Voice message (0:12)", "📄 document.pdf", "Sticker"); the media itself isn't available. Edited messages may repost with the new text; edits are only sometimes marked. Deleted messages may repost as "This message was deleted" or vanish. Reactions show as separate lines ("Reacted 👍 to …"). Calls arrive as call-style notifications. Content isn't visible when "Show preview" is off. Multi-device/web activity can mark chats read and clear notifications before the listener processes them. |
| **Telegram** | MessagingStyle. Groups and channels carry the chat title. | Muted channels (common) post nothing. Content may be hidden by the in-app notification privacy setting. |
| **Signal** | Defaults to showing name and message, but many users set "Name only" or "No name or message". | Expect a large fraction of "New message" with no content. Treat as best effort only. |
| **Messenger** | MessagingStyle. | Some notifications are chat heads/bubbles. Message requests may not notify. |
| **Slack** | Per-channel or DM notifications. Title is usually "#channel" or the workspace, and the sender is in the text. | Only what the user's Slack notification preferences allow; by default that's DMs and mentions only, not all channel traffic. |
| **Gmail** | Per-email notification: sender, subject, and a body snippet (`EXTRA_BIG_TEXT`). Several emails collapse into inbox style with `EXTRA_TEXT_LINES` (one line per email). | Snippet only, no full body or attachments. Labels without notifications are invisible. Full mail needs the Gmail API, which requires OAuth restricted-scope verification and a security assessment. |
| **Google Messages / SMS apps** | MessagingStyle with the sender as a Person. | OTP messages are redacted (§1.3). Android 17 also delays OTP SMS for non-default readers by 3 h; that applies to READ_SMS readers, not listeners. RCS group chats use the group title. |

**General:** a notification listener provides **no history**. Only messages posted after access is granted are visible, and only while the source app chooses to notify. If backfill is needed, use the existing Zuri cloud Baileys sync (the WhatsApp linked-device path) or user-initiated chat export (WhatsApp "Export chat" .txt via the share sheet). Both are separate consent flows.

---

## 3. Google Play policy

### 3a. Notification listener and Accessibility
- **Notification listener.** I found **no dedicated Play declaration form** for `BIND_NOTIFICATION_LISTENER_SERVICE` **[K — re-check Permissions & APIs policy, answer 9888170]**. Reading notifications from other apps is still collection of personal and sensitive user data, so the full User Data policy applies: privacy policy, **in-app prominent disclosure before** sending the user to the access settings, affirmative consent, and an accurate Data safety form. Expect review scrutiny; a clear onboarding video helps.
- **Accessibility.** Only apps "designed to help people with disabilities" may set `isAccessibilityTool`. "Deceptive and non-declared uses of these APIs may result in a suspension of your app and/or termination of your developer account." Non-tool use needs prominent disclosure and consent, plus a Play Console declaration. Autonomous agent-like actions through Accessibility are restricted. **Do not use Accessibility to read chats or press Send.** **[V]** ([Play Help 10964491](https://support.google.com/googleplay/android-developer/answer/10964491?hl=en))

### 3b. SMS & Call Log
- SMS and Call Log permissions require the app to be the **default SMS, Phone, or Assistant handler**, unless it gets an approved exception through the Permissions Declaration Form. **[V]** ([Play Help 9047303](https://support.google.com/googleplay/android-developer/answer/9047303), [default handlers](https://developer.android.com/guide/topics/permissions/default-handlers))
- The exception lists across help pages are inconsistent. They include contact prioritization, call recording, device performance boosting, SMS translation, and others. **[S/V]** "Social graph / personality profiling" appears on an older list but not clearly on the current one. Do not plan on getting READ_SMS. Read SMS through notifications from the default SMS app instead.
- Android 17 delays WebOTP-format SMS for non-target apps by 3 h. Apps targeting API 37 also see this delay on standard OTP SMS. **[V]** ([Android 17 behavior changes](https://developer.android.com/about/versions/17/behavior-changes-all))

### 3c. Contacts, calendar, prominent disclosure
- **Contacts Permissions policy** ([Play Help 16935362](https://support.google.com/googleplay/android-developer/answer/16935362?hl=en)) **[V]**
  - Applies to apps targeting **API 37+**.
  - Timeline: declaration prompts from Sept 2026; **compliance mandatory 2027-01-27**, with a 30-day self-extension.
  - READ_CONTACTS is allowed only if the Android 17 Contact Picker is insufficient. A declaration must name the features that need it.
  - Allowed examples include **CRM** and **personal assistants**. Invite/referral/sharing-only uses are disallowed, and a custom picker doesn't justify access.
  - Contact data is always "personal and sensitive".
  - Note: one older preview page cited an Oct 28, 2026 date; the current page says Jan 27, 2027.
- **WRITE_CONTACTS.** For apps targeting API 38+, it no longer permits writes. Use the `ACTION_INSERT` / `ACTION_EDIT` intents instead. The MANAGE_CONTACTS policy was announced 2026-10-29, with compliance in Aug 2027. **[V]**
- **Calendar.** I found no calendar-specific Play policy. READ_CALENDAR is a dangerous runtime permission covered by the User Data policy; disclosure and consent are needed if the data is sent off the device. **[K]**
- **Prominent disclosure** must appear in-app, before the permission prompt. It must describe what is accessed, collected, used, and shared, and consent requires an affirmative action. Treating contacts as non-sensitive is a listed violation. **[V]** ([Play Help 10144311](https://support.google.com/googleplay/android-developer/answer/10144311))

### 3d. Foreground services
- Targeting API 34+ requires an FGS type and matching `FOREGROUND_SERVICE_*` permission for every foreground service, plus a **Play Console "Foreground service permissions" declaration**. The declaration needs a description and a **video** showing how the user triggers each feature. **[V]** ([FGS types required](https://developer.android.com/about/versions/14/changes/fgs-types-required), [Play Help 13392821](https://support.google.com/googleplay/android-developer/answer/13392821))
- **dataSync / mediaProcessing (targeting Android 15+):** 6 h combined per type per 24 h, after which `onTimeout()` fires. If the service doesn't stop within seconds, a `RemoteServiceException` crashes the app. A new dataSync FGS can't start until the user foregrounds the app. Google recommends WorkManager instead. **[V]** ([FGS timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout))
- **shortService:** about 3 minutes, cannot be started from the background. **[K]**
- **specialUse:** requires a `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` manifest property and a Play justification. Google reviews these strictly, and on-device LLM processing is not a pre-approved category. **[K]**
- **Android 15:** dataSync, camera, mediaPlayback, phoneCall, mediaProjection, and microphone FGS types can't be started from `BOOT_COMPLETED`. **[K]**
- **Recommendation:**
  - The listener itself needs **no FGS**.
  - Run batch LLM extraction in **WorkManager** jobs constrained to charging, idle, and battery-not-low.
  - Use a dataSync FGS (or `setForeground` in WorkManager) only for a user-initiated "process backlog now" action.
  - For the initial bulk download of a large model, use **user-initiated data transfer jobs** (API 34+).

### 3e. Model downloads
- Device & Network Abuse policy: an app "may not download executable code (such as dex, JAR, .so files) from a source other than Google Play". Code running in a VM or interpreter is excepted. **[V]** ([Play Help 9888379](https://support.google.com/googleplay/android-developer/answer/9888379?hl=en))
- Model weights (.litertlm, .gguf, .tflite, .onnx) are data interpreted by a runtime that ships in the APK. Downloading them from your own CDN is common practice **[K — the policy doesn't name ML models; this is an interpretation]**. Ship every native library (llama.cpp .so, LiteRT delegates) inside the AAB, and verify weight downloads by hash/signature.
- **Play for On-device AI (beta)** delivers "AI packs" at install-time, fast-follow, or on-demand. Packs can be up to **1.5 GB compressed** each, with a 4 GB total per app version, and the Play AI Delivery Library is required. It also supports device targeting. **[V/S]** ([docs](https://developer.android.com/google/play/on-device-ai))
- A 1–4B model at 4-bit is about 0.6–2.5 GB, so it fits either route.

### 3f. Data safety
- "Collect" means transmitting data off the device. Data processed **only on the device** does not need to be declared as collected. **[V]** ([Play Help 10787469](https://support.google.com/googleplay/android-developer/answer/10787469))
- **When cloud sync is enabled**, Zuri collects messages ("Messages: emails, SMS/MMS, other in-app messages"), contacts, calendar events, and possibly name, phone, and email. Declare purposes, encryption in transit, and a deletion request mechanism. Optional sync counts as "collected (optional)".
- Sending data to a cloud LLM provider counts as **sharing** unless the provider is a service provider acting on your behalf. **[K]**
- Data passed to another app on the same device is still "sharing". **[V]**

### 3g. AI-Generated Content policy
- Apps generating content from text, voice, or image prompts must provide **in-app reporting or flagging of offensive AI output** without the user leaving the app, and should use those reports for moderation. **[V]** ([Play Help 13985936](https://support.google.com/googleplay/android-developer/answer/13985936), [14094294](https://support.google.com/googleplay/android-developer/answer/14094294))
- Apps that only "summarize non-AI content" are listed as out of scope "at this time". Zuri's reply drafts and advisor chat are in scope, so add a "Report this response" action on all generated output. **[V]**
- The developer is accountable for testing models and must ensure the app can't generate the prohibited content categories. **[V]**

---

## 4. Background work
- **WorkManager** is the right tool, with these constraints: charging, `deviceIdle` (API 23+), battery-not-low, storage-not-low.
  - Doze defers jobs to maintenance windows.
  - App Standby Buckets (active/working_set/frequent/rare/restricted) limit how often jobs run. An app the user rarely opens drifts toward rare. An NLS app the user interacts with daily usually stays in better buckets. **[K]**
- **Android 16 job quotas:**
  - Regular and expedited job runtime quota now depends on the standby bucket, even in the active bucket.
  - Jobs started while the app is visible stay subject to quota after the app leaves the foreground.
  - **Jobs running concurrently with an FGS are subject to quota.**
  - Check `WorkInfo.getStopReason()`.
  **[V]** ([Android 16 behavior changes](https://developer.android.com/about/versions/16/behavior-changes-all))
- **Expedited jobs** are for short, user-important work and have limited quota. They're a poor fit for multi-minute LLM inference. **[K]**
- **Android 15 dataSync cap:** 6 h per 24 h (§3d). **[V]**
- **Android 15 network:** network requests started outside a valid process lifecycle get exceptions. Run sync inside WorkManager. **[V]**
- **Android 17 memory limits:** RAM-based per-app memory limits apply, with exit reason `MemoryLimiter:AnonSwap`. This directly affects a 2–3 GB LLM process. Test with `am memory-limiter status`. **[V]** ([Android 17 behavior changes](https://developer.android.com/about/versions/17/behavior-changes-all))
- **Running LLM inference in the background** **[K]**:
  - Thermal throttling: use `PowerManager.getThermalHeadroom()` and `addThermalStatusListener` to back off.
  - Batch extraction: process many notifications in one prompt or structured pass.
  - Prefer CPU/GPU in the background (NPU delegates vary by OEM).
  - Checkpoint progress so a killed job resumes.
  - Gemini Nano is **not usable in the background** (§5).
- **Recommended pipeline:**
  1. The NLS callback does a cheap parse and encrypted insert.
  2. A rule/regex pre-filter runs, plus embeddings (small and fast).
  3. Deferred WorkManager LLM extraction runs while charging, or opportunistically while the app is in the foreground.
  4. Small "urgent" classifications use a tiny model or heuristics.

---

## 5. On-device LLM runtime landscape (late 2026)

| Runtime | Status | Notes |
|---|---|---|
| **LiteRT-LM** (Google AI Edge) | **Recommended Google path**, production-ready, open source. Kotlin API (`litertlm-android`). | GPU/NPU acceleration, multimodal input, tool use. `engine.initialize()` is slow, so keep the engine warm. Supports **Gemma 4 E2B/E4B**. Google reports ~52 tok/s decode for Gemma 4 E2B on Android GPU (OpenCL) on a high-end device; Gemma 3n E4B shows single-digit to ~20 tok/s on an S24 Ultra depending on backend. **[V/S]** ([overview](https://ai.google.dev/edge/litert-lm/overview), [Android](https://ai.google.dev/edge/litert-lm/android), [blog](https://developers.googleblog.com/blazing-fast-on-device-genai-with-litert-lm/)) |
| **MediaPipe LLM Inference API** | **Maintenance only / deprecated on Android & iOS**; Google says migrate to LiteRT-LM (the Web version is in maintenance mode). | Don't start new work on it. **[V]** ([guide](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference)) |
| **ML Kit GenAI / Gemini Nano (AICore)** | APIs: Prompt API (`GenerativeModel`), agentic `AgentRunner`, Summarization, Proofreading, Rewriting, Image description, Speech recognition/translation, TTS. | **Foreground-only:** "permitted only when the app is the top foreground application". Background or FGS calls get `BACKGROUND_USE_BLOCKED`. There are per-app rate quotas (`BUSY`) and a daily battery quota (`PER_APP_BATTERY_USE_QUOTA_EXCEEDED`). Only supported flagships work: Nano v2/v3/v4 devices including Pixel 9–11, Galaxy S25/S26, and some Xiaomi/Honor/OPPO/vivo models. Check availability with `checkStatus()`. Good for in-app rewrite/proofread/summarize at no download cost. **[V]** ([ML Kit GenAI](https://developers.google.com/ml-kit/genai)) |
| **llama.cpp** (GGUF) | Mature, CPU-first, with Vulkan/OpenCL GPU backends of varying quality on Android. Widest model support. | You must ship the .so files in the APK and align them to 16 KB pages (required since Android 15 devices; Android 16 has a compat mode). **[K]** |
| **MLC LLM** | GPU (OpenCL/Vulkan) compiled models, with an Android SDK. | Higher build complexity. **[K]** |
| **ExecuTorch** (PyTorch) | 1.x is stable, with XNNPACK, Vulkan, QNN (Qualcomm), and MediaTek backends. Llama/Qwen examples. | Good NPU story on Snapdragon. **[K]** |
| **ONNX Runtime GenAI** | Supports Phi/Qwen/Llama, with the QNN EP. | Mainly Microsoft's model ecosystem. **[K]** |

### Models (licenses)

**Generation models**
- **Gemma 4 E2B / E4B.** Effective 2B/4B footprint, 128K context, audio ASR, **Apache 2.0**. Best fit for LiteRT-LM. **[V]** ([Gemma 4 blog](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/), [LiteRT-LM Gemma 4](https://ai.google.dev/edge/litert-lm/models/gemma-4))
- **Gemma 3 1B/4B and Gemma 3n.** Gemma Terms of Use, which include a prohibited-use policy and are less permissive. **[V/K]**
- **Qwen 2.5/3 (0.6–4B).** Mostly Apache 2.0. Strong for multilingual and structured JSON output. **[K]**
- **Phi-3.5/4-mini.** MIT. **[K]**
- **Llama 3.2 1B/3B.** Llama Community License, which has an acceptable-use policy, attribution requirements, and a 700M MAU clause. **[K]**

**Embedding models**
- **EmbeddingGemma (308M).** Under 200 MB RAM quantized, Matryoshka dims 768 down to 128, Gemma license. **[V]** ([blog](https://developers.googleblog.com/en/introducing-embeddinggemma/))
- **EmbeddingGemma 2 (740M, multimodal)** also exists. Its RAM figure is unverified.
- Alternatives: multilingual-e5-small and bge-small (MIT/Apache, ~120 MB) **[K]**.

**RAM rules of thumb** **[K]**
- Weights at 4-bit are about 0.55–0.6 GB per 1B params. Add KV cache (grows with context) and runtime overhead.
- 1B (Q4): ~0.8–1.2 GB total.
- 2–3B: ~1.8–2.5 GB.
- 4B: ~2.8–3.5 GB.
- Practical floor: about 6 GB device RAM for 1–2B and 8 GB+ for 4B, especially under the Android 17 memory limiter.

**Speed on mid-range devices (Snapdragon 7-series / Dimensity 7xxx, 6–8 GB)** **[K]**
- Decode: 1B ≈ 10–25 tok/s (CPU/GPU); 3–4B ≈ 3–10 tok/s.
- Prefill is much faster, ~50–300+ tok/s.
- Flagships are 2–5× faster.
- Takeaway: extraction prompts should keep outputs short, using structured JSON with few tokens.

---

## 6. Security
- **Android Keystore / StrongBox:**
  - Generate AES-256-GCM keys in Keystore. Request StrongBox (`setIsStrongBoxBacked(true)`) when `FEATURE_STRONGBOX_KEYSTORE` is present, and fall back to TEE otherwise.
  - StrongBox is slow, so use it to wrap a data-encryption key (DEK) rather than for bulk encryption.
  - Android 17 limits keys to 50,000 per app (when targeting 37), which is irrelevant at this scale. **[V for limit]** / **[K]**
- **BiometricPrompt:**
  - Authenticator classes are `BIOMETRIC_STRONG` (Class 3), `BIOMETRIC_WEAK` (Class 2), and `DEVICE_CREDENTIAL`.
  - Only Class 3 (or device credential) can unlock a Keystore key via `CryptoObject` or `setUserAuthenticationParameters`.
  - **Do not make the DB key auth-bound if the background pipeline must write while the device is locked.** Use a split design: an always-available ingest key plus an auth-gated "vault" view, or an app-level lock screen. Also consider `setUnlockedDeviceRequired`. **[K]**
- **Database encryption:**
  - **SQLCipher for Android** (`net.zetetic:sqlcipher-android`, which replaced `android-database-sqlcipher`) plugs into Room via `SupportOpenHelperFactory`. **[K]**
  - Room's bundled-SQLite driver path makes SQLCipher integration slightly different. Check current docs.
  - Alternative: app-level field encryption with Tink AEAD. **[K]**
  - Vector store: use sqlite-vec with SQLCipher, or ObjectBox. ObjectBox has HNSW vector search but is only encrypted in paid tiers. **[K]**
- **Jetpack Security:**
  - `security-crypto` (EncryptedSharedPreferences/EncryptedFile) is **deprecated, with no further releases**. **[V]** ([release notes](https://developer.android.com/jetpack/androidx/releases/security), [reference](https://developer.android.com/reference/androidx/security/crypto/EncryptedSharedPreferences))
  - Use **DataStore + Tink** (AEAD with a Keystore-wrapped keyset) or plain platform `KeyGenerator("AndroidKeyStore")`.
  - Community fork: `dev.spght:encryptedprefs-*` (unofficial).
- **Screen protection:**
  - `FLAG_SECURE` on sensitive screens blocks screenshots and non-secure displays.
  - `Activity.setRecentsScreenshotEnabled(false)` (API 33+) hides the Recents thumbnail while still allowing user screenshots.
  - API 35 adds `View.setContentSensitivity` for screen-share protection.
  **[V/S]** ([fraud-prevention activities](https://developer.android.com/security/fraud-prevention/activities), [Android 15](https://developer.android.com/about/versions/15/behavior-changes-all))
- **Backup:**
  - Set `android:dataExtractionRules` (API 31+), plus `fullBackupContent` for ≤30. Exclude the DB, model files, and keysets from both cloud backup and device transfer.
  - Keystore keys don't migrate, so backed-up ciphertext would be unreadable anyway.
  - Google advises excluding sensitive data or requiring E2E encryption.
  **[V]** ([backup best practices](https://developer.android.com/privacy-and-security/risks/backup-best-practices))
- **Auth:**
  - **Clerk Android SDK** is GA (Sept 2025) and now at v1.x (v1 released Feb 2026). It's Kotlin-native with prebuilt Compose components, and supports Google sign-in via Credential Manager. Good fit since the web app already uses Clerk. **[V/S]** ([Clerk GA](https://clerk.com/changelog/2025-09-11-android-sdk-ga), [v1](https://clerk.com/changelog/2026-02-10-ios-android-sdk-v1.md))
  - Exchange the Clerk session for the Zuri JWT via the existing `/api/auth/clerk-sync` pattern, but **from the device without the INTERNAL_API_SECRET**. That secret must never ship in an APK. A new device-facing endpoint is needed that verifies the Clerk session token server-side.
  - Use Credential Manager for passkeys and Google sign-in. **[K]**
- **Other:**
  - Exclude the inference/DB process from `android:allowBackup`.
  - Certificate pinning is optional.
  - Use Play Integrity API for the sync endpoint.
  - Keep notification-derived data out of logs and crash reports.
  **[K]**

---

## 7. SDK versions
- **targetSdk:** **36** is mandatory now (since 2026-08-31, with extensions to 2026-11-01). Existing apps below 35 lose visibility to new users on newer devices. **[V]** ([Play Help 11926878](https://support.google.com/googleplay/android-developer/answer/11926878), [target SDK](https://developer.android.com/google/play/requirements/target-sdk))
  - Practical advice: build with compileSdk 37 and plan to target 37 in 2027.
  - Targeting 37 activates the Contacts policy, the per-app keystore limits, standard-SMS OTP delay, and stricter background audio rules.
- **minSdk:**
  - **Recommend minSdk 29 (Android 10)**, or **31 (Android 12)** for a simpler codebase. **[K — judgment]**
  - Reasons:
    - Compose itself supports 21+ (recent Compose BOMs moved to 23+). **[K]**
    - On-device 1–4B LLMs realistically need 6–8 GB RAM and a recent GPU or NPU. Such phones overwhelmingly ship Android 12+.
    - API 30+ gives conversation shortcuts/`LocusId` on notifications.
    - API 31+ gives `dataExtractionRules`, exact-alarm/FGS restriction clarity, and splash APIs.
    - API 33 gives `POST_NOTIFICATIONS` and `setRecentsScreenshotEnabled`.
  - Gate LLM features at runtime on RAM (`ActivityManager.MemoryInfo.totalMem` ≥ ~6 GB) and ABI (arm64-v8a only), with a cloud or "lite" fallback.
  - Ship arm64-v8a only, with 16 KB-aligned native libs.

---

## 8. Recommendations (summary)
1. **Pipeline:** NLS does a cheap encrypted ingest; WorkManager runs batch LLM extraction while charging/idle; LiteRT-LM + Gemma 4 E2B by default (E4B on 8 GB+ devices); EmbeddingGemma for retrieval. Use Gemini Nano (ML Kit) only for foreground features such as rewrite, proofread, and summarize-on-open.
2. **Coverage:** treat it as "what notifications show". Build explicit UI states for redacted, hidden-preview, and media placeholders, plus a per-source coverage indicator. Offer WhatsApp export import and the existing cloud Baileys link for history.
3. **Replies:** RemoteInput replies are user-tap-to-send only. No Accessibility. No unattended WhatsApp auto-send.
4. **Permissions:** no READ_SMS. READ_CONTACTS only with a CRM/personal-assistant declaration (or the Contact Picker for the narrower use). Calendar with prominent disclosure.
5. **Play prep:**
   - Prominent-disclosure screens before notification access, contacts, and calendar.
   - Data safety answers split by sync on/off.
   - FGS declaration video only if you ship an FGS.
   - In-app "report AI output".
   - Privacy policy covering notification content.
6. **Security:**
   - SQLCipher (or Tink field encryption) with a Keystore-wrapped DEK, and an ingest-capable key while locked.
   - Tink + DataStore (no security-crypto).
   - FLAG_SECURE plus no-recents-thumbnail on sensitive screens.
   - Backup exclusions.
   - Clerk Android SDK with a new device token-exchange endpoint, and never embed INTERNAL_API_SECRET.
7. **Versions:** targetSdk 36 now (prepare for 37), compileSdk 37, minSdk 29–31, arm64 only, 16 KB alignment.

## 9. Open uncertainties to re-verify
- Whether Play has added a specific declaration for notification-listener access (none found today).
- The exact current SMS/Call Log exception list (help pages disagree).
- The exact OTP-redaction heuristics and which roles exempt an app (no official API doc; based on AOSP code and press reports).
- WhatsApp's exact notification formats for edits, deletes, and reactions in current versions. Test on devices.
- Real tok/s for the chosen model and runtime on target mid-range devices. Benchmark before committing.
- Room + SQLCipher integration with Room 2.7+/3.x's bundled SQLite driver.
