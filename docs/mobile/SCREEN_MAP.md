# Zuri Android — Screen Map

> Part of the Zuri Android initial engagement, 2026-11-24. **Status: proposed.** The screen ids below (`G01`, `P03`, …) match the clickable prototype in `design/mobile/` (`index.html#<id>`).
> Data source codes:
> - **L** = local DB
> - **C** = cloud API (cached)
> - **O** = online only

## 1. Navigation model

```
App launch → [App lock] → Root
Root = NavigationBar (5) + TopAppBar(context chip · search · capture dot)

Personal / Hybrid context            Business context
├─ Today        P01                  ├─ Today (business)   B01
├─ Inbox        P02                  ├─ Inbox              P02B (scoped)
├─ People       P04                  ├─ Studio             B02
├─ Ask          P13                  ├─ Ask (business)     B05
└─ More         G13                  └─ Documents          D01
     Goals P08 · Timeline P10 · Calendar P11 · Knowledge P12 · Memory P07
     Documents D01 · Career (cloud) · Recommendations P14 · Settings G10
```

- **Context switcher** (G08) is a bottom sheet opened from the context chip on every root screen.
- **Global search** (G09) is a full-screen search from the top bar. It is scoped to the active context and has a "widen" affordance.
- **Deep links:** `zuri://conversation/{id}`, `zuri://person/{id}`, `zuri://document/{id}`, `zuri://memory/{id}` (from notifications and widgets).
- **Back behaviour:** predictive back on all screens; bottom sheets dismiss first.

## 2. Screen inventory

### A. Global

| Id | Screen | Purpose | Entry | Key elements | States | Data | Milestone |
|---|---|---|---|---|---|---|---|
| G01 | Welcome | First impression; promise "your phone, your intelligence" | First launch | Brand mark, 3 value lines, Start | — | — | M1 |
| G02 | How Zuri works / Privacy explanation | Explain on-device processing, what is captured, what never leaves | G01 | Diagram: phone ⟷ (optional) cloud; bullet commitments | — | — | M1 |
| G03 | Local or cloud setup | Choose "Start on this phone" vs "I have a Zuri account" | G02 | Two cards; local recommended | — | — | M1 |
| G04 | Notification source selection | Pick apps to observe; per-app coverage notes | G03, Settings | App list with toggles, coverage chips, "Grant access" CTA, prominent disclosure | not granted / granted / partially / restricted-settings (sideload) | L | M2 |
| G04b | Notification access disclosure (sheet) | Play-required prominent disclosure before the system screen | G04 | What is read, why, where stored, Continue → system settings | — | — | M2 |
| G05 | Account connection | Clerk sign-in, explain P1 only | G03, Settings | Sign-in options, "This does not upload anything" | signing in / error / success | C | M7 |
| G06 | Initial cloud import | Category selection with counts, sensitivity, time window | G05 | Category list, estimates, mapping preview | discovering / ready / running / paused / done / partial | C | M8 |
| G07 | Sync preferences | P3/P4/P6 toggles, Wi-Fi only, per-source upload | G06, Settings | Toggle groups with explanations | — | L | M9 |
| G07b | Local model selection (onboarding) | Recommend a model for this device | G03 | Device verdict, recommended model card, "Skip, use Essential" | checking / compatible / not compatible / downloading | L | M3 |
| G08 | Context switcher (sheet) | Switch Personal / Business workspace / Hybrid | Context chip | Workspace list with tints, Hybrid builder, "New business workspace" | — | L | M5 |
| G09 | Global search | Search people, messages, memories, documents | Top bar | Scoped results by type, "Also search Personal" chip | empty / results / none | L(+C) | M4 |
| G10 | Settings | All settings | More | Sections: Account & cloud, Sources, AI & models, Privacy, Security, Workspaces, Notifications, About | — | L | M1 |
| G11 | Privacy Center | What's stored, synced, sources, models, egress, permissions | Settings, shield icon | Storage meter by category, consents P1–P6, ledger link | — | L | M1→M9 |
| G12 | Security & app lock | Lock timing, biometric, vault, screenshots | Settings | Toggles, vault status | — | L | M1 |
| G13 | More | Secondary destinations | Nav | Grid of destinations | — | — | M1 |

### B. Personal

