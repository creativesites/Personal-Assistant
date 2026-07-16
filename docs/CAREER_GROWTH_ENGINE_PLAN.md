# The Zuri Career & Growth Engine (Career OS)

## 0. Why This Doc Exists

Not "Help me find a job." **"Help me create more opportunities."** That reframing is the entire point: a job-search assistant stops mattering the day someone gets hired. A Career & Growth Engine matters every day of a professional life — to a student building their first CV, an employed engineer deciding whether to learn Kubernetes, a freelancer waiting on the next contract, a consultant deciding which conference to attend, an executive weighing a board seat. Named **Career OS** to sit alongside Zuri's other named systems — Relationship OS, Business OS, the Neural Layer, the Reality Engine — rather than a bolted-on "jobs" feature.

Zambia is the launch market, not the ceiling. The product bet is: become the best career companion a Zambian professional has ever used (local employer taxonomy, local salary context, WhatsApp-native — the channel Zambians already live in) while keeping every table/engine underneath it market-agnostic, so expansion to Zimbabwe, Botswana, Namibia, South Africa, and beyond is a data/config change, not a rebuild.

This is, deliberately, one of the largest single features proposed for this codebase — on par with the Neural Layer itself in scope. It is planned here as a **master document with a phased build order**, the same discipline `docs/NEURAL_LAYER_PLAN.md` and `docs/ADVISOR_COMPANION_PLAN.md` used: reuse everything reusable, name what's genuinely new, ship a real Phase 1 slice, and write the rest down as roadmap rather than pretend it all ships at once.

---

## 1. Current State — What Already Exists to Build On

Confirmed by reading the actual schema/code, not assumed:

