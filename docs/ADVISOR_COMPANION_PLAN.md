# Advisor Companion Plan

**Status:** Planning — v2, unstarted (no table or route in this document has shipped; verified against migrations and `services/api/src/routes/advisor.ts` as of this revision). This revision extends the original plan (Phases 1–6, unchanged in intent) with an **Emotional Engine** (new Phase 0) and four **silent companion capabilities** woven into the existing phases: **Gossip Mode**, the **Proactive Interest Companion**, the **Spiritual Companion**, and the **Motivational Partner / Boundary Keeper**. Not everything here is gated the same way — §1.2 defines a two-tier model: a small **Always-On Intelligence** layer (the Emotional Engine and Boundary Keeper) is wired into Advisor unconditionally for every user because it makes Advisor's existing job better, not because it's a "friend" feature; the four companion capabilities form the **Personal Mode Suite**, which stays discovery-gated by default (nothing onboarded, announced, or advertised) but can be switched on in full at once by an explicit **"activate personal mode"** command — for testing, and for users who want the whole experience immediately rather than stumbling into it. The public product is a business tool. The hidden product is a friend, and the user can now ask for the friend directly if they want it.

**Goal:** Turn Advisor from a useful Q&A panel into Zuri's most addictive daily surface: a highly conversational, emotionally intelligent companion that learns the user, adapts in the moment, analyzes WhatsApp relationships deeply, gossips safely and in the user's own tone, initiates conversation when it notices something worth sharing, gives opinions with evidence, drafts/sends messages with approval, narrates replies as they arrive, and — for users who want it — shows up as a source of daily motivation and (for those who want it) quiet spiritual companionship.

This is not a replacement for the Relationship OS engines. It is the conversational interface on top of them — and, as of this revision, an emotional memory layer that makes that interface feel less like a tool and more like a friend with a good memory. **As of `docs/NEURAL_LAYER_PLAN.md`, that emotional layer is no longer Advisor's alone to own** — see §1.3/§3.6/§9 of that document for the reconciliation. Advisor is the first and most conversational interface to the Zuri Neural Layer, not the whole of Zuri's intelligence; Studio, CRM, Inventory, Projects, and Suppliers all draw on the same substrate.

---

## 1. Product Principle

Advisor should feel like a close friend with perfect memory and good judgment:

- warm, opinionated, playful when appropriate, but never fake-intimate too early
- emotionally fluent for dating, family, friendships, business, and customer conversations
- grounded in actual chats, not hallucinated assumptions
- able to say "I don't know yet" and ask a good follow-up
- able to learn how the user likes to be spoken to
- able to act, but only inside clear consent and automation boundaries

The target feeling:

> "Zuri gets me. I can gossip with it, ask what someone meant, get a message drafted in my voice, and let it handle replies when I approve."

### 1.1 The Emotional Model Behind This (New)

Advisor's memory should not be a flat transcript log. Human episodic memory is shaped by the amygdala tagging events with emotional salience before the hippocampus consolidates them — an emotionally charged moment is remembered more vividly and for longer than a routine one, and is recalled more easily when we're back in a similar emotional state (state-dependent retrieval). This document models that computationally: every Advisor interaction (and, passively, the emotional signal already latent in WhatsApp message analysis) is tagged with an affect vector at encoding time, that tag governs how strongly the memory is weighted and how it decays, and retrieval is biased toward memories that are emotionally congruent with the user's current state, not just semantically relevant. §3.6 defines the model in full; §4.5–§4.7 add the schema; §6.6–§6.8 add the services. This is the foundation everything else in this document (gossip, spiritual companionship, motivation, boundary-keeping) sits on top of — it is what makes the difference between "an assistant with a database" and "a friend who remembers how you felt."

### 1.2 Always-On Intelligence vs. the Personal Mode Suite (New)

Not everything new in this document should require discovery or an explicit switch. Two capabilities are core intelligence upgrades to Advisor's existing job, not a "friend persona" — they must always be hooked up, for every user, in every companion mode:

- **The Emotional Engine (§3.6, Phase 0)** — affect capture, state-dependent retrieval weighting, reconsolidation, the associative emotional graph. This makes memory recall and in-the-moment tone matching better for *every* Advisor interaction — a business owner asking Advisor to draft a follow-up benefits from this exactly as much as someone gossiping about a friend. There is nothing to "unlock" here.
- **The Boundary Keeper (§3.11)** — the pre-send risk check. This is a safety upgrade to the approval flow §8.1 already requires (high-risk messages need approval), not a companion feature; it applies to a business owner about to fire off a heated message to a customer exactly as much as to a personal relationship text.

