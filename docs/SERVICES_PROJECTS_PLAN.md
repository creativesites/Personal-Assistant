# Services & Projects Plan — Studio as the Commercial Hub

## 0. Why This Doc Exists

Studio has so far modeled every offering as a stocked physical `product`. That stops working the moment a business sells anything that isn't inventory — a freelancer's hours, a barber's chair-time, a software agency's milestones, a photographer's packages. This doc designs a **Services Management System** that treats products and services as siblings under one commercial catalog, plus a first phase of real substance for **Project Management** (milestones, time tracking, budget, an AI-surfaced daily brief) and the direct linking of document generation to both projects and services. It also documents — deliberately without building — the longer-term vision (teams, risk register, dependency graphs, a generic automation engine) so nothing gets lost.

Nothing here duplicates infrastructure that already exists. `products.item_type` (`product`/`service`/`bundle`/`subscription`/`package`/`digital_product`) and modular JSONB buckets (`service_details`, `pricing_details`) were added in migration `0049` and have sat unused ever since — this plan activates them rather than inventing a parallel schema. Likewise, `projects`/`project_tasks` (migration `0060`) stays exactly as-is; this plan adds to it, not around it.

---

## 1. Current State (confirmed by reading the code, not assumed)

- **Three bugs prompted this work.** (1) Linking a project to a goal via `POST /api/goal-profiles/:id/link` succeeds and writes to `goal_linked_entities`, but `GET /api/projects/:id` (`services/api/src/routes/projects.ts:120-133`) never queries that table, and `projects/[id]/page.tsx` has no UI slot to show a linked goal even if it did — a missing reverse-lookup on both ends, not a naming mismatch. (2) Adding a new "Product Type" in Studio's "Manage Product Types" modal doesn't appear in the New Product dropdown until a full page reload — `ProductFamiliesManager` (`studio/page.tsx:817`) has its own independent `useApi` fetch and `refetch`, but `CatalogModule`'s separate families fetch (`studio/page.tsx:1274`) is never invalidated when the modal closes. (3) Studio has no way to say "this is a service, not a stocked item" in a way that actually changes behavior.
- **`products.item_type`** (migration `0049`) already exists as a CHECK-constrained enum (`product|service|bundle|subscription|package|digital_product`), wired through `services/api/src/routes/products.ts` and rendered as a badge/filter tab in `studio/page.tsx` — but it is purely decorative. The New Product form shows Stock/Minimum Stock unconditionally; `InventoryModule` computes low-stock/reorder purely from `p.available <= p.minimumStock`; the `inventory_forecasts` job (migration `0061`) has no exclusion either. A "service" row today is silently treated as a stocked physical good everywhere in the UI.
- **`products`** also already carries `service_details JSONB`, `pricing_details JSONB`, `family_id`/`attributes` (via `product_families`/`product_attribute_definitions`, migration `0056`), WhatsApp catalog sync fields, AI negotiation bounds (`min_price`/`max_price`), and everything else a catalog "offering" needs — all unused for services today.
- **`projects`/`project_tasks`** (migration `0060`) is deliberately lightweight: `projects(id, user_id, contact_id, deal_id, title, status, start_date, due_date)`, `project_tasks(id, project_id, title, status, due_date, assigned_to (free text), completed_at)`. No milestones, no time tracking, no budget, no risk register, no dependencies exist yet.
- **`documents`** (migration `0043`, extended since) has `contact_id`/`deal_id`/`opportunity_id`/`conversation_id`/`agent_id`/`template_id`/`supplier_id` FKs but **no `project_id`** — a project's documents are found today only via a *shared* `deal_id` (`documents.deal_id = projects.deal_id`), which silently orphans any document generated directly against a project with no deal. Several service/project document types (`service_agreement`, `statement_of_work`, `maintenance_contract`, `project_plan`) already exist in the `document_type` CHECK constraint, unused.
- **`goal_linked_entities`** (migration `0063`) is a generic polymorphic table (`goal_id, entity_type CHECK(deal|project|product|contact|document), entity_id`) with an index on `(entity_type, entity_id)` — a service (as a `products` row) already fits under `entity_type='product'` with zero schema change, and a project fits under `entity_type='project'` — the goal-link bug is purely a missing query, not a missing capability.
- **No generic Automation Engine exists.** What exists is scoped narrowly: `auto_reply_rules`/`auto_reply_exclusion_rules` (inbound WhatsApp auto-response only) and `action_bundles` (Business OS Phase E, a JSONB `{type, params, dependsOn}` array executed client-side, populated by exactly one detector today). CLAUDE.md already calls a real cross-module condition→action engine "separately planned, unchanged."
- **The AI Daily Brief** (`GET /api/proactive/brief`) already has `UNION ALL` branches for `task_overdue`/`project_behind` (Business OS Phase F) — the natural extension point for project-health signals, not a new dashboard.
- **Purchase orders are `documents` rows** (`document_type='purchase_order'`, `supplier_id` set instead of `contact_id`) — the established precedent for adding a new nullable FK column to `documents` for a new counterpart type, which is exactly the shape `project_id` takes.

