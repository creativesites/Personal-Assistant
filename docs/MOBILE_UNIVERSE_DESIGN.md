# Zuri Universe — Mobile Design System

> Status: **shipped in `apps/mobile`** (Expo 51 / React Native 0.74). Interactive prototype of the same five screens: https://claude.ai/artifact/78u1CJxPDBB64ehAUEaavX (private to the owner).
> This document is the source of truth for how Zuri's mobile app looks, moves and feels. Read it before you touch any screen in `apps/mobile`, and before designing any new mobile surface — including the planned native Android app (`docs/mobile/`, decision D-01), which should carry this design language forward rather than invent a new one.

## Contents
1. The idea
2. Design principles
3. Foundations: color, type, shape, depth, motion
4. Screen specs (Ignition, Signals, Signal Tunnel, Orbits, Missions)
5. Component kit (`src/universe/`)
6. The 2.5D orbit engine (how the 3D works in React Native)
7. Data mapping — what every visual encodes
8. Accessibility & reduced motion
9. Performance budget
10. How to extend the universe (rules for new screens)
11. Known gaps & follow-ups

---

## 1. The idea

Zuri is a Relationship Operating System. The web dashboard presents that as a calm productivity tool. The mobile app — a personal, always-in-your-pocket surface — leans all the way into the metaphor instead:

**Your relationships are a living star system, and you are the sun at its centre.**

| Product concept | Universe metaphor | Where |
|---|---|---|
| The user | The **sun** (warm orange orb, "YOU") | Signals, Orbits |
| A contact | A **planet** — each has its own deterministic colour skin | everywhere |
| Relationship health | **Orbital distance** — healthier bonds orbit closer | Orbits |
| Importance tier | **Planet size** | Orbits |
| Unread / waiting on you | A **pulsing ion ring** around the planet | Signals |
| A conversation | A **signal tunnel** — rings rushing toward you | Conversation |
| AI reply drafts | **Holographic cards** fanned in 3D | Conversation |
| Proactive nudges | **Missions** — cards you launch like comets | Missions |
| Nothing left to do | **Orbit clear** — a calm green world breathing | Missions |
| Zuri itself | The violet **core** in the centre of the dock | Dock |

Renamed surfaces (route names in code are unchanged so navigation/types stay stable):

| Route (code) | Display name | Icon |
|---|---|---|
| `Login` | Ignition | ringed planet |
| `Inbox` | **Signals** | chat bubble |
| `Conversation` | Signal Tunnel | — |
| `Relationships` | **Orbits** | orbit (raised core button) |
| `Proactive` | **Missions** | comet |

---

## 2. Design principles

1. **Every visual encodes something true.** Distance = health, size = tier, pulse = unread, ring colour = health band. Decoration that carries no meaning (stars, nebula, tunnel) is confined to the background layer and never competes with data.
2. **Motion is ambient, never blocking.** Loops run on the native driver, nothing waits on an animation to finish before it is usable, and every loop freezes under OS Reduce Motion.
3. **Zuri advises, you decide.** Nothing sends without an explicit tap ("Launch message", the send orb). Drafts are always editable (tap the front holo card).
4. **Dark is the only theme.** The app is a night sky; there is no light mode. Contrast is designed for that one surface (§3.1).
5. **Physical, not flat.** Things tilt back when pressed (`TiltPressable`), rise into place when they appear (`Rise`), and leave the screen with momentum (mission cards fly off). Depth is always readable.
6. **Honest empty and error states.** No invented data. Empty sky / lost signal / orbit clear each say exactly what is going on and what to do.

---

## 3. Foundations

All tokens live in `apps/mobile/src/universe/theme.ts`. Never hardcode a colour that already has a token.

### 3.1 Color