- **`contacts.company`/`contacts.job_title`** (migration `0021`) already exist — a contact is already partially "professional" without any new column.
- **`relationships.network_value`** (migration `0039`) and **`emotional_signals_summary`** (migration `0062`) are the established precedent for a denormalized JSONB "computed summary" column on `relationships`, recomputed on the same cadence `health.py`'s `recalculate()` already runs — the model for a new career-specific summary column (§4).
- **`relationship_connections`** (migration `0038`) — the people-to-people graph. Critically, `connection_type` is a plain `VARCHAR(50)` **with no CHECK constraint** — its existing values (`works_with`, `introduced_by`, `owns`, `refers_to`, `family_of`, `friend_of`, `married_to`) are convention, not enforcement. Adding `recruiter_for`, `mentor_of`, `colleague_at`, `referred_by` needs **zero migration**.
- **`knowledge_graph_edges`** (migration `0065`) — `from_entity_type`/`to_entity_type` are likewise unconstrained `VARCHAR(20)`. Adding a `career_opportunity` entity type to the existing traversal (`services/api/src/lib/knowledge-graph.ts`, `services/intelligence/app/neural/knowledge_graph.py`) needs **zero migration** — this is exactly the substrate the Relationship-to-Opportunity Bridge (§7) needs.
- **`opportunities`** (migration `0038`) is relationship-nudge-flavored and structurally unsuited for reuse here: `contact_id UUID NOT NULL` (a job posting mentioned by a stranger, or found via a source with no associated contact, has none) and its `opportunity_type` CHECK is an 8-value relationship vocabulary (`buying_signal`, `renewal_due`, etc.), not a career one. A **new, purpose-built table** is the right call here — same judgment already made for `deals` existing alongside `opportunities` rather than overloading one table with two shapes.
- **`business_events`** (migration `0076`) + `action_bundles` (migration `0059`, generalized this session) — the generic detected-signal log and the multi-action-bundle-approval mechanism. Both are explicitly designed to be extended with new `event_type`/mention-type values, not rebuilt — this is the direct model for Passive Opportunity Detection (§6).
- **`MessageAnalysis`** (`services/intelligence/app/models.py`) — one LLM call per live message already returns 10 structured signal types (most recently extended this session with `new_products_mentioned`/`suppliers_mentioned`). Adding an 11th, `career_opportunities_mentioned`, follows the exact same pattern.
- **`documents.document_type`** (migration `0043`) **is** a strict CHECK enum (`quotation`, `invoice`, ... `offer_letter`) — unlike the two graphs above, adding `resume`/`cover_letter`/`portfolio_page` genuinely needs a migration (the same kind of CHECK-widen already done for `products.status` this session).
- **`services/api/src/lib/pdf/`** (React-PDF templates, `renderDocumentPdf()`), `document_generator.py`'s conversational-description → `structured_data` pipeline, and `documents.embedding` (pgvector semantic search, migration `0046`) are all directly reusable for AI Resume Studio (§8) — no new PDF engine, no new AI-generation mechanism, no new search infrastructure.
- **`projects`/`project_tasks`/`project_milestones`** (migrations `0060`, `0075`) — `projects.contact_id`/`projects.deal_id` are both nullable FKs (confirmed: a project needn't have a contact yet). The exact same nullable-FK pattern gives "an application is a project" (§9) a one-column migration.
- **`goal_profiles`/`goal_linked_entities`** (migration `0063`) — already a generic, polymorphic goal system (`entity_type`/`entity_id` linking to deal/project/product/contact/document). A career goal ("become Senior AI Engineer by 2027") is just another `goal_profiles` row — **no new goal system needed**, only `goal_linked_entities.entity_type`'s CHECK needs `career_opportunity` added.
- **`services/intelligence/app/services/advisor_companion.py`** — `companion_mode` is set by plain string assignment (`companion_mode = 'gossip'`), no CHECK/enum anywhere blocking a new `'career_coach'` mode — the Career Coach (§11) is an orchestrator extension, not a new service.
- **`services/intelligence/app/services/companion_delivery.py`**'s `deliver_initiated_message()` is already the shared helper every proactive companion cron (spiritual, motivational, interest) delivers through — the Motivation & Accountability Engine (§11) reuses it verbatim.
- **`services/intelligence/app/neural/reflection.py`**, **`neural/prediction.py`**, **`services/reality_engine.py`** are all explicitly pluggable-by-design (new highlight category, new `prediction_type` adapter, new staleness check respectively) — §14 maps exactly what each gains.
- **`daily_worker.py`**'s scheduler slots currently run at 03:00, 04:00, 07:00–19:00 UTC (plus Monday-gated 11:00 and a 6-hour interest cadence) — **20:00 UTC is the next free slot**, the same "next free hour" convention every prior phase this session used.
- **Credits/subscription** (`credits.py`, `subscription_plans`, migration `0073`) — the three existing daily counters (`messages_remaining_today`/`ai_replies_remaining_today`/`nudges_remaining_today`) are sized for conversational volume, not one-shot heavy generations (a full tailored resume, a mock interview transcript). Advisor/Studio chat are precedent for "some AI surfaces are plan-gated, not credit-metered" — Career OS's flagship AI features (§15) follow that precedent rather than forcing a new daily counter.

---

## 2. Philosophy

Every module below must pass one test: **is this useful to someone who already has a great job?** If a feature only makes sense to someone unemployed, it's a job-search feature, not a Career OS feature — still worth building, but it belongs in the Opportunity Engine (§5), not the core Career Profile. Career OS's job is to make a person's whole professional life — network, reputation, skills, opportunities, story — visible, current, and actionable, the same way the Relationship OS did for personal relationships and the Business OS did for a small business's operations.

---

## 3. The Career Graph

**`career_profiles`** (new table, one row per user) is the professional identity Zuri reasons from — the equivalent of `business_profiles` for a person instead of a company: `headline`, `summary`, `skills` (JSONB array of `{name, level, yearsExperience}`), `certifications` (JSONB array), `education` (JSONB array), `languages` (JSONB array), `career_goals_text`, `target_roles` (text array), `target_industries` (text array), `salary_expectation_cents`/`currency`, `remote_preference` (`onsite`/`hybrid`/`remote`/`no_preference`), `relocation_preference`, `work_authorization` (text — deliberately free-text given the range of Southern African work-permit regimes), `github_url`/`linkedin_url`/`portfolio_url`. This is the single source every generated artifact (§8) reads from — the same "one profile, many generated documents" principle `business_profiles` already established for Brand Kit.

**Career goals stay in `goal_profiles`, not a parallel system.** "Become Senior AI Engineer by 2027" is a `goal_profiles` row like any other; `goal_linked_entities.entity_type` gains `career_opportunity` (its CHECK needs one new value) so a goal can link to the specific roles/opportunities that would achieve it.

**The people side of the Career Graph is `relationship_connections` + `contacts`, enriched, not replaced.** A mentor, a recruiter, a hiring manager, a former colleague — these are already `contacts` rows; what's new is professional-flavored `connection_type` values (`recruiter_for`, `mentor_of`, `colleague_at`, `referred_by`, `hiring_manager_for` — all free, per §1) and a new denormalized summary column, `relationships.career_signals JSONB` (mirroring `network_value`/`emotional_signals_summary`'s exact precedent — a migration adds the column; a service recomputes it on the same cadence `health.py` already runs): `{isRecruiter, isHiringManager, canReferLikely, referralCount, mutualProfessionalContacts, currentRole, currentCompany}`.

