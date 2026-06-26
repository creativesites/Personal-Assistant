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

## 2. The Ten Intelligence Engines

The Intelligence Service (`services/intelligence`) is structured around ten engines. Each engine has a single responsibility, reads from and writes to the database, and communicates with other engines only through the job queue.

### Engine 1 — Relationship Intelligence Engine

The core of Zuri. Builds and maintains **living psychological profiles** of every contact.

Not a static contact card — a continuously updated mental model that includes:
- Personality and communication style
- Attachment style and emotional baseline
- Mood patterns and stress indicators
- Personal triggers (what excites them, what upsets them)
- Humor profile and shared inside references
- Current life context (job, relationships, projects, stresses)
- Known goals and ambitions
- Important people and places in their life
- Communication cadence preferences

These profiles deepen over time. Every new message refines the model. The profile is what makes suggested replies feel supernatural — they are written with full knowledge of who the person is, not just what they last said.

**Key outputs:** `contact_profiles`, `contact_insights`, `user_communication_profiles`

---

### Engine 2 — Temporal Intelligence Engine

Replaces the "8 AM cron" with **relationship clocks** — event-driven, per-relationship timers that understand each contact's unique communication rhythm.

Instead of a single daily sweep, every relationship has its own heartbeat:

| Relationship | Normal Pattern | Trigger |
|---|---|---|
| Partner / Spouse | Good morning text 7–8 AM daily | No text by 9 AM → gentle nudge |
| Best friend | Chat every 2–3 days | Silent for 6 hours unusually → soft prompt |
| Business contact | Weekly touchpoint | 14 days silence → dormancy alert |
| Investor | Reply within 30 min | No reply in 3 days → escalation flag |
| Parent | Call every few days | 5 days silence → proactive suggestion |

The engine continuously evaluates cadence deviations. When a pattern breaks, it generates a contextual, personalized suggestion rather than a generic reminder.

**Key capabilities:**
- Per-relationship clock configuration (auto-learned + manually adjustable)
- Urgency tiers: gentle nudge → soft prompt → alert → escalation
- Spontaneous moment injection: "it's been the right amount of time to send something casual"
- Missed occasion detection: birthday missed, anniversary not acknowledged

---

### Engine 3 — Opportunity Detection Engine

Continuously scans conversations for high-value moments that the user should act on.

**Personal opportunities:**
- Birthday / anniversary / graduation / promotion approaching
- Contact going through a major life event (new job, new baby, moving)
- Friend hasn't been acknowledged after sharing exciting news
- Relationship cooling — health score declining over time

**Business opportunities:**
- Buying signals detected (`intent: purchase_high`)
- Upsell / cross-sell moment in ongoing conversation
- Renewal window approaching
- Churn risk — negative sentiment trend or reduced engagement
- Referral opportunity — satisfied customer with high trust score
- Abandoned conversation — lead went cold mid-funnel
- Invoice overdue — payment not received after agreed date

Each opportunity generates a proactive queue item with priority scoring, a draft message, and the reasoning behind the suggestion.

---

### Engine 4 — World Knowledge Engine

Gives the intelligence layer a **live connection to the world** — news, trends, market data, and contextual information — and connects it to specific relationships.

**Data sources:**
- Trending news (general, local, industry-specific)
- Financial markets (stocks, crypto, forex, commodities)
- Weather and local events
- Social media trends (viral content, memes)
- Sports results and scores
- Entertainment (new releases, concerts, events)
- Company announcements relevant to business contacts

**How it connects to relationships:**

The engine continuously cross-references external data against contact profiles. When it finds a match, it generates a proactive suggestion:

- "Dad follows Arsenal. Arsenal won last night." → suggested celebration message
- "Client owns a logistics company. Fuel prices jumped 8%." → suggested empathy/check-in draft
- "Friend is obsessed with F1. Verstappen won at Monaco." → joke or reaction message suggested
- "Contact asked about exchange rates in their last message." → AI drafts reply with live rate

**Live information requests:** When a contact asks a factual question in chat ("What time does that restaurant open?" / "What's the weather in Dubai?"), the engine performs a real-time web search and bakes the answer into the suggested reply.