| Token | Hex | Role |
|---|---|---|
| `void` | `#03040B` | deepest background, nav theme background |
| `space` | `#070818` | mid sky |
| `deep` | `#140F33` | top-of-sky glow |
| `ink` | `#EEF0FF` | primary text |
| `inkSoft` | `#B9BFE0` | body text |
| `inkMuted` | `#A3AACC` | labels, timestamps (≥ 4.5:1 on `space`) |
| `nebula` | `#7C5CFF` | brand violet / primary accent |
| `ion` | `#7DF9FF` | live, selected, focus, unread |
| `sun` | `#FF9E4A` | the user |
| `aurora` | `#5BF5B0` | thriving, success, sent |
| `ember` | `#FF966E` | drifting, needs attention |
| `star` | `#FFB86B` | Zuri noticings, check-ins |

Gradients: `sky` (page), `launch` (primary CTA: violet → purple → cyan), `outgoing` (my bubbles), `glass` (surfaces), `card` (opaque deep cards: holo drafts, missions, sheets).

**Planet skins** — 8 three-stop skins (`[highlight, body, shadow]`): rose, amber, teal, moss, cobalt, amethyst, citrine, coral. `skinFor(id)` hashes a contact id so a person is the same colour on every screen, forever. Special skins: `SUN_SKIN` (user), `CORE_SKIN` (Zuri), `CLEAR_SKIN` (orbit clear).

**Health bands** (`healthBand(score)` — same thresholds as web):

| Band | Score | Colour |
|---|---|---|
| Thriving | ≥ 75 | aurora |
| Steady | 50–74 | ion |
| Drifting | 25–49 | ember |
| Dormant | < 25 or null | grey-lilac |

### 3.2 Typography

| Use | Font | Size / tracking |
|---|---|---|
| Wordmark (Ignition) | Space Grotesk Bold | 66 / -3, violet text glow |
| Screen title | Space Grotesk Bold | 38 / -1.5 |
| Card / sheet title | Space Grotesk Bold | 19–28 / -0.6 to -0.8 |
| Body | Inter Regular | 13.5–16, line-height ≈ 1.45 |
| Names | Inter Bold | 15 |
| Labels / eyebrows | Inter Bold or ExtraBold | 10.5–11, uppercase, +1.2–1.5 tracking |

Only these 7 weights are bundled (`App.tsx` requires each `.ttf` individually): Inter 400/500/600/700/800, Space Grotesk 600/700. Use the `fonts.*` tokens.

### 3.3 Shape

Radius scale (`radii`): chips 999 · controls 18 · cards 24 · sheets 30 · hero cards 32. Every interactive element has a **44 px minimum touch target**; orbit planets get an invisible ≥ 44 px hit area even when the planet is drawn smaller.

### 3.4 Depth

Four layers, back to front:
1. **Sky** — gradient + nebula + 3 star layers (`Starfield`). Non-interactive.
2. **Scene** — orbit systems, the warp tunnel, the planet hero. Mostly decorative, planets tappable.
3. **Glass** — content surfaces (`Glass`): translucent gradient + hairline border. No blur (blur is unreliable on Android and expensive); the translucency over the moving sky is what reads as glass.
4. **Chrome** — the floating dock, composer, sheets.

