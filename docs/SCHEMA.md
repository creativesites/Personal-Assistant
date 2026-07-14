# Database Schema

PostgreSQL 16 + pgvector. 46 migrations applied (0001–0046).

Migration files live in `db/migrations/`. Run with `npm run db:migrate`.

> **Coverage note:** this reference was last fully audited at migration 0025 (30 tables across the 8 domains below). The **Business Workspace** domain (migrations 0043–0046) was added in full as part of that feature shipping. Domains/tables added in between (0026–0042 — Marketing Studio, Deals/Opportunities/Connections, Contact Products/Life Events/Network Value, Relationship Goals, Business Facts, Agent Workforce/Memory, Social Publishing, etc.) are **not yet reflected here** — check the migration files directly for those.

---

## Domains

| # | Domain | Tables | Description |
|---|--------|--------|-------------|
| 1 | Core | `users`, `subscriptions`, `whatsapp_instances` | Accounts, billing, connected WA sessions |
| 2 | Contacts & Relationships | `contacts`, `contact_group_members`, `relationships`, `contact_tags`, `relationship_health_logs` | Every person/group the user communicates with, typed relationships, health tracking |
| 3 | Conversations & Messages | `conversations`, `messages`, `message_analyses`, `suggested_replies` | All WA threads, individual messages, AI analysis, reply drafts |
| 4 | AI Intelligence | `user_communication_profiles`, `contact_profiles`, `contact_insights`, `context_snapshots`, `personas`, `contact_documents` | Deep profiles, atomic insights, compressed memory, tone personas, file attachments |
| 5 | Proactive System | `events`, `proactive_queue`, `auto_reply_rules` | Extracted events, morning suggestion feed, automation rules |
| 6 | Calendar | `calendars`, `calendar_events`, `calendar_reminders`, `calendar_event_attendees` | Native calendar — auto-populated from extracted events |
| 7 | AI Advisor | `advisor_sessions`, `advisor_messages` | Direct user ↔ AI conversations |
| 8 | Notifications | `notification_preferences`, `notifications` | Push log and delivery settings |
| 9 | Business Workspace | `business_profiles`, `document_templates`, `documents`, `document_events`, `deal_stage_history`, `document_chat_messages`, `recurring_documents`, `document_pack_runs` | AI-generated quotations/invoices/proposals/contracts (Brand Kit, status lifecycle, per-document AI chat, scheduled/recurring generation, Business Packs) — see `docs/BUSINESS_WORKSPACE_PLAN.md` |
| System | Sync & Automation | `sync_jobs`, `auto_response_settings` | History sync progress tracking, auto-reply config |

---

## Key Design Notes

**`contact_insights`** stores atomic AI observations as individual rows (`insight_key: 'avoids_conflict'`, `insight_value: 'Tends to disengage or go quiet rather than argue'`, `supporting_text: 'excerpt from conversation'`). They accumulate over time. Stale or contradicted insights are marked `is_active = false` rather than deleted — preserving the learning history.

**`context_snapshots`** contains AI-compressed summaries of relationship history with pgvector embeddings. When generating a reply, the intelligence service uses semantic search (`embedding <-> query_vector`) to retrieve the most relevant past context instead of feeding all messages into the prompt. Critical for keeping token costs manageable.

**`events` vs `calendar_events`** — `events` is the raw AI extraction layer (may be low-confidence, unconfirmed). `calendar_events` is the clean user-facing calendar. A confirmed extracted event populates a calendar entry via `source_event_id`. Keeps AI noise away from the user's calendar.

**`relationship_health_logs`** is append-only. The live score sits on `relationships.health_score`. The log table is what powers the health trend chart and allows the AI to say "this relationship was healthy 3 months ago — here's when it changed."

**CRM fields on `contacts`** — extended in migration 0021 to include full CRM data: `customer_status`, `pipeline_stage`, `lead_score`, `company`, `job_title`, `email`, `industry`, `website`, `source`, `notes`, `archived_at`. Powers the Leads pipeline and Contacts CRM pages.

**`contact_profiles` extended fields** — migration 0024 added `preferences`, `goals`, `pain_points`, `buying_behaviour`, `relationship_stage`, `locked_fields`, `user_edited_fields` to the AI profile.

**`sync_jobs`** tracks one row per manual history sync run. Updated in real time as the background worker processes conversations and messages. The Diagnostics page polls this for its progress UI.

