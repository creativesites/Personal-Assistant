# Zuri — Product Vision & Specification

> Zuri is an AI Relationship Operating System. It continuously understands people, remembers what matters, reasons about every relationship, stays aware of the outside world, plans interactions, and executes communication — whether for your personal life, your business, or your team.

---

## 1. Core Philosophy

Zuri is not a messaging tool. It is not a CRM. It is an operating system for relationships.

The shift from "WhatsApp assistant" to "relationship operating system" changes everything:
- Features become capabilities of intelligent engines, not isolated bolt-ons
- The product is coherent whether the user has 5 close personal contacts or 5,000 business customers
- Every interaction the system facilitates is intentional and goal-oriented
- The system improves continuously — it learns the user, learns their contacts, and learns the world around them

---

## 2. The Twelve Intelligence Engines

The Intelligence Service (`services/intelligence`) is structured around twelve engines grouped into three layers. Each engine has a single responsibility, reads from and writes to the database, and communicates with other engines only through the job queue.

### The Three Layers

```
┌──────────────────────────────────────────────────────────┐
│  LAYER 1 — PERCEPTION  (Observe & Understand)             │
│  Engines 1, 2, 3, 4                                       │
│  Watch conversations, temporal patterns, external events. │
│  Build the living model. Never act. Only inform.          │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  LAYER 2 — COGNITION  (Reason & Plan)                     │
│  Engines 5, 7, 12                                         │
│  Determine strategy. Consult knowledge. Learn from        │
│  outcomes. This is the brain of Zuri.                     │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  LAYER 3 — EXECUTION  (Act & Govern)                      │
│  Engines 6, 8, 9, 10, 11                                  │
│  Execute agent tasks. Generate reports. Run automations.  │
│  Communicate across channels. Govern every action.        │
└──────────────────────────────────────────────────────────┘
```

---

## Layer 1 — Perception Engines

### Engine 1 — Relationship Intelligence Engine

The core of Zuri. Builds and maintains **living psychological profiles** of every contact.

Not a static contact card — a continuously updated mental model:
- Personality and communication style
- Attachment style and emotional baseline
- Mood patterns, stress indicators, recurring emotional states
- Personal triggers (what excites them, what upsets them, what they avoid)
- Humor profile and shared inside references
- Current life context (job, relationships, projects, pressures)
- Known goals and ambitions
- Important people, places, and ongoing projects in their life
- Communication cadence preferences

Every new message refines the model. Over months the profile becomes a living memory — this is what makes suggested replies feel supernatural.

**Key outputs:** `contact_profiles`, `contact_insights`, `user_communication_profiles`

---

### Engine 2 — Temporal Intelligence Engine

Replaces the "8 AM cron" with **relationship clocks** — event-driven, per-relationship timers that understand each contact's unique communication rhythm.

Every relationship has its own heartbeat:

| Relationship | Normal Pattern | Trigger |
|---|---|---|
| Partner / Spouse | Good morning text 7–8 AM daily | No text by 9 AM → gentle nudge |
| Best friend | Chat every 2–3 days | Silent 6+ hours unusually → soft prompt |
| Business contact | Weekly touchpoint | 14 days silence → dormancy alert |
| Investor | Reply within 30 min | No reply in 3 days → escalation flag |
| Customer requesting quote | Expects follow-up next day | No follow-up → reminder |

When a pattern breaks, the engine generates a contextual, personalized suggestion — not a generic reminder.

**Key capabilities:**
- Per-relationship clock (auto-learned from message timestamps, manually overridable)
- Urgency tiers: gentle nudge → soft prompt → alert → escalation flag
- "Good morning / good night" awareness for close relationships
- Spontaneous moment injection: "it's the right moment for something casual"
- Missed occasion detection: birthday not acknowledged, anniversary passed

**Key outputs:** `proactive_queue` (timing-triggered items)

---

### Engine 3 — Opportunity Detection Engine

Continuously scans conversations for high-value moments requiring action.

**Personal opportunities:**
- Birthday, anniversary, graduation, promotion approaching
- Major life event (new job, new baby, moving, health news)
- Friend shared exciting news with no acknowledgement
- Relationship health score declining over time

**Business opportunities:**
- Buying signals (`intent: purchase_high`)
- Upsell / cross-sell moment in active conversation
- Renewal window approaching
- Churn risk — negative sentiment trend or reduced engagement
- Referral opportunity — satisfied customer with high trust score
- Abandoned conversation — lead went cold mid-funnel
- Overdue invoice — payment not received after agreed date
- Commitment made and not followed up