| Id | Screen | Purpose | Key elements | States | Data | Milestone |
|---|---|---|---|---|---|---|
| P01 | Today (Daily Brief) | What matters today | Greeting + date, brief summary, "Promised" commitments due, people to reconnect with, events, recommendations, capture status | empty (first day) / normal / offline | L(+C) | M6 |
| P02 | Inbox | Unified conversations | Source filter chips, needs-reply filter, rows with source badge, provenance, unread | listening / paused / empty / coverage warning | L(+C) | M2 |
| P02b | Conversation list (per source) | Browse a source's conversations | Same rows filtered | — | L | M2 |
| P03 | Conversation detail | Read thread, see what Zuri understood | Bubbles; placeholder bubbles (media, hidden, OTP-redacted); "Zuri understood" strip (commitments, events); reply sheet | live-reply-available / reply-unavailable | L(+C) | M2/M4 |
| P03b | Reply sheet | Draft & send | 3 drafts (tone chips), edit field, "Send via WhatsApp" (RemoteInput), source note | sending / sent / notification expired | L | M4 |
| P04 | People | People list | Search, sort by needs attention, health dots, workspace badges | — | L(+C) | M6 |
| P05 | Person profile | Who they are to me | Header with relationship(s) per workspace, tabs: Overview · Memories · Commitments · Conversations · (Business tabs if in business workspace) | — | L(+C) | M6 |
| P06 | Relationship detail | Health and rhythm | Health ring + trend, cadence clock ("usually every 9 days"), health history chart, goals | — | L | M6 |
| P07 | Memory Inspector | See and correct what Zuri remembers | Filters (kind, person, confidence, source), memory cards with confidence and source link, confirm/edit/reject | — | L | M4 |
| P07b | Memory detail & source | Provenance | Memory text, extracted value, confidence explanation, source message excerpt with highlight, extractor/model, history | — | L | M4 |
| P08 | Goals | Goals list | Active/achieved filter, progress rings | — | L(+C) | M6 |
| P09 | Goal detail | Progress & links | Progress, linked people/projects/documents, timeline, next step | — | L(+C) | M6 |
| P10 | Personal timeline | Life Timeline | Month groups, event cards (life events, goals, reflections) | — | L | M6 |
| P11 | Calendar | Agenda + month | Agenda list with commitments and device events, add event | permission not granted | L | M6 |
| P12 | Knowledge | Notes & documents | Notes, files, "Ask about this" | — | L(+C) | M6 |
| P13 | Ask Zuri | Conversational assistant | Scope chip, answer with citations, "model: on-device" label, follow-ups | thinking / answered / no-model (retrieval only) / needs consent for cloud | L | M4 |
| P14 | Recommendations | Proactive queue | Cards with why + evidence, actions (draft, snooze, dismiss), auto-resolved section | — | L(+C) | M6 |
| P15 | Commitments | What I promised / what's promised to me | Two segments, due dates, source link | — | L | M4 |

### C. Business

| Id | Screen | Purpose | Key elements | Data | Milestone |
|---|---|---|---|---|---|
| B00 | Workspace switcher | Same as G08 in business framing | Workspaces with cloud badge | L | M5 |
| B01 | Business Today / dashboard | Business brief | Cash snapshot (invoiced/paid/outstanding), pipeline value, due follow-ups, "Zuri noticed", quick create | L/C | M10 |
| B02 | Studio overview | Hub | Tiles: CRM, Pipeline, Projects, Catalog, Inventory, Suppliers, Knowledge, Reports; insights | L/C | M10 |
| B03 | CRM — Contacts | Business contacts | Filters (customer/lead/supplier), LTV, outstanding | L/C | M10 |
| B03b | Companies | Organisations | Company list → people | L/C | M10 |
| B04 | Leads | Lead stages | Hot/warm/cold columns as segmented list, score | C | M10 |
| B05 | Business Intelligence (Ask + metrics) | Ask business questions; metric cards with evidence | Ask bar, metric cards, "Why?" evidence sheet | L/C/O | M12 |
| B06 | Opportunity pipeline | Deals by stage | Horizontal stage tabs + stacked cards, value per stage | L/C | M10 |
| B07 | Opportunity detail | Deal | Stage stepper, value, contact, related conversation, documents, next action | L/C | M10 |
| B08 | Projects | List | Status filter, progress, budget health | L/C | M10 |
| B09 | Project detail | Execution | Tasks, milestones, timer, budget card, linked documents | L/C | M10 |
| B10 | Tasks | All business tasks | Due groups | L/C | M10 |
| B11 | Business knowledge | Facts, rules, docs | Categories, rule cards | L/C | M10 |
| B12 | Reports | BI sections | List of mobile BI screens | O | M12 |
| B13 | Products & services | Catalog | Segmented products/services, price, margin, stock badge | L/C | M10 |
| B14 | Inventory | Stock | Low-stock first, movements, adjust (cloud ledger aware) | C | M10 |

### D. Documents

| Id | Screen | Purpose | Key elements | Milestone |
|---|---|---|---|---|
| D01 | Document Studio home | All documents | Filters by type/status, recent, "Create" FAB, drafts needing info | M11 |
| D02 | Document type selector | Pick type | Grouped types (Sales, Contracts, Operations, Personal) | M11 |
| D03 | Create from natural language | Describe it | Prompt field, examples, voice input, workspace chip | M11 |
| D04 | Context selection | Choose what Zuri may read | Chips: client, conversation, prior quote, catalog items; add/remove | M11 |
| D05 | Missing information | Questions instead of guesses | Question cards with input types; "leave blank" disabled for required | M11 |
| D06 | Template selector | Layout | 8 template thumbnails, brand profile | M11 |
| D07 | Document editor | Structured editing | Header fields, sections (reorder/regenerate), line table, totals (read-only computed) | M11 |
| D08 | Section editing | One section | Rich text, "Regenerate with…" options, source chips | M11 |
| D09 | Financial table editing | Lines | Line editor sheet: description, qty, unit price, discount, tax; computed line total | M11 |
| D10 | Document preview | Rendered PDF | Page viewer, template switch | M11 |
| D11 | Validation | Checks | Pass/warn/fail list with fix actions | M11 |
| D12 | Provenance inspector | Where each part came from | Per section/line sources | M11 |
| D13 | Version history | Versions | Version list, diff | M11 |
| D14 | Export & share | Out | PDF/DOCX, share sheet, cloud send, link | M11 |

