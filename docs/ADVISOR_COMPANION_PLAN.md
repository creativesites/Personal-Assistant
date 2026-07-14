# Advisor Companion Plan

**Status:** Planning  
**Goal:** Turn Advisor from a useful Q&A panel into Zuri's most addictive daily surface: a highly conversational, emotionally intelligent companion that learns the user, adapts in the moment, analyzes WhatsApp relationships deeply, gossips safely, gives opinions with evidence, drafts/sends messages with approval, and narrates replies as they arrive.

This is not a replacement for the Relationship OS engines. It is the conversational interface on top of them.

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

Main gap:

Advisor has no durable model of the **user as a person**, no dynamic personality policy, no structured tool protocol, no streaming/reply narration loop, and no strong action approval contract.

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

Do not describe `therapist_like` as therapy in UI. Use "gentle support" or "soft mode."

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

This changes the current session immediately and can be persisted if user chooses.

### 7.3 Memory Drawer

Right inspector should become:

- "What Zuri knows about me"
- "Current vibe"
- "People we talk about most"
- "Recent lessons"
- "Boundaries"
- "Edit / forget"

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

Use responsibly. No dark patterns:

- no fake urgency
- no invented social drama
- no emotional manipulation
- clear notification controls

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

---

## 9. Phased Build

### Phase 1 — Companion Brain Foundation

- Add `advisor_user_profiles`
- Add `advisor_memories`
- Add profile/memory API routes
- Create `AdvisorCompanionService`
- Add intent/emotional-mode classification
- Add dynamic prompt assembly
- Return richer assistant metadata
- Frontend: mode chips and memory drawer skeleton

Success criteria:

- Advisor remembers explicit user preferences.
- Advisor changes tone in-session.
- Advisor can explain what it knows about the user.

### Phase 2 — Relationship Analysis Experience

- Add scoped contact/conversation retrieval for Advisor
- Add evidence cards and receipts
- Add "my read / alternative read / what I'd do" response pattern
- Add relationship advice prompt policy
- Add frontend relationship analysis components

Success criteria:

- User can ask "what did they mean?" and receive grounded, nuanced analysis with evidence.

### Phase 3 — Action Protocol And Approval

- Add `advisor_action_requests`
- Add action APIs
- Convert reply draft/send actions to structured requests
- Implement WhatsApp send approval from Advisor
- Add inline editable message approval cards

Success criteria:

- User can ask Advisor to draft and send a message after approval from the chat UI.

### Phase 4 — Watch Replies And Narration

- Add conversation watch requests
- Wire incoming WhatsApp messages to Advisor narration jobs
- Add WebSocket events
- Add reply narration cards
- Add "suggest next response" loop

Success criteria:

- User can send/approve a message, leave Advisor open, and get narrated replies plus next-step suggestions.

### Phase 5 — Learning Loop And Personalization

- Add background memory learner
- Learn from approved/rejected drafts
- Learn user tone preferences
- Add "remember / forget / correct" UX
- Add per-user companion profile tuning

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

### Frontend

- Keep `/advisor` as the flagship surface.
- Use custom in-chat cards rather than dumping everything into Markdown.
- Preserve simple text fallback for old assistant responses.
- Make mobile composer and approval cards first-class.

---

## 11. Open Decisions

1. Should "best friend" be the default, or should Advisor start balanced and gradually warm up?
2. Should dating/relationship mode be explicit, inferred, or both?
3. How much slang is acceptable by default?
4. Should watch mode send mobile/browser notifications by default?
5. What is the highest automation tier allowed for personal relationships?
6. Should Advisor memory share infrastructure with `agent_memories`, or stay in a dedicated `advisor_memories` table for transparency?

Recommended defaults:

- Start `balanced`, but quickly adapt in-session.
- Make "Best friend", "Be blunt", and "Soft mode" visible controls.
- Keep Advisor memory dedicated and user-editable.
- Require approval for all personal relationship sends in Phase 3.
- Add scoped auto-send only after watch mode is stable.

