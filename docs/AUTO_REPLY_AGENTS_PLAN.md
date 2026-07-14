# Auto-Reply & Agents — Unification Plan

## 0. Why This Doc Exists

Two systems currently answer the same question — "should Zuri reply to this message on its own?" — from two different places, with a real bug in the wiring between them and no per-contact granularity anywhere. This doc designs the fix: one system, presented at two altitudes (a fast global control in Settings + Inbox, and a deeper per-agent view for anyone who wants it), with genuine per-contact and rule-based control over who's in and who's out.

Nothing here is a rewrite. Every piece below builds on tables and columns that already exist (`agents.is_default`, `agents.trust_level`, `agent_performance_daily`, `GET /api/agents/:id/performance`) but are currently half-wired or entirely unused in the UI.

---

## 1. Current State (confirmed by reading the code, not assumed)

- **`auto_response_settings`** (one row per user) is the actual send-gate: master `enabled` switch, `approval_mode` (auto/preview/manual), business hours + active days, coarse targeting (`respond_to_leads`/`respond_to_customers`/`respond_to_new_contacts`, `skip_groups`/`skip_broadcasts`), `escalation_keywords`. Read by `AutoResponseService.evaluate()` (`services/intelligence/app/services/auto_response.py`).
- **Agents** get assigned to a contact or a segment tag (`agent_assignments`). `orchestrator.route_message()` decides, per message, whether an assigned agent handles it or it falls through to the plain suggestion flow — this routing never looks at `auto_response_settings` at all.
- Inside `agent_engine.handle_agent_message()`, trust level changes what happens next: `observe` does nothing; `suggest`/`assisted` create a draft and then **call the exact same `AutoResponseService.evaluate()`** to decide whether to auto-send it; `delegated`/`autonomous` **skip that call entirely** and send unconditionally, gated only by the agent's own escalation checks and daily send cap.
- **The Inbox auto-reply toggle** is not a separate concept — it's `PUT /api/settings/auto-response` with `{ enabled }` only. That route rebuilds *every* column from `body.field ?? hardcoded_default` on every call (`services/api/src/routes/settings.ts:79-130`), so **flipping the Inbox toggle silently resets business hours, approval mode, and escalation keywords back to their defaults.** This is a live, confirmed bug, independent of anything else in this plan.
- There is no per-contact override anywhere in the schema. `auto_reply_rules` (migration `0006_proactive.sql`) exists in the schema but has zero references in any route, service, or worker — dead since it shipped.
- `agents.is_default` and the performance/impact data model (`agent_performance_daily`, `agent_actions.confidence`, `GET /api/agents/:id/performance`) already exist but aren't used: `is_default` is a settable flag with no behavior attached, and no page in the UI calls the performance endpoint.

---

## 2. The Shape: Agents Are The Engine, One Of Them Is Always "Default"

Every user gets exactly one agent from the moment their account is created: a **Default Assistant** — `is_default = true`, a real persona (name, avatar emoji, tone, greeting message), `trust_level = 'suggest'`, `is_active = true`. It is not a hidden system record; it shows up as a normal card on `/automation` and has its own detail page like any other agent. Settings' "Auto Responses" tab and the Inbox widget are simply the fast, no-jargon way to control *that one agent* without ever having to know the word "agent" — a user who never visits `/automation` still has one, sees its persona in Settings, and can turn it on/off from Inbox.

Power users who create additional agents (Sales, Support, whatever) get the same rules applied uniformly: the global gates in section 3 below, and the per-contact/rule exclusions in section 4, apply to *every* agent, default or custom, because they're evaluated once per message regardless of which agent (if any) ends up handling it.

**Routing change** (`orchestrator.py:route_message`): when no explicit `agent_assignments` row matches a contact, instead of falling through to the bare `generate_suggestion` path, look up the user's `is_default = TRUE AND is_active = TRUE` agent and route to it. The bare non-agent path becomes the fallback-of-a-fallback — only reached if a user somehow has no active default agent (pre-migration edge case, or someone explicitly deactivated it). One extra indexed query (`idx_agents_is_default` already exists) in the `else` branch.

