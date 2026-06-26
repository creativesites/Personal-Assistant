# Database Schema

PostgreSQL 16 + pgvector. 28 tables across 8 domains.

Migration files live in `db/migrations/`. Run with `pnpm db:migrate`.

---

## Domains

| # | Domain | Tables | Description |
|---|--------|--------|-------------|
| 1 | Core | `users`, `subscriptions`, `whatsapp_instances` | Accounts, billing, connected WA sessions |
| 2 | Contacts & Relationships | `contacts`, `contact_group_members`, `relationships`, `contact_tags`, `relationship_health_logs` | Every person/group the user communicates with, typed relationships, health tracking |
| 3 | Conversations & Messages | `conversations`, `messages`, `message_analyses`, `suggested_replies` | All WA threads, individual messages, AI analysis, reply drafts |
| 4 | AI Intelligence | `user_communication_profiles`, `contact_profiles`, `contact_insights`, `context_snapshots`, `personas` | Deep profiles, atomic insights, compressed memory, tone personas |
| 5 | Proactive System | `events`, `proactive_queue`, `auto_reply_rules` | Extracted events, morning suggestion feed, automation rules |
| 6 | Calendar | `calendars`, `calendar_events`, `calendar_reminders`, `calendar_event_attendees` | Native calendar — auto-populated from extracted events |
| 7 | AI Advisor | `advisor_sessions`, `advisor_messages` | Direct user ↔ AI conversations |
| 8 | Notifications | `notification_preferences`, `notifications` | Push log and delivery settings |

---

## Key Design Notes

**`contact_insights`** stores atomic AI observations as individual rows (`key: 'avoids_conflict'`, `value: 'Tends to disengage or go quiet rather than argue'`). They accumulate over time. Stale or contradicted insights are marked `is_active = false` rather than deleted — preserving the learning history.

**`context_snapshots`** contains AI-compressed summaries of relationship history with pgvector embeddings. When generating a reply, the intelligence service uses semantic search (`embedding <-> query_vector`) to retrieve the most relevant past context instead of feeding all messages into the prompt. Critical for keeping token costs manageable.

**`events` vs `calendar_events`** — `events` is the raw AI extraction layer (may be low-confidence, unconfirmed). `calendar_events` is the clean user-facing calendar. A confirmed extracted event populates a calendar entry via `source_event_id`. Keeps AI noise away from the user's calendar.

**`relationship_health_logs`** is append-only. The live score sits on `relationships.health_score`. The log table is what powers the health trend chart and allows the AI to say "this relationship was healthy 3 months ago — here's when it changed."

**pgvector columns:**
- `message_analyses.embedding` — semantic search across messages
- `context_snapshots.embedding` — semantic retrieval of relevant compressed context

---

## Badge Key

| Badge | Meaning |
|-------|---------|
| PK | Primary key (uuid) |
| FK | Foreign key |
| UNIQUE | Unique constraint |
| NN | Not null |
| IDX | Indexed |
| VEC | pgvector column (vector(1536)) |
| ENC | Encrypted at rest |

---

## Core Tables (quick reference)

### `users`
`id` · `email` · `password_hash` · `full_name` · `timezone` · `locale` · `onboarding_completed`

### `contacts`
`id` · `user_id` · `whatsapp_jid` · `phone_number` · `display_name` · `custom_name` · `is_group` · `last_message_at`
UNIQUE (user_id, whatsapp_jid)

### `relationships`
`id` · `user_id` · `contact_id` · `relationship_type` · `relationship_subtype` · `importance_tier` (1–5) · `health_score` (0–100) · `health_trend` · `dormancy_alert_days` · `is_auto_managed`
UNIQUE (user_id, contact_id)

### `messages`
`id` · `conversation_id` · `whatsapp_message_id` · `sender_type` · `message_type` · `body` · `transcription` · `whatsapp_timestamp`

### `message_analyses`
`id` · `message_id` · `sentiment` · `sentiment_score` · `emotions` (jsonb) · `intent` (jsonb) · `importance_score` · `requires_response` · `response_urgency` · `promises_detected` (jsonb) · `embedding` (vector)

### `suggested_replies`
`id` · `message_id` · `persona_id` · `suggestion_text` · `tone` · `reasoning` · `status` · `user_feedback`

### `contact_profiles`
`id` · `contact_id` · `user_id` · `personality_summary` · `communication_style` · `emotional_patterns` (jsonb) · `known_triggers` (jsonb) · `current_life_context` · `mood_baseline`

### `context_snapshots`
`id` · `contact_id` · `snapshot_type` · `summary` · `embedding` (vector) · `covers_from` · `covers_to` · `token_count` · `is_current`

### `proactive_queue`
`id` · `contact_id` · `event_id` · `suggestion_type` · `title` · `body` · `draft_message` · `priority` · `status` · `suggested_for_date`

### `events`
`id` · `contact_id` · `event_type` · `title` · `event_date` · `is_recurring` · `recurrence_rule` · `source` · `confidence_score` · `is_confirmed`

---

Full interactive schema reference: see the project artifact at the schema URL in project notes.
