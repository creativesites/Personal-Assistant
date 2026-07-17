# Zuri Platform Polish — One Mind, Not Fifteen Engines

## 0. Why This Doc Exists

Zuri now has ~15 independently-shipped intelligence engines (Reality Engine, Business Manager, Career Coach, Curiosity Layer, Gossip Detector, Reflection, and more — see `CLAUDE.md`), each correctly built and individually tested. The founder's own framing, verbatim: *"I think Zuri is reaching a point where you should stop thinking in terms of adding more features and start thinking in terms of making every feature participate in the same intelligence system."* This doc is the audit-backed response — not a new engine, but the pass that makes the existing ones behave like one mind before production launch.

Six parallel audits (full codebase reads, not CLAUDE.md prose) confirmed the founder's instinct with hard evidence:

- **Reconciliation is real but partial.** Reminders genuinely self-heal (`reality_engine.py`'s event-driven resolve + daily sweep). But `context_snapshots` — the schema's own documented "compressed relationship summary" mechanism — is dead code (`proactive.py:95-97` admits this directly: "defined in schema, never written by any code, so this always fell back to..."). `business_facts`/`contact_insights` confidence only ever rises (`business_facts.py:71`, `min(MAX, existing+STEP)`) with no decay counterpart, unlike `advisor_memories`, which already has one (`advisor_memory_learner.py`). `opportunities.expires_at`/`churn_risk` rows are advisory-only — nothing closes them. `inventory_forecasts` rows for products that stop selling never expire.
- **The intelligence layer is fragmented, not unified.** `memory/retrieval_service.py` — the one real shared-context abstraction — is imported by only 5 of 59 service files. Studio's `studio_ask`, Advisor's `handle_turn`, and Career's 14 task endpoints are three independent prompt-assembly implementations sharing zero code. Relationship-health lookups are hand-written from scratch in 8 separate files; contact-identity resolution in 13+.
- **The connect-the-dots chain has one big hole.** `deals.ts`'s `closed_won` transition today does exactly two things — `recordWonRevenue()` and `resolveInvoiceGapNudges()` — and nothing else. No project, no stock reservation, no calendar milestone. Invoice-paid never suggests advancing the deal (Reality Engine's hourly sweep already *detects* `contradiction_invoice_paid_deal_open`, it just never surfaces it as an action).
- **Invisible intelligence is mostly already right.** `reality.resolved`, `advisor.narration_ready`, and `suggestion:ready` are all silently handled by the frontend today — no toast, no celebration library exists anywhere in the repo. The one violation: `bundle:ready` fires an unconditional toast for every detected bundle regardless of confidence. The deeper gap is structural — zero of the three approval gates (`action_bundles`, `advisor_action_requests`, `proactive_queue`) has any confidence- or reversibility-based bypass; a 95%-confidence reversible action gets the same manual click as a 40%-confidence one.
- **Business Manager is one detector wearing a big coat.** `business_manager.py` ships exactly one behavior (invoice-gap). Of 14 founder-named behaviors, 4 exist elsewhere but scattered across ungated files (`business_manager_paused` doesn't gate `document_followups.py`, `project_progress.py`, or `clock_engine.py`), 7 exist only as passive Studio dashboard cards nobody proactively surfaces, and 3 (duplicate contacts, repeat enquiries, tax prep) don't exist at all.
- **Reflection/Feed/Search are three different distances from done.** `reflection.py`'s monthly/quarterly cadences are dead stubs (only weekly is scheduled); every highlight is a single-metric delta, zero correlational analysis. A Business Feed can mostly reuse `business_events` + the existing "Zuri Noticed" render pattern, needing ~6-8 new lightweight detectors. Cmd+K (`command-palette.tsx`) is a hardcoded static action list + substring match on contact names — a dead end for "Ask About Anything," not a partial implementation of it.

**Scope for this pass:** Phases 0-3 are production-readiness bars — they fix real bugs and close the most valuable connection/consistency gaps. Phases 4-6 are fast-follow, each independently valuable, explicitly *not* launch-blocking. Per this codebase's established discipline (`docs/BUSINESS_EVENTS_PLAN.md` §9, `docs/REALITY_ENGINE_PLAN.md` §9), every phase ships a real, bounded slice and documents the rest as roadmap — no big-bang rewrites.

---

## 1. Philosophy

Six principles, restated as build constraints:

1. **Nothing goes stale.** Every derived fact needs either a live compute-on-read path (already true for Studio insights, health rollups) or a genuine notice-and-fix loop (Reality Engine's pattern) — not a fixed-cadence overwrite with no staleness check.
2. **One porous intelligence layer, not fifteen silos.** New engines must consume shared context-fetchers; the fetchers must exist for business entities the same way they already exist for contacts.
3. **State changes cascade.** A deal closing, an invoice getting paid, a project crossing a threshold — each should trigger its natural next step as a *suggestion* (never a silent mutation of the user's own business record — that boundary stays exactly where Reality Engine already drew it).
4. **Silence is earned by confidence + reversibility, not by fiat.** High-confidence, cheap-to-undo actions get to skip the click. Customer-facing or structurally significant ones never do.
5. **Business Manager is one role, one voice.** Every "operations manager" behavior — wherever its detection logic already lives — surfaces through the same gated, unified delivery mechanism.
6. **Reflection should teach, not just report.** Single-metric deltas are a floor, not the ceiling — correlational, comparative insight is the target.

---

## 2. Phase 0 — Reconciliation Bug Fixes

*No new migration.* All four fixes extend `reality_engine.py`'s existing three-layer shape (event-driven / hourly / daily) or a sibling service, reusing columns that already exist.

**2.1 Retire the `context_snapshots` dead reference.** Don't build the full compressed-summary pipeline the original schema imagined — that's a bigger investment than this bug deserves. Instead: remove `proactive.py`'s dead fallback-to-nothing path, and have it (and any other reader currently getting "No recent context available") fall through to `contact_profiles.personality_summary`/`current_life_context` directly, which already exists and is refreshed on a real cadence (`message_worker.py`, every 10th live message). Update the one CLAUDE.md sentence that still implies `context_snapshots` is load-bearing.

**2.2 Business-side memory confidence decay.** New function in a new small file `services/intelligence/app/services/business_memory_maintenance.py` (one-class-per-file convention), mirroring `advisor_memory_learner.py::_deactivate_weak_memories()` exactly: deactivate `business_facts`/`contact_insights` rows where `confidence < 0.3`, `evidence_count <= 1`, unreinforced 30+ days, and `is_approved = FALSE` (never touch a human-approved fact). Wired into the Reality Engine's daily sweep (`run_daily_sweep`) rather than its own scheduler slot — it's the same "cognitive garbage collection" job, just a new table.

**2.3 Close expired/recovered opportunities.** `opportunities.status`/`expires_at` already exist (migration `0038`) — nothing currently reads `expires_at` to close a row. Add to `run_daily_sweep`: `UPDATE opportunities SET status='expired', resolved_at=NOW() WHERE status='open' AND expires_at < NOW()`, plus a second, `churn_risk`-specific close: `opportunity_type='churn_risk' AND status='open'` joined to `relationships.health_trend='improving'` → `status='expired'`. Each closed batch logs one aggregated `business_events(event_type='nudge_auto_resolved')` row, matching the existing aggregation discipline (not one row per swept item).

**2.4 Expire stale forecasts.** `inventory_forecast.py::generate_for_all_users()` currently `HAVING SUM(...) > 0` — skips (not deletes) a product with zero trailing-30-day sales, leaving its old forecast row stale forever. Add one `DELETE FROM inventory_forecasts WHERE product_id NOT IN (<the same trailing-30-day sales query>)` right before the upsert loop — a product that stops selling loses its forecast instead of keeping a lie.

**Files:** `services/intelligence/app/services/reality_engine.py`, new `business_memory_maintenance.py`, `services/intelligence/app/services/inventory_forecast.py`, `services/intelligence/app/services/proactive.py`, `CLAUDE.md`.

---

## 3. Phase 1 — Everything Connects (the deal-close chain)

*No new migration* — `deals.product_ids` (JSONB array, migration `0037`) already links a deal to products; `projects.deal_id` (Business OS Phase F) already links a project back to a deal.

**3.1 Deal closes → suggest a project.** `deals.ts`'s `PATCH /:id` `closed_won` branch gains a check: does a `projects` row already exist for this `deal_id`? If not, write `business_events(event_type='deal_closed_no_project')` + a `proactive_queue` suggestion ("Start a project to deliver this?") whose one-click action calls a new small helper mirroring `services.ts`'s `start-project`/`career-opportunities.ts`'s `apply` pattern — copy a minimal default task template, set `deal_id`, done. Suggested, never auto-created — a new project is structurally significant.

**3.2 Deal closes (product-linked) → reserve stock + supplier check.** Same branch: if `product_ids` is non-empty, for each product call the existing `POST /api/products/:id/reserve` endpoint (Business OS Phase E — already built, never called from here) and re-run the existing low-stock/supplier-reliability check (`studio.ts`'s `suggestedPurchaseOrders` logic, extracted to a small reusable function if it isn't already) scoped to just those products. Reservation is the one piece of this that's safe to do without a click (see Phase 2's confidence tier — reserving stock is cheap to undo); a resulting low-stock/reorder suggestion still goes through the normal PO-suggestion card.

**3.3 Invoice paid → suggest advancing the deal.** `reality_engine.py::run_hourly_sweep`'s existing `contradiction_invoice_paid_deal_open` check currently only writes to `business_events`. Extend it to also insert a `proactive_queue` row (`suggestion_type='follow_up'`, matching `business_manager.py`'s own convention) — "Invoice X is paid — close this deal?" — never auto-mutating `deals.stage` itself, preserving Reality Engine's existing safety boundary ("never silently rewrite a user's own business record").

**Files:** `services/api/src/routes/deals.ts`, `services/api/src/lib/` (new small project-templating helper, extracted from `services.ts`'s existing pattern), `services/intelligence/app/services/reality_engine.py`.

---

## 4. Phase 2 — Invisible Intelligence Confidence Tiers

**Migration `0087`:** widen `action_bundles.status`'s CHECK to add `'auto_approved'` (currently `pending, approved, partially_approved, dismissed, expired`) — the one schema change this whole plan needs before Phase 4+.

**4.1 Kill the unconditional `bundle:ready` toast.** `inbox/page.tsx`'s handler currently both bumps a refresh counter *and* fires `addToast(...)` for every detection. Drop the toast; keep the silent refresh — matching `reality.resolved`/`suggestion:ready`'s already-correct pattern exactly.

**4.2 Confidence + reversibility auto-execute tier.** In `action_bundles.py::detect_and_create`, after building the dependency-ordered `actions` array, compute per-action `autoExecutable`: `true` only for `create_product` (already forced to safe defaults — `status:'secondary', trackInventory:false`), `reserve_stock` (trivially released), and `reminder` — *and* only when `business_events.confidence >= 0.85` for that detection. If **every** action in the bundle qualifies, execute them immediately (call the same executor logic `action-executor.ts` calls, from the backend directly — a small new Python-side dispatcher, or a synchronous internal call to the existing Node endpoints, matching whichever cross-service-call convention is already closest — this needs to be nailed down in implementation against how thin the existing action-executor logic actually is) and insert the bundle with `status='auto_approved'` instead of `pending`. Otherwise, fall through to the existing manual-approval card exactly as today. Every auto-executed bundle still writes to `business_events` and appears in the "Zuri Noticed" feed — logged, never hidden.

**4.3 Extend scoped-automation risk logic from "changes copy" to "changes gate."** `advisor_companion.py::_assess_boundary_risk()` currently only changes the approval card's copy. Within an *active* `advisor_automation_grants` scope (Phase 6 of the Advisor Companion plan already re-classifies every candidate reply's scope + risk per message via `scoped_automation.py::check_reply_in_scope`), a `send_whatsapp_message` action request that comes back `in_scope=true` and `is_high_risk=false` should skip the approval card and go straight through `auto_response.py`'s existing `enqueue_send()` — this is not a new send mechanism, just removing the click for a case the codebase already re-verifies safety on per-message. Outside an active grant, or for anything the Boundary Keeper flags `high`, the click stays mandatory.

**Files:** `db/migrations/0087_action_bundle_auto_approval.sql`, `services/intelligence/app/services/action_bundles.py`, `services/intelligence/app/services/advisor_companion.py`, `apps/web/src/app/(dashboard)/inbox/page.tsx`, `apps/web/.../action-bundle-card.tsx` (render an "auto-handled" state, not just pending/approved).

---

## 5. Phase 3 — Business Manager: One Role, One Voice

*No new migration.*

**5.1 Unify the pause toggle.** `document_followups.py`'s overdue-quotation nudge, `project_progress.py`'s drift nudge, and `clock_engine.py`'s reconnect-window nudge (the business-relevant ones specifically — not the personal check-in clocks) each add the same one-line `business_manager_paused` guard `business_manager.py` already has. One switch, one honest meaning: "is my ops manager on."

**5.2 Promote passive Studio insights into real nudges.** `studio.ts`'s already-computed `lowStock`, `thinMargin`, and `supplierFlags` (`GET /api/studio/insights`) currently only render as dashboard cards nobody has to look at. Add a small new detector (same one-class-per-file convention, e.g. `business_manager_insights.py`) that re-runs the same SQL on the daily cadence, writes `business_events`, and inserts `proactive_queue` suggestions for anything crossing threshold for the first time (deduped the same way every other detector here dedupes — a `NOT EXISTS` marker check). Closes 3 wishlist items (low stock, pricing/margin issues, supplier reliability) with zero new detection logic, just a delivery-layer promotion.

**5.3 Duplicate contact detection.** New deterministic SQL check: normalize `phone_number` (strip formatting) for an exact match, plus a fuzzy `custom_name`/`display_name` match (Postgres `similarity()`/trigram, already available via `pg_trgm` if enabled — confirm during implementation, fall back to a simpler normalized-substring check if not) across a user's own contacts. Surfaces as a "these two might be the same person — merge?" suggestion. **The merge action itself may need a new small endpoint** (repoint FKs from the duplicate to the canonical contact, then soft-delete) if one doesn't already exist — confirmed absent in the audit; scope the merge endpoint narrowly (contacts + their conversations/messages/deals/documents) rather than a generic entity-merge framework.

**5.4 Repeat-enquiry / unmet-demand signal.** Aggregate `message_analyses.products_mentioned` (or `contact_products` interest rows) across *distinct contacts* in a trailing window with zero resulting purchase — "5 people asked about X this month, none bought — want a price list drafted?" Pure aggregation over data the analysis pipeline already extracts.

**5.5 Broaden missing-documentation check.** Extend `business_manager.py`'s existing invoice-gap query with a second, wider branch: any `customer_status='customer'` contact with **zero** documents ever (not just the current narrow 30-day project/deal window).

**5.6 Dormant-customer win-back.** `relationships.health_trend='declining'` + `customer_status='customer'` + no purchase in 60+ days, framed commercially ("haven't ordered in a while — want a check-in message?") — distinct from the generic personal reconnect clock, which already exists but isn't commercially framed.

**Files:** `services/intelligence/app/services/business_manager.py`, `document_followups.py`, `project_progress.py`, `clock_engine.py`, new `business_manager_insights.py`, new duplicate-contact detector file, `services/api/src/routes/contacts.ts` (merge endpoint, if confirmed absent).

---

## 6. Phase 4 — Intelligence Foundation *(fast-follow, not launch-blocking)*

Scope deliberately bounded to **foundation + two flagship migrations**, not a full rewrite of all ~15 engines — matching this codebase's own "File Architecture" convention of chipping away at a known problem when a file is next touched, rather than a big-bang migration.

**6.1** Expand `memory/retrieval_service.py` with business-entity fetchers symmetric to its existing contact-entity ones: `get_open_opportunities`, `get_project_status`, `get_invoice_aging`, `get_deal_pipeline_summary` — same file, same docstring convention explaining what each replaces.

**6.2** Build `BusinessContextService` (new file, `services/intelligence/app/services/business_context_service.py`) with one entrypoint — `answer(surface, user_id, question, scope={contact_id?, project_id?, product_id?})` — that internally dispatches to the retrieval fetchers above plus the existing relationship/contact ones, assembles one prompt from composable policy-block fragments (the pattern `RELATIONSHIP_ADVICE_POLICY`/`CV_STUDIO_NEVER_INVENT_POLICY` already prove works), and makes one LLM call. `surface` changes only which policy fragments get folded in, never re-derives context from scratch.

**6.3** Migrate `routes/conversation.py::studio_ask` onto it as the first proof (Studio is the most-cited "ask a business question" surface in the founder's own framing). Migrate one more high-traffic surface as the second proof — Advisor's `handle_conversation_turn` for `chat_analysis`/`relationship_advice` intents is the natural second candidate, since it already has the closest-shaped structured-response pattern (`ANALYZE_CHAT_TURN`) to fold in.

**6.4** Document the migration pattern in this file's own follow-up section and require every new engine going forward to consume it — enforced by convention/code-review, not a lint rule, matching how every other cross-cutting discipline in this codebase (File Architecture, AI Usage Tiers) is enforced.

**Explicitly deferred:** migrating Career's 14 task endpoints, Curiosity/Gossip/Motivational's independent SQL, and the Neural Layer's under-adopted modules (`knowledge_graph.py`'s `inferred_neighbors` still has no writer) — real work, not blocking this pass.

---

## 7. Phase 5 — Reflection Depth + Business Feed *(fast-follow)*

**7.1 Reflection.** Wire the already-stubbed monthly cadence (`reflection.py::_period_bounds()` already branches on it; `daily_worker.py` just never calls it) plus a new quarterly bucket. Add business-facing highlight categories alongside the existing emotional/relationship/responsiveness/projects/goals/business/career ones: invoices sent/paid this period, sales trend vs. prior period. Ship exactly **one** correlational insight to start — quote-response-latency vs. deal-close-rate, the founder's own worked example — as a bounded, separable addition (a single new aggregation query joining `documents.created_at`-to-first-view-or-response against `deals.stage='closed_won'` outcomes), not a general correlation engine.

**7.2 Business Feed.** Reuse `business_events` + the existing "Zuri Noticed" render pattern (`studio.ts`'s `recentEvents`, Studio's Overview card) rather than a new table. Add ~6-8 new lightweight, deterministic detectors emitting feed-worthy events: payment-posted (`documents.ts`'s `paid` transition gains a `business_events` write, not just the Reality Engine hook it already has), project-percent-crossing (75%/100%), period-over-period sales-trend comparison, repeat-product-mention aggregation (shares logic with 5.4 above), a ghosting/silence post (contact-side, reusing Reality Engine's existing contradiction-detection shape), and milestone-counter-crossing (Nth completed invoice/deal). New dedicated `GET /api/business-feed` endpoint (a superset read of the same table `recentEvents` already reads) + a first-class feed page, promoting the pattern out of being just a Studio Overview card.

**Files:** `services/intelligence/app/neural/reflection.py`, `daily_worker.py`, new detector files under `services/intelligence/app/services/`, `services/api/src/routes/business-feed.ts` (new), `apps/web/src/app/(dashboard)/feed/` (new).

---

## 8. Phase 6 — Ask About Anything *(fast-follow)*

Genuinely new engine, reusing an existing pattern rather than inventing one: `job_discovery.py`'s `PLAN_JOB_SEARCHES` already proves the "one `complete_json` call turns free text into a structured, executable directive" shape this needs. `POST /api/search/ask` takes free text, one LLM call classifies it into `{entityType, filters: [{field, op, value}], sort?}` against a fixed, per-entity queryable-field schema (contacts, documents, projects, suppliers, products to start), then a plain dispatcher builds parameterized SQL per entity — no text-to-SQL, no generic query language, just a small fixed set of per-entity query builders the classifier's output slots into. Replaces Cmd+K's current hardcoded-list-plus-substring-match with a real search box; Cmd+K's existing fixed actions (Create Deal, Add Task, etc.) stay as-is alongside it.

**Files:** new `services/intelligence/app/services/ask_anything.py`, new prompt in `ai/prompts.py`, `services/api/src/routes/search.ts` (new), `apps/web/src/components/command-palette.tsx` (extend, don't replace).

---

## 9. Explicitly Deferred (documented, not built)

Full intelligence-layer migration of all ~15 engines onto `BusinessContextService`; a generic contact-merge framework beyond contacts (deduping products/suppliers); a general cross-variable correlation engine for Reflection (beyond the one shipped insight); confidence auto-tuning of detector thresholds from correction history; extending the auto-execute tier beyond the three action types named in 4.2; a true text-to-SQL layer for Ask About Anything beyond the fixed per-entity field schema.

---

## 10. Verification (every phase)

Same discipline as every prior engine in this codebase: migration (where one exists) tested against a fresh local Postgres full chain + idempotent re-run; `python3 -m py_compile`/`compileall` across `services/intelligence/app` for Python touched; `npx tsc --noEmit` in `services/api` and `apps/web`; a manual walk-through of the specific new behavior before moving to the next phase; commit + push to `main` after each phase, continuing in sequence without re-confirming unless genuine ambiguity comes up — matching this session's established autonomous-execution pattern.
