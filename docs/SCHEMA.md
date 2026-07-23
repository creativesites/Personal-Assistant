# Database Schema

PostgreSQL 16 + pgvector. 115 migrations applied (0001–0115).

Migration files live in `db/migrations/`. Run with `npm run db:migrate`.

---

## Domain Overview

| # | Domain | Key Tables | Description |
|---|--------|------------|-------------|
| 1 | Core & Auth | `users`, `subscriptions`, `whatsapp_instances`, `byok_api_keys`, `organization_memberships`, `organizations` | Accounts, Clerk auth, BYOK keys, Clerk Organizations, connected WA sessions |
| 2 | Contacts & CRM | `contacts`, `contact_group_members`, `relationships`, `contact_tags`, `relationship_health_logs`, `contact_tasks`, `contact_merges` | CRM contacts, groups, pipeline stages, lead scores, merging, presence |
| 3 | Conversations & Messages | `conversations`, `messages`, `message_analyses`, `suggested_replies` | WA threads, active locking, messages, AI analysis, reply drafts |
| 4 | AI Intelligence & Memory | `user_communication_profiles`, `contact_profiles`, `contact_insights`, `context_snapshots`, `personas`, `contact_documents`, `agent_memories` | Profiles, insights, vector memory snapshots, tone personas |
| 5 | Proactive & Temporal | `events`, `proactive_queue`, `auto_reply_rules`, `relationship_clocks`, `emotional_signals` | Extracted events, morning feed, relationship clocks, emotional signals |
| 6 | Calendar | `calendars`, `calendar_events`, `calendar_reminders`, `calendar_event_attendees` | Calendar system auto-populated from extracted events |
| 7 | AI Advisor | `advisor_sessions`, `advisor_messages`, `advisor_user_profiles`, `advisor_action_requests` | User-AI advisor chat, persistent memories, action requests |
| 8 | Autonomous Workforce | `agents`, `agent_workforce`, `knowledge_candidates`, `kb_documents`, `kb_chunks`, `kb_document_versions` | Agents, workforce roles, Knowledge Brain & Discovery engine |
| 9 | Business & ERP | `business_profiles`, `document_templates`, `documents`, `document_events`, `deal_stage_history`, `sales_orders`, `purchase_orders`, `inventory_locations`, `stock_movements`, `bill_of_materials` | Brand Kit, 15 Document types, Quotes/Invoices/Receipts, Sales Orders, BOM, Inventory Locations |
| 10 | Deals & Opportunities | `deals`, `opportunities`, `connections`, `products`, `product_families`, `services` | Sales deals, revenue opportunities, product catalog, BOM, service management |
| 11 | Marketing & Publishing | `social_accounts`, `social_posts`, `content_generations`, `promotion_campaigns` | Brand Studio, social media publishing, content generation |
| 12 | Career OS & Jobs | `scraped_jobs`, `career_profiles`, `readiness_checklists`, `cover_letters`, `cv_studio_documents` | Job workspace, readiness scoring, AI cover letters, resume studio |
| 13 | Membership & Payments | `membership_tiers`, `member_subscriptions`, `membership_payments` | Membership platform, recurring plans, payment flows |
| 14 | BI & Analytics | `analytics_aggregations`, `ai_model_usage`, `token_usage_logs`, `business_facts` | BI metrics, health scores (0-100), token tracking, pricing benchmarks |
| 15 | System & Automation | `sync_jobs`, `auto_response_settings`, `action_bundles`, `scoped_automations` | History sync, auto-reply rules, action bundles, scoped automation |

---

## Migration History (0001–0115)

