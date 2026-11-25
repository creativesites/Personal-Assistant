# Zuri Android

Native Kotlin / Jetpack Compose app. Local-first: it is fully usable without a Zuri account, and the
phone owns the data it creates. Design and plan: `docs/mobile/` (start with `IMPLEMENTATION_PLAN.md`).
Prototype: `design/mobile/index.html`.

## Status: milestone M1, Foundation

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
| Notification capture (M2), on-device models (M3), everything after | not started |

## Build

Requirements: JDK 17+ (21 recommended), Android SDK. The build downloads platform 37.2 itself if licences are accepted. Create `local.properties` with `sdk.dir=…`.

```bash
cd apps/android
./gradlew :app:assembleDebug                 # APK in app/build/outputs/apk/debug
./gradlew :domain:test :core:common:testDebugUnitTest :core:security:testDebugUnitTest \
          :data:local:testDebugUnitTest :app:testDebugUnitTest :arch-tests:test
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
| `:feature:onboarding`, `:feature:today`, `:feature:settings` | Screens and view models |
| `:arch-tests` | Konsist rules: module boundaries, no networking, no raw `android.util.Log` |

## Deviations from the plan

- SDK levels follow D-15: compileSdk 37.2 (current AndroidX/Compose require at least 37.1), targetSdk 36, minSdk 29.
- Business navigation (Studio, Documents) and the Hybrid view arrive with their milestones; M1 has the Personal tab set for every workspace.
- The identity `app.zuri.android` and the name "Zuri" are placeholders (Q-11).
