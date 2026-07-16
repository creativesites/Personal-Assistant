# The Zuri Reality Engine

## 0. Why This Doc Exists

Zuri accumulates intelligence — health scores, lead scores, predictions, proactive nudges, action bundles — but nothing checks whether any of it is still true once written. A "check in with Grace" nudge outlives the actual conversation that made it moot. A "draft an invoice" suggestion outlives the invoice. Nothing ever asks the second question every one of these systems needs: *is this still true?*

This doc names and designs the engine that asks that question — the **Reality Engine**. Not "Reconciliation Agent," which undersells it as an accounting concept: its job is broader — keep Zuri's understanding of reality synchronized with reality itself, the same way a mind constantly updates its beliefs as the world changes around it. If the Memory Engine answers "what do I know?" and the Prediction Engine answers "what's likely to happen?", the Reality Engine answers "is what I already concluded still correct?"

Per this codebase's established discipline (`docs/BUSINESS_EVENTS_PLAN.md` §9, `docs/SERVICES_PROJECTS_PLAN.md` Part D), Phase 1 below is a real, working slice built almost entirely out of mechanisms this codebase already has — not a rewrite, not a new generic infrastructure layer built ahead of need. A much larger brainstorm (per-field freshness columns across the whole schema, confidence auto-tuning from correction history, contradiction auto-*fix* instead of detect-and-surface, a full Truth Sources UI on every record) is written up in §9 as roadmap, not built here.

---

## 1. Current State (confirmed by reading the code, not assumed)

- **No unified freshness/confidence/verification concept exists anywhere in this codebase.** Grepping for "verify"/"verification"/"contradiction" as implemented concepts returns nothing. The recurring idiom instead is: a denormalized cache column (`relationships.health_score`, `contacts.lead_score`, `inventory_forecasts.expected_stockout_date`, ...), recomputed unconditionally on a fixed cadence (event-driven every N messages, or a daily/nightly cron), paired with an `updated_at`/`computed_at` timestamp that is written but never read back by anything to decide "is this stale, should I recompute."
- **The one genuine prior-art "detect the world changed, auto-close the derived state" mechanism** is `advisor_curiosity_prompts`'s `check_pending_answer()` (`services/intelligence/app/services/advisor_companion.py`): on every Advisor turn, it checks whether a `status='asked'` row from the last 72 hours has just been answered by the user's current message (via a small LLM classification, `CLASSIFY_CURIOSITY_ANSWER`), and if so writes the extracted value back and flips the prompt to `answered`. This is the template the Reality Engine generalizes — except Phase 1 below does it with plain SQL/event triggers, not a new LLM call, wherever the underlying signal is already unambiguous (a reply was sent, a document was marked paid).
- **`action_bundles.status`, `business_events.status`, and `gossip_worthy_events.status` already declare `'expired'`/`'dismissed'` CHECK values that no code anywhere ever writes.** Three separate schemas independently anticipated an auto-expiry mechanism; none of them got one. This is the single biggest "free win" available — Phase 1 starts writing to these dead values instead of adding new ones.
- **`proactive_queue`'s `proactive_status` is a genuine Postgres ENUM** (`pending, snoozed, approved, dismissed, sent`) with no value meaning "Zuri determined this nudge is no longer relevant" — distinct from `dismissed` (a human said no) and `sent` (a human acted on it). This is the one place Phase 1 needs an actual schema change.
- **"Needs reply" is not a stale-able cached fact.** The Inbox/Leads pages derive it live — `services/api/src/lib/inbox-events.ts` and `leads.ts` both join the *latest* message per conversation and check `sender_type='contact' AND requires_response AND unread` — so the moment a user sends a reply, that reply becomes the latest message and the derived condition stops being true on the very next read. Nothing was ever cached, so nothing can go stale. The real "stale nudge" problem this doc targets is `proactive_queue`'s materialized relationship-maintenance suggestions (`check_in`/`follow_up`/`reconnect`, written by `proactive.py`/`clock_engine.py`) and `business_manager.py`'s invoice-gap nudges — both of which are computed once and then sit untouched regardless of what happens afterward.
- **`daily_worker.py` already runs three sub-daily cadences** on a plain `asyncio.sleep(N)` loop, not just daily ones: `run_temporal_scheduler` (15 min), `run_world_knowledge_scheduler` (2 hours), `run_interest_cron_scheduler` (6 hours). This is the exact, already-proven template for a new hourly Reality Engine tier — no new scheduling mechanism needs inventing, and the reason this pattern exists at all (rather than BullMQ's native `repeat` option) is a documented Python-BullMQ repeatable-job bug (`daily_worker.py`'s own comments, `taskforcesh/bullmq#2772`) — the asyncio-sleep-loop is deliberate, not a workaround to fix.
- **Python's `publish_event` and Node's `publishInboxEvent`** (`services/api/src/lib/inbox-events.ts`) already publish to the *same* Redis instance under the same `{eventType}:{userId}` channel convention, and `services/api/src/lib/redis-subscriber.ts`'s one generic `pmessage` handler translates any such channel into a Socket.io emit automatically. A new live-update channel needs exactly one line added to the psubscribe list — nothing else.
- **No Node→Python synchronous call exists today for "a document was marked paid" or "a deal closed won."** `documents.ts`'s `POST /:id/status` and `deals.ts`'s `PATCH /:id` both do a plain Postgres UPDATE and nothing else. Per this codebase's own established discipline (`credits.py` does direct Postgres access from Python rather than a new Node HTTP round-trip; the Node→Python document-render endpoint was only added because the *rendering* logic was genuinely Python-owned), the fix here is a **direct Postgres write from the Node route that already owns the transition**, not a new internal API call.
- **`inventory_forecasts.computed_at`** is the one table in the whole schema with a clean, already-populated freshness timestamp sitting right on the row — a ready-made input for a "prediction freshness" metric with zero new columns.