Each opportunity generates a `proactive_queue` item with priority score, draft message, and reasoning.

**Key outputs:** `proactive_queue` (opportunity-triggered items)

---

### Engine 4 — World Knowledge Engine

Gives the intelligence layer a **live connection to the world** — news, trends, market data — and connects it to specific relationships.

**Data sources:**
- Trending news (general, local, industry-specific)
- Financial markets (stocks, crypto, forex, commodities)
- Sports results and scores
- Weather and local events
- Social media trends and viral content
- Entertainment (new releases, concerts, events)
- Company announcements relevant to business contacts
- Government and regulatory announcements

**Relationship-aware search:** The engine cross-references external data against contact profiles. When a match is found, it generates a contextual, personalized outreach suggestion:

- "Dad follows Arsenal. Arsenal won last night." → celebration message draft
- "Client owns a logistics company. Fuel prices jumped 8%." → empathy/check-in draft
- "Friend is obsessed with F1. Verstappen won at Monaco." → reaction message
- "Contact asked about exchange rates in their last message." → AI fetches live rate and bakes it into the reply draft

**Live query tool:** When a contact asks a factual question in chat, the engine performs a real-time web search and includes the answer in the suggested reply.

**Key outputs:** `proactive_queue` (world-event-triggered), enriched reply suggestions

---

## Layer 2 — Cognition Engines

### Engine 5 — Conversation Strategy Engine

Moves beyond reactive reply generation to **multi-step conversation planning**.

Instead of asking "what should I say next?", this engine asks: "What is the optimal sequence of moves to achieve this relationship's goal?"

**Planning by relationship goal:**

| Goal | Strategy |
|---|---|
| Close a $50k deal | Qualify budget → establish timeline → handle objection → book call → follow up |
| Re-engage a cold contact | Open with relevance → rebuild rapport → soft ask |
| Support a grieving friend | Acknowledge → listen → offer presence → follow up next week |
| Retain a churning customer | Identify pain → validate → present solution → escalate if needed |
| Keep relationship warm | Regular low-stakes touchpoints → celebrate their milestones |

Outputs not just the next message, but a **conversation plan** — a sequence of recommended moves with branching logic based on how the contact responds.

**Key concepts:**
- Goal assignment per relationship (personal or business)
- Multi-turn conversation planning (chess, not checkers)
- Objection anticipation and pre-drafted counters
- Tone escalation and de-escalation guidance

---

### Engine 7 — Knowledge Engine

Allows businesses to give agents access to their institutional knowledge.

**Supported sources:**
- PDF documents (policies, manuals, catalogs, contracts)
- Website URLs (scraped and indexed)
- Google Docs / Notion (via integration)
- Custom Q&A pairs
- Product catalogs with pricing
- Return and refund policies
- Training materials and scripts

All uploaded content is chunked, embedded with pgvector, and made semantically searchable. Agents query the knowledge base before responding, ensuring answers are policy-compliant and accurate — not generic AI guesses.

---

### Engine 12 — Learning & Optimization Engine

The system that makes Zuri get better over time. Analyzes the AI's own performance and adjusts.

**What it learns from:**
- Which reply suggestions are accepted vs rejected vs edited
- Which proactive nudges are acted on vs dismissed
- Which follow-up timing windows convert best
- Which tones work best per contact and per relationship type
- Which AI models perform best for which task types
- When suggestions were offered but the user chose to say nothing
- Reaction sentiment to messages after they are sent

**What it optimizes:**
- Suggestion ranking order (highest-acceptance variant surfaces first)
- Timing recommendations for proactive items (contact-specific)
- Tone calibration per contact based on response history
- Model routing (use cheaper model where quality is sufficient)
- Silence recommendations: sometimes the best move is no message

Over months of use, Zuri becomes noticeably better for each user and each contact because it is learning from outcomes, not just generating text.

**Key outputs:** Updated model routing config, contact-level tone tuning, proactive timing adjustments, `learning_outcomes` table

---

## Layer 3 — Execution Engines

### Engine 6 — Autonomous Agent Engine

A fleet of specialized AI agents, each with a distinct role, toolkit, and permission set.

Users assign agents to specific contacts, groups, or contact segments. Each agent operates within defined boundaries and escalates when it hits the edge of its authority.