**Tooling:** Web search via Tavily / SerpAPI. Financial data via market APIs. Results cached in Redis with appropriate TTLs to control costs.

---

### Engine 5 — Conversation Strategy Engine

Moves beyond reactive reply generation to **multi-step conversation planning**.

Instead of asking "what should I say next?", this engine asks:
- "What is the goal of this relationship?"
- "What outcome do I want from this conversation?"
- "What is the optimal next several moves to get there?"

**Examples by relationship goal:**

| Goal | Strategy |
|---|---|
| Close a $50k deal | Qualify budget → establish timeline → handle objection → book call → follow up |
| Re-engage a cold contact | Open with relevance → rebuild rapport → soft ask |
| Support a grieving friend | Acknowledge → listen → offer presence → follow up next week |
| Retain a churning customer | Identify pain → validate → present solution → escalate if needed |

The engine outputs not just the next message, but a conversation plan — a sequence of suggested moves with branching logic based on how the contact responds.

**Key concepts:**
- Goal assignment per relationship (personal or business)
- Multi-turn conversation planning
- Objection anticipation and counter-drafts
- Tone escalation / de-escalation recommendations

---

### Engine 6 — Autonomous Agent Engine

A fleet of specialized AI agents, each with a distinct role, toolkit, and permission set.

Users can assign agents to specific contacts, groups, or contact segments. Each agent operates within defined boundaries — they escalate to human when they hit the edge of their authority.

| Agent | Can Do | Cannot Do |
|---|---|---|
| Sales Agent | Qualify leads, handle objections, generate quotes, book meetings | Promise unsupported features, offer undisclosed discounts |
| Support Agent | Answer FAQs, process returns, look up order status, close tickets | Issue refunds above threshold, override policies |
| Community Manager | Post content to groups, moderate discussions, respond to questions | Make financial commitments |
| Executive Assistant | Schedule meetings, draft follow-ups, manage reminders | Access financial systems |
| Collections Agent | Send overdue payment reminders, offer payment plans | Write off debt |
| Appointment Setter | Confirm, reschedule, cancel bookings | Modify pricing |

**Escalation rules:** Any agent escalates to human when it detects:
- Anger or high frustration sentiment
- "Let me speak to a manager" or equivalent
- A topic outside its knowledge base
- A commitment that exceeds its permission tier
- Legal language or threat of dispute

When escalated: the conversation is flagged, automation paused, the human notified with full context and a recommended response.

---

### Engine 7 — Knowledge Engine

Allows businesses to give agents access to their institutional knowledge.

**Supported sources:**
- PDF documents (policies, manuals, catalogs)
- Website URLs (scraped and indexed)
- Google Docs / Notion (via integration)
- Custom Q&A pairs
- Product catalogs with pricing
- Return and refund policies
- Training materials

All uploaded content is chunked, embedded (pgvector), and made searchable. When an agent needs to answer a question, it performs a semantic search against the knowledge base before responding.

**Business impact:** Agents trained on company-specific knowledge give accurate, policy-compliant answers — not generic AI responses.

---

### Engine 8 — Business Intelligence Engine

Executive-level analytics that prove ROI and surface operational insights.

**Individual metrics:**
- Response time distribution
- AI suggestion acceptance rate
- Relationship health trends across the network
- Proactive suggestion outcomes (accepted / dismissed / resulted in reply)

**Team metrics (Business tier):**
- Agent performance: response time, resolution rate, CSAT (inferred from sentiment shifts)
- AI-suggestion acceptance rate per agent
- Conversation volume by agent, by time, by contact type

**Funnel analytics:**
- Lead → qualified → opportunity → closed conversion rates
- Drop-off points in conversation sequences
- Average time-to-close by contact segment

**Revenue attribution:**
- Link closed deals to specific conversation threads
- Revenue per agent
- Revenue per conversation type

**Proactive impact report:**
- "Zuri surfaced 7 upsell opportunities this month generating $3,400"
- "18 cold leads re-engaged via proactive suggestions"
- "42 hours of manual follow-up work automated"

