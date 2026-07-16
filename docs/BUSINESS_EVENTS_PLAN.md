# Business Events, Customer Management & the Business Manager Assistant

## 0. Why This Doc Exists

Zuri already extracts structured business signals from ordinary WhatsApp conversations — one LLM call per live message (`MessageAnalysis`) already detects products mentioned, order intent, business facts, opportunities, connections, life events, promises, and calendar events. What it doesn't yet do: treat every detection as part of one durable, generic event log; propose *new* catalog entries (products, suppliers) from a conversation with approval; bundle multiple co-occurring detections into a single approval instead of asking one question at a time; explain its own confidence; or proactively nudge a user toward basic business hygiene (an invoice for completed work) the way it already proactively nudges toward relationship hygiene (a stale follow-up).

This doc designs the architectural spine for all of that — **Business Events** (a generic detection log), a generalization of the existing `action_bundles` approval mechanism to consume it, a Customer Management view in Studio that reuses the existing `contacts.customer_status` vocabulary rather than inventing a parallel entity, a widened product lifecycle (so a one-off item a business sourced for a single job can be recorded without cluttering the main catalog), and a Business Manager Assistant that is one more toggleable proactive layer alongside the ones that already exist (Curiosity Layer, Gossip Detector, Advisor Companion). Nothing here is a rewrite; every part reuses a mechanism this codebase already has and extends it.

A deliberately large brainstorm (product/service intelligence, an assets register, expense/payment detection, a ten-stage progressive-formalization journey, a generic condition→action automation engine) is written up in §9 as roadmap, not built here — same discipline `docs/SERVICES_PROJECTS_PLAN.md` Part D already applies to teams/risk-register/dependency-graphs.

---

## 1. Current State (confirmed by reading the code, not assumed)

- **`MessageAnalysis`** (`services/intelligence/app/models.py`) is the *existing* Business Knowledge Extraction engine — one LLM call per live message already returns `products_mentioned`, `order_intent_mentioned`, `business_facts_mentioned`, `opportunities_mentioned`, `connections_mentioned`, `life_events_mentioned`, `promises_detected`, `events_detected`. Crucially: `products_mentioned` (`ProductMention`) is resolved against the existing catalog by name match, and an **unmatched mention is silently dropped** — there is no path today from "customer/business mentions a product not in the catalog" to a proposal to add it.
- **`action_bundles`** (migration `0059`, `services/intelligence/app/services/action_bundles.py`) already is "detect → bundle related actions → one approval card → dependency-ordered execution": `ActionBundleService.detect_and_create` reads `order_intent_mentioned` only, resolves matched products, and writes one row with an `actions` JSONB array (`{type, params, dependsOn?}`) that `apps/web/.../inbox/_components/action-bundle-card.tsx` renders and executes via `apps/web/src/lib/action-executor.ts`. It dedupes a pending bundle per contact within a 60-minute window. There is no `confidence`/`evidence` field on the bundle or any action today — only a free-text `summary`.
- **`contacts.customer_status`** (migration `0021`) is `VARCHAR(50) DEFAULT 'contact'`, no CHECK constraint, with the vocabulary `contact|lead|prospect|customer` already established and filtered on in `services/api/src/routes/leads.ts:48`. "Customer" is not a new entity — it's an existing status value with no dedicated commercial view.
- **`revenue_events`** (migration `0018`, indexed per-contact by migration `0040`) already has a proven per-contact LATERAL aggregation pattern in `services/api/src/routes/relationships.ts:30-33`. **No existing query** sums `documents.total_cents` per `contact_id` by paid/outstanding status — `GET /api/studio/financial-overview` (`studio.ts:192-199`) does this fleet-wide only.
- **`contact_products`** (migration `0039`) tracks `relation_type` (`purchased|interested|quoted|recommended|mentioned`), `quantity`, `replacement_predicted_at` — no monetary amount column (value must come from joining `products.price`). Already joined for per-contact purchase history in `services/api/src/routes/contacts.ts:265-276`.
- **`products.status`** (migration `0031`) is `active|sold|archived` — confirmed via grep that `'sold'` is dead (only referenced in a Zod enum in `products.ts:71`, never queried against anywhere in the ERP logic). No "hidden"/"secondary"/"draft" concept exists.
- **`advisor_user_profiles.companion_features_paused`** (Advisor Companion Plan Phase 0) defaults to `false` — meaning every proactive companion feature (Curiosity Layer, Gossip Detector, Interest Companion, Spiritual Companion, Motivational Detector) is **on by default** and gated by one honest kill switch checked at the top of each cron. This is the exact precedent for a Business Manager toggle — same table, same shape.
- **`daily_worker.py`** already runs 15+ staggered daily/weekly schedulers (00:00 through 17:00 UTC), each a small class + `Queue`/`Worker` pair + a `run_..._scheduler()` sleep-until-next-run loop — the exact shape a new Business Manager cron follows.
- **Studio's `MODULES`/`Module`/`renderModule`** (`apps/web/.../studio/page.tsx`) is a proven 3-line-diff pattern for adding a new tab, most recently used to add the Services tab this same session.
- **File size**: `studio/page.tsx` is ~5,000 lines — the newly-added CLAUDE.md "File Architecture" section calls for new modules to live in their own files under `studio/_components/`, and for modules touched by unrelated work to be extracted as the file is touched. This plan is the first real test of that rule.