| Agent | Can Do | Cannot Do |
|---|---|---|
| Sales Agent | Qualify leads, handle objections, generate quotes, book meetings | Promise unsupported features |
| Support Agent | Answer FAQs, process returns, look up orders, close tickets | Issue refunds above threshold |
| Community Manager | Post content to groups, moderate discussions, answer questions | Make financial commitments |
| Executive Assistant | Schedule meetings, draft follow-ups, manage reminders | Access financial systems |
| Collections Agent | Send overdue reminders, offer payment plans | Write off debt |
| Appointment Setter | Confirm, reschedule, cancel bookings | Modify pricing |
| Recruiter | Screen candidates, schedule interviews, follow up | Make offers |

**Escalation rules:** Any agent escalates to human when it detects:
- Anger or high frustration sentiment
- "Let me speak to a manager" or equivalent
- A topic outside its knowledge base
- A commitment exceeding its permission tier
- Legal language or threat of dispute

When escalated: automation pauses, human notified with full context and recommended response, conversation moved to "Requires Human Attention."

---

### Engine 8 — Business Intelligence Engine

Executive-level analytics that prove ROI and surface operational insights.

**Individual metrics:**
- Response time distribution
- AI suggestion acceptance rate
- Relationship health trends across the full network
- Proactive suggestion outcomes (accepted / dismissed / resulted in reply)

**Team metrics:**
- Agent performance: response time, resolution rate, CSAT (inferred from sentiment shifts after resolution)
- AI-suggestion acceptance rate per agent
- Conversation volume by agent, time, contact type

**Funnel analytics:**
- Lead → qualified → opportunity → closed conversion rates
- Drop-off points in conversation sequences
- Average time-to-close by contact segment

**Revenue attribution:**
- Link closed deals to specific conversation threads
- Revenue per agent, revenue per conversation type

**Proactive impact report:**
- "Zuri surfaced 7 upsell opportunities this month generating $3,400"
- "18 cold leads re-engaged via proactive suggestions"
- "42 hours of manual follow-up work automated"

**Custom report builder:** Drag-and-drop metric builder for managers. CSV / PDF export.

---

### Engine 9 — Automation Engine

A visual workflow platform for designing complex, multi-step conversation automations.

**Capabilities:**
- Visual flow builder (drag-and-drop canvas)
- Conditional logic and variables (store contact responses, use in branching)
- Wait conditions (if no reply in N days, proceed)
- API call steps (look up order in Shopify, update HubSpot, etc.)
- Human handoff nodes
- Pre-built templates: invoice follow-up, lead nurture, appointment booking, NPS collection, onboarding sequence

**Example — Invoice Recovery:**
```
Overdue invoice detected
  → Day 1: friendly reminder
  → No reply? Wait 3 days
  → Day 4: second reminder with payment link
  → No reply? Wait 3 days
  → Day 7: offer payment plan
  → No reply? Assign to collections agent
  → Still nothing? Flag for manual escalation
```

---

### Engine 10 — Multi-Channel Communication Engine

WhatsApp is the starting point. The platform eventually processes all communication channels as a single unified relationship context.

**Planned channel support:**
- WhatsApp (open-wa + official Business API)
- Instagram DMs
- Facebook Messenger
- Telegram
- SMS
- Email
- LinkedIn (read-only initially)
- Slack, Discord, Teams (enterprise)

**Architecture:** Each channel normalises to the same `messages.incoming` pipeline. The intelligence engines process messages identically regardless of channel. Reply drafts route back through the originating channel.

**Unified relationship view:** A contact reached via WhatsApp and Instagram is the same person in Zuri. Profile, history, and insights accumulate across channels.

---

### Engine 11 — Governance & Privacy Engine

The engine that governs every piece of data, every AI decision, and every automated action. Not a settings page — a first-class platform capability.

This is one of Zuri's strongest competitive advantages: making AI memory transparent, auditable, and fully under user control.

#### AI Memory Explorer

Users can inspect exactly what Zuri knows about any contact:

```
Sarah
├── Relationship Health: 92%
├── Communication Style: Very expressive, replies within 10 min,
│   enjoys voice notes, avoids conflict
├── Current Life Context: Planning wedding, recently changed jobs
├── Interests: Golf, dogs, travel, Formula 1
├── Inside Jokes: [list]
├── Recent Significant Events: [list]
└── Confidence: 92%
```

Every insight has four actions: **Edit · Delete · Disable · Explain**

"Explain" reveals the source: *"Learned from conversations on March 12, April 8, May 17."*

#### Memory Timeline

Shows how Zuri's knowledge of a contact evolved over time:
- March: "Sarah started a new job"
- June: "Promotion confirmed"
- October: "Changed companies"

The AI understands not just what is true now, but how things changed — and why.

#### Conversation Privacy Levels

Users can configure a privacy level per conversation:

