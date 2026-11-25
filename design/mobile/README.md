# Zuri Android — design prototype

Open `index.html` in a desktop browser. No build step, no server.

- Left: the 14 journeys and an index of every screen.
- Centre: the phone. Tap anything.
- Right: notes for each screen.
- Use ‹ › or the arrow keys inside a journey, and Auto/Light/Dark for theme.
- Deep links: `index.html#P03` (a screen), `index.html#j12-4` (journey 12, step 4).

Screen ids match `docs/mobile/SCREEN_MAP.md`. The rationale is in `docs/mobile/DESIGN_REVIEW.md`.

All people, businesses, messages and amounts are fictional sample data. This is a design artifact, not app code. The Android app has not been started.

Files:

| File | Contents |
|---|---|
| `app.css` | Viewer styles and the prototype design system |
| `proto-core.js` | Shared helpers and sample data |
| `screens-*.js` | Screens grouped as in the screen map |
| `app.js` | Journeys, router and notes panel |