---

## 2. Philosophy

A product is something you stock. A service is something you deliver. Both are *offerings*, and both feed into sales, CRM, projects, invoicing, analytics, and AI. Studio should not think in terms of "product businesses" vs. "service businesses" — it should think in terms of things a business sells, with `item_type` as the pivot that decides which specialized capabilities apply.

---

## 3. Schema Strategy: Services Live In `products`

A service is a `products` row with `item_type='service'` (or `subscription`/`package`). **No parallel `services` table.** `products` already carries name/description/images/videos/tags/category/family+attributes/WhatsApp sync/AI negotiation bounds/goal-linking — duplicating all of that into a new table would mean re-plumbing every one of those systems for zero benefit, and contradicts the "products and services are siblings" framing this whole plan is built on.

What genuinely deserves its own table — structured, one-to-many per service, meant to be listed/filtered/compared — versus what stays JSONB on `products` (low-cardinality, edited as a whole, never queried individually):

| Real table (queryable, one-to-many) | JSONB on `products` |
|---|---|
| `service_pricing_tiers` (packages + milestones) | `service_details.deliverables` (checklist) |
| `service_capacity` + `service_capacity_movements` (ledger) | `service_details.requirements` (checklist) |
| `service_workflow_stages` (ordered template) | `service_details.requiredCapabilities` (skills/certs/equipment/software/location) |
| | `pricing_details` (model-specific config) |

Two new columns on `products`: `pricing_model` (drives conditional UI, must be filterable) and `track_inventory` (the single conditional that fixes the product/service inventory bug everywhere).

---

## 4. Migration `0074_services_management.sql`

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_model VARCHAR(30)
  CHECK (pricing_model IN ('fixed','hourly','daily','subscription','milestone','quote','recurring'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT true;
UPDATE products SET track_inventory = (item_type IN ('product','bundle'));

CREATE TABLE service_pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL DEFAULT 'package' CHECK (kind IN ('package','milestone')),
  name VARCHAR(255) NOT NULL,
  price DECIMAL(12,2),
  currency VARCHAR(10) NOT NULL DEFAULT 'ZMW',
  duration VARCHAR(100),
  features JSONB NOT NULL DEFAULT '[]',
  extras JSONB NOT NULL DEFAULT '[]',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  capacity_unit VARCHAR(20) NOT NULL DEFAULT 'slots' CHECK (capacity_unit IN ('hours','slots','bays','seats','staff','days')),
  period_type VARCHAR(20) NOT NULL DEFAULT 'week' CHECK (period_type IN ('day','week','month','ongoing')),
  total_capacity NUMERIC(10,2) NOT NULL DEFAULT 0,
  booked NUMERIC(10,2) NOT NULL DEFAULT 0,
  available NUMERIC(10,2) GENERATED ALWAYS AS (total_capacity - booked) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, period_type)
);

CREATE TABLE service_capacity_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capacity_id UUID NOT NULL REFERENCES service_capacity(id) ON DELETE CASCADE,
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('book','release','adjust')),
  quantity_delta NUMERIC(10,2) NOT NULL,
  previous_booked NUMERIC(10,2) NOT NULL,
  new_booked NUMERIC(10,2) NOT NULL,
  reason TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_workflow_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

No `item_type`/`document_type` enum changes needed — both already list the values this plan needs.

---

## 5. Pricing Models

Base rate reuses the existing `selling_price` column; model-specific knobs live in `pricing_details` JSONB; multi-row structures live in `service_pricing_tiers`:

- **fixed** — `selling_price` is the price.
- **hourly / daily** — `selling_price` = rate; `pricing_details = { unit, minUnits, estimatedUnits }`.
- **subscription** — `selling_price` = per-period price; `pricing_details = { interval, minTermMonths }`.
- **recurring** — `pricing_details = { interval, perVisitPrice }`.
- **milestone** — rows in `service_pricing_tiers` (`kind='milestone'`); `selling_price` = sum, denormalized for display.
- **quote** — `selling_price` NULL; `pricing_details = { contactCta: true }` → renders "Contact us".
- **packages** (any pricing model) — rows in `service_pricing_tiers` (`kind='package'`), each with its own price/features/duration/extras.

---

## 6. Deliverables, Requirements & Skills

Simple JSONB checklists on `service_details` — templates only, not per-instance tracking:

