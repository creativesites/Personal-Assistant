# Zuri Documents: An AI-Native Business Document System

**Status**: Planning — nothing in this doc is built yet. Written to be read before Phase 0's migration is.

> Conversations create business. Documents close business.

The mistake most CRMs make is treating a quotation or invoice as an isolated file — something you export once and forget. In Zuri, every quotation, invoice, receipt, purchase order, contract, and proposal is a first-class object: it starts from a conversation, links to a contact/deal/opportunity, moves through a visible lifecycle, and feeds the same Relationship Engine that already tracks health scores and proactive suggestions. Documents becomes another intelligence engine, not a PDF export button bolted onto the CRM.

This doc grounds that vision in what Zuri's codebase actually has today (§1), makes the architecture calls the vision brief left open (§2–§7), and lays out a five-phase build (§8) that ships something real at the end of each phase instead of one big-bang release.

---

## 1. What This Builds On (verified, not assumed)

Every module below already exists and this plan extends it rather than duplicating it:

| Existing piece | Where | How Documents uses it |
|---|---|---|
| `products` table (migration `0031`) | name, specs, price, currency, images, quantity | A quotation/invoice line item is a `product_id` reference + qty + price snapshot, not re-typed data |
| `contact_products` (migration `0039`) | contact ↔ product with `purchased/interested/quoted/...` | A generated quotation writes a `quoted` row here automatically; an accepted one becomes `purchased` |
| `deals` (migration `0037`) | pipeline stage, value, `product_ids` | Quotations/invoices link to `deals.id`; an accepted quotation can advance the deal's stage |
| `opportunities` (migration `0038`) | AI-detected buying signals, `linked_deal_id` | A `buying_signal` opportunity is exactly the trigger for "AI suggests generating a quotation" (§6) |
| `contact_documents` (migration `0024`) | arbitrary uploaded files per contact, `doc_category` enum | Stays as-is for human uploads (a signed PDF mailed back, a photo of a paper contract). **Not replaced** — see §2 for how the two tables relate |
| `agent_engine.py` tool-calling + `trust_level` (`observe/autonomous/delegated`) | `execute_tool()` dispatches named tools like `update_pipeline_stage` | Adding a `create_document` tool here is the concrete path to "Sales Agent generates a quotation without human intervention" (§7) |
| `AIClient.complete_json()` / `complete_text()` (`services/intelligence/app/ai/client.py`) | structured-JSON and free-text LLM calls, already used by every existing generator (proactive suggestions, content generation, goal next-steps) | Same calls generate document data — no new AI plumbing needed |
| `pdf-parse` (Node, `services/api`) / `pdfplumber` (Python, `services/intelligence`) | already installed dependencies, currently used for KB file ingestion | Reused as-is for AI Extraction (§8, Phase 4) — uploading an old PDF and getting structured data back needs zero new dependencies |
| Local shared-volume file storage (`MEDIA_DIR`, `kb_documents.storage_path`) | `services/api/src/routes/media.ts` streams files off a Docker volume, no S3 | Generated PDFs are stored and served the same way — one more file type in the same convention, not a new storage system |
| `messages.send` / `SessionManager.sendMessage()` (`services/whatsapp`) | **text-only today** — `sock.sendMessage(jid, { text })` at `session-manager.ts:279` | Sending a generated PDF over WhatsApp requires extending this. This is real Phase 1 work, not a footnote — see §5 |
| `relationship_health_logs` / `health.py` factor list | append-only health-score history | An unpaid invoice or an accepted quotation becomes a new health factor (§8, Phase 4) — extends existing logic, doesn't fork it |
| `context_snapshots.embedding` / `message_analyses.embedding` (pgvector) | existing semantic-search precedent | `documents.embedding` follows the identical pattern for "find that quotation where Peter wanted Samsung phones" (§8, Phase 4) |

**What's genuinely missing and has no existing analog:** a document-rendering pipeline (nothing in this repo turns structured data into a PDF today), and any concept of a reusable "brand kit" (logo/bank details/numbering) — both are net-new, scoped in §3–§4.

---

## 2. `contact_documents` vs. `documents` — two different concerns, not a merge

`contact_documents` (migration `0024`) already covers "a file a human uploaded and tagged" — a scanned signed contract, a photo of a delivery slip, a PDF a customer emailed in. It stays exactly as it is.

The new `documents` table is specifically for **structured, AI/template-generated business documents that Zuri itself created** — a quotation has line items, a total, a status, a document number; a random uploaded PDF doesn't. Keeping them separate avoids retrofitting structure onto a table designed for opaque blobs. The two cross-link: `contact_documents` gets a nullable `generated_document_id` so "customer sent back the signed version" can point at the quotation that produced it.

