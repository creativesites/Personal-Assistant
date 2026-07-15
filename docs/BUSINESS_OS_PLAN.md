# BUSINESS_OS_PLAN.md — Zuri as an AI Business Operating System

**Status (2026-07-15):** Phases A through G have shipped (migrations `0056`–`0061`) — see `CLAUDE.md`'s "Studio ERP & AI Business Advisor" section for the authoritative per-phase summary of what's live in production, and §18 below for the phase-by-phase status. Only Phase H (Manufacturing/BOM, §12) and the smaller unlettered items in §6/§8.1/§10 remain unbuilt, deliberately deferred per this doc's own "build only when a real user asks" framing. This document originally started from the foundation specified in `docs/STUDIO_ERP_PLAN.md` (`suppliers`, rich `products` columns, `stock_movements`, `GET /api/studio/insights`, and the Studio AI Business Advisor with `[ACTION: ...]` tags — live as of migration `0055`) and defined the phases that turned Studio from "a good catalog + inventory + advisor" into an AI layer that keeps a business's operational reality in sync with what happens in its conversations. Every proposal below is labeled **extends** (builds on a shipped table/engine), **reconciles** (fixes a naming/design inconsistency along the way), or **net-new** (nothing like it existed yet) relative to the audit in §2 — those labels are historical (as of when each phase was planned), not a live build queue.

---

## 1. The Philosophy

Most ERPs are systems of record. They store what already happened, and they require a human to type it in first. Zuri should be a **system of intelligence**: it observes conversations, understands business context, recommends actions, automates the routine work, and continuously learns how the business actually operates.

Concretely: a user sells 3 Samsung A16 phones to Peter over WhatsApp. Today, nothing in Zuri changes unless the user manually opens Studio and edits stock. The target behavior is that Zuri notices the sale in the conversation and proposes the bundle of consequences in one shot:

> "I detected you've sold 3 Samsung A16 phones to Peter. Should I create the invoice, reduce inventory, mark the deal as won, and schedule a follow-up in 30 days?"

The user approves or edits. Zuri executes. That reversal — conversation as the primary source of truth, AI as the data-entry layer, human as the approver — is the differentiator. A boutique in Lusaka and an engineering firm in London both already have inventory, suppliers, projects, documents, and a CRM's worth of relationships to manage. What neither has is an assistant that ties all of it together and runs it proactively. That's the product to build, not "another CRM" or "another lightweight ERP."

Two corollaries that shape every design decision below:
- **One graph, not modules.** A product, a supplier, a deal, an invoice, and a project are edges on the same graph, not rows in unrelated tables that happen to share a `user_id`. Every new table added under this plan must declare which existing entities it references.
- **Everything is reversible and inspectable.** Nothing in this plan should introduce a "the AI silently changed something" experience. Every automated action is either proposed-then-approved (extends the existing `[ACTION: ...]` pattern) or, for advanced trust levels, executed-then-logged with an audit trail the user can review and undo (extends the existing `stock_movements`/`document_events`/`deal_stage_history` append-only-log pattern already used three times in this codebase).

---

## 2. What Already Exists Today (Audit)

This section is the ground truth as of migration `0055`. Every proposal in §6 onward states what it extends from here.

### 2.1 The Business Graph today

Entities that exist right now, and how they already connect:

```
users
  └─ contacts ──────────┬─ deals (0037) ── deal_stage_history (0043)
                         ├─ contact_products (0039) ── products (0031/0049/0042/0051)
                         ├─ contact_life_events (0039)      └─ suppliers (0049)
                         ├─ opportunities (0038) ── linked_deal_id → deals
                         ├─ relationship_connections (0038)
                         ├─ relationships.network_value (0039, JSONB)
                         ├─ documents (0043) ── contact_id / deal_id / opportunity_id / conversation_id
                         ├─ contact_documents (0024) ── generated_document_id → documents
                         └─ conversations → messages
  └─ business_facts (0029) — policies/rules/pricing/supplier facts, category-tagged
  └─ business_profiles (0043) — one Brand Kit row per user
  └─ stock_movements (0055) ── product_id → products
```

This is already a real graph, not isolated modules — `documents` alone references contacts, deals, opportunities, conversations, and agents. The gap (see §3) is that the graph has no node for **suppliers → purchase orders**, no **projects**, no **locations**, and `products` is a flat table that can't express "this business's version of a product" without adding columns for every vertical.

### 2.2 Catalog — `products` table

