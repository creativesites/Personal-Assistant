# Zuri Android — Design Review

> Part of the Zuri Android initial engagement (deliverable 3 of 3), 2026-11-24. **Status: for product-owner review. Implementation does not start until this design and `IMPLEMENTATION_PLAN.md` are explicitly approved.**

## 1. How to view the prototype

- **Hosted copy (private to the owner):** https://claude.ai/artifact/517Eg8uAGLTZgGJQK26VKY
- **Entry point:** `design/mobile/index.html`. Open it in any desktop browser. It is a self-contained clickable HTML prototype: no build step, no server, fonts from Google Fonts.
- **Viewer:**
  - **Left:** the 14 required journeys, plus an index of all 91 screens grouped A–F as in `SCREEN_MAP.md`.
  - **Centre:** the phone.
  - **Right:** notes for the current screen: purpose, data source, milestone, design notes and open UX questions.
- **Navigating:**
  - Tap anything in the phone.
  - In a journey, use ‹ › (or the arrow keys) to step.
  - Use Auto/Light/Dark to switch themes.
- **Deep links:** `index.html#P03` opens a screen; `index.html#j12-4` opens journey 12, step 4.
- **On a phone or narrow window:** the rail becomes a picker above the phone.
- **Sample data:** all people, businesses, messages and amounts are fictional. The device figures (RAM, speed) are illustrative until the M0 benchmark spike.

Every screen id matches `SCREEN_MAP.md`. The prototype contains three Android system screens (`X01`, `X02`) for journey continuity, plus a few state variants (`P02N`, `P02B`, `G04G`, `S01C`, `G06M`, `P13A`, `P14E`, `P14D`, `B05A`, `B05E`), each listed in the viewer.

## 2. Design direction

**Idea.** A calm personal notebook that listens. The signature visual idea is the **thread**: every insight hangs from a visible line to the message it came from.
- In a conversation, "Zuri understood" sits directly under the bubble that produced it.
- Every memory, answer, document section and BI number opens its source.

This is the brief's provenance requirement turned into the product's look, not a hidden debug panel.

**Context is always visible.**
- The top app bar carries a soft band and a context chip in the active workspace's colour:
  - **teal** for Personal
  - **indigo** for the Kalulu Irrigation business
  - **plum** for a second, phone-only business
  - **slate** for a Hybrid view
- The same tint marks the active navigation item, primary buttons and selection.
- A user can tell from any screen which world they are in, which is the visible half of workspace isolation (D-04).

**Brand continuity with the web, re-expressed for Android.**
- **Kept from the web Design System:** indigo-600 as the brand colour, large radii (24–28 dp cards and sheets), restrained tinted surfaces, and the indigo-to-cyan gradient reserved for the Zuri AI mark.
- **Changed for Android:**
  - Material 3 patterns throughout: navigation bar, top app bars, bottom sheets, FAB, segmented chips, switches, predictive back.
  - No dashboard grids squeezed onto a phone.
  - Typography is Manrope for headings and numbers, and Roboto Flex for UI text, which stays close to platform-native.

**Calm over busy.** Each root screen answers one question:
- Today: what needs me?
- Inbox: who said what?
- People: who matters?
- Ask: what do I want to know?
- Studio/Documents: what am I running or making?

Numbers appear large only where they are the answer (money owed, a health score).

**Light and dark** are both first-class. The dark theme is the same design at night, not inverted.

## 3. Navigation

| Context | Bottom navigation |
|---|---|
| Personal / Hybrid | Today · Inbox · People · Ask · More |
| Business workspace | Today · Inbox · Studio · Ask · Documents |

- **Business navigation swaps** People/More for Studio/Documents. This is the most frequent business work. People remain reachable through Studio → Clients and from conversations.
- **Every root screen** has the context chip (opens the switcher sheet `G08`), search (`G09`), and the capture-status indicator (green = listening, amber = degraded, grey = paused), which opens Sources.
- **Sub-screens** use a back-arrow top bar. Sheets are used for focused, short decisions: disclosure, reply, line edit, evidence, pause, context switch.
- **On tablets and foldables** (described, not prototyped): a navigation rail and list-detail panes for Inbox, People and Documents.

The full tree and web route mapping are in `SCREEN_MAP.md`.

## 4. Major interaction patterns