**Custom reports:** Drag-and-drop metric builder for managers.

---

### Engine 9 — Automation Engine

A visual workflow platform for designing complex, multi-step conversation automations.

**Capabilities:**
- Visual flow builder (drag-and-drop canvas)
- Conditional logic and variables (store contact responses, use in branching)
- Wait conditions (if no reply in N days, proceed to next step)
- API call steps (look up order in Shopify, update HubSpot, etc.)
- Pre-built templates (invoice follow-up, lead nurture, appointment booking, NPS collection)
- Human handoff nodes

**Example workflow — Invoice Recovery:**
```
Overdue invoice detected
  → Send friendly reminder (Day 1)
  → No reply? Wait 3 days
  → Send second reminder with payment link (Day 4)
  → No reply? Wait 3 days
  → Offer payment plan (Day 7)
  → No reply? Assign to collections agent
  → Still nothing? Flag for manual escalation
```

**Example workflow — Lead Qualification:**
```
New lead message detected
  → Sales agent qualifies: budget, timeline, decision-maker
  → If qualified: book intro call → confirm → send calendar link
  → If not qualified: nurture sequence (monthly touchpoint)
  → If lost: archive with reason tag
```

---

### Engine 10 — Multi-Channel Communication Engine

WhatsApp is the starting point. The platform eventually understands relationships across all communication channels as a single, unified context.

**Planned channel support:**
- WhatsApp (open-wa + official Business API)
- Instagram DMs
- Facebook Messenger
- Telegram
- SMS
- Email
- LinkedIn (read-only initially)

**Architecture:** Each channel is a normalised message source. All channels feed the same `messages.incoming` pipeline. The intelligence engines process messages identically regardless of channel. Reply drafts are sent back through the originating channel.

**Unified relationship view:** A contact reached via WhatsApp and Instagram is the same person in Zuri. Their profile, history, and insights accumulate across channels.

---

## 3. The Trust Engine

Not a separate engine — a cross-cutting configuration layer that governs how much autonomy the system has for each individual relationship.

| Level | Name | What the AI Can Do |
|---|---|---|
| 0 | Observe | Analyze conversations, build memory. No proactive actions. |
| 1 | Suggest | Draft replies, surface proactive suggestions. User always approves. |
| 2 | Assisted | Auto-send routine acknowledgements (read receipts, "thanks"). Confirm before anything substantive. |
| 3 | Delegated | Handle FAQs, schedule meetings, follow up on invoices. Escalate exceptions. |
| 4 | Autonomous | Full agent mode — operates within configurable boundaries without requiring approval. |

Default: Level 1 for all personal contacts. Businesses can configure per-contact or per-segment trust levels.

---

## 4. The Goal Engine

Every relationship exists for a reason. Zuri should understand the user's desired outcome for each relationship and optimize for it.

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

The system evaluates every interaction against the assigned goal and surfaces actions that improve the probability of success. It shifts from "replying to messages" to actively helping users achieve relationship outcomes.

---

## 5. User Journey

### Personal User — Daily Habit

**Morning (5 min):**
1. Open Zuri. See the "Morning Coffee" feed.
2. Review relationship health alerts — who needs attention today.
3. Browse pre-drafted messages (birthday texts, follow-ups, spontaneous joke to a friend).
4. Click approve. Done.

**Throughout the day:**
- New WhatsApp message arrives → Zuri analyzes in real-time
- Suggested reply appears in inbox with tone breakdown and contact mood
- User approves, tweaks, or rejects in one tap

**Weekly:**
- Review relationship health dashboard
- See which relationships are improving vs. cooling
- Review proactive outcomes — what did the AI suggest, what worked

### Business User — Sales Rep

**Morning:**
- Dashboard shows lead pipeline with AI-assigned intent scores
- Today's follow-up sequence items (with drafted messages)
- Flagged conversations needing human attention

**Active selling:**
- Incoming lead message → AI qualifies intent → drafts opening response
- Conversation strategy shows the next 3 recommended moves
- Objection detected → AI drafts counter with reasoning