| Level | What's Stored | AI Active |
|---|---|---|
| **Observe Only** | Nothing — no storage at all | Notification detection only |
| **Metadata Only** | Timestamps, frequency, response latency | Health scoring only |
| **Temporary Memory** | Messages for 24h or 7 days, auto-deleted | Full AI, raw messages expire |
| **Full Memory** | Everything, retained per policy | Full AI |
| **Locked Vault** | Nothing — AI fully disabled unless explicitly invoked | Disabled (lawyer, doctor, board discussions) |

#### Explainability

Every suggestion surfaces its reasoning:

```
Suggested: "Good morning ❤️ Hope your meeting goes well."

Reasons:
  • You normally text every morning
  • She mentioned an important meeting yesterday
  • Similar messages received positive responses previously

Confidence: 96%
```

#### Automation Audit Log

Every autonomous action is logged with reasoning and can be replayed:

```
09:32  Support Agent answered refund request
       Matched: Refund Policy (Confidence 98%)

09:35  Support Agent escalated to human
       Reason: Customer frustration detected (Sentiment -0.82)
```

#### Data Control Center

One screen, everything:
- Export any data (conversation, contact, full account)
- Delete any insight, snapshot, or conversation
- Pause monitoring for any contact
- Reset and rebuild any contact profile
- Request full account data export

#### AI Permission Matrix

Per-contact granular permissions (not just on/off):

| Permission | Configurable Per Contact |
|---|---|
| Draft replies | ✓ |
| Send automatically | ✓ |
| Schedule follow-ups | ✓ |
| Search the web about this contact's topics | ✓ |
| Access user's calendar | ✓ |
| Create reminders | ✓ |
| Book meetings | ✓ |
| Send proactive messages | ✓ |
| Join autonomous workflows | ✓ |

#### AI Cost Transparency

Show users what the AI is spending:
- Today's AI usage: models used, tokens consumed, estimated cost
- Most expensive automations and contacts
- Model fallback history

#### Enterprise Governance Center

For large businesses — a compliance dashboard:
- Data residency and retention policy status
- Consent tracking per contact (opt-in/opt-out, last update)
- Full audit log (who viewed, who sent, who edited, who exported)
- API activity log
- Role permissions and access scoping
- Security alerts and incident history
- Compliance score
- Upcoming scheduled data deletions
- DPA (Data Processing Agreement) status

---

## 3. The Trust Engine

A cross-cutting configuration layer governing how much autonomy the system has per relationship.

| Level | Name | Behavior |
|---|---|---|
| 0 | Observe | Analyse conversations. Build memory. No proactive actions. |
| 1 | Suggest | Draft replies and proactive items. User always approves. *(Default)* |
| 2 | Assisted | Auto-send routine low-stakes messages. Confirm on anything substantive. |
| 3 | Delegated | Handle FAQs, schedule meetings, follow up on invoices. Escalate exceptions. |
| 4 | Autonomous | Full agent mode within defined permission boundaries. |

Users build trust with the system gradually rather than making an all-or-nothing automation decision.

---

## 4. The Goal Engine

Every relationship exists for a reason. Zuri understands the user's desired outcome for each relationship and optimizes every interaction toward it.

**Personal goals:**
- "Be a better son"
- "Stay emotionally close to my girlfriend"
- "Reconnect with university friends"
- "Grow my professional network"

**Business goals:**
- "Close this $50k deal by end of quarter"
- "Retain this customer past their renewal"
- "Get 3 referrals from this satisfied client"
- "Recruit a senior developer"

The Conversation Strategy Engine evaluates every interaction against the assigned goal and surfaces actions that improve the probability of success. It shifts Zuri from "replying to messages" to actively helping users achieve relationship outcomes.

---

## 5. User Journey

### Personal User — Daily Habit

**Morning (5 min):**
1. Open Zuri. See the "Morning Coffee" feed.
2. Review relationship health alerts — who needs attention today.
3. Browse pre-drafted messages (birthday texts, follow-ups, spontaneous joke to a friend).
4. Click approve. Done.

**Throughout the day:**
- New WhatsApp message arrives → Zuri analyses in real-time
- Suggested reply appears with tone breakdown and contact mood context
- User approves, tweaks, or rejects in one tap
- World Knowledge Engine surfaces: "Arsenal won — suggested congratulation to Dad"

**Weekly:**
- Review relationship health dashboard
- See which relationships are improving vs. cooling
- Review proactive outcomes — what did the AI suggest, what worked

### Business User — Sales Rep

**Morning:**
- Dashboard shows lead pipeline with AI-assigned intent scores
- Today's follow-up sequence items with drafted messages
- Flagged conversations needing human attention