```json
service_details.deliverables = [{ "label": "Source Code", "included": true }]
service_details.requirements  = [{ "label": "Signed contract", "type": "document", "required": true }]
service_details.requiredCapabilities = ["Node.js", "React", "AWS"]
```

`requirements[].type` ∈ `document|file|photo|measurement|notes|questionnaire|contract|payment|approval`.

---

## 7. Capacity — A Ledger, Not A Counter

`service_capacity` holds the denormalized total/booked/available (a generated column) per service per period; `service_capacity_movements` is the append-only ledger (`book`/`release`/`adjust`) — directly mirroring the existing `stock_movements` pattern (migration `0055`) that already solves this exact problem for physical inventory. "40 hours/week, 32 booked, 8 available" maps onto this 1:1.

---

## 8. Workflow Templates → Real Projects

`service_workflow_stages` stores an ordered list of stage names against a service. `POST /api/products/:id/start-project` reads the service's stages and:
1. Inserts one `projects` row (the existing table, verbatim).
2. Inserts one `project_tasks` row per stage.
3. Optionally books capacity via a `service_capacity_movements` row linked to the new project.

This is a template→tasks copy — it does not redesign project management.

---

## 9. Studio UI

A new **Services** tab, structurally modeled on the existing Catalog tab (same gradient/rounded-3xl/icon-chip design system): Overview, pricing-model picker with conditional fields, packages editor, deliverables editor, requirements editor, capacity setup, workflow editor, skills/requirements chips, and a single free-text staff-assignment field (the anchor for future team assignment, not built now).

The existing Catalog tab becomes `item_type`-aware: Stock/Minimum Stock/Supplier Lead Time only show for `track_inventory=true` items; a `package` option is added to the item-type picker; non-tracked items show a pricing-model badge instead of a stock badge.

`track_inventory` is gated everywhere a "physical stock" assumption currently leaks: Studio's insights queries (low-stock, out-of-stock, inventory value, suggested reorders), `InventoryModule`'s filters/sort, the stock-movement modal, and the `inventory_forecasts` job.

---

## 10. AI Assistant Integration

No new chat mechanism — this extends Studio's existing `[ACTION: type | param | param]` tag system (`ZURI_ACTION_INSTRUCTIONS` in `services/intelligence/app/routes/conversation.py`). `generate_document` gains `statement_of_work`/`service_agreement` to its allowed types; two new tags — `estimate_duration` and `start_project` — are added. "Client hasn't replied", "project is behind", and "suggested next action" reuse existing reminder/reply-draft tags plus the new AI Daily Brief branches below.

---

## 11. Project Management Phase 1

### 11.1 Migration `0075_project_management_expansion.sql`