---

## 4. Professional CRM

Every professional contact's card gains what `career_signals` computes: relationship strength (already `health_score`), last contact (already `last_interaction_at`), referral likelihood and count, shared professional interests (derived the same way `contact_insights` already tags personal interests — a career-flavored `insight_key` namespace, e.g. `professional_interest`, reusing `profiler.py`'s existing insight-writing pass rather than a second extraction call), mutual contacts (a `relationship_connections` count query, same shape `knowledge-graph.ts` already runs for co-purchasers), and — the genuinely new piece — an AI-surfaced "potential mentor" / "potential referrer" read, computed the same deterministic way Studio's Zuri Insights are (a SQL threshold, not a narrative), rendered on `/contacts/[id]` behind the existing `FeatureGate` mode gating.

---

## 5. The Opportunity Engine

**`career_opportunities`** (new table) — one object, many categories, matching the user's own framing that only the workflow differs per category:

```sql
CREATE TABLE career_opportunities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,        -- nullable: many opportunities have no contact yet
  category            VARCHAR(30) NOT NULL,   -- job | contract | consulting | investment | speaking |
                                               -- partnership | collaboration | freelance | board_position |
                                               -- research | mentorship | grant | scholarship | tender |
                                               -- supplier_opportunity | acquisition
  title               VARCHAR(255) NOT NULL,
  company_or_org      VARCHAR(255),
  description         TEXT,
  location            VARCHAR(255),
  is_remote           BOOLEAN,
  salary_range_cents  JSONB,                  -- {min, max, currency} — nullable, ranges are often unknown
  source              VARCHAR(30) NOT NULL,   -- whatsapp_detected | manual | web_search | referral
  source_message_id   UUID REFERENCES messages(id) ON DELETE SET NULL,
  application_url     TEXT,
  deadline            DATE,
  match_score         SMALLINT,               -- 0-100, computed (§ match logic below), nullable until scored
  match_breakdown     JSONB,                  -- {skills, culture, salary, growth, location, goalAlignment}
  status              VARCHAR(20) NOT NULL DEFAULT 'detected'
                        CHECK (status IN ('detected', 'shortlisted', 'applied', 'interviewing',
                                           'offered', 'accepted', 'rejected', 'withdrawn', 'archived')),
  confidence          NUMERIC(3,2) DEFAULT 0.5,   -- only meaningful for source='whatsapp_detected'
  business_event_id   UUID REFERENCES business_events(id) ON DELETE SET NULL, -- Reality-Engine-style linkage
  project_id          UUID REFERENCES projects(id) ON DELETE SET NULL,        -- set once "applied" (§9)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The **status lifecycle** (`detected → shortlisted → applied → interviewing → offered → accepted/rejected/withdrawn → archived`) is deliberately its own vocabulary, not force-fit onto `opportunities.status`'s (`open/acted_on/dismissed/expired`) or `action_bundles.status`'s — a job application's lifecycle is genuinely longer and more specific, and per the Reality Engine's own precedent (`docs/REALITY_ENGINE_PLAN.md` §6), naming a lifecycle explicitly beats forcing it into an unrelated table's enum.

**Match scoring is deterministic, not a narrative LLM call**, same discipline as Studio's Zuri Insights and `pricing_benchmarks.py`: skills overlap (`career_profiles.skills` vs. a lightweight AI-extracted skill list from the opportunity's description — one small structured call, not a full analysis), salary fit (opportunity range vs. `salary_expectation_cents`), location/remote fit (exact match against `remote_preference`), and goal alignment (does this opportunity's `category`/`target_roles`-adjacent title match an active `goal_profiles` row via `goal_linked_entities`). Each sub-score is stored in `match_breakdown` so the UI can explain itself — the same confidence-and-evidence discipline every other engine in this codebase already commits to.

---

## 6. Passive Opportunity Detection

**Reuses the exact `MessageAnalysis` → `business_events` → `action_bundles` pipeline `docs/BUSINESS_EVENTS_PLAN.md` built**, not a parallel detector. `MessageAnalysis` gains `career_opportunities_mentioned: list[CareerOpportunityMention]` (`title`, `company`, `category`, `is_remote`, `evidence`, `confidence`) — one more field on the same one-LLM-call-per-message pass, narrow and high-confidence per the existing instruction style for `new_products_mentioned`. Not gated on `sender_type` (a friend saying "we're hiring React devs" and the user saying "I'm thinking about consulting work" are equally valid signals — the same reasoning already applied to `new_products_mentioned`/`suppliers_mentioned`).

Every detection writes a `business_events(event_type='career_opportunity_detected')` row unconditionally (the audit trail — Studio's "Zuri Noticed" feed already renders this for free once the label map gains one entry), and `action_bundles.py`'s `detect_and_create` gains a new resolved-mention branch producing a `create_career_opportunity` action (`POST /api/career/opportunities`, `status: 'detected'`) — the same conservative "AI proposes, user approves" posture `create_product`/`create_supplier` already established, folded into the same one-bundle-per-message-pass card rather than a separate approval mechanism.

---

## 7. Relationship-to-Opportunity Bridge

The killer feature, and the one that needs the least new infrastructure: `knowledge_graph_edges` already supports arbitrary `from_entity_type`/`to_entity_type` pairs (§1) — a `career_opportunity` → `contact` edge (`relation_type = 'hiring_manager_for'`) plus the existing `relationship_connections` people-graph (`works_with`, `colleague_at`) is already enough data for a shortest-path query: *from the user, through people they actually have relationship history with, to whoever's closest to this opportunity.* `services/api/src/lib/knowledge-graph.ts` gains one new function, `shortestIntroductionPath(userId, careerOpportunityId)`, doing a small bounded BFS (max depth 3 — beyond that, an introduction ask is not credible) over `relationship_connections` weighted by `relationships.health_score`, returning the path plus a suggested-introduction-request draft (reusing the existing Advisor draft-generation pipeline, not a new one). This is deliberately a **read/suggest-only** feature in Phase 1 — Zuri never messages anyone on the user's behalf to request an introduction; it drafts, the user sends.

---

## 8. AI Resume Studio & Portfolio

**Migration adds three `document_type` values** (`resume`, `cover_letter`, `portfolio_page`) to the existing CHECK — the same widen already done for `products.status` this session. Generation reuses `document_generator.py`'s conversational-description-to-`structured_data` pipeline (fed from `career_profiles` instead of `business_profiles`) and the existing React-PDF render pipeline (`services/api/src/lib/pdf/`) — a **new template** per output type (ATS-plain, Modern, Executive) joins the existing `Minimal`/`Modern` document templates, not a new rendering engine.

**Resume analysis** (upload an existing CV, get scored) is a new, narrow AI call — `services/intelligence/app`'s existing `extract_image_text`/PDF-text-extraction path (already used for KB documents, per `ai/client.py`'s `extract_image_text` method) feeds a structured scoring prompt returning the exact breakdown the user described (`atsCompatibility`, `recruiterAppeal`, `technicalStrength`, `achievementFraming`, `formatting`, each 0–100, plus specific rewrite suggestions — "responsibilities → achievements" is a concrete, gradeable rewrite pattern, not vague feedback). Scored resumes and their versions live as ordinary `documents` rows (`document_type='resume'`) — version history, already a shipped Business Workspace capability, is reused verbatim rather than building a second versioning system.

**CV-to-opportunity matching reuses `documents.embedding`** (pgvector, migration `0046`) exactly as designed: embed the opportunity's description and the resume's `structured_data` text, cosine-similarity rank — the same mechanism Business Workspace Phase 4 already built for semantic document search, now with a second consumer.

---

## 9. Applications as Projects

`projects` gains one nullable FK, `career_opportunity_id UUID REFERENCES career_opportunities(id) ON DELETE SET NULL` — the identical pattern `documents.project_id` used to link into Business OS Phase B. Once a `career_opportunities` row moves to `status='applied'`, `POST /api/career/opportunities/:id/apply` creates a `projects` row (title = the opportunity title, `career_opportunity_id` set) and copies a small default task template (`Tailor resume`, `Write cover letter`, `Submit application`, `Follow up in 7 days`) — the exact `POST /api/products/:id/start-project`-from-workflow-template convenience Services Management already shipped, reapplied here. Every subsequent artifact (tailored resume, cover letter, interview notes) attaches to this project the same way a service's project attaches its generated documents.

---

## 10. Interview Memory

**`career_interviews`** (new table): `career_opportunity_id`, `round_number`, `interview_type` (`phone_screen`/`technical`/`behavioral`/`case`/`panel`/`final`), `scheduled_at` (also written to `calendar_events`, reusing the existing calendar integration — no parallel scheduling system), `questions_asked` (JSONB array), `user_notes`, `ai_feedback`, `difficulty_rating`, `outcome` (`pending`/`passed`/`failed`/`withdrawn`). This becomes the memory the user described — "Company X tends to ask system design first" is a plain SQL aggregation over past `career_interviews` rows for the same `company_or_org`, not a new prediction model.

---

## 11. Career Coach & Motivation & Accountability

**Not a new service — an Advisor Companion extension.** `companion_mode` gains `'career_coach'` (no schema change, per §1), reachable the same way `gossip`/`spiritual_companion` already auto-switch on classified intent. The system prompt assembly gains a career-context block (active `career_opportunities`, recent `career_interviews`, `career_profiles` goals) the same way the existing conversation-scoped Advisor already folds in contact/relationship context.

**Motivation & Accountability is a `companion_delivery.py` consumer, not a new delivery mechanism** — a new cron (`career_coach.py`, mirroring `motivational_detector.py`'s shape exactly: plain SQL, no narrative LLM call for the trigger condition, one small LLM call only for the encouraging phrasing itself) checks for: no application activity in N days (→ "want me to shortlist three high-quality roles instead of browsing hundreds?"), a rejection just logged (→ acknowledge concretely: applications submitted, CV score improvement, interview count — pulled from real counts, never generic sympathy), a `career_opportunities` row crossing into `interviewing`/`offered` (→ celebrate). Wired at **20:00 UTC**, the next free daily slot. The tone constraint the user named — encouraging without becoming sentimental or manipulative — is enforced the same way `RELATIONSHIP_ADVICE_POLICY` already constrains Advisor's relationship-advice tone: a named prompt policy block reused across every career-coach message, not a per-message ad-hoc instruction.

---

## 12. Career Radar

A 0–100 composite score, **computed on read** (same judgment as the Intelligence Health Score and Customer tiers — a handful of aggregate queries per page load, not a hot path needing a cached column) from signals every other section above already produces:

- **Network** — professional contacts' average `health_score`, weighted by `career_signals`' recruiter/hiring-manager/mentor flags.
- **Skills** — `career_profiles.skills` coverage against the target roles' AI-extracted skill lists (the same small extraction call §5's match scoring already runs, cached per role title so it isn't recomputed per opportunity).
- **Portfolio** — count and recency of `documents` rows (`document_type IN ('resume','portfolio_page')`) plus whether `career_profiles.github_url`/`portfolio_url` are populated.
- **Interview readiness** — `career_interviews` history: count, average `outcome`, days since last practiced (a mock-interview feature, §16 roadmap, feeds this once built).
- **Market demand** — Phase 1 proxy: frequency of matching `career_opportunities` detected for the user's `target_roles`/`target_industries` over the trailing 90 days (an honest, self-referential proxy — a real external labor-market signal is roadmap, §16, not invented here).
- **Visibility** — Phase 1 proxy: days since the most recent `documents`/portfolio update (a real GitHub/LinkedIn activity feed is roadmap, §16).

Each sub-score renders with its own one-line "why" and a concrete next action, matching the Confidence-and-Evidence discipline every score in this codebase already carries — never a bare number.

---

## 13. Localisation — Zambia First

**Employer taxonomy** — a small seed list of Zambian/Southern African employer categories (banks, telecoms, mines, NGOs/UN agencies, government/civil service, universities, startups) used only to improve match/category inference (e.g. recognizing "Zanaco," "MTN Zambia," "Barrick," "ZRA" as employer-type signals when scoring an opportunity or enriching a contact's `career_signals.currentCompany`) — a static reference table (`career_employer_categories`), not a scraped directory. **Salary context** — `career_opportunities.salary_range_cents` always carries `currency`, defaulting to ZMW for detected-in-Zambia opportunities (reusing the existing multi-currency convention `documents`/`subscription_plans` already use, no new currency-handling code). **Country scope** — `career_profiles` and `career_opportunities` both carry an optional `country` field from day one (Zambia/Zimbabwe/Botswana/Namibia/South Africa seeded, open-ended beyond that) so nothing about the schema assumes a single-country product even though the launch focus and seed data are Zambian.

**Explicitly deferred**: scraping company career pages, global/regional job boards, or recruiter feeds. Phase 1's opportunity sources are WhatsApp-passive-detection (§6) and manual entry/paste-a-job-description — both genuinely buildable now; a multi-source job-board aggregator is a real data-sourcing project of its own (§16).

---

## 14. Integration Map

| Existing engine | What it gains |
|---|---|
| Advisor | `career_coach` companion mode (§11) |
| Projects | `career_opportunity_id` FK; applications become projects (§9) |
| Documents | `resume`/`cover_letter`/`portfolio_page` types; embedding-based CV↔opportunity matching (§8) |
| CRM (contacts/relationships) | `career_signals` summary; new `relationship_connections` types (§3/§4) |
| Knowledge Graph | `career_opportunity` entity type; shortest-introduction-path (§7) |
| Goal Engine | career goals are ordinary `goal_profiles` rows; `career_opportunity` joins `goal_linked_entities` |
| Calendar | interview scheduling reuses `calendar_events` (§10) |
| Reflection Engine | a new highlight category — opportunities detected/applied/interviewed this week, pluggable per its existing design (no restructuring) |
| Prediction Engine | a new `prediction_type` adapter, e.g. `interview_success_likelihood`, against the existing `PredictionEngine.predict()` contract |
| Reality Engine | a new staleness check — an application sitting in `applied` with no movement past a threshold, an interview past its date with no `outcome` recorded — both are the exact "detect and surface, business_events log" shape the Reality Engine already generalizes |
| Business Manager | for freelancers/consultants specifically: a `career_opportunities.category IN ('contract','consulting','freelance')` row surfaces through the *existing* invoice-gap-style nudge once accepted — "you accepted this contract, want Zuri to draft the agreement?" — reusing `business_manager.py`'s pattern, not a parallel one |
| Credits/subscription | §15 |

---

## 15. Subscription & Premium Framing

Positioned as **Career OS**, not "AI Job Search" — the same reasoning that makes a $300k/year executive and an unemployed graduate both plausible subscribers. Per the AI Usage Tiers principle (`CLAUDE.md`): a **Light** user (a passively-detected opportunity once a month, no active search) costs almost nothing — detection reuses the existing per-message analysis call, no incremental cost. A **Normal** user (a few applications a month, occasional resume tailoring) is where most of the value and most of the cost sits. A **Heavy** user (daily applications, frequent mock interviews, weekly resume regeneration) is where token cost genuinely matters — mock interviews and full tailored-resume generation are exactly the kind of "big one-shot generation" this codebase's Pricing doc already flags as a poor fit for the existing daily credit counters. Phase 1 gates the flagship generation features (tailored resume/cover letter generation, mock interviews) by **subscription plan tier** (`monthly_personal` and above) rather than inventing a fourth daily counter — passive detection, the Career Radar, and the Career Graph itself stay available to every tier, including `free`, since a visible-but-locked "unlock AI resume generation" is a stronger upgrade motivator than a fully gated feature nobody's seen the value of yet.

---

## 16. Phased Build Order

**Phase 1 — Foundation**: `career_profiles`, `career_opportunities`, `career_interviews` migrations; `relationship_connections`/`knowledge_graph_edges` new value conventions (no migration); `career_signals` summary column + computation; manual opportunity entry (paste-a-job-description) + status lifecycle API; basic `/career` dashboard.

**Phase 2 — Passive Detection & Bundling**: `MessageAnalysis.career_opportunities_mentioned`; `business_events`/`action_bundles` extension (§6); Studio-style "Zuri Noticed" surfacing.

**Phase 3 — AI Resume Studio**: `document_type` widen; resume upload + scoring; AI resume/cover-letter generation; version management; embedding-based CV↔opportunity matching (§8).

**Phase 4 — Applications as Projects + Interview Memory**: `projects.career_opportunity_id`; apply-flow project templating (§9); `career_interviews` + calendar integration (§10).

**Phase 5 — Career Coach & Motivation**: `companion_mode='career_coach'`; `career_coach.py` cron at 20:00 UTC (§11).

**Phase 6 — Relationship-to-Opportunity Bridge**: `shortestIntroductionPath()` (§7); introduction-draft generation.

**Phase 7 — Career Radar + Reflection/Prediction/Reality integration**: the composite score (§12); Reflection Engine highlight category; Prediction Engine adapter; Reality Engine staleness checks (§14).

**Phase 8 — Localisation Depth**: employer taxonomy seed data, multi-country schema fields (§13) — the schema-level groundwork ships in Phase 1; this phase is about seeding and refining the Zambia-specific data, not new architecture.

Each phase ships independently useful value — per this codebase's own discipline, no phase should be blocked waiting for a later one.

---

## 17. Deferred Roadmap (Documented, Not Built in Any Phase Above)

- **Multi-source job discovery** — scraping company career pages, global/regional job boards, government/NGO recruitment portals. A real data-sourcing pipeline (crawlers, dedup, freshness) — its own project, not a Career OS sub-feature.
- **Real GitHub/LinkedIn/portfolio activity integration** — Personal Brand Intelligence as originally envisioned needs actual API integrations (GitHub contributions, LinkedIn posting activity); Phase 1's Career Radar visibility score is an honest proxy, not this.
- **Salary negotiation AI coach** — a genuinely new conversational capability (real-time negotiation coaching), not a reuse of an existing pattern; deserves its own design pass once the base Opportunity Engine has real usage data.
- **Mock interview voice/video mode** — Phase 1's interview coach is text-based (chat-driven Q&A through the existing Advisor surface); a voice/video mock-interview experience is a materially different product surface.
- **AI Auto-Pitch Customizer's "research the hiring manager"** — needs the same web-search tooling already flagged as a gap in `docs/ADVISOR_COMPANION_PLAN.md`'s Interest Companion (no LiteLLM grounding/tool-calling wired for any provider today); deferred until that gap is closed platform-wide, not solved twice.
- **Learning path generation tied to actual course/certification catalogs** — Phase 1's skill-gap detection (§12) identifies *that* a gap exists; recommending specific courses/providers needs either a curated catalog or the same web-search gap above.
- **A full "Zuri Noticed" equivalent for network-health nudges** (career-version of "you haven't spoken to a mentor in 3 months") — straightforward to build once Phase 1's `career_signals` exists, but not part of Phase 1's own success criteria.
- **Confidence auto-tuning of match scores from outcome history** (did a high-match-score opportunity actually lead to an offer?) — the same "learn from corrections" pattern the Reality Engine's nudge-accuracy metric established; revisit once there's enough `career_opportunities` outcome data to learn from.