### E. AI and local models

| Id | Screen | Purpose | Milestone |
|---|---|---|---|
| A01 | Model library | Installed and available models, tier badge | M3 |
| A02 | Model download | Progress, pause/resume, Wi-Fi only, verify | M3 |
| A03 | Model compatibility | Device profile, verdict per model, benchmark | M3 |
| A04 | Model settings | Per-task model, context length, battery behaviour | M3 |
| A05 | AI processing preferences | When to process (charging/idle), groups, Tier B | M3 |
| A06 | Router status | Recent tasks: which model ran, time, result | M3 |
| A07 | Local & remote processing controls | Remote AI per purpose and workspace (P6) | M3 |
| A08 | What leaves my phone | Egress ledger | M3 |

### F. Synchronisation

| Id | Screen | Purpose | Milestone |
|---|---|---|---|
| S01 | Cloud connection status | Account, plan, org, health | M7 |
| S02 | Initial import (progress) | Category progress, pause | M8 |
| S03 | Sync progress / status | Per-category state | M9 |
| S04 | Sync history | Runs log | M9 |
| S05 | Data categories | What syncs, uploaded data | M9 |
| S06 | Conflict resolution | Side-by-side resolver | M9 |
| S07 | Pause sync | Sheet with consequences | M9 |
| S08 | Disconnect account | Three choices, outbox summary | M7 |

## 3. Journeys (prototype walkthroughs)

| # | Journey | Screens |
|---|---|---|
| J1 | Install and start locally without an account | G01 → G02 → G03 → G07b → G04 → P01 |
| J2 | Enable WhatsApp notification access | G04 → G04b → (system) → G04 (granted) → P02 |
| J3 | Notification arrives and is processed locally | (system notification) → P02 → P03 (Zuri understood) → P15 |
| J4 | Ask what I promised someone | P13 (question) → P13 (answer with citations) → P03 (source) |
| J5 | Review an extracted memory and its source | P07 → P07b → P03 |
| J6 | Connect an existing Zuri account | G10 → S01 → G05 → S01 (connected) |
| J7 | Import existing cloud history | G06 → (mapping) → S02 → done |
| J8 | Configure ongoing sync | G07 → S05 → S03 |
| J9 | Disconnect while retaining local data | S01 → S08 → P01 (still works) |
| J10 | Switch personal → business | P01 → G08 → B01 |
| J11 | Ask a business intelligence question | B05 → evidence sheet |
| J12 | Create a client proposal with business context | D01 → D03 → D04 → D05 → D06 → D07 |
| J13 | Edit, validate and export the proposal | D07 → D09 → D11 → D12 → D10 → D14 |
| J14 | Review a proactive recommendation | P14 → evidence → P03b (draft) → sent |

## 4. Web route → Android screen

| Web route | Android |
|---|---|
| `/dashboard` | P01 / B01 |
| `/inbox`, `/inbox/queue` | P02, P03 (Queue = "Needs reply" filter with cloud suggestions) |
| `/contacts`, `/contacts/[id]` | P04/P05 (personal), B03/P05 business tabs |
| `/leads` | B04 |
| `/relationships(/[id])` | P04 (relationships view), P06 |
| `/goals(/[id])` | P08, P09 |
| `/timeline` | P10 |
| `/calendar` | P11 |
| `/advisor` | P13 (+ companion modes, M13) |
| `/proactive` | P14 |
| `/notifications` | More → Notifications |
| `/knowledge-base` | P12, B11 |
| `/studio` (13 modules) | B02 + B03/B06/B13/B14/suppliers/brand (Settings → Workspace) |
| `/business`, `/documents/new`, `/documents/[id]/edit` | D01–D14 |
| `/projects(/[id])` | B08, B09 |
| `/feed` | B02 "Zuri noticed" |
| `/analytics/*` | B05, B12 |
| `/career/*` | More → Career (M13) |
| `/agents`, `/automation`, `/escalations`, `/broadcasts` | Studio → Automation (M13) |
| `/billing`, `/redeem` | Settings → Plan (Q-09) |
| `/settings`, `/settings/ai`, `/profile`, `/diagnostics`, `/organization` | G10–G12, A0x, S0x |
| `/onboarding` | G01–G07 |
| `(admin)`, `(marketing)` | Excluded (D-12) |