Glows are colour-matched to their source (`shadowColor` = the orb's body colour), never neutral black — same principle as the web Design System's tinted shadows.

### 3.5 Motion

| Token / loop | Base duration | Notes |
|---|---|---|
| Star twinkle | 3.5 s / 6 s / 9 s | three layers, ping-pong |
| Star drift | 90–160 s | sky slowly scrolls upward |
| Nebula | 40 s ping-pong | translate + 10° rotate |
| Inbox orbit period | 42 s | inner ring ×3, middle ×2, outer ×1 revolutions |
| Orbits gravity map | 80 s | one revolution, all planets rigid |
| Login moons | 17 s | inner moon ×2 |
| Unread pulse | 1.8 s | ion ring expands and fades |
| Dock core pulse | 2.8 s | violet halo |
| Warp tunnel | 6 s | 6 staggered rings |
| Holo shimmer | 4 s | sweep across cards |
| CTA sheen | 3.2 s | sweep across `LaunchButton` |
| Entrance (`Rise`) | 800 ms | `bezier(.2,.8,.2,1)`, +26 px & 22° tilt → 0, 70 ms stagger per row (first 8 rows only) |
| Card swing (holo) | spring speed 9 / bounciness 7 | |
| Mission fly-off | 750 ms | `bezier(.5,0,.75,.2)` — accelerates away |

**Motion setting** (`MotionProvider`): `calm` ×1.9 · `cosmic` ×1 (default) · `hyper` ×0.45 multiplies every ambient duration. Persisted in SecureStore (`zuri_motion_level`). Changed from the **Control deck** (tap your sun or the sliders button on Signals).

**Haptics** (`tap()`): light on selection/navigation, medium on primary CTAs, success notification on sign-in, send and launch.

---

## 4. Screen specs

### 4.1 Ignition — `LoginScreen.tsx`
- **Hero:** `PlanetHero` — a 184 px banded violet world (stripes scroll across the surface for rotation), a breathing atmosphere halo, three tilted rings (dashed outer, glowing cyan, wide faint pink) and two moons on the 76°-tilted orbit engine; the whole system floats ±9 px.
- **Copy:** "RELATIONSHIP OS · ONLINE" live pill → "Zuri" wordmark → tagline "Every relationship you care about, held in orbit. Zuri reads the gravity — you decide the move."
- **Form:** labelled glass inputs; focused input glows ion. Errors render inline in ember (no `Alert` pop-ups).
- **CTA:** "Launch into orbit" (`LaunchButton`). Footnote: "Zuri advises. You stay in control."
- Everything rises in with a 100 ms stagger.

### 4.2 Signals — `InboxScreen.tsx`
- **Header:** time-of-day label ("Good evening") + "Signals"; right side: control-deck button + live pill (`N unread` in ion, or `All quiet` in aurora).
- **Constellation (260 px):** the user's sun at centre, three rings at 75 / 116 / 158 px tilted 68°. The six most relevant conversations (API order: pinned → unread → recent) become planets, two per ring, sizes 34 → 22. Unread planets pulse. Tapping a planet opens that chat; tapping the sun opens the control deck.
- **List:** glass rows rise in; each row = planet avatar, name, relative time, preview, health-band chip (or "Group"), "Pinned" chip, ion unread badge. Rows tilt back under the thumb.
- **Live:** refreshes on socket `message:new` and `conversation:upsert`; pull-to-refresh with ion spinner.
- **Empty:** "A quiet sky" (link WhatsApp from the web app). **Error:** "Lost the signal".

### 4.3 Signal Tunnel — `ConversationScreen.tsx`
- **Backdrop:** `WarpTunnel` — six violet rings scale from a point at 38 % height out past the screen edges.
- **Header:** glass bar — back, contact planet (glowing), name, "Warmth {score} · {band}" in the band colour.
- **Messages:** inverted list. Theirs = glass bubble (sender name in groups); mine = violet gradient with tinted shadow. Media without text shows an italic label (Photo, Voice note…).
- **Noticing chip:** when the latest contact message `requiresResponse` and there are no drafts: "Zuri noticed: this one is waiting on you" (star colour).
- **Holo deck:** if the latest contact message has pending suggestions, they appear as 236×164 holographic cards. Front card faces you; neighbours swing ±128 px, rotateY ∓38°, 86 % scale, 55 % opacity. Tap a side card → it swings forward. Tap the front card → its text drops into the composer for editing. "Not this one" dismisses the front draft.
- **Composer:** glass bar + violet send orb. Send rules: edited draft → `approve` with `editedText`; typed text → `POST /conversations/:id/messages`; empty input with drafts → approve the front draft. Success replaces the input for 2.2 s with "Sent into orbit. Zuri will watch for {name}'s reply."
- **Live:** refreshes on `message:new` and `suggestion:ready`; marks the conversation read on open.

### 4.4 Orbits — `RelationshipsScreen.tsx`
- **Filters:** All orbits / Needs attention (drifting band) / Dormant — pill tabs.
- **Gravity map (300 px, tilt 64°, 80 s):** the user's sun at centre; rings at 42 % (aurora — thriving zone), 70 % (ion — steady) and 100 % (dashed ember — the drift line). Up to 10 contacts as planets:
  - `radius = 30 + (100 − health)/100 × (maxR − 30)` → **closer = healthier**
  - `size = {tier1: 44, tier2: 36, tier3: 30}`
  - angles spread by the golden angle (137.5°) so planets never clump.
  - selected planet wears a glowing ion ring.
- **Overflow strip:** when more than 10 contacts match, a horizontal strip of planet chips lets you select anyone.
- **Profile sheet:** health ring (SVG arc in band colour), name, job · company, tier / band / trend chips (Warming ↑ / Cooling ↓), the AI personality summary (or an honest "still getting to know this person"), actions **Open chat** (only if a conversation exists) and **Missions**.

### 4.5 Missions — `ProactiveScreen.tsx`
- **Header:** "Missions" + "{N} nudges in orbit"; a progress constellation of dots (aurora = launched, grey = skipped, ion = current), capped at 8.
- **Deck:** up to 4 cards stacked in depth (each deeper card −22 px, rotateX +5°, −4 % scale, −28 % opacity). Card: contact planet, name, relationship type, type chip (Check in / Reconnect / Celebrate / Follow up), title, body, "Draft in your voice" panel.
- **Actions:** **Launch message** → `POST /api/proactive/:id/send` (sends the draft over WhatsApp for real) and the card flies up-right off screen; for drafts-less nudges the button reads "Mark done" (`PATCH status=approved`). **Not now** → `PATCH status=dismissed`, card swings away left. Failures keep the card and show an inline error.
- **Ambient:** two comets streak across the sky on a 7 s cycle.
- **Orbit clear:** breathing green world, "{launched} of {total} messages launched…", "Check again".

### Dock — `universe/Dock.tsx`
A floating glass pill (74 px, radius 30, 18 px side insets, above the safe area). Signals and Missions on the wings (icon + label + ion dot when active); **Orbits is the raised core** — a 60 px violet orb in a dark collar that pokes above the bar with a pulsing halo. Screens pad their scroll content with `useDockClearance()`.

### Control deck — `universe/ControlDeck.tsx`
Bottom sheet: motion speed (calm / cosmic / hyper, radio cards), a note when OS Reduce Motion is on, and Sign out.

---

## 5. Component kit (`apps/mobile/src/universe/`)

Import everything from `'../universe'`.

| Export | File | Use |
|---|---|---|
| `colors`, `gradients`, `fonts`, `radii`, `skinFor`, `initialOf`, `healthBand`, `BAND_STYLE`, `relativeTime`, `greeting` | `theme.ts` | tokens & helpers |
| `MotionProvider`, `useMotion`, `useLoop`, `useEntrance` | `motion.tsx` | all animation timing |
| `SpaceScreen`, `Starfield` | `Starfield.tsx` | **every screen's root** |
| `Orb` | `Orb.tsx` | any planet/avatar/sun |
| `Glass` | `Glass.tsx` | content surfaces |
| `Rise` | `Rise.tsx` | entrance animation wrapper |
| `OrbitSystem` | `OrbitSystem.tsx` | tilted orbits with occlusion + tap targets |
| `PlanetHero` | `PlanetHero.tsx` | Ignition hero |
| `WarpTunnel` | `WarpTunnel.tsx` | conversation backdrop |
| `HoloDeck` | `HoloDeck.tsx` | 3D card fan |
| `Dock`, `useDockClearance` | `Dock.tsx` | tab bar |
| `ControlDeck` | `ControlDeck.tsx` | settings sheet |
| `Label`, `Title`, `LivePill`, `LiveDot`, `Chip`, `LaunchButton`, `GhostButton`, `TiltPressable`, `LoadingOrb`, `tap` | `Kit.tsx` | atoms |
| `ChatIcon`, `OrbitIcon`, `CometIcon`, `SparkIcon`, `ArrowIcon`, `BackIcon`, `CheckIcon`, `CloseIcon`, `SlidersIcon` | `Icons.tsx` | stroke SVG icons (no emoji, no icon fonts) |

---

## 6. The 2.5D orbit engine

React Native has no `transform-style: preserve-3d`, so a tilted plane with children cannot be expressed directly. `OrbitSystem` projects orbits itself:

```
θ(p) = angle₀ + 2π · speed · p          p ∈ [0,1] is the loop value
x = r·cosθ
y = r·sinθ·cos(tilt)                     ellipse squashed by the tilt
depth = sinθ                              +1 = nearest the viewer
scale = 1 + 0.16·depth                    near planets are bigger
```

The orbit is sampled at 48 points and handed to `Animated.Value.interpolate` for `translateX`, `translateY`, `scale` and two opacities — so **the whole system runs on the native driver; JS does zero work per frame.**

- **Occlusion:** each body renders twice: a *back* copy (visible while `depth < 0`, dimmed to 78 %) drawn before the centre object, and a *front* copy (visible while `depth ≥ 0`) drawn after it. Rings are split the same way into a back arc and a front arc (SVG elliptical arcs), so planets pass behind the sun and rings wrap around planets.
- **Touch:** a single transparent top layer of ≥ 44 px `Pressable`s follows the same translate tracks, so each body is tappable exactly once regardless of which copy is visible.
- **Seamless loops:** every body's `speed` is an integer number of revolutions per period, so `p = 1` lands exactly where `p = 0` started.
- **Other 3D:** `HoloDeck`, `Rise`, `TiltPressable` and mission cards use `perspective` + `rotateX/rotateY` transforms, which RN supports natively. The warp tunnel fakes translateZ with scale + opacity on `Animated.modulo`-phased rings.

---

## 7. Data mapping

All shapes come from the real API (`apps/mobile/src/lib/api.ts`; the original scaffold's types were wrong and were fixed in this pass — see `docs/mobile/BACKEND_API_MAP.md` §C.8).

| Visual | Source |
|---|---|
| Signals planets & rows | `GET /api/conversations` → `{conversations}` (first 6 become planets) |
| Planet colour | `skinFor(contact.id)` |
| Unread pulse / badge | `conversation.unreadCount > 0` |
| Health chip / warmth line | `healthScore` → `healthBand()` |
| Messages | `GET /api/conversations/:id/messages` → `{messages, contact}` |
| Holo drafts | latest contact message with `pendingSuggestions > 0` → `GET /api/messages/:id/suggestions` |
| Send draft | `POST /api/suggestions/:id/approve` (`{editedText}` if edited) |
| Manual send | `POST /api/conversations/:id/messages` `{text}` |
| Dismiss draft | `POST /api/suggestions/:id/dismiss` |
| Orbit distance / size / sheet | `GET /api/contacts` → `relationship.healthScore`, `importanceTier`, `healthTrend`, `profile.personalitySummary` |
| "Open chat" from Orbits | contact id → conversation id via `GET /api/conversations` |
| Missions | `GET /api/proactive` → `{suggestions}`; launch `POST /api/proactive/:id/send`; skip `PATCH /api/proactive/:id {status:'dismissed'}` |
| Live updates | Socket.io `message:new`, `conversation:upsert`, `suggestion:ready` (client now authenticates with the raw JWT string, as `services/api/src/lib/socket.ts` expects) |

---

## 8. Accessibility & reduced motion

- **Reduce Motion:** `useLoop` returns a frozen value when the OS setting is on (planets hold position, stars stop twinkling, tunnel stops); `useEntrance` starts at its end state; mission fly-off becomes instant. The control deck explains why things are still.
- Every tappable element is a real `Pressable` with `accessibilityRole`, a label, and `accessibilityState` (`selected`, `disabled`, `busy`). Orbit planets announce "Name, health N".
- Decorative layers (`Starfield`, `PlanetHero`, comets, tunnel) are `pointerEvents="none"` and hidden from accessibility.
- Stacked mission cards behind the front one are removed from the accessibility tree; only the front mission is announced. Holo draft cards all stay reachable, each announcing its tone, text and selected state.
- Text colours were chosen against `space`/`void`: `inkMuted` ≥ 4.5:1; never put body text below `inkMuted`.
- Errors are inline text with `accessibilityLiveRegion="polite"`, not modal alerts.

---

## 9. Performance budget

- All ambient animation on the **native driver**; never animate width/height/top/left/margins.
- Starfield ≈ 120 tiny views in 3 layers — do not add more layers; reuse `SpaceScreen`.
- Orbit systems: ≤ 10 bodies (each costs 3 views: back, front, hit target).
- Entrance stagger only on the first 8 list rows; later rows appear instantly.
- No blur views. No Lottie. No reanimated/skia dependency (kept the dependency surface to `react-native-svg`, `expo-linear-gradient`, `expo-haptics`, `expo-font`).
- Bundle check: `npx expo export --platform android` (Hermes bundle ≈ 2.3 MB).

---

## 10. Extending the universe — rules

1. **Root every screen in `<SpaceScreen>`.** Never set a light background anywhere.
2. **Find the metaphor first.** A new surface should answer "what is this in the universe?" (e.g. Calendar → a *trajectory* of upcoming encounters; Advisor → talking to the *core*; Documents → *cargo*). Write the mapping into §1 of this doc.
3. **Encode, don't decorate.** If a visual property varies (size, distance, colour, pulse), it must map to a real field — document it in §7.
4. **Use tokens and the kit.** New colours/skins go into `theme.ts`; new reusable visuals go into `src/universe/` with a one-line header comment and an export in `index.ts`.
5. **Animate through `useLoop` / `useEntrance` / springs with `useNativeDriver: true`.** That is what makes the motion setting and Reduce Motion work for free.
6. **Every primary action gets haptics** via `tap()`.
7. **One screen per file** under `src/screens/`, shared visuals under `src/universe/` (same File Architecture rule as the web app — split at ~500 lines).
8. **Verify:** `npx tsc --noEmit` and `npx expo export --platform android` must pass. Update this document in the same change.

---

## 11. Known gaps & follow-ups

- **Auth model:** the app still signs in with email/password (`POST /api/auth/login`), which only works for legacy password accounts; Clerk-created users have no password. Moving mobile to Clerk is out of scope for the redesign (see `docs/mobile/BACKEND_API_MAP.md`).
- **Strategic status:** `docs/mobile/DECISIONS.md` D-01 proposes superseding `apps/mobile` with a native Kotlin/Compose app (`apps/android`), pending product-owner approval. If that happens, port this design language: Compose `graphicsLayer { rotationX; cameraDistance }` covers the 3D transforms, and the orbit engine's projection math (§6) carries over unchanged.
- **Assets:** `app.json` references `assets/icon.png`, `assets/splash.png`, `assets/adaptive-icon.png`, which do not exist yet. Design them in the Universe style (the ringed Ignition planet on `#03040B`).
- Not yet built: per-message "Zuri noticed" insights beyond `requiresResponse`, Advisor chat (the core), Calendar, and push notifications.
- Not verified on a physical device in this pass — validated by typecheck and a full Metro/Hermes Android export only.