**`auto_response_settings`** is one row per user (UNIQUE constraint on `user_id`). Stores business hours schedule, approval mode, conversation type filters, escalation config, and message templates. Upserted via `ON CONFLICT (user_id) DO UPDATE SET`.

**pgvector columns:**
- `message_analyses.embedding` — semantic search across messages
- `context_snapshots.embedding` — semantic retrieval of relevant compressed context
- `documents.embedding` — semantic search across generated business documents (migration 0043; populated on render)

**`documents`** is strictly AI/template-generated business documents (quotations, invoices, receipts, proposals, contracts, etc.) — distinct from `contact_documents`, which is human-uploaded files. Cross-linked via `contact_documents.generated_document_id` for "customer sent back the signed version." Status is a single lifecycle (`draft → generated → sent → viewed → downloaded → accepted/rejected/expired/paid → archived`), never a parallel vocabulary. `document_events` is the append-only timeline behind it (same pattern as `relationship_health_logs`).

**`documents.share_token`** (migration 0046) is a dedicated, unguessable UUID — never the row's `id` — used by the one unauthenticated route in the API (`GET /api/documents/shared/:token`) so a customer can open/view a document without a Zuri login. This is how `view_count`/`viewed_at` get populated, since a WhatsApp file attachment gives no "they opened it" signal on its own.

**`business_facts.category`** (migration 0029, widened in 0046) now includes `'pricing_benchmark'` — rows written by a periodic aggregation job (`source = 'aggregation'`, not `'ai_inference'`), read back through the same `get_approved_facts()` path every other business fact already uses.

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

## Table Reference

### Core Domain

#### `users`
`id` (PK) · `email` (UNIQUE NN) · `clerk_user_id` (UNIQUE) · `full_name` · `timezone` · `locale` · `mode` (personal/business/hybrid, default: hybrid) · `role` (user/admin) · `onboarding_completed` · `trial_ends_at` · `created_at` · `updated_at`

#### `subscriptions`
`id` (PK) · `user_id` (FK UNIQUE) · `stripe_customer_id` · `stripe_subscription_id` · `plan` · `status` · `current_period_end` · `created_at` · `updated_at`

#### `whatsapp_instances`
`id` (PK) · `user_id` (FK UNIQUE) · `phone_number` · `status` (connecting/qr_pending/link_code_pending/connected/disconnected/error) · `qr_code` · `link_code` · `last_connected_at` · `created_at` · `updated_at`

---

### Contacts & Relationships Domain

#### `contacts`
`id` (PK) · `user_id` (FK) · `whatsapp_jid` · `phone_number` · `display_name` · `custom_name` · `is_group` · `last_message_at`
**CRM fields (migration 0021):** `email` · `company` · `job_title` · `industry` · `website` · `notes` · `customer_status` (contact/lead/customer/churned, default: contact) · `pipeline_stage` · `lead_score` (0–100, default: 0) · `source` (default: whatsapp) · `archived_at`
UNIQUE (user_id, whatsapp_jid)
IDX: `(user_id, customer_status)` WHERE archived_at IS NULL · `(user_id, lead_score DESC)` WHERE archived_at IS NULL

#### `contact_tags`
`id` (PK) · `contact_id` (FK) · `user_id` (FK) · `tag`
UNIQUE (contact_id, tag)
IDX: `(contact_id)`

#### `contact_group_members`
`id` (PK) · `contact_id` (FK) · `group_jid` · `role`

#### `relationships`
`id` (PK) · `user_id` (FK) · `contact_id` (FK) · `relationship_type` · `relationship_subtype` · `importance_tier` (1–5) · `health_score` (0–100) · `health_trend` · `dormancy_alert_days` · `is_auto_managed`
UNIQUE (user_id, contact_id)

#### `relationship_health_logs`
`id` (PK) · `relationship_id` (FK) · `health_score` · `factors` (jsonb) · `recorded_at`

---

### Conversations & Messages Domain

#### `conversations`
`id` (PK) · `user_id` (FK) · `contact_id` (FK) · `whatsapp_chat_id` · `last_message_at` · `unread_count` · `is_archived` · `created_at` · `updated_at`

#### `messages`
`id` (PK) · `conversation_id` (FK) · `whatsapp_message_id` · `sender_type` (user/contact) · `message_type` · `body` · `transcription` · `media_url` · `whatsapp_timestamp` · `is_deleted` · `created_at`

