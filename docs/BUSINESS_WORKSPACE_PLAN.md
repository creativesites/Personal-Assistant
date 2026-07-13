# Zuri Business Workspace: Documents as Business Objects

**Status**: Planning — nothing in this doc is built yet. Supersedes `docs/DOCUMENTS_PLAN.md`'s framing (kept in git history; this file replaces it going forward).

> Conversations create business. Documents close business.

This is a revision of the original Documents plan in response to an architectural review. The core critique: the first draft was still document-centric — it modeled quotations and invoices well, but treated them as the main character. The fix isn't new features so much as a change in what's the subject and what's the object: **the business relationship (opportunity, deal, contact) is the subject; a document is one thing that happens to it, alongside conversations, health-score changes, and proactive follow-ups.** §0 maps every review point to what changed; the rest of the doc is the updated plan itself, not a diff.

---

## 0. What Changed From the First Draft

| Review point | What changed here |
|---|---|
| "Documents should become Business Objects" | §1: every `documents` row now carries `opportunity_id`, `agent_id`, `requested_by`, and `ai_reasoning` — the "why/who/which-opportunity" is schema, not convention. |
| "Introduce the Business Timeline" | §4: new `GET /api/contacts/:id/business-timeline`, composed the same way `/api/proactive/brief` already composes multiple sources — plus a real gap it surfaced: `deals` has no stage-history log, so a `deal_stage_history` table is added. |
| "AI should understand business stages" | §5: deliberately **not** a new stored field — a derived label computed from `deals.stage` + document status + payment state, to avoid a second, driftable source of truth. |
| "Every document should have an AI Summary" | §6: `documents.ai_summary`, generated the same way `contact_profiles.personality_summary` already is. Conversion-likelihood numbers are explicitly gated to Phase 4, once there's enough data to back them — not fabricated early. |
| "Build an AI Document Memory" | §7: **reuses `contact_insights`** (add `source_document_id`) instead of a parallel memory table — this is the single biggest simplification in this revision. |
| "AI should compare documents" | §8: an Advisor capability over existing `documents` rows, not a new engine. |
| "AI learns your pricing" | §9: **reuses `business_facts`** (Memory Engine) instead of a parallel pricing-intelligence table. |
| "Business Knowledge Graph" | §10: already exists — `relationship_connections` (migration `0038`) is this. Documents becomes a new evidence source for it, nothing new is built. |
| "Proposal Generation" / full SME template list | §11: `document_type` and a new `document_category` grouping expanded to cover the fuller list. |
| "AI Document Assistant" (chat per document) | §12: reuses the exact "regenerate with instruction" mechanism already shipped for `proactive_queue`, scoped per-document and made multi-turn. |
| "Automatic Business Packs" | §13: scoped to Phase 4, packs defined as code constants (not a DB-editable builder) to avoid overbuilding before there's usage data. |
| Rename the module away from "Documents" | §2 — addressed directly, with a concrete (and deliberately asymmetric) resolution. |
| "Advisor should generate documents on demand" | §14: extends the existing `[ACTION: ...]` tag system in `chat-formatter.tsx` / the Advisor's `ZURI_ACTION_INSTRUCTIONS`, not a new mechanism. |

---

## 1. The Core Reframe

The original plan already linked documents to contacts/deals/opportunities/conversations (see the old §1 grounding table). What was missing is that the link has to be **causal, not just relational** — a document should be able to answer "why do you exist," not just "what are you attached to."

```
WhatsApp: "Can I get prices for 15 Lenovo ThinkPads?"
        │
        ▼
Message analysis detects buying intent + large order + business customer
   (ANALYSE_MESSAGE already extracts entities/products_mentioned/intent —
    no new detector, see docs/BUSINESS_WORKSPACE_PLAN.md §1 of the old doc)
        │
        ▼
Opportunity created (opportunities table, opportunity_type='buying_signal')
        │
        ▼
AI suggests: "Generate quotation?" → proactive_queue-style card, or the
   inbox AI Action card (§7 of the rendering/creation sections below)
        │
        ▼
documents row created: opportunity_id = <that opportunity>,
   requested_by = 'customer', agent_id = NULL (human-initiated),
   ai_reasoning = "customer requested pricing for 15x Lenovo ThinkPad in
   conversation <id>; opportunity <id> flagged buying_signal at 0.86 confidence"
        │
        ▼
Customer accepts → opportunity.status = 'acted_on', deal created/advanced
        │
        ▼
Invoice generated (source_document_id → the quotation) → Receipt
        │
        ▼
relationship_health_logs gets a new factor; contact_insights gets new
   AI Document Memory facts (§7); relationship_connections may gain a new
   edge if a decision-maker or referral was mentioned (§10)
```