| Migration | Description |
|-----------|-------------|
| 0001–0010 | Initial core, contacts, conversations, intelligence, proactive, calendar, advisor, notifications, indexes |
| 0011–0020 | Clerk auth, relationship clocks, link code, user mode, admin role, pro trial, agents, analytics, enterprise, default mode |
| 0021–0025 | Contacts CRM fields, subscription unique, contact tasks, AI profile fields, history sync |
| 0026–0030 | Agent workforce, KB enhancements, AI model usage, memory engine, business facts, agent memories |
| 0031–0035 | Marketing access, advisor conversation links, content generation, social publishing, lead attribution |
| 0036–0042 | KB file storage OCR, deals, opportunities, products, network value, revenue events, goals, WA catalog |
| 0043–0046 | Business workspace phase 0–4: brand kit, documents, templates, document events, recurring docs, share tokens |
| 0047–0051 | Event type extensions, contact fixes, studio ERP improvements, brand fields, negotiation fields |
| 0052–0056 | Auto-reply agents unification, storage policies, group chat support, stock movements, product families |
| 0057–0061 | Purchase orders, inventory locations, action bundles, projects, inventory forecasts |
| 0062–0066 | Emotional signals, goal profiles, reflection summaries, knowledge graph edges, advisor profiles |
| 0067–0071 | Advisor memories, action requests, proactive companion, scoped automation, curiosity engine |
| 0072–0077 | Token usage tracking, subscriptions & payments, services management, project expansion, business events, reality engine |
| 0078–0082 | Career growth engine, employer taxonomy, CV studio phase 1 & 9 |
| 0083–0089 | Membership platform, payment flows, notifications, promotion engine, action bundle auto-approval, contact merge, reflection quarterly |
| 0090–0096 | Career profile identity, job discovery manual runs, multi business profiles, document templates expansion, scraped jobs, living companion, advanced caching & resume |
| 0097–0103 | Contact presence & ticks, notification WA events, privacy & auto-reply inclusions, scraped jobs contacts, career OS enrichment, production maturity upgrade, career OS upgrades, three workspaces |
| 0104–0108 | E-signatures & dunning reminders, brand studio & document analytics, client portal & payments, expand document types (15 types), business presets |
| 0109–0115 | Bill of materials, brand signatures, BYOK production system, BYOK schema fix, KB system overhaul, Business ERP sales engine, Clerk organizations & teams, organization workspace scoping |

---

## Detailed Table Reference (Key Domains)

### 1. Core & Organization Governance

#### `users`
`id` (PK) · `email` (UNIQUE NN) · `clerk_user_id` (UNIQUE) · `full_name` · `timezone` · `locale` · `mode` (personal/business/hybrid) · `role` (user/admin) · `onboarding_completed` · `created_at` · `updated_at`

#### `organizations`
`id` (PK) · `clerk_org_id` (UNIQUE) · `name` · `slug` · `owner_user_id` (FK) · `seat_limit` · `created_at` · `updated_at`

#### `organization_memberships`
`id` (PK) · `organization_id` (FK) · `user_id` (FK) · `role` (admin/member) · `created_at`

#### `byok_api_keys`
`id` (PK) · `user_id` (FK) · `provider` (openai/anthropic/gemini/dashscope) · `encrypted_api_key` · `is_active` · `created_at` · `updated_at`

---

### 2. Business Workspace & ERP Domain

#### `business_profiles`
`id` (PK) · `user_id` (FK) · `organization_id` (FK) · `company_name` · `logo_storage_path` · `address` · `phone` · `email` · `tax_id` · `registration_number` · `bank_details` (jsonb) · `signature_storage_path` · `stamp_storage_path` · `theme_color` · `default_currency` · `numbering` (jsonb) · `created_at`

#### `documents`
`id` (PK) · `user_id` (FK) · `organization_id` (FK) · `contact_id` (FK) · `deal_id` (FK) · `document_type` (quotation, invoice, receipt, purchase_order, delivery_note, credit_note, contract, proposal, certificate, letter, custom, statement_of_work, inspection_report, visit_report, timesheet) · `document_number` (UNIQUE) · `title` · `status` (draft, generated, sent, viewed, downloaded, accepted, rejected, expired, paid, archived) · `structured_data` (jsonb) · `currency` · `total_cents` · `storage_path` · `share_token` (UNIQUE) · `view_count` · `expires_at` · `created_at`

#### `sales_orders`
`id` (PK) · `user_id` (FK) · `organization_id` (FK) · `contact_id` (FK) · `order_number` (UNIQUE) · `status` · `items` (jsonb) · `total_cents` · `created_at`

#### `purchase_orders`
`id` (PK) · `user_id` (FK) · `organization_id` (FK) · `supplier_contact_id` (FK) · `po_number` (UNIQUE) · `status` · `items` (jsonb) · `total_cents` · `created_at`

#### `inventory_locations`
`id` (PK) · `user_id` (FK) · `organization_id` (FK) · `name` · `address` · `is_default` · `created_at`

#### `bill_of_materials`
`id` (PK) · `product_id` (FK) · `component_product_id` (FK) · `quantity_required` · `notes` · `created_at`

---

### 3. Knowledge Base & AI Brain Domain

#### `kb_documents`
`id` (PK) · `user_id` (FK) · `organization_id` (FK) · `title` · `category` · `summary` · `file_storage_path` · `file_size_bytes` · `word_count` · `tags` · `used_count` · `last_used_at` · `created_at`

#### `kb_chunks`
`id` (PK) · `document_id` (FK) · `chunk_index` · `content` · `embedding` (VEC) · `created_at`

#### `knowledge_candidates`
`id` (PK) · `user_id` (FK) · `organization_id` (FK) · `category` · `title` · `proposed_value` · `source_type` · `observation_count` · `confidence` · `status` (pending, approved, rejected, merged) · `created_at`