---

## 3. Data Model

```sql
-- Business identity + defaults, one row per user (same 1:1 convention as
-- auto_response_settings). This is the "Brand Kit."
CREATE TABLE business_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name        VARCHAR(255),
  logo_storage_path   VARCHAR(2000),
  address             TEXT,
  phone               VARCHAR(50),
  email               VARCHAR(255),
  website             VARCHAR(255),
  tax_id              VARCHAR(100),          -- TPIN or country equivalent
  registration_number VARCHAR(100),
  bank_details        JSONB NOT NULL DEFAULT '{}',   -- {bankName, accountName, accountNumber, branchCode}
  mobile_money        JSONB NOT NULL DEFAULT '{}',   -- {provider, number}
  signature_storage_path VARCHAR(2000),
  stamp_storage_path     VARCHAR(2000),
  theme_color         VARCHAR(20) NOT NULL DEFAULT '#4F46E5',
  accent_color        VARCHAR(20) NOT NULL DEFAULT '#818CF8',
  default_template_id UUID,                  -- FK added after document_templates exists
  footer_text         TEXT,
  default_terms       TEXT,
  payment_instructions TEXT,
  default_currency    VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  default_tax_rate    DECIMAL(5,2) NOT NULL DEFAULT 0,
  numbering           JSONB NOT NULL DEFAULT
    '{"quotation":{"prefix":"QT-","next":1},"invoice":{"prefix":"INV-","next":1},
      "receipt":{"prefix":"RC-","next":1},"purchase_order":{"prefix":"PO-","next":1},
      "delivery_note":{"prefix":"DN-","next":1},"credit_note":{"prefix":"CN-","next":1},
      "contract":{"prefix":"CT-","next":1},"proposal":{"prefix":"PR-","next":1}}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Layouts. System templates ship with user_id NULL; custom templates (later
-- phase) have a user_id. layout_key maps to a renderer-side HTML template
-- file — the DB never stores markup (see §4).
CREATE TABLE document_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  layout_key   VARCHAR(100) NOT NULL,   -- e.g. 'minimal', 'modern', 'corporate'
  category     VARCHAR(50),             -- industry hint: retail/construction/legal/...
  applicable_to JSONB NOT NULL DEFAULT '[]',  -- document_type values this layout supports
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The core object.
CREATE TABLE documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id             UUID REFERENCES deals(id) ON DELETE SET NULL,
  opportunity_id      UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  conversation_id     UUID REFERENCES conversations(id) ON DELETE SET NULL,
  template_id         UUID REFERENCES document_templates(id) ON DELETE SET NULL,
  document_type       VARCHAR(30) NOT NULL CHECK (document_type IN
                        ('quotation','invoice','receipt','purchase_order','delivery_note',
                         'credit_note','contract','proposal','certificate','letter','custom')),
  document_number     VARCHAR(50) NOT NULL,   -- e.g. 'QT-2026-0154', assigned from business_profiles.numbering
  title               VARCHAR(255) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN
                        ('draft','generated','sent','viewed','downloaded',
                         'accepted','rejected','expired','paid','archived')),
  structured_data      JSONB NOT NULL,   -- the AI/form-produced JSON: line items, terms, notes (§6)
  currency            VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  subtotal_cents      BIGINT NOT NULL DEFAULT 0,
  discount_cents      BIGINT NOT NULL DEFAULT 0,
  tax_cents           BIGINT NOT NULL DEFAULT 0,
  total_cents         BIGINT NOT NULL DEFAULT 0,
  storage_path        VARCHAR(2000),     -- rendered PDF, once generated
  version             INT NOT NULL DEFAULT 1,
  source_document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,  -- prior version OR the doc this one converted from
  ai_generated        BOOLEAN NOT NULL DEFAULT TRUE,
  source_message_ids  JSONB NOT NULL DEFAULT '[]',
  embedding            vector(1536),     -- Phase 4, see §8
  expires_at          TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  viewed_at           TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_user_type ON documents(user_id, document_type);
CREATE INDEX idx_documents_contact ON documents(contact_id);
CREATE INDEX idx_documents_status ON documents(user_id, status);
CREATE UNIQUE INDEX idx_documents_number ON documents(user_id, document_number);

-- Append-only timeline, same pattern as relationship_health_logs.
CREATE TABLE document_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  event_type   VARCHAR(30) NOT NULL,  -- created/edited/sent/viewed/downloaded/accepted/rejected/paid/reminder_sent
  metadata     JSONB NOT NULL DEFAULT '{}',
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_document_events_document ON document_events(document_id, occurred_at DESC);

-- Cross-link for the human-uploaded case described in §2.
ALTER TABLE contact_documents ADD COLUMN generated_document_id UUID REFERENCES documents(id) ON DELETE SET NULL;
```