#### `message_analyses`
`id` (PK) · `message_id` (FK UNIQUE) · `sentiment` · `sentiment_score` · `emotions` (jsonb) · `intent` (jsonb) · `entities` (jsonb) · `importance_score` · `requires_response` · `response_urgency` · `promises_detected` (jsonb) · `embedding` (VEC)

#### `suggested_replies`
`id` (PK) · `message_id` (FK) · `conversation_id` (FK) · `user_id` (FK) · `persona_id` (FK) · `suggestion_text` (NN) · `tone` · `reasoning` · `status` (pending/approved/rejected/sent) · `user_feedback` · `created_at` · `updated_at`

---

### AI Intelligence Domain

#### `user_communication_profiles`
`id` (PK) · `user_id` (FK UNIQUE) · `voice_summary` · `avg_message_length` · `punctuation_style` · `emoji_frequency` · `formality_level` · `opener_patterns` (jsonb) · `vocabulary_patterns` (jsonb) · `updated_at`

#### `contact_profiles`
`id` (PK) · `contact_id` (FK UNIQUE) · `user_id` (FK) · `personality_summary` · `communication_style` · `emotional_patterns` (jsonb) · `known_triggers` (jsonb) · `current_life_context` · `mood_baseline`
**Extended fields (migration 0024):** `preferences` · `goals` · `pain_points` · `buying_behaviour` · `relationship_stage` · `locked_fields` (TEXT[] default '{}') · `user_edited_fields` (TEXT[] default '{}')
`updated_at`

#### `contact_insights`
`id` (PK) · `contact_id` (FK) · `user_id` (FK) · `insight_key` · `insight_value` · `confidence` (0.0–1.0) · `supporting_text` (migration 0021) · `source` · `is_active` (default true) · `created_at` · `updated_at`
IDX: `(contact_id, user_id)` WHERE is_active = TRUE

#### `context_snapshots`
`id` (PK) · `contact_id` (FK) · `snapshot_type` · `summary` · `embedding` (VEC) · `covers_from` · `covers_to` · `token_count` · `is_current` · `created_at`

#### `personas`
`id` (PK) · `user_id` (FK) · `name` · `tone` · `formality` · `emoji_usage` · `is_default` · `created_at` · `updated_at`

#### `contact_documents`
`id` (PK) · `user_id` (FK) · `contact_id` (FK) · `file_name` · `file_type` · `file_size` · `storage_url` · `doc_category` (invoice/contract/receipt/image/pdf/vehicle_photo/other) · `notes` · `uploaded_at` · `created_at`
IDX: `(contact_id, user_id)`

---

### Proactive System Domain

#### `events`
`id` (PK) · `contact_id` (FK) · `event_type` (birthday/anniversary/meeting/payment/delivery/service_reminder/custom) · `title` · `event_date` · `is_recurring` · `recurrence_rule` · `source` · `confidence_score` · `is_confirmed` · `created_at`

#### `proactive_queue`
`id` (PK) · `user_id` (FK) · `contact_id` (FK) · `event_id` (FK nullable) · `suggestion_type` · `title` · `body` · `draft_message` · `priority` · `status` (pending/approved/dismissed/snoozed/sent) · `suggested_for_date` · `snoozed_until` · `created_at` · `updated_at`

#### `auto_reply_rules`
`id` (PK) · `user_id` (FK) · `name` · `trigger_type` · `trigger_value` (jsonb) · `action_type` · `action_value` (jsonb) · `is_enabled` · `created_at` · `updated_at`

---

### Calendar Domain

#### `calendars`
`id` (PK) · `user_id` (FK) · `name` · `color` · `is_default` · `created_at`

#### `calendar_events`
`id` (PK) · `calendar_id` (FK) · `user_id` (FK) · `title` · `description` · `start_at` · `end_at` · `is_all_day` · `source_event_id` (FK → events, nullable) · `contact_id` (FK nullable) · `created_at` · `updated_at`

#### `calendar_reminders`
`id` (PK) · `calendar_event_id` (FK) · `remind_at` · `method` · `is_sent`

#### `calendar_event_attendees`
`id` (PK) · `calendar_event_id` (FK) · `contact_id` (FK) · `status`

---

### AI Advisor Domain

#### `advisor_sessions`
`id` (PK) · `user_id` (FK) · `title` · `created_at` · `updated_at`

#### `advisor_messages`
`id` (PK) · `session_id` (FK) · `role` (user/assistant) · `content` · `created_at`

---

### Notifications Domain