**Auto-creation**: insert the default-agent row in both places a user is created — `services/api/src/routes/auth.ts`'s `clerk-sync` handler (next to the existing subscription/calendar inserts, ~line 91) and the legacy `/api/auth/register` path (~line 156). A one-time backfill migration creates the missing row for every existing user (`WHERE NOT EXISTS (SELECT 1 FROM agents WHERE user_id = u.id AND is_default = TRUE)`).

---

## 3. The Universal Eligibility Gate (fixes the trust-level bypass)

Today, `delegated`/`autonomous` agents skip `auto_response_settings` entirely — meaning the master on/off switch, business hours, and (once built) exclusions have **no effect** on your most autonomous agent, which is backwards from "the system must be robust yet easy to use... always aware and maintains state."

The fix splits `AutoResponseService.evaluate()`'s single check into two concerns that were previously bundled together:

- **`check_eligibility(user_id, contact_id, conversation_id, message_body)`** — is Zuri allowed to engage with this contact right now, at all? Covers: master `enabled`, business hours/active days, `skip_groups`/`skip_broadcasts`, the coarse `respond_to_*` targeting, `escalation_keywords`, and the new per-contact/rule exclusions (section 4). **Applies to every trust level, including `delegated`/`autonomous`.** If ineligible, nothing happens — no draft, no send — same outcome as `observe`, different reason logged.
- **`evaluate()`** (kept, now a thin wrapper) — everything `check_eligibility` covers, *plus* `approval_mode == 'auto'`. Used only where "should this be sent without a human" is a live question: the plain non-agent fallback, and `suggest`/`assisted` agents deciding whether to auto-send their draft. `delegated`/`autonomous` never call this — their trust level already means "no approval needed" — they call `check_eligibility` only, once eligible they send.

This is a precise, minimal change to `agent_engine.py`'s trust-level branching (`observe` unchanged; `suggest`/`assisted` unchanged, since they already call the full `evaluate()`; `delegated`/`autonomous` gain a `check_eligibility` call in front of what they already do) plus one new call at the top of `evaluate()` itself so both entry points share the same exclusion logic.

---

## 4. Per-Contact & Rule-Based Exclusions

Two new tables, both scoped per user, both consulted inside `check_eligibility`:

```sql
-- Explicit, named opt-outs — "never auto-engage this specific person"
CREATE TABLE auto_reply_exclusions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  reason      TEXT,                 -- optional note, e.g. "spouse" — shown back to the user, never required
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_id)
);

-- Rule-based opt-outs — "exclude anyone matching this", resolved against
-- real contact fields at evaluate-time, same free-text-match pattern
-- agent_assignments.segment_tag already uses against contact_tags.
DROP TABLE IF EXISTS auto_reply_rules; -- legacy, migration 0006, zero references anywhere — dead on arrival
CREATE TABLE auto_reply_exclusion_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_type   VARCHAR(30) NOT NULL CHECK (rule_type IN ('relationship_type', 'tag', 'customer_status')),
  rule_value  VARCHAR(100) NOT NULL,
  source_text TEXT,                 -- the original instruction that produced this rule, kept for transparency
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, rule_type, rule_value)
);
```

**Two ways in, both land here:**
1. **Pick contacts directly** — a searchable multi-select in Settings/Inbox ("Exclude: Grace Banda, my Dad") writes straight to `auto_reply_exclusions`. No AI involved, no ambiguity.
2. **Type a plain-English instruction** — "exclude all my relatives", "leave out anyone tagged personal", "don't auto-reply to my wife" — sent to a new small `complete_json()` prompt (`PARSE_EXCLUSION_INSTRUCTION`, same house style as every other structured-extraction prompt in `prompts.py`) that returns either a `rule` (`{rule_type, rule_value}` matched against real `relationship_type` values / `contact_tags` / `customer_status`) or, if a specific name is mentioned, resolves it against the user's actual contact list (never invents a contact — same discipline as document generation's "never free-text match" rule) and returns a `contactId`. **The parsed result is shown back to the user before saving** — "This will exclude: relationship_type = family (12 contacts) — Confirm?" — so a misread instruction is caught before anything is silently excluded.

Both tables are additive on top of the existing coarse `respond_to_leads`/`respond_to_customers`/`respond_to_new_contacts` booleans, not a replacement — the mental model is "respond to these types of contacts, **except** these people/rules," which matches how allow/block lists already work in every inbox product.