---

## 2. Philosophy

Zuri should not wait to be told what happened in a business — it should notice, on its own, in the background, using the same single analysis pass it already runs on every message, and it should say what it noticed and why before acting. A "product" is not a fixed catalog row decided once at onboarding; it's a knowledge asset that can start as an offhand mention in a chat, sit quietly as a record nobody else needs to see, and only later become a first-class catalog item if the business actually starts selling it more broadly. And formal business hygiene — invoices, records, structure — should be something Zuri gently nudges toward by default, the same way it already nudges toward keeping in touch with a contact, not something the user has to remember to ask for.

---

## 3. Business Events: the generic detection log

A `business_events` row is written for *every* detected signal, regardless of whether it becomes a user-facing action — this is what makes extraction feel continuous rather than a one-shot chat trick, and it gives Studio something concrete to show ("Zuri noticed 6 things this week", §7).

```sql
CREATE TABLE business_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type      VARCHAR(40) NOT NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id      UUID REFERENCES messages(id) ON DELETE SET NULL,
  confidence      NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  evidence        JSONB NOT NULL DEFAULT '[]',
  payload         JSONB NOT NULL DEFAULT '{}',
  bundle_id       UUID REFERENCES action_bundles(id) ON DELETE SET NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'bundled', 'dismissed', 'expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_business_events_user_status ON business_events(user_id, status);
CREATE INDEX idx_business_events_contact ON business_events(contact_id) WHERE contact_id IS NOT NULL;
```

Named `business_events`, not "business intelligence events" — this codebase already ships a "Business Intelligence & Executive Intelligence Platform" (Phase 9, the analytics dashboards); reusing that name for an unrelated detection log would collide. The conceptual name stays "Business Intelligence Events" in prose/UI copy; the table/service name is shorter.