| Pattern | Where | Rule |
|---|---|---|
| **Understood strip** | `P03`, `P03B` | Extracted items appear under the source message with confidence (5-bar meter). Tap to confirm, edit or open the memory. |
| **Confidence meter** | Memories, facts | 1–5 bars. Low-confidence items are "to confirm", never silent memories. |
| **Citations** | Ask (`P13A`), BI (`B05A`) | Numbered chips open the exact message or record. No answer without sources, or an explicit "I don't know". |
| **Scope bar** | Ask, BI, document context | States what Zuri may read for this request. Widening is a visible, one-tap, logged action. |
| **Evidence sheet** | Recommendations (`P14E`), BI (`B05E`) | The numbers and records behind a suggestion. |
| **Honest limits** | `P14D`, `G04`, Inbox placeholders | When the platform can't do something (send without a live notification, read Signal previews, show photos), the UI says so plainly and offers the next best action. |
| **Calculated fields** | Document editor | Lock icon. Totals can't be typed over. Prices default to the catalog, and overrides need a reason. |
| **Missing information** | `D05` | Questions instead of guesses. Required ones block finalising; optional blanks stay visibly blank. |
| **Separate consents** | `G05`, `G07`, `A07` | Connect ≠ import ≠ sync ≠ upload ≠ cloud AI. Each is its own switch with its own explanation. |
| **Snackbars** | Throughout | Confirm outcomes ("Sent through WhatsApp", "Import continues in the background"). |
| **Empty / loading / error states** | Specified per screen in notes | Shown: hidden-content states (`P02`), not-granted state (`G04`), no-model fallback (`G07b`, `A05`), offline snapshot labels (`B12`). See §7 for states not yet drawn. |

## 5. The 14 journeys, and the decision each one demonstrates

| # | Journey | What it proves |
|---|---|---|
| 1 | Start locally, no account | No account wall. Model recommendation by measurement, with an Essential fallback. |
| 2 | WhatsApp notification access | Play-compliant disclosure before the system screen. Honest per-app coverage. |
| 3 | Notification processed locally | Capture is instant and silent. Understanding follows in a background batch. Provenance by position. |
| 4 | "What did I promise Chanda?" | Local RAG with citations; on-device model labelled. |
| 5 | Review a memory | Full provenance: quote, resolution logic, model, prompt version, "left this phone: No". |
| 6 | Connect account | Clerk sign-in that uploads nothing and enables no cloud AI. |
| 7 | Import history | Category choice, sensitive items off, workspace mapping, resumable progress. |
| 8 | Configure sync | Direction-by-direction control; conflicts surfaced. |
| 9 | Disconnect | Default keeps everything; pending changes handled explicitly. |
| 10 | Personal → business | Context chip and tint; isolated workspaces; navigation adapts. |
| 11 | Business question | NL → structured query; code computes money; evidence and freshness shown. |
| 12 | Client proposal | Conversation → document with chosen context; questions not guesses; web-identical templates. |
| 13 | Edit, validate, export | Calculated lines, checks with fixes, sources, preview, numbering at finalise, share. |
| 14 | Recommendation | Reasoned suggestion with evidence; the honest "Zuri can't send this for you" moment. |

## 6. Mobile-specific design decisions

1. **The inbox is not a messaging client.** Zuri can't send arbitrary messages (D-11) and sees only notifications. So the conversation screen is optimised for understanding: the reply composer is a "Draft" entry point, not a chat keyboard.
2. **Reply uses WhatsApp's own reply action**, only on tap, only while the notification is live. Otherwise: copy and open the app.
3. **Background work is invisible but inspectable:** capture dot, listener health card, Recent AI activity (`A06`), and the egress ledger (`A08`).
4. **Context switch is a sheet, not a navigation destination.** It is reachable from every root screen in one tap.
5. **Documents are structured on the phone and rendered with the web's templates.** Editing happens on fields and lines, never on a PDF.
6. **Security is quiet by default:** app lock, blocked screenshots on sensitive screens, blank recents preview. Zuri's own notifications show no message text unless enabled.

## 7. Open UX decisions for the product owner

| # | Decision | Options | Recommendation |
|---|---|---|---|
| U-1 | Business navigation: 5th tab | Documents (prototype) · More · Inbox queue | Documents: document generation is a priority |
| U-2 | Hybrid view | One saved Hybrid view · many · none | One (prototype) |
| U-3 | Brief delivery time | Fixed 07:00 · user-set in onboarding · learned | User-set, default 07:00 |
| U-4 | Default message import window | 30 / 90 days / 1 year / all | 90 days |
| U-5 | Group chats | Store only (prototype) · analyse by default · opt-in per group | Store only + per-group opt-in |
| U-6 | Screenshot blocking | On for chats/memories (prototype) · vault only | On, user-switchable |
| U-7 | Showing Zuri's interpretations about people (personality, emotions) | Visible on profiles · hidden behind a tap · off | Behind a tap, labelled as interpretation |
| U-8 | Product name and mascot | "Zuri" (placeholder; MeetingMind already has a mascot named Zuri) | Decide before Play listing (Q-11) |

**States specified in notes but not drawn in this prototype** (to be designed in M1–M2 with the component library):
- first-day empty Today
- no model and no cloud (Essential-only Ask)
- listener-unbound warning
- sync error with retry
- signed-out session expiry
- tablet layouts

## 8. What approval of this design means

Approving the design means approving:
- the navigation model
- the context-tint system
- the interaction patterns in §4
- the journeys' behaviour

It does **not** fix copy, pixel values or every state; those are refined in implementation under the same principles. Any requested change will be revised in the prototype and this document before implementation begins.