**End of day:**
- Review what the sales agent handled autonomously
- Analytics: 12 conversations active, 3 moved to opportunity, 1 closed

---

## 6. Pricing Tiers

| Tier | Price | Who It's For |
|---|---|---|
| **Personal** | Free / $19/mo | Single user, up to 50 contacts, basic nudges and suggestions |
| **Pro** | $49/mo | Unlimited contacts, full AI, web search, calendar sync, all proactive features |
| **Business** | $149/mo (up to 5 agents) | Shared inbox, RBAC, CRM sync, analytics, autonomous care agent, group management, API access |
| **Enterprise** | Custom ($500+/mo) | Dedicated instance, BYOK, white-label, SOC 2 audit logs, advanced data retention, SLA |

---

## 7. Feature Matrix

| Feature | Personal | Pro | Business | Enterprise |
|---|---|---|---|---|
| Proactive nudges & reply suggestions | ✓ | ✓ | ✓ | ✓ |
| Voice-matched drafts | ✓ | ✓ | ✓ | ✓ |
| Relationship health scoring | ✓ | ✓ | ✓ | ✓ |
| Temporal Intelligence (relationship clocks) | limited | ✓ | ✓ | ✓ |
| World Knowledge Engine (web search + trends) | — | ✓ | ✓ | ✓ |
| Opportunity Detection Engine | — | ✓ | ✓ | ✓ |
| Conversation Strategy Engine | — | ✓ | ✓ | ✓ |
| Shared team inbox | — | — | ✓ | ✓ |
| RBAC + audit logs | — | — | ✓ | ✓ |
| Autonomous Agent Engine | — | — | ✓ | ✓ |
| Knowledge Engine (upload docs) | — | — | ✓ | ✓ |
| Business Intelligence Engine | — | — | ✓ | ✓ |
| Automation Engine (visual flows) | — | — | ✓ | ✓ |
| CRM sync (HubSpot, Salesforce, Pipedrive) | — | — | ✓ | ✓ |
| Group management + content | — | — | ✓ | ✓ |
| White-labeling | — | — | — | ✓ |
| BYOK (bring your own AI keys) | — | — | — | ✓ |
| Official WhatsApp Business API | — | — | — | ✓ |
| Dedicated instance | — | — | — | ✓ |
| SOC 2 / DPA | — | — | — | ✓ |

---

## 8. Enterprise Features Detail

### Shared Team Inbox
A single WhatsApp number linked to a central dashboard. Multiple agents log in, see AI-suggested replies, and handle conversations. Includes collision detection (banner when two agents view the same chat) and internal @mention notes.

### Role-Based Access Control (RBAC)
Custom roles (Admin, Team Lead, Agent, Analyst). Data scoped by team/region. Every action logged — who viewed, who sent, who edited. Immutable audit trail.

### Customer Consent Management
Tracks opt-in/opt-out per contact. Auto-pauses AI monitoring for contacts who revoke consent. Critical for GDPR compliance.

### Data Retention Policies
Configurable auto-deletion of raw message content after X days. Insights and embeddings retained. Businesses choose their data residency requirements.

### Bring Your Own AI Key (BYOK)
Enterprise customers plug in their own Anthropic/OpenAI contract. Data never hits Zuri's provider account. Reduces cost at scale and satisfies data sovereignty requirements.

### Official WhatsApp Business API
For enterprises requiring compliance: use the official Meta API via 360dialog or Twilio instead of open-wa. Same Zuri dashboard, same intelligence layer, official channel. Migrate from open-wa to official API with one config change.

### Integration Ecosystem
- **Native CRM:** HubSpot, Salesforce, Pipedrive, Zoho (bi-directional sync)
- **Webhook Engine:** custom "if this, then that" rules fired on any event
- **Zapier / Make:** public integration for no-code workflows
- **Public REST API:** programmatic access for custom dashboards and reporting

### Broadcast & Segmentation Engine
Dynamically segment contacts by AI-assigned tags (intent, industry, relationship tier). Send personalised blast messages that look individually typed. Throttled delivery to avoid spam detection.