**Numbering** is a JSONB counter on `business_profiles`, incremented with `UPDATE business_profiles SET numbering = jsonb_set(numbering, '{quotation,next}', (numbering->'quotation'->>'next')::int + 1) WHERE user_id = $1 RETURNING numbering->'quotation'->>'next'` inside the same transaction that inserts the document row — avoids a separate sequences table per user while still being race-safe.

**Line items live inside `structured_data`, not a separate table.** A quotation's items are `[{productId, description, quantity, unitPriceCents, discountPct, taxPct, lineTotalCents}]` inside the JSONB blob. This mirrors the `deals.product_ids` / `products.specs` precedent of "flexible JSONB over a rigid child table" already established in this schema, and means version history (below) is just a JSONB diff, not a join-table snapshot problem.

---

## 4. The Rendering Pipeline — AI never lays anything out

This is the one architectural principle from the vision brief that matters most, and it's already how every other AI feature in this codebase works: `complete_json()` produces structured data; nothing downstream asks the model to produce markup, layout, or pixels. Documents follows the same three steps:

```
User intent (typed, spoken, or inferred from a WhatsApp message)
        │
        ▼
AIClient.complete_json()  →  structured_data JSON
  (line items, totals, terms text, prose sections — never HTML)
        │
        ▼
Template renderer  →  fills an HTML template with structured_data
  (Jinja2, in services/intelligence — same service that already does
   pdfplumber/OCR work, so no new heavy dependency lands in services/api)
        │
        ▼
Headless-browser PDF render  →  Playwright (Python) renders the HTML to PDF
        │
        ▼
Write to shared volume, same convention as kb_documents.storage_path /
MEDIA_DIR — served back through a documents.ts route modeled directly on
the existing media.ts range-request file server
```

**Decision: Playwright in `services/intelligence`, HTML/Jinja2 templates, not React-PDF and not a Node renderer in `services/api`.** Reasoning: `services/intelligence` already owns every AI-adjacent file-processing concern (OCR via `pdfplumber`, image extraction) — adding Chromium there keeps `services/api` a thin request/queue router, which is what it is everywhere else in this codebase. Templates are plain HTML+CSS files (one per `layout_key`), not database rows — consistent with how this repo already treats prompts (`prompts.py` constants, not DB-editable) for anything that needs careful, reviewable formatting.

**The document builder ("Canva meets Word") from the vision brief is explicitly not Phase 0-3 work.** A drag-and-drop component system is a multi-month project on its own; §7 covers why it's deferred without dropping the idea.

---

## 5. WhatsApp Delivery — closing the real gap

"Send Now" only means something if Zuri can actually attach a PDF to a WhatsApp message, and today it can't — `SessionManager.sendMessage()` (`services/whatsapp/src/lib/session-manager.ts:279`) and the Baileys transport underneath it only send `{ text }`. Closing this is concrete, scoped Phase 1 work:

1. `packages/shared-types/src/queue.ts` — add a `mediaUrl`/`mediaPath`, `mimeType`, `fileName` set of optional fields to the existing `SendReplyJob` (reusing one queue rather than minting `documents.send`, since a document-attached message is still fundamentally "send this to this JID").
2. `services/whatsapp/src/transport/baileys.ts` — add a `sendDocument(jid, { path, mimetype, fileName, caption })` method calling `sock.sendMessage(jid, { document: { url: path }, mimetype, fileName, caption })`.
3. `SessionManager.sendMessage()` branches on whether the job carries a document payload.
4. `services/whatsapp/src/lib/reply-consumer.ts` passes the new fields through.

No new queue, no new worker — the existing `messages.send` consumer gets one more capability.

---

## 6. AI's Job vs. the Renderer's Job