---

## 5. Real-Time State Sync

Settings, the Inbox widget (section 7), and an agent's own detail page must always agree, instantly, because the same underlying row can be edited from any of the three. Two changes:

1. **Fix the actual bug**: `PUT /api/settings/auto-response` must merge onto the existing row, not recompute every column from request-body-or-default. Concretely: stop applying JS `?? default` before the query runs; pass `body.field ?? null` and let SQL do `COALESCE(EXCLUDED.field, auto_response_settings.field, <hardcoded default>)` in the `ON CONFLICT` clause — explicit value wins, then whatever's already stored, then the default only for a genuinely first-ever row.
2. **Push, don't poll**: emit a socket event (`agent:default-updated:{userId}`, same Socket.io channel already used for `suggestion:ready:{userId}`) whenever the default agent's `is_active`/`trust_level` changes or `auto_response_settings` is saved — from whichever route made the change (agents PATCH, settings PUT). Settings page, Inbox widget, and the agent detail page all subscribe and update their local state on receipt, so toggling in one place is reflected everywhere else within the same second, with no manual refresh.

---

## 6. Agent Impact — Show What It's Been Doing

The data already exists (`agent_performance_daily`: `messages_handled`, `escalations`, `auto_sent`, `suggested`, `human_overrides`, `avg_confidence`; `GET /api/agents/:id/performance` returns 30 days of it plus lifetime totals) — it's just never been rendered. Add:

- **A "Performance" tab** on `apps/web/src/app/(dashboard)/agents/[id]/page.tsx`, alongside the existing config/actions/assignments tabs: messages handled (7d/30d), auto-sent vs. drafted-for-approval split, escalation count, correction count, a small daily trend sparkline. Reuses the "hours saved" framing already established on the ROI Dashboard (Phase 9) — an auto-sent message is worth roughly the same estimated minutes-saved figure already computed there, rolled up per agent instead of per workspace.
- **A compact version of the same numbers** on each agent's card in `/automation` (e.g. "127 handled this week · 4 escalated") so the impact is visible without opening the detail page.
- The Default Assistant is not exempted from this — its card and detail page show the same stats as any custom agent, since it's doing real work from day one.

---

## 7. Inbox: Always-Visible Auto-Reply Control

The current toggle is a small pill inside the per-conversation action bar (`hidden sm:flex`, only visible with a conversation open, desktop only) — easy to miss entirely, which is exactly the complaint. Two changes:

- **A persistent widget in the Inbox header** (not per-conversation, visible regardless of which conversation is open, visible on mobile): shows the Default Assistant's avatar emoji + name, an on/off switch, and its current trust level as a short label ("Drafts for you" / "Auto-sends"). Clicking it opens a small popover with the on/off switch, a trust-level quick-select (mapped to the same options as the agent's own config, see section 8), and a "Manage in Settings →" link for anything deeper.
- **The per-conversation toggle becomes a per-contact exclusion control instead of duplicating the global switch** — "Exclude [contact name] from auto-reply" right where you're already looking at their conversation, writing straight to `auto_reply_exclusions`. This is a better use of that screen position than a second copy of the global toggle, and it's the single most natural place to act on "don't do this for my spouse" — while looking at the spouse's chat.

---

## 8. Settings Page: One Dial, Not Two

Today there are two overlapping "how autonomous" enums: `auto_response_settings.approval_mode` (auto/preview/manual) and `agents.trust_level` (observe/suggest/assisted/delegated/autonomous) — and `preview`/`manual` are already functionally identical at the evaluate() gate (both simply withhold auto-send; nothing today implements `preview`'s implied "countdown before sending" behavior, that's copy without logic behind it yet).

**Decision: `trust_level` wins.** For an agent-routed contact (which, after section 2, is everyone), Settings' "Auto Responses" tab writes `trust_level` onto the Default Assistant row instead of `approval_mode`. Shown to the user as plain language, not the internal enum names:

| Shown as | `trust_level` |
|---|---|
| "Off — I'll reply myself" | `is_active = false` |
| "Draft replies, I approve every one" | `suggest` |
| "Draft replies, auto-send during business hours if I haven't responded" | `assisted` |
| "Auto-send, only escalate when something needs me" | `delegated` |
| "Fully autonomous" | `autonomous` |

