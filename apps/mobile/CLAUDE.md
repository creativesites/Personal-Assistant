# apps/mobile — agent guide

The Zuri mobile app (Expo 51 / React Native 0.74) uses the **Zuri Universe** design system: a dark, animated star system where the user is the sun and contacts are planets. **Read `docs/MOBILE_UNIVERSE_DESIGN.md` before changing any screen.** It is the source of truth for tokens, screen specs, data mapping and motion.

## Setup
- Not part of the root npm workspace (React 18/19 conflict). Run `npm install --legacy-peer-deps` **inside `apps/mobile`**.
- `EXPO_PUBLIC_API_URL` points the app at the API (defaults to `http://localhost:3000`).

## Verify every change
```bash
cd apps/mobile
npx tsc --noEmit                                    # must be clean
npx expo export --platform android --output-dir /tmp/zuri-export   # Metro + Hermes bundle must succeed
```

## Building an APK
CI builds it, not this container (cloud sandboxes usually can't reach Google's Android SDK host). `.github/workflows/mobile-apk.yml` runs on every push to `main` that touches `apps/mobile/**`, or on demand from the Actions tab ("Mobile APK" → Run workflow, with an optional API URL). It runs `expo prebuild` → `gradlew assembleRelease` and uploads `zuri-universe-<run>.apk` as a run artifact, kept for 30 days.
- `versionCode` = the run number, so each new APK installs as an update over the last one.
- It's signed with the debug keystore. That's fine for sideloading, but the Play Store needs a real keystore.
- The package is `com.zuri.app`. The native Kotlin app (`apps/android`) is `app.zuri.android`, so both can be installed side by side.
- `EXPO_PUBLIC_API_URL` is inlined at build time, and defaults to production `https://34-13-48-134.sslip.io`.
- `android/` is generated and gitignored. Never commit it.

## Layout
```
src/
  universe/        design-system kit — import everything from '../universe'
    theme.ts       colours, gradients, fonts, radii, planet skins, health bands, helpers
    motion.tsx     MotionProvider, useLoop, useEntrance (speed setting + Reduce Motion)
    Starfield.tsx  SpaceScreen (every screen's root) + animated sky
    Orb.tsx        lit sphere — planets, sun, core
    OrbitSystem.tsx  2.5D tilted orbits (native-driver projection, occlusion, tap targets)
    Glass.tsx, Rise.tsx, Kit.tsx, Icons.tsx, Dock.tsx, ControlDeck.tsx,
    HoloDeck.tsx, WarpTunnel.tsx, PlanetHero.tsx
  screens/         one file per screen (Login=Ignition, Inbox=Signals, Conversation=Signal Tunnel,
                   Relationships=Orbits, Proactive=Missions)
  navigation/      stack + tabs; custom tab bar is universe/Dock
  lib/api.ts       typed client — shapes mirror services/api exactly
```

## Rules
1. Wrap every screen in `<SpaceScreen>`. No light backgrounds, no light mode.
2. Use tokens from `theme.ts` and fonts from `fonts.*`. Don't hardcode a hex that has a token, and don't add font weights without adding them to `App.tsx`'s `useFonts` (each `.ttf` is required individually to keep the bundle small).
3. All animation goes through `useLoop` / `useEntrance` / springs with `useNativeDriver: true`. Never animate layout props. That's what makes the motion setting and OS Reduce Motion work.
4. Every visual variable encodes real data (distance = health, size = tier, pulse = unread). Record new mappings in the design doc's §7.
5. Interactive elements: `Pressable` with `accessibilityRole` + label, ≥ 44 px target, haptics via `tap()`.
6. Nothing sends without an explicit user tap. AI drafts stay editable.
7. Icons are stroke SVGs in `universe/Icons.tsx`. No emoji, no icon fonts.
8. Keep files under ~500 lines; new shared visuals go in `src/universe/` and get exported from `index.ts`.
9. Check API response shapes against `services/api/src/routes/*` (or `docs/mobile/BACKEND_API_MAP.md`) before adding a call. The original scaffold guessed wrong.
10. Update `docs/MOBILE_UNIVERSE_DESIGN.md` in the same change as any design change.

## Context
- `docs/mobile/` holds a separate, pending proposal (D-01) to replace this app with native Kotlin/Compose. Until that's approved, this app is live work. If it's approved, the Universe design language carries over (design doc §11).
- Launch assets live in `assets/` (icon, Android adaptive icon, splash). See design doc §3.1b before replacing them.
- Auth is still email/password (`/api/auth/login`), which doesn't work for Clerk-only accounts. This is a known gap.