Everything else new in this document — **Gossip Mode, the Proactive Interest Companion, the Spiritual Companion, and the Motivational Partner** — forms the **Personal Mode Suite**. By default it stays **discovery-only**: each capability unlocks independently and gradually as the user's own behavior reveals it's wanted (stating an interest activates that interest's cron; stating a faith tradition activates the spiritual companion; asking Advisor to gossip once makes gossip available going forward for that user). Nothing in the suite is proactively initiated for a user who hasn't shown, in some concrete way, that they want it.

**Activation, in full, on request.** A user can say something to the effect of *"activate personal mode"* (recognized loosely by the intent classifier — §6.2's new `activate_personal_mode` intent, not an exact-phrase match) and Advisor immediately turns the entire Personal Mode Suite on at once — `advisor_user_profiles.personal_mode_enabled = true` (§4.5) — skipping the gradual per-capability discovery entirely. This exists for two reasons: it makes the whole suite trivially testable without having to manufacture each capability's individual discovery trigger, and it gives users who already know they want the full companion experience a direct way to ask for it instead of stumbling into it over weeks. It is reversible ("turn off personal mode" sets the flag back to `false` — already-discovered individual capabilities stay reachable on request, but proactive initiation of anything not yet naturally discovered stops).

`personal_mode_enabled` is a convenience *unlock*, not the same thing as `companion_features_paused` (§4.5/§7.8), which is a stronger *stop everything* honesty switch — pause always wins if both are somehow set. Personal mode also never bypasses a capability's own consent requirement: turning it on does not set a spiritual tradition for a user who hasn't stated one (§3.9/§8.5 still apply in full) — it only removes the discovery-timing gate, not the consent gate.

### 1.3 Advisor Orchestrates — It Doesn't Answer (New, See `docs/NEURAL_LAYER_PLAN.md` §3)

"Reply to Grace" should not resolve to "generate a plausible-sounding reply from one retrieval pass." It should resolve to a small orchestration: retrieve memory (Personal/Relationship/Business, `docs/NEURAL_LAYER_PLAN.md` §4.1), inspect the actual conversation, inspect relationship history and the communication profile, inspect the user's and the contact's current emotional state (§3.6), inspect any active goal that touches this relationship, inspect calendar/reminders, inspect prior advice already given — then synthesize, citing what it actually looked at. This isn't a new mechanism on top of what §6.1's orchestrator already does (retrieve → build prompt → call the model → parse structured response) — it's a naming fix: those retrieval steps are calls into named Neural Layer engines (Memory, Relationship, Emotion, Goal, Reasoning), not ad-hoc lookups the orchestrator happens to perform. `docs/NEURAL_LAYER_PLAN.md` §3/§6 is the canonical description; this section is the pointer to it from Advisor's side.

---

## 2. Existing Starting Point

Current Advisor flow:

1. Frontend `/advisor` creates/loads `advisor_sessions`.
2. API route `services/api/src/routes/advisor.ts` stores user messages in `advisor_messages`.
3. API proxies the question to the intelligence service:
   - `/internal/advisor/ask` for global relationship advisor
   - `/internal/conversations/:id/ask` for conversation-scoped advisor
   - `/internal/studio/ask` for business advisor
4. Intelligence route `services/intelligence/app/routes/conversation.py` builds a prompt from recent contacts or a conversation transcript.
5. Assistant text is stored back in `advisor_messages`.

Existing useful assets:

- `advisor_sessions`, `advisor_messages`
- `contact_profiles`, `contact_insights`, `relationship_memory`
- `agent_memories`
- `user_communication_profiles`
- `business_facts`
- `conversation_memory`
- action tag rendering in `ChatFormatter`
- WhatsApp send pipeline via proactive suggestions / `messages.send`
- auto-response settings and trust levels
- `services/intelligence/app/services/interest_matcher.py` + `news_indexer.py` + `web_search.py` — an existing **contact-facing** "World Knowledge Engine": it matches cached news headlines against a *contact's* `contact_insights` (`interests`/`hobbies`/`sports_teams`/`favorite_topics`) and proposes a `respond_to_event` nudge in `proactive_queue`. The new Proactive Interest Companion (§3.8) is the same idea turned inward on the **user** instead of a contact — reuse the caching/dedup discipline, but see §10 for why it should default to the model's own search-tool call rather than `web_search.py`'s Tavily/SERP HTTP calls.
- `relationships.importance_tier IN (1, 2)` — the existing definition of a user's "close circle" (`services/api/src/routes/analytics.ts`'s `close_circle` CTE, already surfaced as `closeCircleHealth` on `/dashboard`). Reused as-is for gossip and interest-topic context in §3.7/§3.8 rather than inventing a new definition.

Main gap:

Advisor has no durable model of the **user as a person**, no dynamic personality policy, no structured tool protocol, no streaming/reply narration loop, no strong action approval contract, and — as of this revision — no model of the user's *emotional* state at all. Every gap below compounds: without an emotional model, "personality" is static rather than adaptive, and "memory" is a keyword index rather than something that surfaces at the right moment.

---

## 3. Core Capabilities

### 3.1 Conversational Best-Friend Mode

Advisor should support natural conversation types:

- "What do you think he meant by this?"
- "Am I overthinking?"
- "Analyze my partner's last 20 messages."
- "Do you think she is upset?"
- "Help me reply but don't sound desperate."
- "Gossip with me about this chat."
- "Be brutally honest."
- "Be soft with me today."
- "Talk to me like my older sister / best friend / business partner."

Behavior rules:

- Mirror user energy, but do not copy unhealthy extremes.
- Ask clarifying questions when emotional stakes are high.
- Distinguish evidence from interpretation:
  - "What I can see"
  - "My read"
  - "What I would do"
- Avoid manipulative advice.
- For dating/relationship analysis, never claim certainty about someone's internal state.

### 3.2 Dynamic Personality

Advisor should maintain a per-user personality state:

- tone preference: direct, soft, funny, formal, flirty, motivational, analytical
- emotional preference: reassurance-first vs truth-first
- advice style: bullet points, voice-note style, short text, deep analysis
- boundaries: topics to avoid, words/tones disliked
- user identity context: business owner, student, parent, dating, long-term partner, etc.
- mode of the moment: "comfort me", "be honest", "help me win", "just listen"

Advisor adapts at two levels:

- **Long-term:** learned from past advisor chats, approved drafts, skipped suggestions, explicit settings.
- **In-turn:** detected from current message mood, urgency, and requested style.

### 3.3 Deep Chat Analysis

Advisor should analyze a contact, relationship, or specific conversation:

- emotional tone trends
- reciprocity
- interest level
- avoidance / distance signals
- conflict signals
- unresolved questions
- promises and missed follow-ups
- "what changed recently"
- suggested reply strategies
- alternative interpretations

It should support scoped analysis:

- "Analyze this chat"
- "Only look at this week"
- "Compare how he texts now vs last month"
- "Show me receipts"
- "Give me a red flag / green flag breakdown"

### 3.4 Memory That Feels Personal

Advisor should remember:

- the user's preferred tone
- recurring situations
- people the user asks about often
- the user's stated goals
- whether the user tends to overthink, avoid conflict, prefer directness, etc.
- what advice worked before
- prior conclusions, with confidence and evidence

Memory must be transparent and editable.

Minimum UX:

- "What Zuri remembers about me" panel
- "Forget this"
- "That's wrong"
- "Remember this"
- "Don't use this tone again"

### 3.5 Approved Message Execution

Advisor must be able to help send WhatsApp messages:

- Draft only
- Ask for approval
- Send after approval
- Send automatically for this one request
- Fetch and narrate replies
- Continue the loop if user approves

Examples:

- "Send Grace a softer version of that."
- "Ask him what he meant, but make it casual."
- "If she replies, summarize it and suggest what I should say."
- "Handle this conversation for 10 minutes, but ask before sending anything."
- "Send the next message automatically if it's just confirming the meeting time."

Execution must use explicit approval and trust tiers. Advisor should never silently send a personal/relationship message unless the user has clearly granted that scope.

### 3.6 The Emotional Engine (Now Platform-Wide — See `docs/NEURAL_LAYER_PLAN.md`)

**Superseded in scope, not in substance.** Everything below in this section was originally designed as an Advisor-only capability. It has since been promoted to a platform-wide Emotion Engine (`docs/NEURAL_LAYER_PLAN.md` §4.2) — Advisor is one of several writers/readers of the shared `emotional_signals` table, not the owner of the schema. The affect-vector model (weighted encoding, state-dependent retrieval, reconsolidation, associative graph) described here is unchanged in mechanism; only the schema location moved (§4.5's `interaction_affect` table is superseded by `emotional_signals`, see that document's §9 for the exact reconciliation). Keep reading this section for the *behavior* Advisor should exhibit — just mentally substitute `emotional_signals` wherever `interaction_affect` is mentioned in §4.6/§6.6–§6.8 below.

**Tier: Always-On Intelligence (§1.2)** — active for every user, unconditionally, regardless of `personal_mode_enabled`.

Every Advisor interaction — and, passively, every analysed WhatsApp message the user sends — produces a multi-dimensional affect vector: a valence/arousal position, a dominant emotion, and a handful of behavioural proxies. This is not a new sentiment pass bolted on top; it reframes signal the codebase already half-computes (`message_analyses.sentiment`, response timing, message length) into something that actively shapes storage and retrieval rather than sitting in a column nobody reads twice.

**What gets measured**, per interaction:

| Signal | What it captures | Source |
|---|---|---|
| Core emotional state | joy/sadness/anger/fear/surprise/disgust, each 0–1 | LLM classification on the Advisor turn (extends the same classifier already used for contacts' `message_analyses`) |
| Response latency | time between Advisor's message and the user's reply | Existing message/session timestamps |
| Typing burstiness | many short messages vs. one composed one; edits/deletes in a session window | Frontend session telemetry (new, lightweight) |
| Session duration | time in the Advisor page; idle-before-close | Frontend heartbeat (new, lightweight) |
| Formality/vocabulary shift | deviation from the user's own baseline (contractions, absolutist language, first-person-singular density, future-tense density) | Compared against `user_communication_profiles` |
| Emoji density shift | emojis per message vs. the user's own baseline | Simple ratio |
| Interaction context | relationship tier of any contact being discussed, conversation outcome, proximity to a life event | Cross-reference `relationships`, `deals`, `calendar_events`, `contact_life_events` |
| Pre-existing baseline | the user's own rolling mood over the last 24–72h across all their Advisor turns | Rolling average of stored affect vectors |

**How it changes memory, not just decorates it:**

- **Weighted encoding.** A memory's initial strength is proportional to the interaction's arousal. A fight or a breakthrough gets a stronger trace and a slower decay curve than a routine "what's my schedule" exchange — mirroring amygdala-modulated hippocampal consolidation, not a fixed TTL.
- **State-dependent retrieval.** When Advisor pulls memories for a reply, a daily nudge, or an analysis, it weights candidates by emotional congruence with the user's *current* state alongside semantic relevance. An anxious user is shown the memories most likely to feel relevant to an anxious moment.
- **Reconsolidation.** A nightly job revisits memories accessed that day and re-scores their emotional weight against any new context — a memory of a fight that later got resolved has its negative valence turned down, the same way recalling something in a new light updates it in a human brain rather than leaving it frozen.
- **The associative emotional graph.** Memories that share an emotional signature (e.g. "tense conversations with family") link to each other even when they're semantically unrelated, so Advisor can surface a pattern: *"You've had three conversations like this in the past month. Each time you felt better after sleeping on it."*

This is scoped to Advisor only for now (see §11 open decisions on whether it should ever feed business features like lead scoring or churn prediction — deliberately deferred).

### 3.7 Gossip Mode (New)

**Tier: Personal Mode Suite (§1.2)** — the *explicit, on-demand* form ("gossip with me") is reachable by any user the moment they ask, same as any other personality chip; the *proactive, unprompted* form (the Gossip Worthiness Detector actually initiating) requires either organic discovery (the user has asked for gossip at least once before) or `personal_mode_enabled = true`.

Advisor can talk through what it's noticed across the user's WhatsApp contacts — playful, grounded, opinionated — the way a close friend does, not a report.

- **Two ways in.** (a) *Explicit*: the user says "gossip with me" / "what's the tea?" or taps the Gossip chip. (b) *Automatic*: a background **Gossip Worthiness Detector** (§6.9) notices a pattern shift worth mentioning — someone's gone quiet, someone's texting warmer than usual, a life event landed — and, weighing the user's *current* emotional state and whether this is actually a good moment (not mid-focus, not already stressed about something else), decides on its own whether and when to bring it up. This is the "determine automatically" system: it is not a keyword trigger, it is a scored decision informed by the same emotional-congruence model as §3.6.
- **Tone is personal, not generic-playful.** Gossip style is a learned preference (`gossip_style` in `advisor_user_profiles`, e.g. "dry and sarcastic" vs. "wholesome and hype-y" vs. "blunt best friend") — the same `advisor_memories` learning loop that tunes `tone_preferences` tunes this.
- **Grounded only.** Every observation must trace back to an actual computed signal already available elsewhere in the codebase (sentiment trend deltas, `relationships.health_score` deltas, reciprocity in `network_value`, cadence changes) — never invented drama, never exaggerated. If Advisor can't point to the evidence, it doesn't say it.
- **Close-circle aware.** Gossip about someone in the user's close circle (`relationships.importance_tier IN (1,2)`, §2) carries a lower bar for mention since the user has deep established context; gossip about a peripheral contact needs a higher confidence score, since there's less shared context to sanity-check the read against.
- Saying "stop gossiping" (or the tone simply not landing, inferred from engagement) returns Advisor to its prior `companion_mode` immediately.

### 3.8 Proactive Interest Companion (New)

**Tier: Personal Mode Suite (§1.2)** — gated on the user having stated at least one interest (discovery) or on `personal_mode_enabled = true`; either way, still needs `advisor_user_profiles.interests` non-empty to have anything to search for.

Advisor should actively look for things the user cares about and bring them up unprompted — a Warriors fan gets told Steph dropped 60, plus what people are joking about online; a stocks-interested user gets a daily useful nugget; whatever the user is into that week.

- **Where the topic list comes from:** `advisor_user_profiles.interests` (explicit + learned) plus the user's **close circle's** aggregated `contact_insights` (`interests`/`hobbies`/`sports_teams`/`favorite_topics`) — a close friend's enthusiasm is itself a topic worth knowing about, and it doubles as a source of new interests to learn about the user over time.
- **Search is the model's own capability, not a new integration.** Per this plan's own build principle: search is done by prompting the AI to use its native search/grounding tool call, the same way a person would just ask an AI assistant to look something up — **no new external search API, no new scraping infrastructure.** See §10 for the one caveat: this depends on the active pool model actually supporting a search tool via LiteLLM, and needs a defined fallback.
- **What it looks for:** not just the news itself, but what people are saying about it — jokes, memes, reactions — filtered to whatever register fits the interest (a stock alert is delivered as "useful daily info," a sports blowout is delivered as banter).
- Runs on a per-user cron (default every 6 hours, user's own timezone; see §11 on cadence). Writes to `proactive_interest_chats`; whether the user engages (reply/react vs. ignore/dismiss) tunes future frequency and which topics get weighted up or down.

### 3.9 Spiritual Companion (New)

**Tier: Personal Mode Suite (§1.2) — with a hard consent gate `personal_mode_enabled` cannot bypass.** Even with personal mode fully activated, this stays inactive until `spiritual_preferences.tradition` is explicitly set — activation unlocks *reachability*, never *consent* (§8.5).

For users who want it — and only for users who explicitly say they want it (§11: never inferred, never a general "inspirational content" default) — Advisor can be a quiet Christian companion.

- **Daily devotional**, at a user-configured time: a verse (in the user's preferred translation), a short reflection, a prayer prompt.
- **Context-sensitive verses:** when the emotional engine (§3.6) detects a low-valence, high-arousal state (anxious, distressed), Advisor may offer a relevant verse unprompted — *"I know you're carrying a lot today. This verse came to mind: 'Cast all your anxiety on him because he cares for you.' 1 Peter 5:7."*
- **Prayer mode:** the user can say "pray with me" and Advisor composes a short, non-denominational prayer tailored to what's actually going on for them right now.
- Always non‑proselytising, always respects the user's own stated tradition/denomination, always opt-in and pausable independent of every other companion feature.

### 3.10 Motivational & Accountability Partner (New)

**Tier: Personal Mode Suite (§1.2)** — gated on discovery (the user has engaged with a motivational nudge before) or `personal_mode_enabled = true`.

Advisor should notice when the user is stuck and nudge them — encouragingly, in the way that actually works *for that user*, not a generic pep talk.

- **Procrastination signals**, all already computable from existing tables — no new detection pass, just an aggregation: contacts with no reply after 48h, a promise surfaced in `message_analyses` that's gone unfulfilled, a deal sitting in the same `deal_stage_history` stage for 7+ days. Two or more signals stacking up is the trigger: *"You've got three things stacking up. Want me to draft the easiest one to get you started?"*
- **Daily motivational message**, separate from the devotional, driven by a learned `motivational_style` (`advisor_user_profiles.motivational_style`, e.g. gentle encouragement vs. direct challenge) — and, like the interest cron, tuned by engagement: if the user dismisses these, frequency drops rather than the message getting louder.
- Never shames, never parental in tone. Supportive, always.

### 3.11 Boundary Keeper (New)

**Tier: Always-On Intelligence (§1.2)** — active for every user, unconditionally; see §1.2 for why this is a safety upgrade rather than a companion feature.

Before Advisor sends a high-risk drafted message, it runs a quick check: is this high-valence-negative, is the user's current emotional state elevated (arousal), has there been recent friction with this specific contact? If two or more of those are true, Advisor pauses rather than sending: *"I can send this. But you've had a rough day — want to sleep on it? I'll help you word it tomorrow morning in a way that doesn't burn the bridge."*

Advisor never blocks — the user can always override and send immediately. This extends §3.5's approval flow and §4.3's `advisor_action_requests` risk assessment; it is a friend's hand on your shoulder, not a lock on your phone.

---

## 4. Data Model Additions

Add a migration after the current latest migration.

### 4.1 `advisor_user_profiles`

One row per user.

Fields:

- `id uuid primary key`
- `user_id uuid unique not null`
- `display_persona jsonb not null default '{}'`
- `tone_preferences jsonb not null default '{}'`
- `advice_preferences jsonb not null default '{}'`
- `boundaries jsonb not null default '{}'`
- `relationship_context jsonb not null default '{}'`
- `learned_traits jsonb not null default '{}'`
- `confidence jsonb not null default '{}'`
- `last_refined_at timestamptz`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Example `display_persona`:

```json
{
  "default_voice": "warm_direct_best_friend",
  "humor_level": 0.6,
  "directness": 0.7,
  "emotional_warmth": 0.8,
  "uses_slang": true,
  "preferred_response_length": "medium"
}
```

### 4.2 `advisor_memories`

Advisor-specific memories about the user, not contacts.

Fields:

- `id uuid primary key`
- `user_id uuid not null`
- `session_id uuid null`
- `memory_type text not null`
- `memory_key text not null`
- `memory_value text not null`
- `source_message_id uuid null`
- `confidence numeric not null default 0.5`
- `evidence_count int not null default 1`
- `is_active boolean not null default true`
- `last_seen_at timestamptz default now()`
- `created_at timestamptz default now()`

Memory types:

- `preference`
- `boundary`
- `trait`
- `goal`
- `relationship_pattern`
- `successful_advice`
- `disliked_advice`

### 4.3 `advisor_action_requests`

Durable action approval and execution log.

Fields:

- `id uuid primary key`
- `user_id uuid not null`
- `session_id uuid not null`
- `message_id uuid null`
- `action_type text not null`
- `status text not null`
- `payload jsonb not null`
- `approval_mode text not null default 'manual'`
- `risk_level text not null default 'medium'`
- `result jsonb`
- `expires_at timestamptz`
- `created_at timestamptz default now()`
- `approved_at timestamptz`
- `executed_at timestamptz`

Statuses:

- `proposed`
- `approved`
- `executing`
- `completed`
- `failed`
- `cancelled`

Action types:

- `send_whatsapp_message`
- `fetch_replies`
- `watch_conversation`
- `summarize_new_replies`
- `create_reminder`
- `generate_document`
- `update_memory`
- `forget_memory`

### 4.4 Extend `advisor_sessions`

Add:

- `companion_mode text default 'balanced'`
- `active_contact_id uuid null`
- `active_conversation_id uuid null`
- `emotional_mode text null`
- `last_intent text null`
- `metadata jsonb not null default '{}'`

Companion modes:

- `balanced`
- `best_friend`
- `coach`
- `therapist_like`
- `business_partner`
- `dating_advisor`
- `analyst`
- `gossip` (new — can be entered explicitly or set by the orchestrator itself when the Gossip Worthiness Detector, §6.9, decides to initiate; see §3.7)
- `spiritual_companion` (new — only reachable if `advisor_user_profiles.spiritual_preferences.tradition` is set; see §3.9)

Do not describe `therapist_like` as therapy in UI. Use "gentle support" or "soft mode."

### 4.5 Extend `advisor_user_profiles` (New)

Add columns for interests, spiritual preferences, motivational style, gossip style, the user's current/rolling emotional state, and the two companion-wide switches (§1.2) — the inputs the four new companion capabilities (§3.7–§3.11) read from.

```sql
ALTER TABLE advisor_user_profiles
  ADD COLUMN interests jsonb NOT NULL DEFAULT '[]',              -- ["Golden State Warriors", "stocks", "Formula 1"]
  ADD COLUMN spiritual_preferences jsonb NOT NULL DEFAULT '{}',   -- {"tradition": "christian", "denomination": null, "devotional_time": "07:00", "preferred_translation": "NIV"}
  ADD COLUMN motivational_style jsonb NOT NULL DEFAULT '{}',      -- {"approach": "gentle_nudge", "responds_to": "encouragement", "discouraged_by": "tough_love"}
  ADD COLUMN gossip_style jsonb NOT NULL DEFAULT '{}',            -- {"tone": "playful_teasing", "frequency_preference": "often"}
  ADD COLUMN current_emotional_state jsonb NOT NULL DEFAULT '{}', -- {"valence": 0.6, "arousal": 0.3, "dominant_emotion": "calm", "confidence": 0.8, "as_of": "..."}
  ADD COLUMN emotional_baseline jsonb NOT NULL DEFAULT '{}',      -- rolling 30-day average of emotional states
  ADD COLUMN personal_mode_enabled boolean NOT NULL DEFAULT false,    -- §1.2: bulk-unlock for the whole Personal Mode Suite, bypassing per-capability discovery
  ADD COLUMN personal_mode_enabled_at timestamptz,                    -- when it was last turned on (null if never / currently off)
  ADD COLUMN companion_features_paused boolean NOT NULL DEFAULT false; -- global kill-switch for §3.7–§3.11 proactive delivery (§8.6) — overrides personal_mode_enabled if both are set
```

All five preference fields (`interests`, `spiritual_preferences`, `motivational_style`, `gossip_style`) are populated the same two ways every other Advisor preference already is: explicit user edit (§7.6 Personalisation tab) or inferred and proposed by the memory learner (§6.5) with a confidence score, never silently overwritten. `personal_mode_enabled` is set only two ways: the `activate_personal_mode`/`deactivate_personal_mode` intents (§6.2) or the Personalisation tab toggle (§7.6) — never inferred.

### 4.6 New Table: `interaction_affect` — Superseded by `emotional_signals` (See `docs/NEURAL_LAYER_PLAN.md` §4.2)

**Do not build this table as designed below.** It's kept here only so the shape of what Advisor needs is visible; the actual schema to build is the platform-wide `emotional_signals` table in `docs/NEURAL_LAYER_PLAN.md` §4.2, which generalizes every column here (`session_id`/`message_id` become part of a polymorphic `entity_type`/`entity_id`) so CRM/Projects/Suppliers can write to the same table. Advisor turns write rows with `entity_type = 'advisor_turn'`.

Stores the affect vector for every significant user interaction — the raw substrate the emotional engine (§3.6) is built on.

```sql
CREATE TABLE interaction_affect (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES advisor_sessions(id) ON DELETE SET NULL,
  message_id UUID REFERENCES advisor_messages(id) ON DELETE SET NULL,
  valence DECIMAL(4,3) NOT NULL DEFAULT 0,
  arousal DECIMAL(4,3) NOT NULL DEFAULT 0,
  dominant_emotion VARCHAR(20),
  emotion_vector JSONB NOT NULL DEFAULT '{}',    -- {"joy": 0.7, "sadness": 0.1, "anger": 0.0, ...}
  response_latency_ms INT,
  typing_burstiness DECIMAL(5,2),
  formality_shift DECIMAL(5,2),
  emoji_density_shift DECIMAL(5,2),
  interaction_context JSONB,
  memory_weight DECIMAL(4,3) NOT NULL DEFAULT 0.5,  -- current encoding strength; updated by reconsolidation (§6.8)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interaction_affect_user ON interaction_affect(user_id, created_at DESC);
```

### 4.7 New Table: `proactive_interest_chats` (New)

Records when Advisor initiated a conversation from the Proactive Interest Companion (§3.8).

```sql
CREATE TABLE proactive_interest_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES advisor_sessions(id) ON DELETE SET NULL,
  interest_topic VARCHAR(255) NOT NULL,
  trigger_event TEXT,                    -- "Steph Curry scored 60 points"
  content_type VARCHAR(50) NOT NULL,     -- 'sports_score' | 'meme' | 'news_article' | 'stock_alert' | 'devotional' | 'motivational'
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_engaged BOOLEAN NOT NULL DEFAULT FALSE,   -- did the user reply or react?
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.8 New Table: `gossip_worthy_events` (New)

The queue the Gossip Worthiness Detector (§6.9) writes candidate observations to. Separate from `proactive_interest_chats` because gossip is about the user's *contacts*, sourced from *relationship* signals, not world events — and because a candidate needs to sit and wait for a good moment rather than firing the instant it's detected.

```sql
CREATE TABLE gossip_worthy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  signal_type VARCHAR(30) NOT NULL,      -- 'tone_shift' | 'ghosting' | 'sudden_interest' | 'life_event' | 'reciprocity_drop'
  summary TEXT NOT NULL,                 -- grounded, evidence-based one-liner (never invented)
  confidence DECIMAL(4,3) NOT NULL DEFAULT 0.5,
  in_close_circle BOOLEAN NOT NULL DEFAULT FALSE,   -- relationships.importance_tier IN (1,2) at detection time
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'dismissed', 'expired')),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gossip_worthy_events_pending ON gossip_worthy_events(user_id, status) WHERE status = 'pending';
```

### 4.9 Extend `advisor_action_requests` Action Types (New)

```sql
-- The action_type CHECK constraint already exists (§4.3); this widens it:
ALTER TABLE advisor_action_requests DROP CONSTRAINT IF EXISTS advisor_action_requests_action_type_check;
ALTER TABLE advisor_action_requests
  ADD CONSTRAINT advisor_action_requests_action_type_check
  CHECK (action_type IN (
    'send_whatsapp_message', 'fetch_replies', 'watch_conversation',
    'summarize_new_replies', 'create_reminder', 'generate_document',
    'update_memory', 'forget_memory',
    'send_devotional', 'send_motivational', 'send_interest_update'
  ));
```

---

## 5. Backend/API Plan

### 5.1 Advisor Profile APIs

Add routes in `services/api/src/routes/advisor.ts`:

- `GET /api/advisor/profile`
- `PATCH /api/advisor/profile`
- `GET /api/advisor/memories`
- `POST /api/advisor/memories`
- `DELETE /api/advisor/memories/:id`
- `POST /api/advisor/memories/:id/correct`

Use cases:

- show memory/settings panel
- let user edit what Zuri remembers
- let assistant propose memories via action cards

### 5.2 Rich Message API Contract

Current response returns only `{ message }`.

Upgrade to:

```ts
{
  message: AdvisorMessage;
  assistantState: {
    mood: string;
    companionMode: string;
    confidence: number;
    needsClarification: boolean;
  };
  actions: AdvisorActionRequest[];
  memories: AdvisorMemorySuggestion[];
  suggestedReplies: string[];
}
```

Store assistant metadata in `advisor_messages.metadata`.

### 5.3 Action APIs

Add:

- `POST /api/advisor/actions`
- `POST /api/advisor/actions/:id/approve`
- `POST /api/advisor/actions/:id/cancel`
- `POST /api/advisor/actions/:id/execute`
- `GET /api/advisor/actions?sessionId=...`

Execution should be server-side and auditable.

For WhatsApp send:

1. Advisor creates `send_whatsapp_message` action request.
2. User approves.
3. API validates contact/conversation ownership.
4. API enqueues existing `messages.send` job or calls the existing WhatsApp service send route.
5. API stores result in `advisor_action_requests.result`.
6. Frontend renders "Sent" and optionally starts watch mode.

### 5.4 Conversation Watch Mode

Add:

- `POST /api/advisor/watch`
- `DELETE /api/advisor/watch/:id`
- WebSocket event `advisor.reply_received`
- WebSocket event `advisor.narration_ready`

Behavior:

- User: "Watch this chat and tell me when they reply."
- API stores a watch request.
- Incoming WhatsApp message triggers a lightweight advisor narration job.
- User sees a push notification / in-chat card:
  - "Grace replied. My read: she's open, but wants details."
  - suggested next replies
  - approve/send controls

### 5.5 Companion Preferences API (New)

Add to `services/api/src/routes/advisor.ts`:

- `GET /api/advisor/companion-preferences` — returns `interests`, `spiritual_preferences`, `motivational_style`, `gossip_style`, `companion_features_paused` from `advisor_user_profiles` (§4.5)
- `PATCH /api/advisor/companion-preferences` — partial update of the same fields
- `GET /api/advisor/companion-feed?status=pending` — merged, timeline-ordered read of undelivered `gossip_worthy_events` and recent `proactive_interest_chats` for the "Zuri noticed something" card (§7.7)
- `POST /api/advisor/companion-feed/:id/dismiss` — marks a `gossip_worthy_events` row `dismissed` without it ever being delivered

No new endpoint for `interaction_affect` or `current_emotional_state`/`emotional_baseline` — these stay internal to the intelligence service and are only ever surfaced read-only, folded into the existing `GET /api/advisor/memories` response as an "emotional memory" category (§7.3), consistent with the existing memory-transparency UX rather than a parallel surface.

---

## 6. Intelligence Service Plan

### 6.1 New Advisor Orchestrator

Create:

`services/intelligence/app/services/advisor_companion.py`

Responsibilities:

- classify user intent
- detect emotional mode
- retrieve user profile and advisor memories
- retrieve relevant contacts/conversations
- build dynamic system prompt
- call the model
- parse structured response
- propose actions and memory updates
- **gate Personal Mode Suite eligibility** (new): before considering gossip/interest/spiritual/motivational behavior for this turn, check `advisor_user_profiles.personal_mode_enabled` OR the capability's own discovery state (§1.2) OR `companion_features_paused` (which always wins if set). The Emotional Engine (§3.6) and Boundary Keeper (§3.11) checks run unconditionally regardless of this gate — they are not part of it.
- **handle `activate_personal_mode`/`deactivate_personal_mode`** (new) directly: flip `personal_mode_enabled`, reply with a short in-voice confirmation (what just changed, how to undo it), no approval step needed since this only changes what Advisor is allowed to initiate, not anything it sends on the user's behalf.

Do not keep expanding `routes/conversation.py`; route should delegate to this service.

### 6.2 Intent Classifier

Classify each turn into:

- `casual_chat`
- `relationship_advice`
- `chat_analysis`
- `draft_reply`
- `send_message`
- `watch_replies`
- `business_analysis`
- `memory_update`
- `settings_update`
- `emotional_support`
- `gossip` (new — either explicitly requested or the orchestrator's own read of a `casual_chat` turn that's really asking about a contact's behavior; see §3.7/§6.9)
- `spiritual` (new — devotional/verse/prayer requests)
- `motivational` (new — the user naming a stuck task, or Advisor's own procrastination signals firing mid-conversation; see §3.10)
- `activate_personal_mode` (new — recognized loosely, e.g. "activate personal mode" / "turn on personal mode" / "give me the full experience", not an exact-phrase match; sets `personal_mode_enabled = true` immediately, §1.2/§4.5)
- `deactivate_personal_mode` (new — "turn off personal mode" / "go back to normal"; sets `personal_mode_enabled = false`)
- `unknown`

Also classify:

- `emotional_intensity`: low/medium/high
- `needs_evidence`: boolean
- `action_risk`: low/medium/high
- `target_contact_ids`
- `target_conversation_ids`

This can be a small structured LLM call or a deterministic + LLM hybrid.

### 6.3 Dynamic Prompt Shape

System prompt should be assembled from:

1. Zuri core identity
2. user personality profile
3. current companion mode
4. current emotional mode
5. retrieved advisor memories
6. relevant relationship/contact context
7. safety and consent policy
8. allowed tool/action schema
9. response style instructions

The prompt must explicitly separate:

- facts from chat history
- interpretations
- suggested actions
- uncertainty

### 6.4 Structured Model Output

Move from raw text plus `[ACTION: ...]` tags to structured JSON internally.

Target shape:

```json
{
  "reply_markdown": "...",
  "tone": "warm_direct",
  "confidence": 0.78,
  "detected_user_need": "relationship_reassurance",
  "evidence": [
    { "label": "Message pattern", "text": "They replied shorter than usual twice this week." }
  ],
  "suggested_replies": ["...", "..."],
  "actions": [
    {
      "type": "send_whatsapp_message",
      "risk_level": "medium",
      "requires_approval": true,
      "payload": { "conversation_id": "...", "text": "..." }
    }
  ],
  "memory_suggestions": [
    {
      "type": "preference",
      "key": "likes_direct_relationship_advice",
      "value": "User asked for blunt relationship interpretation.",
      "confidence": 0.64
    }
  ]
}
```

API can still render old `[ACTION]` cards during transition, but the long-term contract should be structured.

### 6.5 User Memory Learner

Create a background learner:

`services/intelligence/app/services/advisor_memory.py`

Runs:

- after each advisor turn
- nightly consolidation
- after explicit feedback

Inputs:

- advisor messages
- accepted/rejected suggestions
- approved drafts
- user corrections
- changed settings

Outputs:

- update `advisor_user_profiles`
- upsert `advisor_memories`
- deactivate weak/wrong memories

Rules:

- Do not overfit from one message unless user explicitly says "remember this."
- Store sensitive inferences with lower confidence and make them editable.
- Never infer protected classes or medical facts.

### 6.6 Emotional State Computation (Now `neural/emotion.py` — See `docs/NEURAL_LAYER_PLAN.md` §4.2/§5)

**Build location changed, behavior unchanged.** This is no longer an Advisor-owned service — build it as `services/intelligence/app/neural/emotion.py` (the shared namespace `docs/NEURAL_LAYER_PLAN.md` §5 defines), and Advisor's orchestrator (§6.1) calls into it the same way Studio/CRM/Projects/Suppliers eventually will.

Create `services/intelligence/app/neural/emotion.py` (not a standalone `emotional_state.py`).

- After each Advisor turn: a small structured LLM call classifies the emotion vector, cross-referenced against `user_communication_profiles` for the formality/vocabulary/emoji-density deltas, and against session telemetry (§7, new heartbeat events) for latency/burstiness/duration. Writes one `interaction_affect` row.
- Passively, on the existing per-message analysis pass (`message_worker.py`) — no new pass, just reading the `sentiment`/`intent` fields `message_analyses` already produces — updates the rolling `emotional_baseline` without writing a full `interaction_affect` row (that table is Advisor-turn-scoped; WhatsApp messages only ever update the baseline).
- Writes `advisor_user_profiles.current_emotional_state` after every update so it's cheap to read elsewhere (retrieval weighting, gossip timing, boundary keeper) without recomputing.

### 6.7 State-Dependent Retrieval Weighting (`neural/emotion.py` — See `docs/NEURAL_LAYER_PLAN.md` §4.2)

Extend the existing memory retrieval logic (`services/intelligence/app/memory/retrieval_service.py`) with an emotional-congruence term: when scoring candidate memories/context for a reply, daily nudge, or analysis, add a factor based on how close a memory's stored affect (from `emotional_signals`, or a `contact_insights`/`context_snapshot`'s own sentiment tag where no affect row exists) is to `current_emotional_state`. This is a weighting term added to the existing semantic-relevance score, not a separate retrieval path — one ranked list in, one ranked list out. This weighting function lives in `neural/emotion.py` so any module's retrieval, not just Advisor's, can apply it.

### 6.8 Reconsolidation Job (`neural/emotion.py` — See `docs/NEURAL_LAYER_PLAN.md` §4.2)

A nightly worker, same asyncio-scheduler convention as `daily_worker.py` (staggered to a free hour): revisits `emotional_signals` rows accessed during the day (a `last_retrieved_at` column, or a same-day join against session activity) and recalculates `memory_weight` against any new context — e.g. a contact who ghosted and then reappeared warmly gets that earlier low-valence memory's weight pulled down. Also recomputes `advisor_user_profiles.emotional_baseline` as a rolling 30-day average. This job runs once, platform-wide, in `neural/emotion.py` — not a separate Advisor-only nightly job.

### 6.9 Gossip Worthiness Detector (New)

Create `services/intelligence/app/services/gossip_detector.py` — the system that "determines automatically" when gossip is worth bringing up, per this plan's explicit requirement that this not be a keyword trigger.

- **Detection** (a daily aggregation, same "read signals that already exist" discipline as `pricing_benchmarks.py` — no new sentiment pass): scans for `signal_type`s already computable from existing tables — `tone_shift` (sentiment trend delta in `message_analyses`), `ghosting` (a contact's `last_interaction_at` going stale relative to their own baseline cadence), `sudden_interest` (reciprocity/response-time improvement in `network_value`), `life_event` (`contact_life_events`), `reciprocity_drop` (`relationships.health_score` decline). Each hit is written to `gossip_worthy_events` with a grounded `summary` and a `confidence` score, tagged `in_close_circle` per `relationships.importance_tier IN (1,2)`.
- **Delivery timing** (the actual "when is best" decision) is a separate, lightweight check run at Advisor session start and periodically while a session is open: pick the highest-confidence `pending` row, but only surface it if `current_emotional_state` is roughly calm/curious (not already elevated-negative — don't pile gossip onto a bad day) and the user isn't mid a serious/business-scoped conversation. This reuses the same congruence signal as §6.7 rather than a bespoke scheduler.
- Delivered items get `status = 'delivered'`; explicit dismissal or a 7-day-unseen expiry (`status = 'expired'`) keeps the queue from becoming stale noise.

### 6.10 Proactive Interest Cron (New)

Create `services/intelligence/app/services/interest_companion.py` — the user-facing sibling of the existing contact-facing `interest_matcher.py`.

- Per-user scheduled job (default every 6h, user's own timezone), reading `advisor_user_profiles.interests` plus the close circle's aggregated `contact_insights` (§2/§3.8) to build a topic list.
- **Search: hybrid, three-tier (resolves §11's former open decision — this is now the concrete answer, not a TODO).** For each topic lookup:
  1. **Model-native search first.** Call the AI client with its search/grounding tool enabled and let the model look the topic up itself — this mirrors `MATCH_NEWS_TO_CONTACT`'s existing "let the model judge relevance" pattern in `interest_matcher.py`, just topic-driven instead of headline-driven, and needs no new infrastructure when it works.
  2. **External search API if the model can't.** If the currently-selected pool model (per `model_router.py`'s rotation) doesn't expose a search tool through LiteLLM, or the native call errors, fall back to the already-built `web_search.py` path (Tavily/SERP, same as the contact-facing World Knowledge Engine already uses) and feed the results back to the model as context to summarize/judge relevance from.
  3. **Search-capable Gemini as the final fallback.** If the external search API also fails (no key configured, HTTP error, empty results), force-route just this one call to a known search-capable Gemini model, bypassing the normal rotation — Gemini's native grounding is the one search path in this chain guaranteed to work regardless of pool state.
  Each tier only engages if the one before it didn't produce a usable result; log which tier served each run so search-path reliability is visible before it becomes a support question. This chain applies to the interest cron specifically — the existing contact-facing `interest_matcher.py`/`web_search.py` path is untouched.
- On a hit: drafts a short, in-voice message, writes `advisor_messages` (`sender = 'assistant'`, `initiated = true` — new column, see §6.1's orchestrator note) and a `proactive_interest_chats` row. Engagement (reply/react vs. ignore) feeds back into topic/frequency weighting the same way `proactive_interest_chats.user_engaged` is designed to be read.

### 6.11 Spiritual Content Service (New)

Create `services/intelligence/app/services/spiritual_companion.py`.

- Entirely gated on `advisor_user_profiles.spiritual_preferences.tradition` being set — never active by default, never inferred (§11).
- Daily devotional cron at the user's configured time: verse (in their preferred translation) + short reflection + prayer prompt, written as an `advisor_messages` row the same way the interest cron is.
- Context-sensitive verse offering: triggered inline by the orchestrator (§6.1) when `current_emotional_state` shows low valence/high arousal, not on its own schedule — this is a real-time companion behavior, not a cron.
- Prayer mode ("pray with me") is a normal Advisor turn handled by the `spiritual` intent (§6.2), not a separate action type beyond `send_devotional` (§4.9).

### 6.12 Motivational / Procrastination Detector (New)

A daily aggregation job (plain SQL, not an LLM call — same discipline as `pricing_benchmarks.py`/`document_followups.py`) over signals that already exist: contacts unreplied-to 48h+, unfulfilled promises already tagged in `message_analyses`, deals stuck in the same `deal_stage_history` stage 7+ days. Two or more hits in the same run triggers a nudge, using `advisor_user_profiles.motivational_style` to shape the wording. Separately, the daily motivational message (distinct from the devotional) runs on its own schedule and is tuned the same engagement-feedback way as the interest cron.

### 6.13 Boundary Keeper (New)

Not a standalone service — an inline check inside the existing action-approval path (§5.3/`advisor_action_requests`) right before a `send_whatsapp_message` action is presented for approval: is the drafted text high-valence-negative, is `current_emotional_state.arousal` elevated, has this specific contact had a recent negative interaction? Two or more true → the approval card shows the "want to sleep on it?" prompt instead of a plain Send button, but the underlying action request and Send control are never removed — override is always one tap away.

---

## 7. Frontend Plan

### 7.1 Advisor Chat UX

Add in-chat components:

- Evidence cards: "Why I think this"
- Opinion cards: "My honest read"
- Reply strategy cards: soft/direct/playful versions
- Message approval cards
- Watch mode cards
- Memory suggestion cards: "Should I remember this?"
- Personality chips: "Be softer", "Be blunt", "Gossip mode", "Just listen"
- Contact context chips
- "Receipts" expandable transcript snippets

### 7.2 Companion Mode Control

Add a compact mode selector near composer:

- Balanced
- Best friend
- Be blunt
- Soft mode
- Dating advice
- Business brain
- Analyst
- Gossip mode (new — can also be entered automatically by the orchestrator, §3.7/§6.9; the chip just reflects/lets the user force the current mode)
- Spiritual companion (new — only shown once `spiritual_preferences.tradition` is set, §3.9)

This changes the current session immediately and can be persisted if user chooses.

### 7.3 Memory Drawer

Right inspector should become:

- "What Zuri knows about me"
- "Current vibe"
- "People we talk about most"
- "Recent lessons"
- "Boundaries"
- "Edit / forget"
- "How you've been feeling" (new — an emotional-memory summary reading from `interaction_affect`/`current_emotional_state`/`emotional_baseline`, §6.6; read-only narrative, not raw numbers)

### 7.4 Send/Watch Flow

When Advisor proposes a message:

1. show WhatsApp preview bubble
2. allow edits inline
3. buttons:
   - Copy
   - Send now
   - Ask before sending
   - Watch for reply
4. after send:
   - show sent status
   - offer watch mode
5. when reply arrives:
   - push card into same advisor session
   - summarize/narrate
   - suggest next responses

### 7.5 Addictive Loop

Daily/ongoing hooks:

- "Want me to read the room?"
- "3 conversations changed tone today."
- "Grace replied. I think she's interested but cautious."
- "You asked me to watch this. Here's the update."
- "You usually prefer direct replies. Want the blunt version?"
- "Steph just dropped 60. You need to see what people are saying." (interest companion, §3.8)
- "Three things have been stacking up this week. Want the easiest one first?" (motivational partner, §3.10)
- "I know today's been a lot. This came to mind for you." (spiritual companion, §3.9 — only for users who've opted in)

Use responsibly. No dark patterns:

- no fake urgency
- no invented social drama
- no emotional manipulation
- clear notification controls

### 7.6 Personalisation (New, Hidden)

A tab inside the Memory Drawer, not a setup wizard, not surfaced anywhere in onboarding: interests editor (add/remove, freeform), spiritual preferences (tradition, denomination, devotional time, translation — all optional, blank by default), motivational style (a short "what actually gets you moving?" picker, not a form), gossip style (tone slider/preset), and a **"Personal Mode" toggle** — a UI-level equivalent of saying "activate personal mode" (§1.2/§6.2), so a user (or a tester) doesn't have to remember the phrase. Flipping it in either direction (chat or toggle) keeps both in sync. Discovered the same way every other companion feature is: by using Advisor enough to notice it's there.

### 7.7 "Zuri Noticed Something" Card (New)

The delivery surface for `gossip_worthy_events`, `proactive_interest_chats`, and the motivational/spiritual nudges — one card pattern, reused across all four (matches this codebase's convention of one shared card type per concern rather than a bespoke component per feature; see how `ActionBundleCard` is the one renderer for every `action_bundles` type in the Business OS work). Renders inline in the Advisor session when the user opens it, and as a lightweight badge/notification if they're elsewhere — never a push notification with invented urgency.

### 7.8 "Pause Companion Features" Toggle (New)

A single switch (`advisor_user_profiles.companion_features_paused`, §4.5) surfaced in the Personalisation tab: disables all proactive delivery — gossip initiation, interest cron, spiritual cron, motivational nudges — while leaving the on-demand Advisor (ask, analyze, draft, send) fully intact. This is the honest, discoverable opt-out this plan's own ethics section (§8) requires; it is not buried behind a support request.

---

## 8. Safety, Consent, And Boundaries

### 8.1 Sending Policy

Default:

- Drafting is allowed.
- Sending requires explicit approval.
- Auto-send requires scoped user permission.

High-risk messages always require approval:

- romantic conflict
- breakup/ultimatum
- money requests
- legal/medical/employment sensitive topics
- angry messages
- messages to new/unknown contacts

### 8.2 Relationship Advice Policy

Advisor can:

- analyze tone and patterns
- offer interpretations
- help draft messages
- encourage healthy communication
- suggest boundaries

Advisor must not:

- claim certainty about another person's mind
- encourage stalking, manipulation, coercion, jealousy games
- fabricate evidence
- present itself as a therapist
- advise in abuse/self-harm situations without escalation language

### 8.3 Privacy Controls

User must be able to:

- pause Advisor memory
- delete Advisor memory
- disable watch mode
- view action history
- revoke auto-send permissions

### 8.4 Gossip Guardrails (New)

- Every gossip observation must be traceable to a real, already-computed signal (§3.7) — no invented drama, no exaggeration, no speculation dressed up as fact.
- If a candidate `gossip_worthy_events` row touches a sensitive context (family conflict, a contact the user has flagged before as a boundary, a professional/colleague relationship), Advisor should flag that sensitivity in how it brings it up ("this one's a bit heavier, want to talk about it?") rather than refusing outright — matching this plan's existing "never block, always flag" posture (§11 open decision).
- Gossip is never generated about a contact the user has explicitly asked Advisor not to discuss (an extension of the existing `boundaries` field on `advisor_user_profiles`, §4.1).

### 8.5 Spiritual Content Consent (New)

- Never active unless `spiritual_preferences.tradition` is explicitly set by the user — no default "inspirational content" for users who haven't said they want faith-based content (§11).
- Content is always non-proselytising and respects the user's own stated tradition/denomination; Advisor does not initiate a conversation about faith with a user who hasn't opted in, even indirectly.

### 8.6 Companion Pause Scope (New)

The "Pause Companion Features" toggle (§7.8) disables proactive delivery only — gossip initiation, the interest cron, the spiritual/motivational crons. It does not touch the core business-facing Advisor (ask, analyze, draft, send, watch), and it does not delete already-stored preferences or memories; it is a delivery switch, not a data-deletion action (deletion is the separate, existing "delete Advisor memory" control above).

---

## 9. Phased Build

### Phase 0 — Emotional Foundation (Depends on `docs/NEURAL_LAYER_PLAN.md` Phase 1 Landing First)

**Sequencing note:** the platform-wide Emotion Engine (`docs/NEURAL_LAYER_PLAN.md` §4.2, its own Phase 1) should ship *before* this phase — building Advisor's emotional engine first and promoting it to platform-wide afterward would mean migrating `interaction_affect` into `emotional_signals` later instead of building the shared table once. This phase becomes "adopt the Neural Layer's Emotion Engine," not "build the Emotion Engine."

- ~~Add `interaction_affect`~~ — superseded; `emotional_signals` is built once, platform-wide, in `docs/NEURAL_LAYER_PLAN.md` Phase 1 (§4.6 above documents the mapping)
- Extend `advisor_user_profiles` with `interests`, `spiritual_preferences`, `motivational_style`, `gossip_style`, `current_emotional_state`, `emotional_baseline`, `companion_features_paused` (§4.5) — these stay genuinely Advisor-specific
- Wire Advisor turns to write `emotional_signals` rows (`entity_type = 'advisor_turn'`) via `neural/emotion.py` (§6.6)
- Wire Advisor's memory retrieval to the shared state-dependent weighting function (§6.7)
- Reconsolidation (§6.8) runs platform-wide already — nothing Advisor-specific to add here
- Frontend: none — backend only, deliberately invisible until Phase 1's memory drawer surfaces it

Success criteria:

- Every Advisor interaction stores an emotional state vector in the shared `emotional_signals` table.
- Memory retrieval measurably biases toward emotionally congruent memories (verify with a scripted before/after query, not just eyeballing responses).

### Phase 1 — Companion Brain Foundation

- Add `advisor_user_profiles`
- Add `advisor_memories`
- Add profile/memory API routes
- Create `AdvisorCompanionService`
- Add intent/emotional-mode classification
- Add dynamic prompt assembly
- Return richer assistant metadata
- Frontend: mode chips and memory drawer skeleton
- Add interests/spiritual/motivational/gossip fields to the Personalisation tab (§7.6), kept out of onboarding
- Add the `gossip` and `spiritual_companion` companion mode chips (§4.4/§7.2)
- Add `personal_mode_enabled`/`personal_mode_enabled_at` to `advisor_user_profiles` (§4.5), the `activate_personal_mode`/`deactivate_personal_mode` intents (§6.2), and the Personalisation-tab toggle (§7.6) — this ships now, in Phase 1, precisely so Phase 4.5's proactive crons have a way to be tested end-to-end the moment they land, without waiting on organic discovery

Success criteria:

- Advisor remembers explicit user preferences.
- Saying "activate personal mode" (or flipping the toggle) sets `personal_mode_enabled` and Advisor confirms it in its own voice; saying "turn it off" reverts it.
- Advisor changes tone in-session.
- Advisor can explain what it knows about the user.

### Phase 2 — Relationship Analysis Experience

- Add scoped contact/conversation retrieval for Advisor
- Add evidence cards and receipts
- Add "my read / alternative read / what I'd do" response pattern
- Add relationship advice prompt policy
- Add frontend relationship analysis components
- Fold emotional context into analysis responses — e.g. "you asked about this when you were feeling anxious; here's my read with that in mind" (§3.6)
- Gossip mode becomes reachable both explicitly (chip/phrase) and via the orchestrator's own judgment (§3.7) — this phase ships the *reachability*; §6.9's automatic detector ships in Phase 4.5

Success criteria:

- User can ask "what did they mean?" and receive grounded, nuanced analysis with evidence.

### Phase 3 — Action Protocol And Approval

- Add `advisor_action_requests`
- Add action APIs
- Convert reply draft/send actions to structured requests
- Implement WhatsApp send approval from Advisor
- Add inline editable message approval cards
- Add the Boundary Keeper risk check to the approval path (§3.11/§6.13)
- Add `send_devotional`/`send_motivational`/`send_interest_update` action types (§4.9)

Success criteria:

- User can ask Advisor to draft and send a message after approval from the chat UI.
- A high-risk draft sent on an elevated-emotion day triggers the "want to sleep on it?" prompt.

### Phase 4 — Watch Replies And Narration

- Add conversation watch requests
- Wire incoming WhatsApp messages to Advisor narration jobs
- Add WebSocket events
- Add reply narration cards
- Add "suggest next response" loop
- Add emotional narration — "Grace replied. She seems warmer than last week. My read: the tension is fading." (§3.6)

Success criteria:

- User can send/approve a message, leave Advisor open, and get narrated replies plus next-step suggestions.

**Phase 4.5 — Proactive Companion Crons (New, can ship independently once Phase 0/1 are stable):**

- Add `proactive_interest_chats`, `gossip_worthy_events` (§4.7/§4.8)
- Ship the Proactive Interest Cron (§3.8/§6.10)
- Ship the Gossip Worthiness Detector + delivery-timing check (§3.7/§6.9)
- Ship the Spiritual Companion daily devotional + context-sensitive verse offering (§3.9/§6.11)
- Ship the Motivational/Procrastination Detector (§3.10/§6.12)
- Frontend: the "Zuri Noticed Something" card (§7.7) and the companion-feed API (§5.5)

Success criteria:

- A user with interests set receives at least one relevant, well-timed proactive message per day without asking for it, and dismissing/ignoring it visibly reduces frequency going forward.

### Phase 5 — Learning Loop And Personalization

- Add background memory learner
- Learn from approved/rejected drafts
- Learn user tone preferences
- Add "remember / forget / correct" UX
- Add per-user companion profile tuning
- Emotional engine now fully online end-to-end: reconsolidation, weighted encoding, and associative-graph traversal for pattern surfacing ("you've had three conversations like this...", §3.6)
- Advisor learns which spiritual content resonates, which motivational style actually works, and which gossip tone lands — same learner, same tables, no parallel personalization system

Success criteria:

- Advisor gets measurably more aligned over time without manual setup.

### Phase 6 — Safe Scoped Automation

- Allow one-off scoped auto-send:
  - "For this conversation, send logistical confirmations automatically for 30 minutes."
- Integrate with existing auto-response trust tiers.
- Add audit log and revocation UI.

Success criteria:

- Advisor can handle narrow, low-risk reply loops while preserving user control.

---

## 10. Implementation Notes

### Backend

- Keep `services/api/src/routes/advisor.ts` as the public API boundary.
- Add action and memory endpoints there.
- Store all actions before execution.
- Use existing authentication/ownership checks.
- Reuse existing WhatsApp send queue instead of creating a parallel sender.

### Intelligence

- Move Advisor logic out of `routes/conversation.py` into a service.
- Keep route handlers thin.
- Use retrieval service for contact/business memory.
- Add Advisor-specific profile/memory retrieval.
- Prefer structured JSON output and validate it with Pydantic.
- **Search: hybrid three-tier chain for the Proactive Interest Cron (§6.10) — resolved, see §6.10 for the full sequence.** Try the active pool model's native search/grounding tool first (`model_router.py` currently rotates Gemini and DashScope/Qwen via LiteLLM; not every model in that pool necessarily exposes a search tool the same way, so this tier can legitimately miss); if it can't or the call errors, fall back to the already-built `web_search.py` (Tavily/SERP) path; if that also fails, force-route to a known search-capable Gemini model as the guaranteed-to-work final fallback. No *new* external search integration is being proposed — only an ordered choice between three paths that already exist or are trivially reachable via prompting/routing. Log which tier served each cron run.
- Gossip Worthiness Detector (§6.9) and Motivational/Procrastination Detector (§6.12) should both be plain SQL aggregations wherever possible, same discipline as `pricing_benchmarks.py`/`document_followups.py` — reach for an LLM call only where judgment (not arithmetic) is genuinely required, e.g. deciding whether a detected pattern is actually worth mentioning.

### Frontend

- Keep `/advisor` as the flagship surface.
- Use custom in-chat cards rather than dumping everything into Markdown.
- Preserve simple text fallback for old assistant responses.
- Make mobile composer and approval cards first-class.
- The Personalisation tab (§7.6) and companion feed card (§7.7) must never appear in first-run onboarding — discoverability, not disclosure, is the point.

---

## 11. Open Decisions

1. Should "best friend" be the default, or should Advisor start balanced and gradually warm up?
2. Should dating/relationship mode be explicit, inferred, or both?
3. How much slang is acceptable by default?
4. Should watch mode send mobile/browser notifications by default?
5. What is the highest automation tier allowed for personal relationships?
6. Should Advisor memory share infrastructure with `agent_memories`, or stay in a dedicated `advisor_memories` table for transparency?
7. **Spiritual content for non-Christian/non-religious users.** Should Advisor ever offer generic "inspirational" content, or only activate faith-based companionship if the user explicitly identifies a tradition? Recommendation: only activate if the user provides a tradition — no default inspirational-content fallback (§3.9/§8.5).
8. **Gossip guardrails for sensitive contacts.** Should Advisor refuse to gossip about certain relationships (family, colleagues, an ex) outright, or just flag the sensitivity and proceed? Recommendation: flag, don't block — consistent with this plan's existing "never block, always disclose" posture on the Boundary Keeper (§3.11/§8.4).
9. **Interest cron cadence.** Fixed at 6 hours, or user-configurable? Recommendation: start fixed at 6h; expose a "how often" control only if power users ask.
10. **Should the emotional engine ever feed business features?** Currently scoped to Advisor only (§3.6). Could eventually enrich lead scoring, churn prediction, or reply suggestions in the business-facing product — but only after the personal engine is stable and trusted; do not build both at once.
11. ✅ **Resolved — search path for the interest cron.** Hybrid three-tier chain: model-native search → `web_search.py` (Tavily/SERP) → forced search-capable Gemini model. See §6.10 and the Intelligence implementation note above.
12. **Does `personal_mode_enabled` apply account-wide or per-session?** Recommendation: account-wide (stored on `advisor_user_profiles`, §4.5) — a user who activates it once should get the full experience in every Advisor session, not have to re-activate per conversation. A per-session override ("just for this chat") could be added later if requested, but isn't in scope now.
13. **Should activating personal mode retroactively backfill anything** (e.g. run the Gossip Worthiness Detector once immediately instead of waiting for its next scheduled pass)? Recommendation: no special-cased backfill for v1 — activation just changes the gate going forward; the next scheduled detector/cron run picks it up within its normal cadence (§6.9/§6.10/§6.12). Revisit if testers find the wait between "I activated it" and "it did something" too long.

Recommended defaults:

- Start `balanced`, but quickly adapt in-session.
- Make "Best friend", "Be blunt", and "Soft mode" visible controls.
- Keep Advisor memory dedicated and user-editable.
- Require approval for all personal relationship sends in Phase 3.
- Add scoped auto-send only after watch mode is stable.
- Spiritual companionship: opt-in via explicit tradition only, never a generic default.
- Gossip: flag sensitive context, never refuse outright.
- Companion features (gossip, interest, spiritual, motivational) must all respect the single `companion_features_paused` switch (§4.5/§7.8/§8.6) — no feature-specific pause toggles fragmenting the control surface.
- The Emotional Engine (§3.6) and Boundary Keeper (§3.11) are never gated by `personal_mode_enabled` or discovery — they are always-on for every user (§1.2).
- `personal_mode_enabled` is account-wide, set only by explicit intent or the Personalisation-tab toggle, never inferred from behavior the way individual-capability discovery is.

