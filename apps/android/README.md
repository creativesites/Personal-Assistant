# Zuri Android

Native Kotlin / Jetpack Compose app. Local-first: it is fully usable without a Zuri account, and the
phone owns the data it creates. Design and plan: `docs/mobile/` (start with `IMPLEMENTATION_PLAN.md`).
Prototype: `design/mobile/index.html`.

## Status: M1 Foundation done; M2 Notification ingestion built (device verification pending)

| Area | State |
|---|---|
| Modules, version catalog, CI (path-filtered) | done |
| Design system: light and dark themes, workspace context tints, Manrope typography, components | done |
| Encrypted database: Room + SQLCipher; key wrapped by Android Keystore (StrongBox when available) | done |
| Secrets: Tink AEAD with a Keystore master key (replaces deprecated security-crypto) | done |
| App lock: biometric or device credential, timeouts; screenshot blocking; blank recents preview | done |
| Backups: disabled; every data domain excluded from cloud backup and device transfer | done |
| Onboarding (Welcome, Privacy, local start), Today (first-day state), Settings (theme), Security, Privacy Center (measured values) | done |
| Workspaces: Personal plus business workspaces, context switcher, tinted chrome | done (isolation enforcement grows in M5) |
| Network | **none**: the app has no INTERNET permission in M1, enforced by a test |
| **M2** Notification listener; per-source opt-in (all off by default); capture gate checked before a notification is read | built |
| **M2** Source adapters (WhatsApp, WA Business, Telegram, Signal, Messenger, Slack, Gmail, Google/Samsung Messages), normaliser with honest placeholders (media, deleted, one-time-code hidden, preview hidden) | built; synthetic golden fixtures until the M0 spike |
| **M2** Ingest: dedup by fingerprint, edits with history, sender deletions (text dropped), exclusions, store-only, retention (raw 7 days; per-source message retention) | built |
| **M2** Sources screen with the prominent disclosure, listener health, restricted-settings and battery guidance; Inbox; read-only conversation with provenance; selective deletion | built |
| On-device models (M3), everything after | not started |

## Build

Requirements: JDK 17+ (21 recommended), Android SDK. The build downloads platform 37.2 itself if licences are accepted. Create `local.properties` with `sdk.dir=…`.

```bash
cd apps/android
./gradlew :app:assembleDebug                 # APK in app/build/outputs/apk/debug
./gradlew :domain:test :core:common:testDebugUnitTest :core:security:testDebugUnitTest \
          :data:local:testDebugUnitTest :engine:ingest:testDebugUnitTest :app:testDebugUnitTest :arch-tests:test
./gradlew recordRoborazziDebug               # re-record screenshot baselines (light and dark)
./gradlew verifyRoborazziDebug               # compare against src/test/screenshots
```

`gradle.properties` is tuned for an 8 GB machine (one 3 GB daemon, in-process Kotlin). Run one Gradle build at a time.

## Modules

| Module | Role |
|---|---|
| `:app` | Activity, navigation shell, app lock gate, DI root |
| `:domain` | Pure Kotlin models and repository interfaces (workspaces, context scope, settings) |
| `:core:common` | UUIDv7 ids, clock, redacting `ZuriLog` |
| `:core:ui` | Theme, tints, typography, components |
| `:core:security` | Keystore key wrapping, database key, Tink secret store, app lock |
| `:data:local` | Encrypted Room database, repositories, preferences, storage inspection |
| `:engine:ingest` | NotificationListenerService, snapshot extraction, source adapters, normaliser, dedup, retention |
| `:feature:onboarding`, `:feature:today`, `:feature:settings`, `:feature:sources`, `:feature:inbox` | Screens and view models |
| `:arch-tests` | Konsist rules: module boundaries, no networking, no raw `android.util.Log` |

## Deviations from the plan

- SDK levels follow D-15: compileSdk 37.2 (current AndroidX/Compose require at least 37.1), targetSdk 36, minSdk 29.
- Business navigation (Studio, Documents) and the Hybrid view arrive with their milestones; M1 has the Personal tab set for every workspace.
- The identity `app.zuri.android` and the name "Zuri" are placeholders (Q-11).
- M2 ingest runs in-process (a conflated single consumer) instead of as WorkManager work: the bound listener keeps the process alive and the work needs no model. Rows left pending by a killed process are processed on the next start. Retention piggybacks on ingest at most every 12 hours.
- M2 has no generic adapter for arbitrary apps: listing every installed app needs `QUERY_ALL_PACKAGES`, which Play restricts. Only the nine supported apps are visible to Zuri (`<queries>`).
- M2 stores the sender's name and key on each message; the `person` table and identity resolution arrive with M4/M6.
- Every captured conversation goes to Personal until M5 adds workspace rules.

## What M2 still needs before it can be called done

The M2 acceptance criteria are measured on real phones, which this environment doesn't have:
- the M0 notification spike: real captures from each app (anonymised) to replace the synthetic fixtures, and to confirm whether WhatsApp's `shortcutId` is the chat JID;
- a 7-day dogfood: ≥ 99% of notifications from enabled sources stored exactly once, zero from other apps;
- the listener callback p95 under 5 ms, and the listener-rebind instrumented test.