```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE TABLE project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  completion_pct SMALLINT NOT NULL DEFAULT 0 CHECK (completion_pct BETWEEN 0 AND 100),
  payment_amount_cents BIGINT,
  currency CHAR(3),
  requires_client_approval BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES project_tasks(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_label VARCHAR(255),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_minutes INT,
  is_billable BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_time_entry_running ON project_time_entries(project_id, user_id) WHERE ended_at IS NULL;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS estimated_budget_cents BIGINT,
  ADD COLUMN IF NOT EXISTS budget_currency CHAR(3);

CREATE TABLE project_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 11.2 Document ↔ Project Linking

`documents.project_id` (new nullable FK, mirroring the `supplier_id` precedent from migration `0057`) lets a document attach directly to a project instead of only through a shared `deal_id`. The project→documents query in `projects.ts` unions both paths so historical deal-linked documents stay visible: `doc.project_id = p.id OR (doc.project_id IS NULL AND doc.deal_id = p.deal_id)`. A new `POST /api/projects/:id/documents` pre-fills `projectId`/`contactId`/`dealId` from the project and delegates to the existing document-create logic — the "generate a document from within a project" entry point. Manual document creation, AI-generate, and purchase orders all gain an optional `projectId` field.

### 11.3 Milestones

`project_milestones` tracks title, target date, status, completion %, an optional payment amount, and client-approval state. API mirrors the existing task sub-routes (`POST/PATCH/DELETE /api/projects/:id/milestones[/:mid]`); `completed_at`/`approved_at` are set the same way `project_tasks.completed_at` already is. Renders as a new card on the project detail page, structurally identical to the existing Tasks card.

### 11.4 Time Tracking

`project_time_entries` supports both a start/stop timer (a partial unique index prevents two concurrent timers for the same user+project) and manual entry, with a simple `is_billable` boolean — no approval workflow, matching this codebase's "don't over-engineer" convention. The project detail page gets a "Time" card: Start/Stop button, manual-entry form, recent entries, a running total.

### 11.5 Budget — No New Ledger

`projects.estimated_budget_cents` vs. a *computed* actual, following the same "operational overview, not accounting" convention as the existing Business OS financial overview: invoiced/paid totals summed from linked `documents`, purchase costs summed from linked purchase orders, labor shown as tracked hours (a labor *rate* needs the deferred team/seat model and isn't computed yet). No profit/expense/tax ledger ships now.

### 11.6 AI Daily Brief Extension

Two new `UNION ALL` branches in the existing brief query, matching its exact shape: `milestone_overdue` (a milestone past its target date, not completed) and `project_over_budget` (an active project whose linked invoices exceed its estimated budget). Both require a linked contact, same as the existing `task_overdue`/`project_behind` branches.

### 11.7 Minimal Project-Progress Notifications

A pragmatic, concrete stand-in for a full automation engine — not a rule builder. A new intelligence-service check (cloning `document_followups.py`'s plain-SQL-scan shape, scheduled at 17:00 UTC alongside the other daily jobs) inserts an approvable `proactive_queue` draft for two hardcoded crossings: a milestone completed and awaiting client approval, and a project's task-completion ratio crossing 75% (the user's own worked example — "notify the client, prepare the next invoice"). A new `project_events` marker table keeps this idempotent across repeated runs, the same role `document_events` plays for `document_followups.py`.

---

## 12. Deferred Roadmap (Documented Only — Not Built In This Phase)

- **Project origination pipelines.** "Everything becomes a project" — auto-creating a project from a won deal, a sold service, a signed contract, a maintenance plan, or a support ticket. Needs a `project_templates` table and a polymorphic `projects.origin_type`/`origin_id`. This phase's `start-project` endpoint and `documents.project_id` are the anchor points a future pipeline would build on.
- **Teams / staff assignment.** Real multi-seat assignment (replacing the free-text `assigned_to`/`person_label` fields) with per-member labor rates. Blocked on a multi-seat account model that doesn't exist yet in this codebase — explicitly deferred at the user's own request, but the free-text fields are the placeholder those FKs would eventually replace.
- **Risk register** — `project_risks(likelihood, impact, mitigation, owner, status)` feeding new brief branches and AI warnings.
- **Change requests** — `project_change_requests(description, cost_impact_cents, deadline_impact_days, status, approval_history)`.
- **Dependency graph** — a real `project_dependencies` table spanning tasks/milestones/purchase orders/payments (the "Project A depends on a supplier delivery, which depends on a PO, which depends on a payment" chain), needing a topological/critical-path resolver and a Gantt-style UI. Migration `0060`'s own comment already notes "no Gantt/dependency graph" was a deliberate original scope cut — this remains true.
- **Resource booking** — equipment/rooms/vehicles/software licenses as bookable, conflict-checked resources, integrated with Calendar and Inventory.
- **Expense/profitability model** — a real `project_expenses` table for true profit = invoiced − expenses, beyond this phase's operational-overview approximation.
- **Generic Automation Engine** — the real condition→action workflow builder ("at 75% complete → notify client → generate progress report → prepare next invoice" as a *user-configurable* rule, not two hardcoded checks). Already flagged elsewhere in this codebase as separately planned.
- **Deep AI Project Manager** — predictive deadline-miss modeling, cross-project "which client needs attention today" synthesis, continuous monitoring beyond the daily brief. Should be additive wiring on the existing Advisor Companion service (a project-coordinator persona/context), not a new subsystem.
- **Unified communication timeline** — merging WhatsApp/email/calls/meetings/voice notes with AI summaries into one searchable per-project feed.
- **Contractor/subcontractor pricing** — a join table mirroring `supplier_products` (migration `0057`) for assigning external subcontractors to services/projects with their own cost/lead-time.
- **Multi-location/multi-period capacity, real appointment-slot calendars, per-project-instance requirements-collection tracking** (i.e. marking a specific project's specific requirement as collected, not just defining the template).

---

## 13. Rollout Phasing

1. Three bug fixes (goal-link display, product-types refetch; the product/service inventory distinction folds into the Services migration).
2. Migration `0074` + Services API (`services.ts`) + Studio UI (Services tab, Catalog gating) + AI actions.
3. Migration `0075` + Projects/Documents/Proactive API changes + intelligence scheduler + Projects UI (Milestones, Time, Budget, Linked Goal cards).
4. `CLAUDE.md` documentation section for both.
5. Full verification (migrations against a local Postgres instance, typecheck all three services, manual endpoint/UI walkthroughs), commit, push to `main`.

## 14. Deliberately Out Of Scope

Everything in section 12, plus: a contractor pricing table, multi-location capacity, and any parallel family/attribute schema for services (the existing `product_families`/`product_attribute_definitions` system is reused as-is).