#### `notification_preferences`
`id` (PK) · `user_id` (FK UNIQUE) · `quiet_hours_start` · `quiet_hours_end` · `enabled_types` (jsonb) · `created_at` · `updated_at`

#### `notifications`
`id` (PK) · `user_id` (FK) · `type` · `title` · `body` · `data` (jsonb) · `is_read` · `created_at`

---

### System Tables

#### `sync_jobs`
`id` (PK) · `user_id` (FK) · `status` (pending/running/completed/failed/cancelled) · `total_conversations` · `processed_conversations` · `total_messages` · `processed_messages` · `contacts_created` · `leads_generated` · `insights_extracted` · `current_chat_name` · `error_message` · `started_at` · `completed_at` · `created_at` · `updated_at`
IDX: `(user_id)` · `(status)`

#### `auto_response_settings`
`id` (PK) · `user_id` (FK UNIQUE) · `enabled` (default false) · `business_hours_start` (TIME, default 09:00) · `business_hours_end` (TIME, default 18:00) · `timezone` (default UTC) · `active_days` (INTEGER[], default {1,2,3,4,5}) · `send_delay_seconds` (default 30) · `approval_mode` (auto/preview/manual, default preview) · `respond_to_leads` · `respond_to_customers` · `respond_to_new_contacts` · `skip_groups` · `skip_broadcasts` · `escalation_keywords` (TEXT[]) · `escalation_notify_email` · `greeting_message` · `away_message` · `smart_followup_enabled` · `learn_from_corrections` · `created_at` · `updated_at`

---

### Business Workspace Domain

See `docs/BUSINESS_WORKSPACE_PLAN.md` for the full design. Migrations 0043–0046.