**Active selling:**
- Incoming lead message → AI qualifies intent → drafts opening response
- Conversation strategy shows next 3 recommended moves
- Objection detected → AI drafts counter with reasoning

**End of day:**
- Review what the sales agent handled autonomously
- Analytics: 12 conversations active, 3 moved to opportunity, 1 closed

---

## 6. Pricing Tiers

| Tier | Price | Engines Active |
|---|---|---|
| **Personal** | Free / $19/mo | 1, 2 (basic), 3, 11 (basic privacy) |
| **Pro** | $49/mo | 1, 2 (full), 3, 4 (full web search), 5, 11 (Memory Explorer) |
| **Business** | $149/mo (up to 5 agents) | 1–9, 11 (full), 12 |
| **Enterprise** | Custom ($500+/mo) | All 12 engines · dedicated instance · white-label · SLA |

---

## 7. Feature Matrix

| Feature | Personal | Pro | Business | Enterprise |
|---|---|---|---|---|
| Voice-matched reply suggestions | ✓ | ✓ | ✓ | ✓ |
| Relationship health scoring | ✓ | ✓ | ✓ | ✓ |
| Opportunity Detection Engine | ✓ | ✓ | ✓ | ✓ |
| Basic privacy controls | ✓ | ✓ | ✓ | ✓ |
| Temporal Intelligence (relationship clocks) | limited | ✓ | ✓ | ✓ |
| World Knowledge Engine (web search + trends) | — | ✓ | ✓ | ✓ |
| Conversation Strategy Engine | — | ✓ | ✓ | ✓ |
| Memory Explorer (AI Memory Transparency) | — | ✓ | ✓ | ✓ |
| Shared team inbox | — | — | ✓ | ✓ |
| RBAC + audit logs | — | — | ✓ | ✓ |
| Autonomous Agent Engine | — | — | ✓ | ✓ |
| Knowledge Engine (upload docs) | — | — | ✓ | ✓ |
| Business Intelligence Engine | — | — | ✓ | ✓ |
| Automation Engine (visual workflows) | — | — | ✓ | ✓ |
| Learning & Optimization Engine | — | — | ✓ | ✓ |
| CRM sync (HubSpot, Salesforce, Pipedrive) | — | — | ✓ | ✓ |
| Group management + content | — | — | ✓ | ✓ |
| Enterprise Governance Center | — | — | — | ✓ |
| White-labeling | — | — | — | ✓ |
| BYOK (bring your own AI keys) | — | — | — | ✓ |
| Official WhatsApp Business API | — | — | — | ✓ |
| Multi-Channel Engine | — | — | — | ✓ |
| Dedicated instance | — | — | — | ✓ |
| SOC 2 / DPA | — | — | — | ✓ |

---

## 8. Enterprise Features

### Shared Team Inbox
A single WhatsApp number linked to a central dashboard. Multiple agents log in, see AI-suggested replies, and handle conversations. Includes collision detection and internal @mention notes visible only to the team.

### Role-Based Access Control (RBAC)
Custom roles (Admin, Team Lead, Agent, Analyst). Data scoped by team or region. Every action logged — immutable audit trail. Essential for compliance and dispute resolution.

### Customer Consent Management
Tracks opt-in/opt-out per contact. Auto-pauses AI monitoring for contacts who revoke consent. Surfaces consent status in the Enterprise Governance Center. Critical for GDPR.

### Data Retention Policies
Configurable auto-deletion of raw message content after N days. Insights and embeddings retained per business configuration. Some businesses want 30 days, others 365.

### Bring Your Own AI Key (BYOK)
Enterprise customers plug in their own Anthropic/OpenAI API contract. Data never hits Zuri's provider account. Reduces cost at scale and satisfies data sovereignty requirements.

### Official WhatsApp Business API
For enterprises requiring compliance: use the official Meta API via 360dialog or Twilio instead of open-wa. Same Zuri dashboard. Same intelligence layer. Start with open-wa (low cost), migrate to official API (low risk) with one config change. Zero workflow disruption.

### Integration Ecosystem
- **Native CRM:** HubSpot, Salesforce, Pipedrive, Zoho (bi-directional sync)
- **Webhook Engine:** custom "if this, then that" rules fired on any platform event
- **Zapier / Make:** public integration for no-code workflows
- **Public REST API:** rate-limited programmatic access for custom dashboards

### Broadcast & Segmentation Engine
Dynamically segment contacts by AI-assigned tags (intent, industry, relationship tier, buying stage). Send personalised blast messages that look individually typed. Throttled delivery to avoid spam detection.