`auto_response_settings.approval_mode` stays in the schema, kept in sync automatically (`suggest`/`assisted` → `preview`; `delegated`/`autonomous` → `auto`) purely so the rare fallback non-agent path (no active default agent) still behaves sensibly — it is no longer shown or editable directly in the UI.

Everything else on the tab is unchanged in spirit, restructured slightly:
- **Business hours, active days, escalation keywords** — unchanged, now genuinely apply to every trust level (section 3).
- **"Who to respond to"** — the existing coarse toggles (leads/customers/new contacts, skip groups/broadcasts) stay as the fast defaults.
- **New "Exceptions" section** — the contact multi-select + plain-English instruction box from section 4, showing currently-active exclusions as removable chips ("Excluding: Grace Banda ✕", "Excluding: relationship_type = family (12 contacts) ✕").
- **Persona fields** (greeting message, away message, tone) move to being the Default Assistant's actual `agents` columns rather than duplicated on `auto_response_settings` — same fields, same tab, just backed by the agent row so `/automation` and Settings never disagree about what the assistant's greeting is.

---

## 9. Explicitly Out of Scope

**A full "exclude this person from AI analysis entirely" privacy switch** — profiling, insight extraction, health scoring, everything — is a materially bigger feature (touches `message_worker.py`'s analysis path, `contact_profiles`, `contact_insights`, health recalculation, and the existing Privacy tab's retention model) and a different kind of decision than "should Zuri reply on my behalf." This plan only covers whether the system *engages/replies* for a contact, not whether it *observes* them. Worth its own pass later if wanted — flagging it explicitly rather than quietly deciding it's covered.

**Rewriting `preview` mode's countdown-before-send behavior** — noted above as a pre-existing gap (copy implies a delay-with-cancel UX that isn't actually implemented), left alone here since it's orthogonal to unifying the two systems.

---

## 10. Phased Roadmap

### Phase 1 — Fix + Foundation
- [ ] Fix `PUT /api/settings/auto-response` merge bug (section 5)
- [ ] `auto_reply_exclusions` + `auto_reply_exclusion_rules` tables (drops dead `auto_reply_rules`)
- [ ] `check_eligibility`/`evaluate` split in `auto_response.py`; wire exclusions into it
- [ ] Remove the `delegated`/`autonomous` bypass in `agent_engine.py` — universal eligibility gate

### Phase 2 — Default Agent
- [ ] Auto-create a `is_default=true` agent (persona, `trust_level='suggest'`) on signup (`clerk-sync` + `register`)
- [ ] Backfill migration for existing users
- [ ] `orchestrator.route_message` falls back to the default agent instead of the bare suggestion path
- [ ] Settings tab restructure: single trust-level dial (section 8), persona fields backed by the agent row

### Phase 3 — Granular Control
- [ ] Contact multi-select exclusion UI (Settings + per-conversation Inbox control)
- [ ] Plain-English instruction parsing (`PARSE_EXCLUSION_INSTRUCTION`) with confirm-before-save preview
- [ ] "Exceptions" chip list in Settings

### Phase 4 — Always-Visible + Real-Time
- [ ] Inbox header widget (on/off, trust-level quick-select, link to Settings)
- [ ] `agent:default-updated:{userId}` socket event; Settings/Inbox/agent-detail all subscribe

### Phase 5 — Impact
- [ ] "Performance" tab on agent detail page
- [ ] Compact stats on `/automation` agent cards
- [ ] "Hours saved" framing reused from the ROI Dashboard, per-agent

---

## 11. Open Decisions

- **Default Assistant naming/emoji** — needs a real name and avatar emoji shown from day one (not "Default Agent"). Placeholder for now: name "Assistant", emoji 🤝, `role_title` "Personal Assistant" — happy to change before Phase 2 ships.
- **What happens to a message from an excluded contact today** — does it still get analyzed (profile/insights/health, per the out-of-scope note in section 9) and just never get a suggestion/auto-send, or should an excluded contact also skip suggestion *generation* entirely (no `suggested_replies` row at all, not just no auto-send)? Current plan assumes the former (still draftable manually from the inbox, just never auto-engaged) — flagging in case the intent was closer to "treat them like Zuri isn't running for this person at all."