One flat table, columns added across four migrations:
- **0031** (original): `name`, `description`, `specs JSONB`, `price`, `currency`, `serial_number`, `quantity`, `images JSONB`, `status`
- **0049**: `sku`, `barcode`, `category`, `supplier_id → suppliers`, `brand`, `item_type` (`product`/`service`/`bundle`/`subscription`/`package`/`digital_product`), `videos`, `stock`, `reserved`, `available`, `minimum_stock`, `maximum_stock`, `lead_time`, `supplier_lead_time`, `purchase_cost`, `selling_price`, `margin`, `discount_rules JSONB`, `cross_sell JSONB`, `upsell JSONB`, `replacement_product_id`, `related_products JSONB`, `warranty`, `manual`, `tags TEXT[]`, and three escape-hatch JSONB columns: `service_details`, `inventory_details`, `pricing_details`
- **0042**: `whatsapp_catalog_product_id/synced_at/status/error` (WhatsApp Business catalog sync)
- **0051**: `min_price`, `max_price`, `discount_min_pct`, `discount_max_pct` (AI negotiation guardrails)

`item_type` already distinguishes product/service/bundle/subscription/package/digital_product, and the three `_details` JSONB columns are already a precedent for "store vertical-specific shape without a new column per vertical" — but there is no user-facing UI or schema layer that defines *what belongs* in those JSONB blobs per vertical, and no concept of a category/family hierarchy at all (`category` is a single free-text string).

### 2.3 Suppliers — `suppliers` table (0049)

`company`, `contact`, `phone`, `whatsapp`, `email`, `average_delivery_time`, `reliability_score`, `minimum_order`, `payment_terms`, `outstanding_balance`, `notes`. `GET /api/studio/insights` already flags suppliers with `reliability_score < 80` or `average_delivery_time > 14`. No purchase order concept, no per-product supplier pricing, no learned-pattern memory beyond the two static score columns.

### 2.4 Inventory — `stock_movements` table (0055)

`movement_type` enum (`restock`/`sale`/`adjustment`/`waste`/`return`), `quantity_delta`, `previous_stock`, `new_stock`, `reason`, timestamped. `POST /api/products/:id/stock-movements` is the only path that should mutate stock going forward (the old blind `PATCH /api/products/:id {stock: N}` still exists for cases like initial catalog entry — see CLAUDE.md). This is real audit-trail infrastructure, but it's single-location (no `location_id`), and the movement-type vocabulary is missing `transfer`, `damaged` (distinct from `waste`), `expired`, `committed`, and `in_transit` — all named explicitly in the user's vision.

### 2.5 Deals / Opportunities / Contact Products