| AI (`services/intelligence`) | Renderer (template + Playwright) |
|---|---|
| Understand the request (typed instruction, inbox message, or agent trigger) | Layout, typography, pagination |
| Resolve the contact (fuzzy match against `contacts`) | Tables, headers, footers |
| Resolve products (fuzzy match against `products`, pull price/tax/stock) | Logo/brand color placement from `business_profiles` |
| Pick `document_type` and a sensible `template_id` (§7's template-recommendation step) | QR code / barcode rendering |
| Calculate totals, apply tax/discount rules | Deterministic, pixel-identical output for the same JSON |
| Write prose sections as **plain text fields inside the JSON** — a proposal's "scope" or a contract's clause text is a string value, never a layout decision | — |
| Suggest a discount using the same evidence-based reasoning already used for pricing (see `docs/MEMORY_ENGINE_PLAN.md`'s `business_facts` confidence model) | — |

Two new prompt constants added to `services/intelligence/app/ai/prompts.py`, following the exact shape of every existing prompt there (`GENERATE_PROACTIVE_SUGGESTION`, `GENERATE_REPLIES`, etc.):

- `GENERATE_DOCUMENT_DATA` — conversation/instruction + resolved contact/products context → the full `structured_data` JSON (items, terms, notes, suggested discount).
- `WRITE_DOCUMENT_SECTION` — used for proposals/contracts where a single named section (executive summary, scope, terms) needs longer prose than a quotation ever does; called once per section rather than forcing one giant prompt to produce a whole proposal at once.

---

## 7. Two Creation Paths, Sequenced

**Traditional (Phase 0):** `/documents` → "New Document" → pick type → form pre-filled by picking a contact (pulls name/company) and products (pulls price/tax/description) → renders. No AI call required — this has to work even before the AI path exists, and it's also the fallback when AI resolution is ambiguous.

**AI conversational (Phase 2):** `"Generate a quotation for Peter — 2 iPhone 15 Pro, 5 AirPods, delivery Friday, 10% off"` → `POST /internal/documents/generate` → `GENERATE_DOCUMENT_DATA` resolves Peter against `contacts`, resolves the two products against `products`, computes totals, returns `structured_data` → user reviews/edits → render. Same `complete_json` pattern already proven by the proactive-suggestion regenerate endpoint shipped this session (`services/intelligence/app/routes/proactive.py`) — no new plumbing, just a new prompt and a new resolution step.

**Inbox integration (Phase 2):** when a message's existing analysis (`ANALYSE_MESSAGE` in `prompts.py`) shows `intent.primary == 'request'` with product/quantity entities present, the inbox surfaces an "AI Action" card next to the message — "Customer is requesting a quotation. 2x Canon Printer detected. Estimated total ZMW 18,000. [Generate] [Edit] [Send]" — mirroring the `ProactiveSuggestion` card pattern (`Send Now` / `Regenerate` buttons, shipped this session for `proactive_queue`) applied to a document draft instead. This does **not** require a new detector: it's a small addition to the fields `ANALYSE_MESSAGE` already extracts (`entities`, `products_mentioned`, `intent`), read by the inbox UI, not a second AI call per message.

**Template recommendation, not a template question.** Instead of asking "which template?", the create flow defaults to `business_profiles.default_template_id`, with the picker still available. A per-industry recommendation (construction → detailed BOQ layout, retail → simple layout) is a nice-to-have `category` filter on `document_templates`, not a model call — no need to spend an LLM request choosing a stylesheet.

---

## 8. Phased Roadmap

Each phase ships something a real user can use — no phase depends on unbuilt future phases to be useful on its own.

### Phase 0 — Foundation
- Migrations: `business_profiles`, `document_templates`, `documents`, `document_events`, `contact_documents.generated_document_id`.
- Brand Kit: new Settings tab (`business_profile`), following the existing lazy-load-per-tab convention (`enterprise`/`memory`/`auto_responses`).
- Rendering pipeline end to end: Playwright + Jinja2 in `services/intelligence`, 2 system templates (Minimal, Modern) covering Quotation + Invoice only, PDF written to the shared volume, served via a new `services/api/src/routes/documents.ts` route modeled on `media.ts`.
- `/documents` hub page: one top-level nav item (own sidebar entry — a real object model, unlike `/studio` which is more clearly an add-on module), with an Overview + per-type sub-nav (mirroring `analytics/page.tsx`'s `SUB_NAV` pattern rather than the ~15-item sidebar tree in the original brief — one hub page keeps this consistent with how `/studio` and `/automation` already consolidated similarly broad feature sets).
- Traditional creation flow only (§7). No AI generation yet.

### Phase 1 — Business Workflow
- Full status lifecycle (§3) + `document_events` timeline rendered per-document.
- One-click convert: `POST /api/documents/:id/convert` — copies `structured_data` forward, sets `source_document_id`, assigns a new number in the target type's sequence. Quotation → Invoice → Receipt chain first; others follow the same code path.
- WhatsApp delivery (§5) — "Send Now" becomes real.
- Document Library tab on `/contacts/[id]`, alongside the existing Messages/AI Notes tabs.
- Version history: editing a sent document creates a new `documents` row with `source_document_id` pointing at the prior version and `version` incremented, rather than mutating in place — "restore" is just re-pointing `is_current`-equivalent status.

### Phase 2 — AI Generation
- Conversational creation (§7) via `GENERATE_DOCUMENT_DATA`.
- Inbox AI Action card (§7).
- AI-written proposals/contracts via `WRITE_DOCUMENT_SECTION`, with 2 additional templates suited to longer documents.
- Quality checker: one `complete_json` call against a fixed checklist prompt (missing totals, empty terms, expired pricing) before a document is allowed to move from `draft` to `generated`.

### Phase 3 — Automation
- Scheduled/recurring documents (monthly invoices, subscription renewals) via a polling worker matching the existing `social-publish-worker.ts` house style (plain interval loop, not a new BullMQ repeatable-job pattern).
- `create_document` tool added to `agent_engine.py`'s `execute_tool()`, gated by `trust_level` exactly like `update_pipeline_stage`/`schedule_followup` today — an `autonomous`/`delegated` agent can generate and send a quotation unattended; lower trust levels draft it for review instead.
- Expiring-quotation / overdue-invoice follow-ups surfaced through the **existing** `proactive_queue`, not a new feed — this is exactly the `check_in`/`follow_up` suggestion-type machinery already built, pointed at a new trigger condition.

### Phase 4 — Intelligence
- `documents.embedding`, populated the same way `context_snapshots.embedding` already is, powering Advisor queries like "quotations over K50,000 that expired unaccepted" (the exact-filter cases don't even need embeddings — pure SQL on `status`/`total_cents`/`expires_at` — embeddings matter for fuzzier recall like "that quotation where Peter wanted Samsung phones").
- View tracking: a lightweight public tracking endpoint on the shareable PDF link populates `viewed_at`/`document_events` — this is the one piece of Phase 4 with a real new surface (an unauthenticated, token-scoped route), everything else reads existing data.
- Document outcomes feed the Relationship Engine: an unpaid invoice past due lowers `health_score` via a new factor in `health.py`'s existing list; an accepted quotation raises it — extension of existing logic, not a fork.
- Pricing/discount suggestions reuse the `business_facts` confidence-accumulates-with-evidence model from the Memory Engine, rather than a separate pricing-intelligence system.

---

## 9. Explicitly Out of Scope for v1 (and why)

| Idea from the vision brief | Why it's deferred |
|---|---|
| Drag-and-drop document builder ("Canva meets Word") | A multi-month project in its own right; §4's fixed-template renderer covers the actual near-term need (consistent, branded PDFs) without it. Revisit once usage data shows which layouts users actually want to customize beyond what templates + Brand Kit already cover. |
| Legally-binding e-signatures with OTP verification + audit trail | v1 covers "upload a signature image, it appears on the document" via `business_profiles.signature_storage_path` — real e-signing is a third-party integration decision (DocuSign-style), not something to build in-house. |
| Multi-level approval workflows (salesperson → manager → finance) | No org/role hierarchy exists in the schema beyond `users.role` (`user`/`admin`) at the account level — this needs the Enterprise/team tables (migration `0019`) to mature into real roles first. Sequenced after that, not before. |
| Multiple businesses / brand switching | Same underlying gap — `users` is 1:1 with one business today. `business_profiles` is deliberately shaped 1:1 with `users` for v1, but that's the seam to later key by an `org_id` if/when Zuri gets real multi-tenant orgs — not solved by this plan. |
| Full per-country tax/compliance engine | v1 makes tax rate, label (VAT/GST/Sales Tax), and currency configurable per Brand Kit — it does not encode any country's actual tax law. |

---

## 10. Open Decisions

These are the calls this plan makes by default; flagging them explicitly rather than burying them, per this repo's own convention (see `ZURI_MARKETING_EXPANSION.md` §11):

1. **Renderer choice (Playwright/Python in `services/intelligence`)** — the alternative is a Node/Puppeteer renderer inside `services/api`. Recommended default: intelligence, per §4's reasoning. Worth confirming before Phase 0's migration, since it decides which service gets the new dependency.
2. **`/documents` as a new top-level nav item** vs. folding into an existing hub. Recommended: new top-level item, since (unlike Studio) documents are a first-class, permanent object model most businesses use daily — not an add-on module behind an entitlement gate.
3. **Template format is server-side HTML/Jinja2, not React-based.** Keeps the render step out of the Node/React world entirely, at the cost of template authors needing to know Jinja2 instead of JSX. Revisit if a future visual builder (§9) changes this calculus.