The quotation isn't the important thing in this flow — the opportunity is, and the quotation is one artifact it produced. The schema changes below make that literal:

```sql
-- Additions to the `documents` table from the original plan:
ALTER TABLE documents ADD COLUMN agent_id       UUID REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN requested_by   VARCHAR(20) NOT NULL DEFAULT 'user'
                        CHECK (requested_by IN ('user', 'customer', 'agent', 'schedule'));
ALTER TABLE documents ADD COLUMN ai_reasoning   TEXT;      -- why this document was created/suggested
ALTER TABLE documents ADD COLUMN ai_summary     TEXT;      -- see §6
ALTER TABLE documents ADD COLUMN document_category VARCHAR(20) NOT NULL DEFAULT 'sales'
                        CHECK (document_category IN ('sales', 'operations', 'legal', 'hr'));  -- see §11
```

`opportunity_id`, `deal_id`, `conversation_id`, `contact_id` were already nullable FKs on `documents` in the original plan (§3 there) — this revision doesn't add new relations, it adds the fields that explain *why* those relations exist.

---

## 2. Naming Decision

The review's strongest recommendation: don't call this "Documents" internally — Zuri is becoming a business operating system, and documents are one capability inside that, not the whole thing.

**Resolution, deliberately asymmetric:**
- **Internally / architecturally**, this is the **Business Workspace** — the engine spans the Business Timeline (§4), business-stage inference (§5), AI Document Memory riding on `contact_insights` (§7), and the Business Graph (§10). This doc's filename and title reflect that.
- **In the sidebar, the nav item stays discoverable, not abstract.** A business owner opens Zuri thinking "I need to send an invoice," not "I need to open my Business Workspace." The nav item keeps a concrete label (`Documents`, in the existing `Business` nav group alongside Contacts/Leads/Intelligence — no new top-level group needed), but its route is `/business` and its landing tab is the **Business Timeline**, not a flat document list. The document list itself becomes one tab among several, exactly the way `/studio` already consolidates several capabilities (Products, Content Generator, Scheduled Posts) under one hub rather than exploding into separate nav items.

This mirrors the same "public label vs. internal architecture can differ" call the Marketing plan already made for `/studio` vs. "Zuri Marketing" — the module's ambition and its UI's discoverability aren't required to use the same word.

---

## 3. Updated Data Model (supersedes the original plan's §3)

Everything from the original `documents` / `business_profiles` / `document_templates` / `document_events` tables still stands, plus the additions in §1 and:

```sql
-- Timeline gap: deals only stores current stage + entered_stage_at, no
-- history. Same append-only pattern as relationship_health_logs.
CREATE TABLE deal_stage_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage  VARCHAR(20),
  to_stage    VARCHAR(20) NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_deal_stage_history_deal ON deal_stage_history(deal_id, changed_at);

-- AI Document Memory (§7) — NOT a new table. One column added to the
-- existing contact_insights table so document-derived facts land in the
-- exact same store, and the exact same retrieval path, as every other
-- AI observation about a contact.
ALTER TABLE contact_insights ADD COLUMN source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL;

-- AI Document Assistant (§12) — per-document chat, mirroring
-- advisor_messages' shape but scoped to a document instead of a session.
CREATE TABLE document_chat_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role         VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_document_chat_document ON document_chat_messages(document_id, created_at);

-- Automatic Business Packs (§13) — records what got generated together.
-- Pack *definitions* (which document types, in what order) are code
-- constants, not DB rows — same "constants in code" precedent already
-- used for prompts.py rather than a DB-editable prompt table.
CREATE TABLE document_pack_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id   UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  pack_key     VARCHAR(50) NOT NULL,     -- e.g. 'new_customer_sales_pack'
  document_ids JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

No new table was added for the Business Timeline (§4) or the Business Graph (§10) — both compose from data that already exists or is added above.

---

## 4. The Business Timeline

Every contact already gets a conversation history. The Business Timeline is a second, higher-level view: not messages, but business events — opportunity created, quotation sent, quotation viewed, invoice generated, payment received, follow-up scheduled, reorder, renewal reminder.

**This is a read-time composition, not a new write-time log table**, following the exact precedent `GET /api/proactive/brief` already established (a `UNION ALL` across `proactive_queue`, `opportunities`, `relationships`, `events` — see `services/api/src/routes/proactive.ts`):

```sql
-- GET /api/contacts/:id/business-timeline — shape, not final SQL:
SELECT 'document' AS kind, de.event_type, de.occurred_at, d.document_type, d.title
  FROM document_events de JOIN documents d ON d.id = de.document_id WHERE d.contact_id = $1