---

## 2. Philosophy

Every AI-generated conclusion has a shelf life. A health score is only as good as the last few messages it was computed from; a "you haven't talked in two weeks" nudge is only true until the user organically reaches out; an invoice-gap suggestion is only relevant until the invoice exists. Zuri should notice when the world has moved past one of its own conclusions and quietly clean up after itself — the same instinct a person has when they realize "oh, that's not true anymore" and stop acting on it. This is strictly about **keeping Zuri's own artifacts honest** — a nudge, a bundle, a logged event. It is never about silently rewriting the user's actual business records (a deal's stage, a product's stock count, an invoice's status); those stay a human decision, and a detected mismatch between two AI-observed facts is surfaced as a "Zuri Noticed" card, never auto-corrected.

---

## 3. Three Layers, Not One Daily Cron

**Layer 1 — Event-driven (immediate).** Runs the instant something concrete happens, so the UI feels alive rather than eventually-consistent. Phase 1 wires two cases: a live outbound WhatsApp reply resolves any pending relationship-maintenance nudge for that contact; a document marked `paid` or a deal reaching `closed_won` resolves the matching invoice-gap nudge.

**Layer 2 — Hourly background refresh.** A new fixed-interval BullMQ scheduler (the same `asyncio.sleep(3600)` shape `run_interest_cron_scheduler` already uses) runs a small set of deterministic, no-LLM-call contradiction checks — plain SQL comparing two already-observed facts against each other (an invoice marked paid while its deal is still open; negative inventory with nothing incoming; a project marked complete with incomplete tasks).

**Layer 3 — Daily deep refresh.** The "cognitive garbage collection" pass — a new 19:00 UTC daily scheduler (the next free slot after Business Manager's 18:00) sweeps genuinely abandoned `pending` rows across `proactive_queue`/`action_bundles`/`business_events`/`gossip_worthy_events` and finally moves them into the `expired`/`auto_resolved` terminal states their own schemas already declared but never used.

---

## 4. Reusing `business_events` as the Reality Engine's Own Log — No New Generic Table

Rather than inventing a parallel "claims ledger," the Reality Engine writes to the table `docs/BUSINESS_EVENTS_PLAN.md` already built this session specifically as "a generic, durable log of every detected business signal" — with new `event_type` values: `nudge_auto_resolved`, `contradiction_invoice_paid_deal_open`, `contradiction_negative_inventory`, `contradiction_project_complete_tasks_incomplete`. This means Studio's existing "Zuri Noticed" feed (`GET /api/studio/insights`'s `recentEvents`) surfaces Reality Engine activity for free — the only frontend change needed is extending `studio/page.tsx`'s event-type→label map. `business_events.confidence`/`evidence` (already columns) carry the Reality Engine's own certainty and reasoning — this is where the "Truth Sources" framing lives (e.g. `evidence: ["Outbound message sent to this contact 2 minutes ago"]`) rather than a new column bolted onto every table that might need it.

---

## 5. Schema Changes — Three Small, Targeted Additions (migration `0077`)

```sql
ALTER TYPE proactive_status ADD VALUE IF NOT EXISTS 'auto_resolved';
-- the one missing lifecycle terminal state: "Zuri determined this nudge is no
-- longer relevant" — distinct from 'dismissed' (a human said no) and
-- 'sent' (a human acted on it)

ALTER TABLE proactive_queue ADD COLUMN IF NOT EXISTS resolved_reason TEXT;
-- the human-readable "why" — the raw material for "learn from corrections"

ALTER TABLE proactive_queue ADD COLUMN IF NOT EXISTS business_event_id UUID
  REFERENCES business_events(id) ON DELETE SET NULL;
-- links a nudge to the business_events row that spawned it, so an
-- invoice-gap nudge can be resolved by exact FK match instead of fuzzy
-- title-text matching. Pre-existing pending rows won't have this set —
-- Reality Engine skips those gracefully rather than pretending a backfill
-- happened; an honest limitation, same convention as every other
-- "backfill is a floor, not exact" note elsewhere in this codebase.

ALTER TABLE advisor_user_profiles ADD COLUMN IF NOT EXISTS
  reality_engine_paused BOOLEAN NOT NULL DEFAULT FALSE;
-- same "paused=false means on by default, honest kill switch" precedent
-- as companion_features_paused / business_manager_paused
```

`action_bundles.status`/`business_events.status`/`gossip_worthy_events.status` need **no migration** — Phase 1 simply starts writing to their already-declared, currently-dead `'expired'` value.

---

## 6. The State Lifecycle — Naming What The Enums Already Encode

Rather than replacing every status vocabulary with a new shared enum (a large, risky blast radius across every frontend surface that reads these columns today), Phase 1 names the conceptual lifecycle once and maps each table's *actual* vocabulary onto it — then wires the one missing terminal edge each table needs:

| Conceptual stage | `proactive_queue` | `action_bundles` | `business_events` |
|---|---|---|---|
| Detected | *(the underlying signal, not yet a queue row)* | *(a `business_events` row not yet folded into a bundle)* | `pending` |
| Suggested | `pending` | `pending` | `bundled` |
| Approved | `approved` | `approved`/`partially_approved` | *(n/a — a business event doesn't get approved, only its bundle)* |
| Executed | `sent` | *(actions executed client-side per `action-executor.ts`)* | *(n/a)* |
| Archived (human) | `dismissed`/`snoozed` | `dismissed` | `dismissed` |
| **Archived (reality)** | **`auto_resolved`** *(new)* | **`expired`** *(newly wired, already declared)* | **`expired`** *(newly wired, already declared)* |

"Verified" (the user's proposed sixth stage) is deliberately not a distinct stored state in Phase 1 — for the safe, Zuri-owned-artifact cases this engine resolves, detection and verification collapse into the same event (the reply *is* the verification). A genuine separate "verified, still pending" state is listed as roadmap (§9) for cases that need it.

---

## 7. Layer 1 — Event-Driven Resolution

**Hook A — a live outbound reply resolves relationship nudges.** `services/intelligence/app/workers/message_worker.py`, inside the existing `if not is_historical:` block (the same gate the watch-narration check already uses), a `sender_type == 'user'` branch calls `RealityEngineService.resolve_relationship_nudges(user_id, contact_id, reason)`: `UPDATE proactive_queue SET status='auto_resolved', resolved_reason=$1 WHERE user_id=$2 AND contact_id=$3 AND status='pending' AND suggestion_type IN ('check_in','follow_up','reconnect') RETURNING id`, one `business_events(event_type='nudge_auto_resolved')` row per resolved nudge, then `publish_event('reality.resolved:{user_id}', ...)`.

**Hook B — paid/closed-won resolves the invoice-gap nudge.** New `services/api/src/lib/reality-engine.ts`, `resolveInvoiceGapNudges(userId, {dealId, projectId}, reason)`: finds `business_events WHERE event_type='invoice_gap' AND status != 'expired' AND (payload->>'dealId' = $dealId OR payload->>'projectId' = $projectId)`, flips those to `expired`, flips the linked `proactive_queue` row (via `business_event_id`) to `auto_resolved`, and calls the already-exported `publishInboxEvent(userId, 'reality.resolved', {...})` — no new Redis publisher needed. Wired into `documents.ts`'s `status === 'paid'` branch and `deals.ts`'s `stage === 'closed_won'` branch, both of which already own the write synchronously. `business_manager.py`'s invoice-gap insert gains the `business_event_id` column so Hook B can match exactly.

---

## 8. Layer 2 — Hourly Contradiction Sweep

`RealityEngineService.run_hourly_sweep()` — three deterministic SQL checks, each deduped via `NOT EXISTS` against a recent matching `business_events` row (the same convention `action_bundles.py`/`project_progress.py` already use for their own dedup):

1. **Invoice paid, deal/opportunity still open** — a `documents` row (`document_type='invoice', status='paid'`) whose contact has a `deals`/`opportunities` row still in an open stage.
2. **Negative inventory, nothing incoming** — `products.available < 0 AND incoming = 0 AND track_inventory`.
3. **Project complete, tasks incomplete** — `projects.status = 'completed'` but `done_task_count / task_count < 1.0`.

Each match writes one `business_events(event_type='contradiction_*', confidence=1.0, evidence=[...])` row — detected and surfaced only, never auto-mutated (§2). These flow into Studio's "Zuri Noticed" feed automatically (§4).

---

## 9. Layer 3 — Daily Deep Refresh + Intelligence Health Score

`RealityEngineService.run_daily_sweep()` sweeps genuinely abandoned `pending` rows (14 days for `proactive_queue`/`gossip_worthy_events`, matching `consolidation.py`'s existing `_STALE_DAYS` precedent style; 7 days for `action_bundles`, since their creation-time dedup window is only 60 minutes so a week of no action means genuinely abandoned) into `expired`/`auto_resolved`, with one aggregated `business_events` row per sweep run rather than one per swept item.

**Intelligence Health Score** — `GET /api/diagnostics/intelligence-health` (`services/api/src/routes/diagnostics.ts`), computed live per page load (a handful of aggregate queries, same "not a hot path" judgment already made for Customer tiers/Financial Overview):
- **Prediction freshness** — % of `inventory_forecasts` rows with `computed_at >= NOW() - INTERVAL '2 days'`.
- **Relationship freshness** — % of `relationships` rows with `updated_at >= NOW() - INTERVAL '7 days'`.
- **Nudge accuracy** ("learn from corrections") — over the last 30 days, `auto_resolved / (auto_resolved + sent + approved)` in `proactive_queue`: the fraction of AI-generated nudges that turned out unnecessary vs. ones a user actually acted on. Phase 1 only *surfaces* this ratio; feeding it back into detector confidence is §9.2 below, deferred.
- **Contradictions open** — count of unresolved `contradiction_*` `business_events` rows in the last 30 days.
- **Overall** — one clearly-documented weighted average, not a black box.

Frontend: a new "Intelligence Health" section on `/diagnostics`, mobile-first stat tiles matching the Token Usage Tracking section's exact established visual convention.

---

## 10. Toggle + Frontend Wiring

`advisor_user_profiles.reality_engine_paused` is exposed via the existing `GET/PATCH /api/advisor/profile` (which already has a `booleanColumns` loop from the Business Manager Assistant work — a third entry is trivial) with a Settings toggle right below Business Manager's, same visual pattern. The `/proactive` page gains a socket listener for `reality.resolved` (mirroring the Inbox's existing `bundle:ready`/`suggestion:ready` listener pattern) that optimistically removes a resolved nudge from the list without a manual refresh.

---

## 11. Deferred Roadmap (documented, not built this pass)

- **Per-field freshness columns beyond nudges/invoice-gap** — extending explicit `last_verified_at`/confidence-decay to `contact_insights`, `relationships.health_score`, `contact_products.replacement_predicted_at`, etc. Each of these already has *some* timestamp; a real staleness-detection pass per field is its own design exercise, not a mechanical retrofit.
- **Confidence auto-tuning from correction history** — using the "nudge accuracy" ratio (§9) to actually lower a detector's future confidence, not just report the number. Needs more data and a design decision on which detector owns which confidence knob.
- **Contradiction auto-*fix*** — today Layer 2 only detects and surfaces (§2's safety boundary). A future phase could let a user opt a *specific* contradiction type into auto-fix (e.g. "always mark the deal closed when its invoice is paid") — an explicit, per-rule opt-in, never a platform-wide default.
- **Extending checks beyond Studio/business modules** — the three Layer 2 checks are all business/Studio-flavored per the user's own worked examples; relationship-side or Advisor-side contradictions (e.g. "flagged this contact as inactive but they messaged yesterday") are a natural next set, reusing the exact same `business_events`-as-log mechanism.
- **A full Truth Sources UI on individual records** — today "truth sources" live in `business_events.evidence` strings; a dedicated expandable "why do I believe this" panel on a contact/deal/product's own detail page is a frontend-only follow-on once there's more than one Reality Engine check writing to a given entity.
- **Generalizing the `advisor_curiosity_prompts` LLM-verification pattern** to ambiguous cases Layer 1/2's plain-SQL checks can't resolve (e.g. "is this relationship actually cooling off, or just quiet for a normal reason?") — deliberately not attempted in Phase 1, which only automates unambiguous, deterministic cases.

---

## Rollout Order

1. Migration `0077` (§5).
2. `services/intelligence/app/services/reality_engine.py` (Layers 1's Hook A, 2, 3).
3. Wire `message_worker.py` (Hook A) and `business_manager.py` (`business_event_id`).
4. `daily_worker.py`/`main.py` — hourly + new 19:00 UTC daily scheduler pair.
5. `services/api/src/lib/reality-engine.ts` (Hook B) + wire into `documents.ts`/`deals.ts`; `redis-subscriber.ts` channel addition.
6. `GET /api/diagnostics/intelligence-health` + `advisor.ts`'s `reality_engine_paused` field.
7. Frontend: Diagnostics section, Settings toggle, Proactive dock socket listener, Studio "Zuri Noticed" label additions.
8. Update `docs/NEURAL_LAYER_PLAN.md` (§4.11 + reconciliation table row) and `CLAUDE.md`, commit, push to `main` directly per this repo's branch policy.