#### `business_profiles`
One row per user (Brand Kit). `id` (PK) · `user_id` (FK UNIQUE) · `company_name` · `logo_storage_path` · `address` · `phone` · `email` · `website` · `tax_id` · `registration_number` · `bank_details` (jsonb) · `mobile_money` (jsonb) · `signature_storage_path` · `stamp_storage_path` · `theme_color` (default #4F46E5) · `accent_color` (default #818CF8) · `default_template_id` (FK → document_templates) · `footer_text` · `default_terms` · `payment_instructions` · `default_currency` (default ZMW) · `default_tax_rate` · `numbering` (jsonb — per-document-type `{prefix, next}` counters, claimed atomically via `SELECT ... FOR UPDATE`) · `created_at` · `updated_at`

#### `document_templates`
`id` (PK) · `user_id` (FK, NULL for system templates) · `name` · `layout_key` (maps to a Jinja2 HTML file — the DB never stores markup) · `category` · `applicable_to` (jsonb array of document types) · `is_system` · `created_at`

#### `documents`
The core object. `id` (PK) · `user_id` (FK) · `contact_id` (FK, nullable — operations docs like a timesheet have none) · `deal_id` (FK, nullable) · `opportunity_id` (FK, nullable) · `conversation_id` (FK, nullable) · `agent_id` (FK, nullable) · `template_id` (FK) · `document_type` (quotation/invoice/receipt/purchase_order/delivery_note/credit_note/contract/proposal/certificate/letter/custom/statement_of_work/inspection_report/visit_report/timesheet/expense_claim/purchase_request/project_plan/meeting_minutes/service_agreement/maintenance_contract/nda/rental_agreement/employment_letter/offer_letter) · `document_category` (sales/operations/legal/hr) · `document_number` (UNIQUE per user) · `title` · `status` (draft/generated/sent/viewed/downloaded/accepted/rejected/expired/paid/archived) · `structured_data` (jsonb — items/sections/notes/terms/validUntil/dueDate; AI only ever fills this, never layout) · `currency` · `subtotal_cents` · `discount_cents` · `tax_cents` · `total_cents` · `storage_path` · `version` · `source_document_id` (FK → documents, self-referential — powers both /convert and /revise chains) · `requested_by` (user/customer/agent/schedule) · `ai_generated` · `ai_reasoning` · `ai_summary` · `source_message_ids` (jsonb) · `embedding` (VEC) · `share_token` (UNIQUE, migration 0046 — public view-tracking link) · `view_count` (migration 0046) · `expires_at` · `sent_at` · `viewed_at` · `paid_at` · `created_at` · `updated_at`
IDX: `(user_id, document_type)` · `(contact_id)` · `(user_id, status)` · UNIQUE `(user_id, document_number)` · UNIQUE `(share_token)`

#### `document_events`
Append-only timeline (same pattern as `relationship_health_logs`). `id` (PK) · `document_id` (FK) · `event_type` (created/edited/generated/sent/viewed/expired/converted/follow_up_suggested, etc.) · `metadata` (jsonb) · `occurred_at`

#### `deal_stage_history`
Append-only — `deals` only stores current stage + `entered_stage_at`, no history before this. `id` (PK) · `deal_id` (FK) · `from_stage` · `to_stage` (NN) · `changed_at`

#### `document_chat_messages`
Per-document AI Assistant — mirrors `advisor_messages`' shape, scoped to a document instead of a session. `id` (PK) · `document_id` (FK) · `role` (user/assistant) · `content` (NN) · `created_at`

#### `recurring_documents`
A rule, not a queued job — a 60s polling worker (`recurring-documents-worker.ts`) checks `next_run_at`. `id` (PK) · `user_id` (FK) · `contact_id` (FK) · `document_type` · `template_data` (jsonb — same shape as `structured_data`) · `recurrence` (weekly/monthly/quarterly/yearly) · `day_of_period` · `auto_send` (generate-only vs. generate + WhatsApp send) · `is_active` · `next_run_at` · `last_run_at` · `last_document_id` (FK → documents) · `created_at` · `updated_at`
IDX: `(next_run_at)` WHERE is_active = TRUE

#### `document_pack_runs`
Records what got generated together by an Automatic Business Pack (pack *definitions* are code constants, not DB rows). `id` (PK) · `user_id` (FK) · `contact_id` (FK) · `pack_key` (e.g. `new_customer_sales_pack`) · `document_ids` (jsonb array) · `created_at`
IDX: `(user_id, created_at DESC)`

---

## Migration History

| File | Description |
|------|-------------|
| 0001_extensions.sql | pgvector, uuid-ossp |
| 0002_core.sql | users, subscriptions, whatsapp_instances |
| 0003_contacts.sql | contacts, relationships, contact_groups, health_logs |
| 0004_conversations.sql | conversations, messages |
| 0005_intelligence.sql | message_analyses, suggested_replies, profiles, insights, snapshots, personas |
| 0006_proactive.sql | events, proactive_queue, auto_reply_rules |
| 0007_calendar.sql | calendars, calendar_events, reminders, attendees |
| 0008_advisor.sql | advisor_sessions, advisor_messages |
| 0009_notifications.sql | notification_preferences, notifications |
| 0010_indexes.sql | Performance indexes across all tables |
| 0011_clerk_auth.sql | clerk_user_id column on users |
| 0012_relationship_clocks.sql | Temporal engine clock tables |
| 0013_whatsapp_link_code.sql | link_code column on whatsapp_instances |
| 0014_user_mode.sql | mode column on users (personal/business/hybrid) |
| 0015_admin_role.sql | role column on users (user/admin) |
| 0016_pro_trial.sql | trial_ends_at, subscription plan updates |
| 0017_agents.sql | Agent configuration tables |
| 0018_analytics.sql | Analytics aggregation tables |
| 0019_enterprise.sql | Team, broadcast, enterprise feature tables |
| 0020_default_mode_hybrid.sql | Default mode changed to hybrid |
| 0021_contacts_crm.sql | CRM fields on contacts; supporting_text on contact_insights |
| 0022_subscriptions_unique.sql | UNIQUE constraint on subscriptions.user_id |
| 0023_contact_tasks.sql | Contact task/todo tracking |
| 0024_ai_profile_fields_documents.sql | Extended contact_profiles fields; contact_documents table; new event types |
| 0025_history_sync.sql | sync_jobs table; auto_response_settings table |
| 0026–0042 | *(not documented here — see individual migration files: Marketing Studio/social publishing, Deals, Opportunities & Connections, Contact Products/Life Events/Network Value, Relationship Goals, Business Facts, Agent Workforce/Memory, Knowledge Base enhancements)* |
| 0043_business_workspace_phase0.sql | business_profiles, document_templates, documents, document_events, deal_stage_history; contact_documents.generated_document_id |
| 0044_business_workspace_phase2.sql | contact_insights.source_document_id (AI Document Memory) |
| 0045_business_workspace_phase3.sql | document_chat_messages, recurring_documents |
| 0046_business_workspace_phase4.sql | documents.share_token/view_count; business_facts category/source widened (pricing_benchmark/aggregation); document_pack_runs |