`services/intelligence/app/services/business_events.py` (new, ~40 lines, mirrors `action_bundles.py`'s size/shape): `BusinessEventService.record(user_id, event_type, contact_id, conversation_id, message_id, confidence, evidence, payload) -> event_id`. Pure insert, no side effects.

---

## 4. New detectors on the existing `MessageAnalysis` call

Two new mention lists added to `services/intelligence/app/models.py`'s `MessageAnalysis` (not four — expense/payment detection is §9, deferred, since it needs its own storage-shape decision first):

```python
class NewProductMention(BaseModel):
    """A product/service mentioned that does NOT match anything in the
    catalog — ProductMention silently drops these today; this is the
    'create a product from chat, with approval' signal."""
    name: str
    category: str | None = None
    estimated_price: float | None = None
    currency: str | None = None
    is_one_off: bool = False
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    evidence: str = ''

class SupplierMention(BaseModel):
    """'I bought this from ABC Auto Parts' — a supplier not in suppliers."""
    company: str
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    evidence: str = ''
```

`new_products_mentioned: list[NewProductMention]` and `suppliers_mentioned: list[SupplierMention]` added to `MessageAnalysis`. `ANALYSE_MESSAGE` (`services/intelligence/app/ai/prompts.py`) gets instructions for both, matching the existing `order_intent_mentioned` instructions' narrowness (only a live, explicit mention with real specificity — not a hypothetical or price-comparison question — same "narrower than products_mentioned" discipline `order_intent_mentioned` already documents).

`CustomerMention` is deliberately **not** a new LLM field — flipping `customer_status` to `'customer'` is driven by the *existing* `order_intent_mentioned`/`ProductMention(relation_type='purchased')` signals already firing today (§6), not a separate detector.

---

## 5. Generalizing `action_bundles` — bundling, new action types, confidence

`ActionBundleService.detect_and_create` is extended in place to also accept `new_products_mentioned` and `suppliers_mentioned` from the same call site in `message_worker.py` (`workers/message_worker.py:146-148`, right where `order_intent_mentioned` is dispatched today). For each detection above the existing `_MIN_CONFIDENCE` threshold:

1. `BusinessEventService.record(...)` — unconditionally, for the audit trail.
2. Fold into the **same** bundle being assembled for that message if one is already in progress this pass — one message mentioning a new product, a new supplier, and an order produces ONE `action_bundles` row with `create_product`, `create_supplier`, `create_deal`, `reserve_stock`, `generate_document` actions, `dependsOn`-ordered exactly like the existing Neural Layer Phase 6 dependency chain already supports. This directly answers "don't ask one question at a time" — bundling happens at detection time, not as a UI grouping trick.
3. Set `business_events.bundle_id` / `status='bundled'` once folded in.

**New action types** `create_product` and `create_supplier`:
- `apps/web/src/lib/action-executor.ts`'s `BundleAction['type']` union gains both; `actionLabel()` gets a label case for each; `executeAction()` calls `POST /api/products` / `POST /api/suppliers` respectively — both endpoints already exist, no new API surface for the create call itself.
- `action_bundles.actions` JSONB shape is unchanged (`{type, params, dependsOn?}`) — no schema migration needed there.
- `create_product`'s params always propose `status: 'secondary'` (§6) — a chat-detected product never lands directly in the main catalog.

**Confidence + evidence**: `action_bundles` gains `confidence NUMERIC(3,2)` and `evidence JSONB DEFAULT '[]'` columns (min/average of the contributing events' confidence; evidence = the concatenated per-event evidence strings). `GET /api/action-bundles` (`services/api/src/routes/action-bundles.ts`) returns them; `ActionBundleCard`'s header block (`action-bundle-card.tsx:116-130`) renders a small "X% confident — because: ..." line using fields already there, no new component.

---

## 6. Product lifecycle + Customer Management (Studio)

**Product lifecycle** — `products.status` CHECK widens from `active|sold|archived` to `active|secondary|archived|discontinued` (`'sold'` backfilled to `'archived'` — confirmed dead, nothing queries it). `secondary` is the "mechanic's one-off spare part" state: fully recorded (supplier, cost, price, and — via `contact_products` — who it was sold to) but excluded from the Catalog tab's default grid, exactly the record-without-cluttering behavior asked for. `discontinued` is new: distinct from `archived` (hidden/old data) — "no longer available, keep the history for reporting."

- `services/api/src/routes/products.ts`: widen the Zod status enum; `GET /api/products` default-excludes `secondary` unless `?includeSecondary=true` is passed (mirrors the existing `status != 'archived'` default exclusion).
- Catalog tab (`CatalogModule`, extracted to `studio/_components/catalog-module.tsx` as part of this work): a "Show secondary items (N)" toggle next to the filter-pill row; a violet "secondary" badge on cards in that state (matching the Services tab's palette); a one-click "Promote to active" action (`PATCH {status:'active'}`, no new endpoint).
- Chat-detected products (§5's `create_product` action) always insert `status='secondary', trackInventory=false` — the AI's own proposal starts conservative.

**Customer Management** — **not** a new table. `contacts.customer_status='customer'` is already the entity; this is a Studio-side commercial lens over the same row — the same "siblings, not parallel schemas" discipline `docs/SERVICES_PROJECTS_PLAN.md` already applies to products/services. New Studio tab `'customers'` added via the exact `Module` union / `MODULES` array / `renderModule` switch pattern the Services tab used.

`GET /api/studio/customers` (`studio.ts`), one row per `customer_status='customer'` contact:
- **Lifetime value**: the proven `revenue_events` per-contact LATERAL pattern (`relationships.ts:30-33`) plus a new per-contact sum of `documents` where `document_type='invoice' AND status='paid'` (new SQL, modeled on the fleet-wide `financial-overview` query at `studio.ts:192-199` but `GROUP BY contact_id`).
- **Outstanding balance**: same `documents` join, `status IN ('sent','viewed','downloaded')`.
- **Purchase history**: the existing `contact_products` ⋈ `products` join already used in `contacts.ts:265-276`, reused as-is.
- **Last purchase**: `MAX` of `contact_products.created_at` / paid-invoice `created_at`.
- **Tier**: computed on read (`gold`/`silver`/`bronze` by LTV threshold) — not stored; this is a handful of rows per page load, not a hot path, so compute-on-read is correct here without a new column.
- **At-risk**: reuse `relationships.health_trend='declining'`, already computed.

`CustomersModule` lives in its own file, `studio/_components/customers-module.tsx` — the first concrete application of the new CLAUDE.md File Architecture rule. `ServicesModule` (added earlier, still inline) is extracted to its own file in the same pass, chipping away at `studio/page.tsx`'s size while it's already being touched for the new tab.

---

## 7. Studio Overview: a "Zuri Noticed" activity feed

`GET /api/studio/insights` gains a `recentEvents` array — the last ~10 `business_events` rows for the user, chronological — rather than a new endpoint (same "extend the existing insights payload" convention `stockoutForecasts`/`topProfitable` etc. already follow). A compact new card on `OverviewModule`, alongside the existing Zuri Insights cards, renders them ("Detected new product: Toyota Brake Pad — 82% confident", "New supplier: ABC Auto Parts") with a link to the pending Action Bundle when `status='bundled'`.

---

## 8. Business Manager Assistant

A proactive, toggleable, system-wide nudge layer — not a new detection or delivery mechanism.

- **Toggle**: `advisor_user_profiles.business_manager_paused BOOLEAN NOT NULL DEFAULT FALSE` — same table, same "paused=false means on by default" precedent as `companion_features_paused`. Exposed via the existing `GET/PATCH /api/advisor/profile` route — one new field, no new endpoint. A labeled switch in Settings (or Studio settings), on by default.
- **Delivery**: the existing `proactive_queue` dock (same as `document_followups.py`/`project_progress.py`) for anything needing an approvable draft, and `companion_delivery.py`'s `deliver_initiated_message()` for anything reading better as an Advisor chat message. No new UI surface.
- **Phase 1 ships one concrete behavior**, deliberately narrow: `services/intelligence/app/services/business_manager.py`, cloning `project_progress.py`'s exact shape (plain SQL, `try_consume_credit(..., 'nudge')`, deduped via a marker) — **"completed work, no invoice"**: a project crossing the same ≥75% task-completion threshold `project_progress.py` already tracks, or a `deals.stage='closed_won'`, with no `invoice`/`quotation` document linked to that contact/project in the last N days, and `business_manager_paused=false`. Surfaces as "You completed this — want me to draft an invoice?" in `proactive_queue`. Wired into `daily_worker.py`/`main.py` at 18:00 UTC, the next free slot after Project Management's 17:00.

This ships the *pattern* end-to-end — toggle → detector → proactive_queue draft — so every other Business Manager behavior from the brainstorm (stale-supplier comparison, "this customer became a top client," a project with no deadline) is a same-shaped follow-on cron once this exists, not a redesign.

---

## 9. Deferred roadmap (documented, not built this pass)

- **Expense & payment detection** — needs a storage-shape decision first: a new lightweight `expense_entries` table vs. reusing the already-defined-but-unused `expense_claim` document type (the Operational Financial Overview's own prior note already flags this as the one deliberately-deferred input).
- **Assets register** — a new `company_assets` table for equipment/vehicles/tools mentioned in chat; out of scope until requested.
- **Full progressive-formalization staged UI** — a ten-stage visual onboarding journey. §7's "Zuri Noticed" feed is the honest, lightweight version; a dedicated staged-journey UI is its own design exercise.
- **Deep product/service intelligence** (seasonality, frequently-paired-item forecasting, replacement-interval-driven demand prediction) — partially covered already by co-purchases/`contact_products.replacement_predicted_at`; further depth is a separate effort.
- **Generic condition→action Automation Engine** — already explicitly deferred in `docs/SERVICES_PROJECTS_PLAN.md` Part D; stays deferred. §8's shipped behavior is a hardcoded check, same reasoning as `project_progress.py`.
- **Broader Business Manager behavior library** — every other brainstormed nudge ships incrementally as its own small cron reusing §8's toggle, once it exists.
- **Contractor/one-off supplier pricing**, multi-location secondary-item tracking, and per-event notification preferences (e.g. muting `business_events` by type) are all reasonable follow-ons once real usage shows which event types are noisy.

---

## Rollout Order

1. This doc.
2. Migration: `business_events` table, `action_bundles.confidence`/`evidence` columns, `products.status` CHECK widen + `'sold'`→`'archived'` backfill, `advisor_user_profiles.business_manager_paused`.
3. `models.py`/`prompts.py` new detectors.
4. `business_events.py`; generalized `action_bundles.py`; `message_worker.py` wiring; `action-executor.ts`/`action_bundles.ts`/`ActionBundleCard` extensions.
5. `products.ts` status widen; `CatalogModule` extraction + secondary-item UI; `GET /api/studio/customers`; `CustomersModule` + Studio tab wiring; `ServicesModule` extraction.
6. `business_manager.py` + scheduler; `advisor.ts` field; Settings toggle UI.
7. `recentEvents` + Overview activity card.
8. `CLAUDE.md` documentation section; commit; push to `main`.