- `deals` (0037): the canonical pipeline entity — `stage` (discovery/qualified/proposal/negotiation/closed_won/closed_lost), `value_cents`, `product_ids JSONB`, `expected_close_date`. `deal_stage_history` (0043) is the append-only log.
- `opportunities` (0038): AI-detected signals — `opportunity_type` (buying_signal/expansion/referral_moment/renewal_due/life_event/reconnect_window/churn_risk/support_needed), `estimated_value_cents`, `confidence`, `linked_deal_id`.
- `contact_products` (0039): join table, `relation_type` (purchased/interested/quoted/recommended/mentioned), `quantity`, `warranty_expires_at`, `replacement_predicted_at` (feeds `renewal_due` opportunities via `clock_engine.py`'s `check_product_replacements`).

This is already most of "Sales Intelligence" plumbing (§9) — `contact_products` + `deals.product_ids` can answer "what does this contact buy" today. What's missing is the co-purchase/basket-analysis layer ("customers who buy X also buy Y") and surfacing it as an in-conversation suggestion.

### 2.6 Documents / Business Workspace (0043–0046)

`documents` (quotation/invoice/receipt/purchase_order/delivery_note/credit_note/contract/proposal/... 25 types total, `document_category` sales/operations/legal/hr, full status lifecycle draft→...→archived→paid, `embedding vector(1536)` for semantic search, `share_token` view tracking). Note: `purchase_order` already exists as a **document type** in `documents.document_type`'s check constraint — but there is no *workflow* around it (no supplier-approval flow, no auto-stock-increment on receipt). §8 below reuses this document type rather than inventing a parallel `purchase_orders` table.

### 2.7 Business Facts / Rules — `business_facts` (0029, widened 0049)

Category-tagged key/value facts (`product`/`pricing`/`shipping`/`refund_policy`/`faq`/`hours`/`inventory`/`promotion`/`supplier`/`tax`/`bank_details`/`wa_template`/`brand_voice`/`objection`/`pricing_benchmark`/`business_rule`/`other`), each with a `confidence` and `source` (ai_inference/manual/document/imported). This is already the "AI learns long-term patterns" mechanism the user describes for suppliers ("Supplier usually delivers late") — it's generic, not supplier-specific, and nothing currently writes supplier-pattern facts into it (see §8).

### 2.8 Studio Insights + AI Advisor + action tags

`GET /api/studio/insights` (`services/api/src/routes/studio.ts`) is deterministic SQL: total/low-stock/out-of-stock counts, inventory value, thin-margin products, flagged suppliers. `studio_ask` (`services/intelligence/app/routes/conversation.py`) is the conversational layer — catalog + business_facts + supplier stats + contact context in the prompt, `ZURI_ACTION_INSTRUCTIONS` appended so the model can emit `[ACTION: type | params]` tags. `OverviewModule.handleChatAction` in `apps/web/.../studio/page.tsx` currently wires five action types: `lead_score`, `pipeline_stage`, `reminder`, `reply_draft`, `generate_document`.

### 2.9 Two action-execution mechanisms already in the codebase

1. **`[ACTION: ...]` tags** — parsed by `ChatFormatter`, rendered as a confirm-before-execute card in a chat UI. Used by the main Advisor, Studio's Advisor, and Inbox's intel panel.
2. **`agent_engine.py`'s tool list** — prompt-described tools + JSON dispatch, used only by the Autonomous Agent Engine (agent-assigned WhatsApp conversations), gated by per-agent trust level (Observe → Autonomous), executes without a confirm step at higher trust tiers.

Neither mechanism today handles "I noticed something in a live conversation, here's a bundle of N related actions to approve at once" — the tag system is single-action-per-tag and lives inside a chat reply, and the agent engine only fires from a tool-call inside an autonomous conversation, not from a passive detection pass over an ordinary conversation. §16 decides how to close this gap.

---

## 3. Gaps Relative to the Vision

Reading the vision against §2, the genuinely new work is:

| Vision element | Status |
|---|---|
| Configurable custom attributes per product type ("exactly like Odoo") | **Missing.** `products` is flat columns + three untyped JSONB blobs. |
| User-definable product families/hierarchy | **Missing.** `category` is one free-text string, no hierarchy. |
| Multi-location inventory | **Missing.** `stock_movements` and `products.stock` are single-location. |
| Full movement vocabulary (transfer/damaged/expired/committed/in-transit) | **Partial.** 5 of ~9 types exist. |
| Inventory forecasting (stockout date, reorder qty, cash required) | **Missing.** `studio/insights` is threshold-based, not predictive. |
| Supplier AI-learned patterns as durable memory | **Missing mechanism**, though `business_facts` is a ready home for it. |
| Purchase orders as a workflow (not just a document type) | **Missing workflow**; the document type already exists. |
| Sales intelligence — co-purchase/cross-sell suggestions in the moment | **Missing.** Data (`contact_products`) exists; no analysis layer. |
| Services module depth (staff assignment, checklists, deliverables) | **Partial.** `service_details JSONB` exists, unstructured. |
| Projects | **Missing entirely.** No table, no concept. |
| Manufacturing / BOM | **Missing entirely.** |
| Operational financial overview | **Missing as a dedicated view**, though the underlying numbers (documents.total_cents, stock_movements, products.purchase_cost) already exist to compute it. |
| "What should I do today" / "why are sales down" reasoning | **Partial.** AI Daily Brief exists for relationships (`RELATIONSHIP_OS_PLAN.md` §Phase-4); no business-equivalent. |
| Conversation → automatic bundle-of-ERP-updates | **Missing.** This is the single biggest gap and the actual differentiator — see §15. |

---

## 4. Target Architecture — The Business Graph

The graph in §2.1 already has the right shape; it's missing three node types and one cross-cutting capability:

```
                              business_profiles (Brand Kit)
                                       │
users ── contacts ── deals ── deal_stage_history
   │         │          │
   │         │          └── documents ── document_events
   │         │
   │         ├── contact_products ──┬── products ── product_attributes (net-new, §5)
   │         │                      │        │            └── product_families (net-new, §5)
   │         │                      │        ├── stock_movements ── inventory_locations (net-new, §7)
   │         │                      │        └── supplier_products (net-new, §8)
   │         │                      │
   │         │                      └── suppliers ── purchase_orders (net-new, §8; reuses `documents`)
   │         │
   │         ├── opportunities
   │         └── projects (net-new, §11) ── project_tasks, linked to documents/products/services
   │
   └── business_facts (rules + learned supplier/customer patterns)
```

No new top-level system is introduced. Projects, product attributes, and locations are new nodes hanging off existing entities (`products`, `contacts`, `suppliers`), not a parallel data model.

---

## 5. Design Decision: Configurable Attributes & Product Families

**✅ Shipped — Phase A** (migration `0056`). See `CLAUDE.md`'s "Business OS Phase A" paragraph.

This is the largest technical departure from what exists, so it gets its own section before the feature-by-feature proposals.

**The problem:** a clothing boutique needs Size/Color/Material/Gender on a product; a spares dealer needs Vehicle/Model/Year/OEM Number; a restaurant needs Prep Time/Ingredients/Calories. None of these should be hardcoded columns, and the business owner (not a developer) needs to define them.

**Options considered:**

1. **Pure EAV** (`product_attributes(product_id, key, value)`): maximally flexible, but loses types (a "Year" range needs different query semantics than a free-text "OEM Number"), and every read requires pivoting rows back into a shape — slow and awkward for the exact "filter/sort by attribute" queries a catalog view needs.
2. **Pure JSONB per product** (dump everything into `products.specs` or the existing `inventory_details`/`service_details`): no schema, so there's nothing to validate against and nothing to build a form-builder UI from — the business owner would just be hand-typing JSON, which contradicts "no code required."
3. **Schema-driven hybrid (recommended):** a small set of new tables that describe *what attributes exist* per product family (the schema), plus JSONB on the product row to hold *this product's values* against that schema. This is the Odoo/Shopify-metafields pattern and is the only option that supports both "no code required" family definition and fast catalog queries.

**Recommended schema (net-new tables):**

```sql
-- The user-definable hierarchy: Electronics > Phones > Android > Samsung > Galaxy A16
CREATE TABLE product_families (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES product_families(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  path          VARCHAR(1000), -- denormalized "Electronics/Phones/Android/Samsung" for fast display + breadcrumb
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- What attributes a family expects (the "schema"). Defined once per family,
-- inherited by every product/variant under it.
CREATE TABLE product_attribute_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id       UUID NOT NULL REFERENCES product_families(id) ON DELETE CASCADE,
  key             VARCHAR(100) NOT NULL,   -- "color", "vehicle_model", "prep_time_minutes"
  label           VARCHAR(255) NOT NULL,   -- "Color", "Vehicle Model", "Prep Time (min)"
  data_type       VARCHAR(20) NOT NULL CHECK (data_type IN ('text', 'number', 'select', 'multiselect', 'boolean', 'date')),
  options         JSONB NOT NULL DEFAULT '[]', -- for select/multiselect: ["Red","Blue","Black"]
  is_variant_axis BOOLEAN NOT NULL DEFAULT FALSE, -- true for "Size"/"Color" — generates variant rows, not just a label
  is_required     BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order      INT NOT NULL DEFAULT 0,
  UNIQUE (family_id, key)
);

-- Values, per product, validated against the definitions above at write time
-- (application-layer validation, not a DB constraint — consistent with how
-- this codebase already validates JSONB shapes elsewhere).
ALTER TABLE products ADD COLUMN family_id UUID REFERENCES product_families(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN attributes JSONB NOT NULL DEFAULT '{}'; -- {"color": "Red", "vehicle_model": "Hilux"}
ALTER TABLE products ADD COLUMN parent_product_id UUID REFERENCES products(id) ON DELETE CASCADE; -- variant → base product
```

Why this over the three JSONB "_details" columns already on `products`: those columns are fine as an escape hatch for module-specific config (they stay), but they're untyped and don't drive a form-builder UI or variant generation. `product_attribute_definitions` is what a "Manage Product Type" screen in Studio reads to render the right form fields and, for `is_variant_axis = true` attributes (Size, Color), to auto-generate one `products` row per combination with `parent_product_id` pointing at the base item — which is also how "Small/Medium/Large" and "128GB/256GB" variants map onto the existing single flat `products` table without a second variants table.

**Not proposed:** a generic form-builder / low-code engine beyond this. The scope is "define attributes and let AI/UI use them," not a full metadata platform.

---

## 6. Catalog Evolution — Item Types Beyond Products

**⏳ Not started.** Not part of the lettered A–H roadmap in §18 and not shipped; revisit when a user asks for bundle/subscription/rental logic specifically.

`item_type` already has `product`/`service`/`bundle`/`subscription`/`package`/`digital_product` (0049) — **extends**, not net-new. What's missing is that today only `product` and `service` have any real UI/logic behind them. Proposed order of build-out (each reuses the same `products` row + `item_type` discriminator, not a new table per type):
- **Bundles**: `pricing_details.bundle_components: [{product_id, quantity}]` — selling a bundle decrements each component via `stock_movements` (same mechanism as BOM in §12, smaller scope).
- **Subscriptions/Memberships**: recurring documents (already shipped, `recurring_documents` from Business Workspace Phase 3) generate the periodic invoice; `products.pricing_details.billing_interval` drives the schedule.
- **Courses/Digital Products**: no inventory dimension at all — `available` is meaningless, `stock`/`reserved` should be hidden in the UI when `item_type` has no physical stock.
- **Rental Items/Assets**: needs a `rental_details.rented_until` concept and a stock state of "out on rental" distinct from "sold" — smallest net-new piece here, deferred to a later phase since no user has asked for it yet.

---

## 7. Inventory 2.0 — Multi-Location + Full Movement + Forecasting

**✅ Shipped** — §7.1/§7.2 (locations + movement vocabulary) as **Phase C** (migration `0058`); §7.3 (forecasting) as **Phase G** (migration `0061`). See `CLAUDE.md`'s "Business OS Phase C"/"Phase G" paragraphs.

**Extends** `stock_movements` (0055) and `products.stock/reserved/available/minimum_stock/maximum_stock`.

**7.1 Locations (net-new):**
```sql
CREATE TABLE inventory_locations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL,   -- "Main Shop", "Warehouse", "Truck 1"
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_stock_by_location (
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  stock       INT NOT NULL DEFAULT 0,
  reserved    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, location_id)
);
```
`products.stock`/`.reserved`/`.available` become the cross-location sum (kept in sync at the API layer on every movement, the same "denormalized cache kept in sync by the API layer, not a trigger" convention `deals.pipeline_stage` already established). Single-location businesses (the common case) never see a location picker — default to one auto-created "Main" location so this is additive, not a UX tax on day-one users.

**7.2 Movement type vocabulary (extends the enum):** add `transfer` (between locations, writes two linked rows), `expired`, `committed` (reserved against an open deal/quotation, not yet shipped), `in_transit`. `damaged` already exists as `waste` — rename is not worth a migration; document the mapping instead (`waste` covers both "waste" and "damaged" for now).

**7.3 Forecasting (net-new, intelligence-service work, not a new table):** a scheduled job (same pattern as `clock_engine.py`'s relationship clocks) computes, per product: sales velocity from `stock_movements` where `movement_type = 'sale'` over a trailing window, compares to `available` and `supplier_lead_time`, and writes results into a new lightweight `inventory_forecasts` table (`product_id`, `expected_stockout_date`, `recommended_order_qty`, `recommended_order_date`, `cash_required`, `computed_at`) that `studio/insights` reads instead of raw SQL thresholds for the "will stock out this week" class of insight. Explicitly deferred to a later phase (§18) — needs real sales history to be useful, so it's low-value until a business has 2-3 months of `stock_movements` data.

---

## 8. Supplier Intelligence & Purchase Orders

**✅ Shipped — Phase B** (migration `0057`): §8.2 (`supplier_products` pricing) and §8.3 (purchase order workflow). **⏳ Not started:** §8.1 (supplier-learned patterns → `business_facts`) — no detector for supplier-conversation facts has been built yet. See `CLAUDE.md`'s "Business OS Phase B" paragraph.

**Extends** `suppliers` (0049) and `business_facts` (0029); **reuses** `documents.document_type = 'purchase_order'` rather than a new table.

**8.1 Supplier-learned patterns → `business_facts`:** extend the analysis pass that already writes `business_rule`/`objection` facts from conversations to also fire on supplier-conversations (WhatsApp threads where the contact matches a `suppliers.whatsapp`/`phone`), writing facts like `category: 'supplier'`, `fact_key: 'delivery_pattern'`, `fact_value: 'Usually delivers 2-3 days late on Tuesday orders'`. This is a new detector, not a new storage mechanism — `business_facts` already supports arbitrary category/key/value with confidence and source.

**8.2 Per-product supplier pricing (net-new, small):**
```sql
CREATE TABLE supplier_products (
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cost            DECIMAL(12,2),
  lead_time_days  INT,
  minimum_qty     INT,
  PRIMARY KEY (supplier_id, product_id)
);
```
Needed because a product can have more than one supplier at different costs — today `products.supplier_id` is a single FK, which can't express that.

**8.3 Purchase order workflow:** when `studio/insights`' low-stock check fires (or the forecast in §7.3 predicts a stockout), the AI Advisor proposes a `generate_document` action with `document_type: 'purchase_order'`, pre-filled from `supplier_products` (cheapest/fastest supplier for the low-stock item) and the recommended quantity. One-tap approve creates the document (existing pipeline) **and** writes a `stock_movements` row with `movement_type = 'in_transit'` (§7.2) so the "incoming" number in inventory reflects the order immediately, not just on delivery. On the supplier marking it delivered (or the user confirming receipt), a `restock` movement closes the loop. This is the first concrete instance of "AI proposes a bundle of actions across two tables" that §15 needs — worth building early since it's a small, well-scoped version of the pattern.

---

## 9. Sales Intelligence

**✅ Shipped — Phase D** (no schema change). See `CLAUDE.md`'s "Business OS Phase D" paragraph.

**Extends** `contact_products` (0039) and `deals.product_ids` — the data already exists; this is an analysis layer, not new storage.

- **Co-purchase suggestion:** a query over `contact_products WHERE relation_type = 'purchased'` grouped by `contact_id`, intersected across contacts, surfaces "customers who bought X also bought Y within N days" — computed on demand (or cached, if slow) when the AI Advisor or a reply-draft mentions product X, following the existing "Catalog items... Format the matching items" injection pattern already in `reply_gen.py` (per `STUDIO_ERP_PLAN.md` §4.1).
- **Most profitable / highest-velocity products, average order size:** all derivable from `contact_products` + `products.selling_price/purchase_cost` + `stock_movements` — a `studio/insights` addition, not a schema change.
- **Lost/upsell/cross-sell opportunities:** reuses `products.cross_sell`/`.upsell` JSONB (already exist, currently unused by any UI) — surfacing them is a frontend task, not a backend one.

---

## 10. Services Module

**⏳ Not started** — not part of the lettered A–H roadmap in §18; blocked on the multi-seat-accounts decision in §19.1.

**Extends** `products.item_type = 'service'` and the existing `service_details JSONB` escape hatch, formalized via the attribute-definitions design in §5 rather than a bespoke services table: a "Service" family ships as a system-seeded `product_family` with attribute definitions for Duration, Requirements, Assigned Staff, Deliverables, Required Skills, Location, Travel, Recurring, Booking Required. Staff assignment needs a `product_service_assignments(product_id, staff_user_id)` join if/when team seats exist (today Zuri is single-user per account — this is explicitly deferred until multi-seat accounts are real, tracked as an open decision in §19, not built speculatively now per this codebase's own "don't design for hypothetical future requirements" convention).

---

## 11. Projects Module (net-new)

**✅ Shipped — Phase F** (migration `0060`). See `CLAUDE.md`'s "Business OS Phase F" paragraph.

The one genuinely new top-level entity in this plan besides attributes/locations.

```sql
CREATE TABLE projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id    UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id       UUID REFERENCES deals(id) ON DELETE SET NULL,
  title         VARCHAR(255) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),
  start_date    DATE,
  due_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')),
  due_date    DATE,
  assigned_to VARCHAR(255), -- free text until multi-seat accounts exist (see §10, §19)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`documents.deal_id` already exists, so linking a project's invoices/quotations is `documents.deal_id = projects.deal_id` — no new FK needed on `documents`. Deliberately lightweight (two tables, no Gantt/dependency graph) — matches the user's own framing, "lightweight ERP project management," not a project-management product. The "AI Project Manager" morning-update behavior (task overdue, project behind schedule, quotation unapproved, invoice unpaid) is a query layer over existing signals (`project_tasks.due_date` vs today, `documents.status`) surfaced through the existing AI Daily Brief mechanism (`RELATIONSHIP_OS_PLAN.md` Phase 4) rather than a new notification system.

---

## 12. Manufacturing / BOM

**⏳ Not started — Phase H.** Explicitly the lowest-priority item in this plan — the user framed it as "eventually." Minimal viable design when it's time:

```sql
CREATE TABLE product_bom_components (
  product_id           UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE, -- the assembled item
  component_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE, -- a raw material, itself a product row
  quantity_required    DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (product_id, component_product_id)
);
```
Selling the assembled product writes one `stock_movements` row per component (`movement_type = 'sale'`, `reason = 'BOM component for <assembled product>'`) in addition to the assembled product's own movement. No separate "manufacturing run" concept for v1 — assembly is assumed instantaneous at time of sale, which covers the "Dining Table = Wood+Glue+Screws+Varnish" example exactly. Do not build until a real user asks for it.

---

## 13. Operational Financial Overview (net-new view, no new core tables)

**✅ Shipped — Phase G** (`GET /api/studio/financial-overview`). See `CLAUDE.md`'s "Business OS Phase G" paragraph. The expenses question below was resolved: it reuses the `expense_claim` document type (a soft note until that type is actually in use), not a new `expenses` table.

Explicitly *not* accounting (no ledger, no double-entry, no chart of accounts) — a rollup view over data that already exists:
- Revenue / Cash Collected / Outstanding → `SUM(documents.total_cents)` grouped by `status IN ('paid')` vs `sent/viewed` for `document_type = 'invoice'`.
- Inventory Value → already computed in `studio/insights` (`SUM(available * purchase_cost)`).
- Purchases → `SUM` of `restock`-type `stock_movements` valued at `purchase_cost`, or `purchase_order` documents once §8.3 ships.
- Margins → already stored per-product (`products.margin`); rollup is an aggregate, not new storage.
- Expenses → the one genuinely missing input. Either a minimal `expenses(user_id, category, amount_cents, occurred_at, note)` table, or reuse the already-defined-but-unbuilt `expense_claim` document type (`documents.document_type` check constraint already includes it) — recommend the latter to avoid a parallel ledger, deferred to when this section is actually scheduled.

---

## 14. The AI Business Assistant

**⏳ Not started.** `studio_ask` itself gained context/action-instruction wiring as part of earlier Studio Advisor work, but the two specific entry points below ("What should I do today?" and "Why are sales down?") have not been built.

Two conversational entry points, both extending `studio_ask` (§2.8) rather than new endpoints:

- **"What should I do today?"** — a business-scoped equivalent of the AI Daily Brief: query low stock (`studio/insights`), open opportunities (`opportunities` table), overdue invoices (`documents.status = 'sent' AND due < now`), stalled deals (`deal_stage_history`), upcoming contact life events/birthdays (`contact_life_events`, `events`), and recent campaign performance (`content_generations`/social posts, already surfaced in Analytics) into one prioritized list. This is a synthesis query over five tables that all already exist — no new storage.
- **"Why are sales down?"** — genuinely harder: requires the model to correlate a revenue dip (from §13) against inventory gaps (stockout dates from §7.3 or simple `stock_movements` gaps), pricing changes, and marketing activity dips in the same window, then narrate the correlation. Start narrow (correlate revenue vs. stockout days only, since that's the user's own worked example) and widen once that's validated, rather than building a general causal-inference engine up front.

---

## 15. The Conversation-to-Automation Loop

**✅ Shipped — Phase E** (migration `0059`). See `CLAUDE.md`'s "Business OS Phase E" paragraph.

This is the actual differentiator and the hardest piece to build well — everything above is infrastructure this loop consumes.

**Target flow:** a WhatsApp message ("I'd like 10 uniforms") arrives → the existing message-analysis pass (`message_worker.py`, already runs on every non-group message) gets a new detection pass that recognizes a **transactional intent** (order/sale/quantity + product reference), not just sentiment/opportunity signals it already extracts → on a hit, it assembles a *bundle proposal*: create/update opportunity or deal, check stock against `products.available`, reserve inventory (a `committed` stock movement, §7.2), draft a quotation or invoice (existing `POST /api/documents/ai-generate`), suggest a delivery date, create a follow-up reminder (existing calendar events), flag a restock if this pushes the product below `minimum_stock` (existing `studio/insights` threshold) → the whole bundle is presented as **one** approval card, not five separate `[ACTION: ...]` tags.

**Why this needs new plumbing, not just more actions:** §2.9 established that the tag system is one-action-per-tag inside a chat reply, and it only fires when a user is actively chatting with the Advisor — it doesn't run passively over an ordinary customer conversation. This flow needs to fire from the passive analysis pipeline (`message_worker.py`) the same way `opportunities` detection already does, but produce a *multi-action bundle* object rather than a single insight row.

**Proposed mechanism (net-new, small): `action_bundles` table**, decoupled from both existing mechanisms so either can render it:
```sql
CREATE TABLE action_bundles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id    UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  summary       TEXT NOT NULL,          -- "Detected sale of 3 Samsung A16 to Peter"
  actions       JSONB NOT NULL,         -- ordered array of the same {type, params} shape [ACTION] tags already use
  status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'partially_approved', 'dismissed', 'expired')),
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);
```
Reusing the `{type, params}` action shape from the existing tag system means `handleChatAction`'s dispatch logic in the frontend is reused as-is for each action inside the bundle — the new work is (a) the detector that writes rows here, (b) a bundle-approval card in the Inbox (parallel to the existing single-action card `intel-panel.tsx` already renders), and (c) an "approve all" / "approve some" flow. This is the single most valuable and most involved item in this entire plan — everything else is either already-shipped-and-needs-extending or comparatively mechanical CRUD.

---

## 16. Which Action Mechanism Powers What — Decision

- **`[ACTION: ...]` tags** stay the mechanism for anything rendered inside an active chat (Advisor, Studio Advisor, per-document chat) — single action, user is already mid-conversation, confirm-before-execute fits.
- **`action_bundles` (§15, net-new)** is the mechanism for passive detection over ordinary customer conversations — multi-action, no user currently chatting with the AI, needs its own inbox surface.
- **`agent_engine.py`'s tool dispatch** stays scoped to the Autonomous Agent Engine only (agent-assigned conversations, trust-level-gated auto-execution) — not extended to power this loop, since mixing "passive detection bundle" semantics into an engine designed for "AI is the one actively replying" would conflate two different trust models.

---

## 17. Tier Gating

Everything in this plan is Business+ tier, consistent with Studio already being gated behind `marketing_access` (`FeatureGate modes={['business','hybrid']}`) and `docs/PRODUCT_VISION.md`'s Personal vs. Business+ split. No change to gating conventions — new Studio tabs/features simply live behind the same gate Studio itself already uses.

---

## 18. Phased Roadmap

| Phase | Scope | Depends on | Status |
|---|---|---|---|
| **A** | Product families + attribute definitions (§5) — schema + "Manage Product Type" UI + variant generation | Nothing new; extends `products` | ✅ Shipped (migration `0056`) |
| **B** | Purchase order workflow (§8.3) + supplier-products pricing (§8.2) | Phase A not required, can ship in parallel | ✅ Shipped (migration `0057`) — §8.1 supplier-fact detection not built |
| **C** | Multi-location inventory (§7.1) + expanded movement vocabulary (§7.2) | Phase A not required | ✅ Shipped (migration `0058`) |
| **D** | Sales intelligence surfacing — co-purchase, cross-sell/upsell UI (§9) | None (data already exists) | ✅ Shipped (no schema change) |
| **E** | `action_bundles` + transactional-intent detector + Inbox bundle-approval card (§15) — **the core differentiator, highest priority despite being listed after the infra phases** | Benefits from Phase A/B/C existing but can ship a v1 against today's flat schema and be widened later | ✅ Shipped (migration `0059`) |
| **F** | Projects module (§11) + AI Project Manager brief | None | ✅ Shipped (migration `0060`) |
| **G** | Inventory forecasting (§7.3) + operational financial overview (§13) | Needs 2-3 months of real `stock_movements` history to be useful — sequence last on purpose | ✅ Shipped (migration `0061`) — forecast quality still pending real sales history |
| **H** | Manufacturing/BOM (§12) | Build only when a real user asks | ⏳ Not started |

Unlettered items still open: §6 (catalog item types beyond product/service — bundles, subscriptions, rentals), §10 (Services module — blocked on multi-seat accounts), §14 (the two AI Business Assistant chat entry points).

Recommended actual build order deviates from the table's top-to-bottom listing: **E should start as soon as Phase B or C gives it a first concrete instance to model against** (the purchase-order proposal in §8.3 is explicitly designed as a small rehearsal of the bundle pattern) — don't wait for every infra phase to finish before starting the differentiator.

---

## 19. Open Decisions

1. **Multi-seat accounts.** Several sections above (staff assignment in Services §10, `assigned_to` in Projects §11) punt on "who is a staff member" because Zuri is currently single-user-per-account. Needs a product decision (not just engineering) before those features can be more than a free-text field.
2. **Forecasting model complexity.** §7.3 proposes a simple trailing-sales-velocity model. Whether to invest in something more sophisticated (seasonality decomposition, etc.) should wait for evidence that the simple version is insufficient.
3. **`waste` vs `damaged` movement types.** §7.2 recommends not splitting them to avoid a data migration; revisit if users actually ask to distinguish "damaged" from "wasted" in reporting.
4. **Expenses storage.** ✅ Resolved as part of Phase G: reuses the `expense_claim` document type rather than a dedicated `expenses` table, surfaced as a soft note in the financial overview until that document type is actually in use.
5. **How aggressively `action_bundles` auto-executes vs. always requires approval.** Shipped with Phase E as always-requires-approval — no trust-level dial for bundles exists yet. Still open: whether to add an Observe→Autonomous-style dial (analogous to the Autonomous Agent Engine's) scoped to inventory/document actions specifically, once there's evidence users want less manual approval.