UNION ALL
SELECT 'opportunity', o.status, o.detected_at, o.opportunity_type, o.title
  FROM opportunities o WHERE o.contact_id = $1
UNION ALL
SELECT 'deal_stage', dsh.to_stage, dsh.changed_at, NULL, NULL
  FROM deal_stage_history dsh JOIN deals d2 ON d2.id = dsh.deal_id WHERE d2.contact_id = $1
UNION ALL
SELECT 'calendar', 'scheduled', ce.start_at, NULL, ce.title
  FROM calendar_events ce WHERE ce.contact_id = $1
ORDER BY occurred_at DESC
```

Rendered on `/contacts/[id]` as a new **Business Timeline** tab — this *replaces* the flat "Document Library" tab the original Phase 1 planned; the document list becomes a filter (`kind = 'document'`) within the richer timeline rather than a separate, competing view.

---

## 5. Business Stages — Derived, Not Stored

The review's "AI should say *this customer is currently in Negotiation*, not *last document was a quotation*" is right, but the fix is **not** a new `business_stage` column — that would be a second source of truth alongside `deals.stage`, and this codebase already has one cautionary tale about exactly that (three competing pipeline vocabularies before `deals` unified them — see `docs/RELATIONSHIP_OS_PLAN.md`'s migration `0037` notes).

Instead, a small pure function (`business_stage.py`, no new table) derives a label from existing fields:

```
deals.stage IN (discovery, qualified, proposal, negotiation) → that stage, verbatim
deals.stage = closed_won AND latest invoice.status != 'paid'  → "Invoice"
latest invoice.status = 'paid' AND < 30 days ago              → "Payment"
latest invoice.paid_at > 30 days ago, no new activity          → "Support"
contact approaching a renewal_due opportunity/contract expiry  → "Renewal"
```

This label is computed on read (Business Timeline header, Advisor context, contact card) — never written to a column, so it can't drift from the data it's derived from.

---

## 6. AI Summary Per Document

`documents.ai_summary` (added in §1), generated via `complete_text()` right after `structured_data` is finalized — the same pattern already used for `contact_profiles.personality_summary`. Content: why it was generated, key negotiated terms pulled from `structured_data`/chat history (§12), and a suggested next action.

**Honesty constraint, stated explicitly because this repo already has a precedent for calling out fabricated precision** (`ZURI_MARKETING_EXPANSION.md`'s "not real engagement metrics" caveat): the "similar quotations converted 72% of the time" style statistic is **not** part of the Phase 0–3 `ai_summary` — it requires enough historical `documents` rows of the same type/segment to mean anything, and is explicitly gated to Phase 4 (§15) once that data exists. Early `ai_summary` is qualitative prose only.

---

## 7. AI Document Memory — Reuse `contact_insights`

The review's "Quotation #294 → AI extracted: Products, Decision Maker, Budget, Concerns, Competitor, Likelihood, Preferred payment" describes exactly the shape `contact_insights` already stores (`insight_key`/`insight_value`/`confidence`/`supporting_text`). Building a parallel "document memory" table would fork the exact same concept the codebase already has one home for.

Instead: `contact_insights.source_document_id` (added in §3). When a document is generated, edited, or negotiated via chat (§12), an extraction pass writes ordinary `contact_insights` rows — `insight_key='decision_maker'`, `insight_value='Peter'`, `source='document'`, `source_document_id=<this document>`, `supporting_text=<the relevant line from structured_data or chat>`. Every existing consumer of `contact_insights` (the profiler, `get_contact_summary`, reply generation) picks these up automatically — "what were Peter's concerns before he bought" is answered by the retrieval path that already exists today, not a new one.

---

## 8. AI Compares Documents (Sales-Analyst Mode)

"Show me quotations that never converted" is an Advisor capability over the existing `documents` table, not a new engine: query `documents` filtered by `status IN ('expired','rejected')`, grouped by `document_type` and the contact's `industry`, aggregate (count, common `structured_data` patterns), then feed the aggregated stats — not raw rows — into `complete_text()` for pattern synthesis. This is the exact shape `POST /internal/content/recommendations` (Zuri Marketing, shipped) already uses: real aggregated numbers in, grounded suggestions out, no per-row prompt stuffing. Phase 4 (§15).

---

## 9. AI Learns Pricing — Reuse `business_facts`

Segment-level discount benchmarks ("Construction: 12% avg, Retail: 5% avg") are exactly the shape `business_facts` already models — confidence rising with more evidence, category-tagged. A periodic aggregation (plain SQL over `documents.structured_data`, grouped by `contacts.industry`) writes/updates `business_facts` rows under a new `category = 'pricing_benchmark'`. `GENERATE_DOCUMENT_DATA` (§6/§7 of the original plan) reads these through `memory/retrieval_service.py` exactly like every other business fact already feeds reply generation — no separate pricing-intelligence system. Phase 4 (§15).

---

## 10. Business Knowledge Graph — Already Exists

The review's Peter → works at ABC Ltd → referred John → John referred Sarah network is **already `relationship_connections`** (migration `0038`, Relationship OS Phase 2 — `connection_type` includes `works_with`/`introduced_by`/`refers_to`, with `confidence`/`evidence_count`/`source_message_ids`). Nothing new needs to be built here.

What Documents adds: a new evidence source. Today, `relationship_connections` rows come only from message-derived detection (`services/intelligence/app/services/connections.py`). Once AI Document Memory (§7) is extracting decision-makers and referral mentions from document chat/negotiation text, those extractions get fed to the same connections detector as an additional evidence source — a document mentioning "my colleague Peter handles purchasing" strengthens or creates a `works_with` edge exactly the way a chat message already does. One detector, two input streams.

---

## 11. Expanded Template & Document-Type Catalog

`document_type` (on `documents`) and templates (`document_templates.applicable_to`) expand to cover the fuller SME list, grouped by the new `document_category`:

| Category | Document types |
|---|---|
| `sales` | quotation, invoice, receipt, credit_note, proposal, statement_of_work |
| `operations` | purchase_order, delivery_note, inspection_report, visit_report, timesheet, expense_claim, purchase_request, project_plan, meeting_minutes |
| `legal` | contract, service_agreement, maintenance_contract, nda, rental_agreement |
| `hr` | employment_letter, offer_letter |
| — | certificate, letter, custom (unclassified / catch-all) |

Not every type needs `contact_id`/`deal_id` — a timesheet or expense claim is an internal operations document with no customer relationship, which is exactly why those FKs on `documents` are nullable in the original schema (§3 there). This is also the strongest evidence *for* the "Business Workspace" framing (§2): several of these documents aren't about closing a sale at all, so a purely sales-pipeline-centric model would have been the wrong shape regardless of naming.

---

## 12. AI Document Assistant (Per-Document Chat)

`document_chat_messages` (§3) + `POST /internal/documents/:id/chat` — takes a natural-language instruction ("reduce the price by 5%", "make this more persuasive") plus the current `structured_data` and chat history, returns updated `structured_data` and an assistant reply, via `complete_json()`. This is **the same mechanism already shipped this session for `proactive_queue`'s "regenerate with instruction"** (`services/intelligence/app/routes/proactive.py`), scoped to a document instead of a suggestion, and made multi-turn by persisting the exchange. The assistant never edits the rendered PDF directly — it edits the JSON, which re-renders, preserving the "AI never lays anything out" boundary from the original plan's §6.

---

## 13. Automatic Business Packs

Pack *definitions* are code constants (mirroring how `PRIORITY_LABELS`-style lookup tables already live in this codebase rather than a DB-editable config), not a builder UI — deliberately, to avoid shipping a generic pack-authoring tool before there's usage data on which packs people actually want. Three starter packs:

- **New Customer Sales Pack**: quotation + proposal + a drafted WhatsApp follow-up message.
- **Renewal Pack**: renewal quotation (pre-filled from the prior accepted invoice) + a drafted reminder message.
- **Project Kickoff Pack**: contract/service agreement + project plan + a `proactive_queue` follow-up task.

`POST /api/documents/packs/:packKey/run` resolves the contact/product context once, fans out the pack's document types through the same `GENERATE_DOCUMENT_DATA` call each takes individually, writes one row per document plus one `document_pack_runs` row recording the set. Phase 4 (§15) — this depends on conversational generation (Phase 2) already working reliably for a single document before it's trusted to run several unattended.

---

## 14. Advisor Generates Documents On Demand

The Advisor already embeds actionable tags in its responses — `chat-formatter.tsx` parses `[ACTION: lead_score | ...]`, `[ACTION: pipeline_stage | ...]`, `[ACTION: reply_draft | ...]`, `[ACTION: reminder | ...]` out of the model's text and renders inline buttons wired to `onAction()`. Adding document generation is the same mechanism, not a new one:

1. `ZURI_ACTION_INSTRUCTIONS` (in `services/intelligence/app/routes/conversation.py`) gains one more line: `[ACTION: generate_document | <document_type> | <contact_id> | <one-line brief>]`.
2. `chat-formatter.tsx`'s `ActionType` union and `ACTION_REGEX` handling gain the `generate_document` case, rendering a preview card + a "Generate" button.
3. The advisor page's `onAction` handler adds a `generate_document` case calling `POST /internal/documents/generate` (§7 of the original plan) with the parsed contact/brief, then links to the created document.

"Generate a quotation for Grace using our premium CCTV package" becomes a normal Advisor turn, not a separate document-creation flow the user has to switch pages for.

---

## 15. Updated Phased Roadmap

Phase numbers and scope below supersede the original plan's §8.

### Phase 0 — Foundation
Everything from the original Phase 0 (migrations, Brand Kit, rendering pipeline, `/documents`→`/business` hub with traditional creation only), **plus**: `documents` ships from day one with `agent_id`, `requested_by`, `ai_reasoning`, `document_category`, and the full expanded `document_type` list (§11) — cheap to include even though most of it goes unused until later phases, and avoids a churny type-widening migration later. `deal_stage_history` ships now too, since it's a trivial append-only table and Phase 1 needs it immediately.

### Phase 1 — Business Workflow + Business Timeline
Status lifecycle, one-click convert, WhatsApp delivery (closing the real `SessionManager` gap — unchanged from the original plan's §5), version history — **plus** the Business Timeline (§4): `GET /api/contacts/:id/business-timeline` and the tab that replaces the flat Document Library.

### Phase 2 — AI Generation + Document Memory
Conversational creation, inbox AI Action card, AI-written proposals/contracts, quality checker (all unchanged from the original plan) — **plus** `contact_insights.source_document_id` wiring (§7), `documents.ai_summary` (§6, qualitative only), and the derived business-stage label (§5).

### Phase 3 — AI Document Assistant + Automation
Per-document chat (§12), the `create_document` agent tool (unchanged from the original plan's §7/Phase 3), scheduled/recurring documents, expiring-quotation/overdue-invoice follow-ups through the existing `proactive_queue`, and the Advisor `[ACTION: generate_document]` tag (§14).

### Phase 4 — Business Intelligence
`documents.embedding` + semantic search (unchanged from the original plan), view tracking, Relationship Engine health feed (unchanged) — **plus** the AI-compares-documents Advisor capability (§8), pricing benchmarks via `business_facts` (§9), and Automatic Business Packs (§13). The conversion-likelihood numbers deferred from §6 also land here, once there's enough `documents` history to compute them honestly.

---

## 16. Explicitly Out of Scope for v1 (unchanged from the original plan)

Drag-and-drop document builder, legally-binding e-signatures with OTP/audit trail, multi-level approval workflows, multiple businesses/brand switching, and a full per-country tax/compliance engine — see the original plan's §9 for the specific schema/architecture gap blocking each one. None of this revision's additions change those constraints.

---

## 17. Open Decisions

Carried over from the original plan's §10 (renderer choice: Playwright/Python in `services/intelligence`; template format: server-side Jinja2, not React), plus one new one from this revision:

4. **Business-stage inference (§5) is rule-based, not model-based, for v1.** A future version could have the model reason about stage from richer signals (tone, negotiation chat content), but the rule-based function is free, deterministic, and debuggable — worth shipping first and only replacing if it visibly gets stages wrong often enough to justify the cost of a model call on every timeline render.
