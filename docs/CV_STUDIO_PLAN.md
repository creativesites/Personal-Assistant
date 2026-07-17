# Zuri CV Studio & Job Search OS — Redesign Plan

## 0. Why This Doc Exists

This is a deliberate course-correction on top of `docs/CAREER_GROWTH_ENGINE_PLAN.md`'s own Phase 3 (AI Resume Studio). That phase shipped a working "describe your resume, AI writes it" flow — technically real, but strategically wrong for the actual highest-value user segment: **job seekers**, who are by far Career OS's largest addressable market. An AI that invents career content is a liability for this audience (a fabricated bullet point in a CV a person then submits to a real employer is a genuine harm, not a demo weakness), and it produces a document the user doesn't fully own or trust.

**The philosophy changes from "AI writes your CV" to "Zuri helps you build the best version of your real professional history."** The AI's role narrows to: polish, rewrite, reorganise, suggest, analyse, score, tailor. It never invents a fact, a number, or an experience the user didn't provide. This one sentence reshapes every downstream design decision in this doc.

Alongside this, Career OS's own roadmap is reprioritized: **job search becomes the daily-engagement layer**, with the broader Career OS vision (Coach, Radar, Networking Bridge — all already shipped, see `docs/CAREER_GROWTH_ENGINE_PLAN.md` Phases 1–8) sitting underneath it as supporting infrastructure rather than the primary surface.

---

## 1. What's Being Replaced, What's Being Kept

Confirmed by reading the actual code shipped this session, not assumed:

- **Kept, unchanged**: `career_profiles`, `career_opportunities` (including its already-unused `source='web_search'` and `match_score`/`match_breakdown` columns — this plan is their first real writer), `career_interviews`, `career_signals`, the Relationship-to-Opportunity Bridge, Career Radar, Career Coach, the passive-detection→action-bundle pipeline, `documents.document_type`'s `resume`/`cover_letter`/`portfolio_page` values, the `Resume.tsx`/`CoverLetter.tsx` React-PDF templates (still valid render targets, just fed from a different data source), version history via `source_document_id` (already generic, already works).
- **Replaced**: `resume_studio.py`'s `generate_resume_data()`/`generate_cover_letter_data()` (whole-document generation from a free-text instruction) — these invent structure from a prompt rather than editing a structured profile the user owns. They're deleted, not deprecated-in-place, once this plan's wizard/editor ship a real replacement (see §19 migration note).
- **Kept and repositioned**: `score_resume_text()`/`extract_resume_text()`/`match_resume_to_opportunities()` — these are already philosophically correct (score what exists, don't invent) and become the ATS Analysis / Job Matching engines this plan calls for, reused near-verbatim.
- **New foundation**: the Master Career Profile becomes a genuinely structured data model (not just the flat `career_profiles` row from Phase 1) — see §3.

---

## 2. Three Ways to Create a CV

1. **Build New** — a guided wizard (§4), ideal for graduates/first CVs with no existing document to work from.
2. **Upload Existing** — PDF/Word/image upload → `extract_resume_text()` (already built, `pdfplumber` for PDF) → a new structured-extraction pass (one AI call, extraction only — pull out what's *there*, never add) parses the raw text into the same field structure the wizard edits. Nothing stays trapped inside a PDF.
3. **Import From Existing Data** — Zuri already knows things: `career_profiles`, `projects`/`project_tasks`, `documents` (certificates), `career_profiles.education`/`certifications` already captured in Phase 1, `business_profiles`, and the profile's own `linkedin_url`/`github_url`/`portfolio_url`. A confirmation step ("We already know some information about you — import it?") pre-fills wizard steps from these sources; nothing is silently merged without the user seeing it first.

All three paths converge on the same structured data model (§3) — there is no separate "AI-generated CV" data shape anymore.

---

## 3. Master Career Profile — The Source of Truth

The relational upgrade `career_profiles`' Phase-1 JSONB-array fields (`skills`, `certifications`, `education`, `languages`) needed once they're edited field-by-field in a wizard rather than written once by an LLM call. New tables, all `user_id`-scoped, all editable independently of any specific CV:

```sql
career_employment_history   -- employer, title, location, employment_type, start/end dates, is_current,
                             -- responsibilities (text), achievements (text[]), technologies (text[]),
                             -- manager_name, reference_available (bool), reason_for_leaving (private-only, never rendered)
career_education_entries    -- institution, qualification, programme, start/end, grade, awards, relevant_modules
career_certifications       -- (already exists as career_profiles.certifications JSONB — migrate to a real table:
                             --  name, issuer, issued_date, expiry_date, credential_id, url, upload_document_id)
career_skill_groups         -- group_name (Programming/Soft Skills/Management/Languages/...), skills (text[]), sort_order
career_awards               -- title, issuer, date, description
career_volunteer_work       -- organisation, role, start/end, description
career_memberships          -- institution (freeform — "Engineering Institution of Zambia", "Zambia ICT Association", etc.,
                             --  never hardcoded to a fixed list), membership_number, since_date
career_publications         -- title, publisher, date, url, co_authors
career_references           -- mode ('available_on_request' | 'listed'); when listed: name, company, phone, email, relationship
```

`career_profiles` itself keeps personal details (§4 Step 1) plus the new fields Step 14 needs (driving licence, passport/NRC — hidden by default, nationality, work permit status, willing to relocate, expected salary, availability, notice period) and gains a `default_page_size` (`A4`/`Letter`, default `A4`) and `use_cv_terminology` (bool, default true for Zambia-first — controls whether the UI says "CV" or "Resume").

**Projects reuse, not duplication** (Step 8, §4): the existing `projects` table (Business OS Phase F) is already exactly what a portfolio project is — title, description (via linked documents/tasks), dates, and now gains `is_portfolio_visible BOOLEAN DEFAULT true` so a project can be excluded from CV pickers (e.g. an internal-only client project). A CV's "Projects" section stores a `career_cv_project_links` join (cv_id, project_id, sort_order, custom_description_override) rather than copying project data — editing the source project once updates every CV that references it, same "update once, every CV updates" principle the whole plan is built on.

**One CV is one row in a new `career_cvs` table** (title, template_key, page_size, is_master, career_opportunity_id nullable — for a tailored variant, structured_content JSONB snapshot of section ordering/visibility/theme, current_version), with `career_cv_sections` (cv_id, section_type, is_visible, sort_order, custom_heading) driving the drag/hide/reorder editor (§9). A tailored variant (§8) is a new `career_cvs` row with `source_cv_id` set (mirrors the existing `documents.source_document_id` version-chain convention) — its own summary/skills-order/achievement-emphasis, but pulling employment/education/certifications live from the same Master Career Profile tables, never copied.

---

## 4. The Wizard — 14 Steps

Autosave on every field blur (no explicit "save" step), one section per step, live preview beside it (§9). Steps map directly onto §3's tables:

1. **Personal Details** — name, title, phone (local-format default, international supported), email, location, country, LinkedIn/GitHub/portfolio/website, driving licence, nationality (optional, hidden by default), work permit.
2. **Professional Summary** — large text area + AI buttons (Improve / Shorten / Professional tone / Executive tone / Graduate tone / ATS Optimise) — all rewrite-in-place on the user's own words, never a blank-page generator.
3. **Career Objectives** (optional) — same rewrite-only AI assist.
4. **Employment History** — unlimited entries, all §3 fields. Every entry gets three scoped AI actions: **Improve** (grammar/clarity on the existing text), **Convert Responsibilities → Achievements** (rewrites "Developed websites" → "Developed and maintained multiple client websites using React and Node.js" — reframes *what's already stated*, adds no numbers not already present), **Add Metrics** (prompts the user for a real number rather than inventing one — see §6's `SUGGEST_METRIC_PROMPT`, which asks a question back instead of generating a stat).
5. **Education** — unlimited entries.
6. **Professional Certifications** — unlimited, with an upload slot per entry (reuses the existing `documents`/storage pipeline — a cert PDF is just another stored file, `document_type` gains `'certificate'`... already in the CHECK list from Business Workspace Phase 0, no migration needed).
7. **Skills** — grouped (`career_skill_groups`), with an AI "suggest grouping" action that only re-buckets skills the user already listed, never adds new ones.
8. **Projects** — checkbox picker over the user's own `projects` rows (plus, once it exists, portfolio items) — imports description/dates/tech/links live, edits are per-CV overrides in `career_cv_project_links`, never a fork of the underlying project.
9. **Awards**.
10. **Volunteer Work**.
11. **Professional Memberships** — freeform institution field (Engineering Institution of Zambia, Zambia ICT Association, medical/legal/accounting bodies, etc. — never a hardcoded dropdown, since this must work for any country/profession).
12. **Publications** (optional).
13. **References** — `available_on_request` vs. a listed table (name/company/phone/email/relationship) — still commonly expected in the Zambian market, per §14.
14. **Additional Information** — driving licence/passport/security clearance (all hidden-by-default), languages, interests, willing to relocate, expected salary, availability, notice period.

---

## 5. Templates — Four to Start

Quality over quantity. Each is a new React-PDF template (sibling to the existing `Resume.tsx`, which becomes the base for "Professional"):

- **Professional** — traditional, single-column, the existing ATS-plain `Resume.tsx` layout. Banks, government, NGOs, accounting, administration, teaching, mining, healthcare — the Zambia-default.
- **Modern** — cleaner typography, a light accent color, still ATS-safe single-column. Software, marketing, sales, corporate.
- **Executive** — leadership-forward: a larger summary block, achievements emphasized over task lists. Management, senior engineers, directors, consultants.
- **Creative** — more visual (a sidebar for skills/contact, color block), for design/media/photography/UI/fashion/architecture roles where ATS-parsing matters less than visual impression.

Academic/International-ATS/Europass are named and deferred (§19) — real formats with their own real constraints, not worth building speculatively.

---

## 6. AI Assistant — Rewrite-Only Contract

Every AI button in this system calls one of a small number of **rewrite** or **classify** operations, never a **generate-from-nothing** one. A named policy block (mirroring `RELATIONSHIP_ADVICE_POLICY`/`CAREER_COACH_TONE_POLICY`'s established pattern) is prepended to every prompt in this feature:

```
CV_STUDIO_NEVER_INVENT_POLICY = """
You are editing text the user already wrote about their own real experience. Rewrite, reorganise, or
tighten language — never add a company, title, date, employer, number, metric, or achievement that
was not already present in the input. If a rewrite would be stronger with a specific number the user
hasn't provided, ask for it rather than inventing one.
"""
```

Concrete operations: `improve_wording`, `shorten`, `tone_professional`/`tone_executive`/`tone_graduate`, `ats_optimise`, `fix_grammar`, `remove_repetition`, `responsibilities_to_achievements`, `suggest_metric_prompt` (returns a *question* to ask the user, e.g. "How many client sites did you maintain, and over what time period?" — never a fabricated figure), `rewrite_for_industry` (management/software/NGO/banking/etc. — reframes emphasis and vocabulary, not facts).

---

## 7. ATS Analysis & CV Health

Reuses `score_resume_text()`'s existing `SCORE_RESUME` prompt/dimensions (ATS compatibility, recruiter appeal, technical strength, achievement framing, formatting) verbatim — it was already built correctly (score, don't invent). CV Health adds deterministic, non-AI checks layered on top (matching this codebase's "exact thresholds beat narrative" convention from Studio's Zuri Insights): missing LinkedIn URL, no quantified achievements found (regex for a digit/%/currency symbol in any achievement/responsibility line), summary under N words (too generic) or over N (too long), an unexplained gap between two employment entries' end/start dates, page count over 2, zero certifications, weak-verb detection (a small static list — "responsible for", "worked on", "helped with" — flagged for the Convert-to-Achievements action). Rendered as a single **CV Health** score (e.g. "92/100") with a bulleted list of what's dragging it down and a one-tap link to the fixing action.

---

## 8. Tailored CVs

Master Career Profile → `career_cvs (is_master=true)` never edited directly by a job-specific tailoring pass. "Create Variant" (§3) copies the master's section visibility/ordering into a new `career_cvs` row with `source_cv_id` set and, when created from an opportunity (§15's job cards, or manually), `career_opportunity_id` set — its summary/skills-order/achievement emphasis/cover-letter can diverge per variant, but employment/education/certification *facts* are always read live from the shared tables, so correcting a job title once fixes every variant. `GET /api/career/opportunities/:id/tailoring-suggestions` (§11) is what actually proposes *which* existing bullets/skills to surface or reorder for a specific opportunity — suggestions the user applies with one tap, never auto-applied silently.

---

## 9. Live Preview & Web Editor

**Live preview**: the wizard is a two-pane layout (wizard left, CV preview right on desktop; a preview toggle on mobile, per this codebase's mobile-first mandate) — every keystroke re-renders the preview client-side (a lightweight HTML/CSS preview component mirroring the chosen template's layout, not a PDF round-trip per keystroke; the real React-PDF render happens on-demand for download/tailored-variant snapshots). No "Generate" button anywhere in the flow.

**Web editor** (post-wizard-completion, still live-preview-backed): drag-to-reorder sections and drag-to-reorder entries within a section (`career_cv_sections.sort_order`), show/hide a section, rename a section heading, choose accent color/font pairing (a small curated set per template, not an open font picker — keeps ATS-safety and visual coherence guaranteed), spacing density (compact/comfortable), page size (A4/Letter), optional profile photo (template-dependent — Creative allows it, Professional/Modern default to none since a photo can trigger bias screening in some markets and isn't ATS-relevant).

---

## 10. Version History

Every save to a `career_cvs` row's `structured_content` writes a new `career_cv_versions` row (cv_id, version_number, snapshot JSONB, created_at) — mirrors the existing `documents.version`/`source_document_id` chain-walking convention (`GET /api/documents/:id/versions`) exactly, reapplied to `career_cvs`. Restore = create a new version copying an old snapshot forward (never destructive). Duplicate = a new `career_cvs` row with `source_cv_id` pointing at the duplicated one. Compare = a simple two-column diff view over two versions' rendered text (no need for a generic diff engine — CV sections are structured enough to diff field-by-field).

---

## 11. Job Matching

`GET /api/career/opportunities/:id/match/:cvId` embeds the opportunity's description (reusing the exact `documents.embedding` cosine-similarity mechanism `match_resume_to_opportunities()` already established) *and* runs one structured extraction call pulling required skills/technologies out of the job description text, diffed against the CV's own skill groups (§3) — returns a percentage plus a concrete missing-skills list (e.g. "Docker, AWS, Leadership, GraphQL"). The follow-up action is explicitly **"Generate Improvement Suggestions"** (which existing bullet could be reworded to surface a skill the user has but under-emphasized, which skill genuinely needs learning) — never "Generate Fake Experience." This is the same `_CV_STUDIO_NEVER_INVENT_POLICY` boundary applied to matching instead of writing.

---

## 12. Cover Letter Studio

Same philosophy, reusing `generate_cover_letter_data()`'s render path (`CoverLetter.tsx`) but changing its *input*: instead of one free-text instruction driving generation from scratch, the cover letter is built from (a) the Master Career Profile's real achievements/skills the user picks or Zuri suggests surfacing for this specific opportunity, and (b) AI polishing of what the user drafts or approves — never inventing a claim about the user's background. Multiple saved letters per user, company-specific versions, templates matching the CV's four (§5).

---

## 13. Supporting Documents

One profile, many documents — `document_type` gains `application_letter`, `expression_of_interest`, `personal_statement`, `motivation_letter`, `reference_sheet` (a rendered view of `career_references`), `portfolio_pdf` (a rendered view of the picked `projects`, §4 Step 8) — all through the existing `documents` table/CHECK-widen pattern (migration precedent: `resume`/`cover_letter`/`portfolio_page` already added this exact way in Career Growth Engine Phase 3), all generated from the same never-invent Master Career Profile source.

---

## 14. Localisation for Zambia (Globally Compatible)

- UI copy says "Curriculum Vitae (CV)" throughout when `career_profiles.use_cv_terminology = true` (the default) — a single copy-lookup table, not per-string conditionals scattered through components.
- References (§4 Step 13) ship as a first-class step, not bolted on — still commonly expected locally.
- Nationality/NRC/passport fields exist but are hidden by default (an explicit "add" toggle) — visible once added, never a required field.
- Professional memberships (§4 Step 11) and education institutions (§4 Step 5) are always freeform text, never a hardcoded dropdown of named institutions (TEVETA/CBU/UNZA/etc. are examples in this doc's prose only, never literal enum values or seed data — the opposite of the deliberate `career_employer_categories` seed table from Phase 8, which exists precisely because *that* table's whole purpose is recognizing named employers).
- Local phone formatting is the default input mask, international format always accepted.
- Page size defaults to A4, Letter available — a per-profile setting (§3), not a template-locked choice.

---

## 15. Job Search OS — Live AI Discovery Engine

**The reframe that matters**: this is not "what jobs exist" (a job board's question) — it's **"what jobs can this specific user realistically get today"**. Not a scraper, not a job board — an AI Opportunity Discovery Engine whose one job is: find the best opportunities for *this* user, every day, from the live web, and explain why each one is worth their time.

**Reuses the existing `web_search.py` (Tavily/SERP) infrastructure rather than newly wiring native Gemini search-grounding.** This mirrors the exact judgment already made and documented for `interest_companion.py` in the Advisor Companion Plan: *"its search deliberately uses only web_search.py (Tavily/SERP), not the plan's full 3-tier hybrid chain, since ai/client.py has no LiteLLM grounding/tool-calling wiring for any provider today and shipping an unverified new integration with no way to exercise real tool-call responses in this environment isn't a risk worth taking."* That constraint is still true today. "A search-capable AI finds you real jobs" is the actual user-facing promise, and the proven Tavily/SERP path meets it without betting the feature on an unverified integration. If/when a provider's native grounding is verified in this environment, the AI Search Planner below is provider-agnostic — swapping the execution layer doesn't change the plan's shape.

### 15.1 Philosophy

The engine never searches blindly with one generic query. Every search is *generated* from the user's actual profile — skills, years of experience, salary target, location, remote preference, contract/freelance openness, target industries. Two users with "software developer" as a title get completely different search plans if one wants $3,000+ remote contract work with AI experience and the other wants an entry-level in-office role in Lusaka.

### 15.2 AI Search Planner

One structured AI call per user per day (`PLAN_JOB_SEARCHES`, `services/intelligence/app/ai/prompts.py`) takes the user's `career_profiles` row (skills, target_roles, target_industries, country, remote_preference, salary_expectation_cents, relocation_preference) plus recent signals (their last 10 `career_opportunities` — what they've already seen, so the planner doesn't waste a query re-finding the same thing; any `rejected` opportunities, which typically means "stop suggesting this exact profile") and returns a categorized list of search query strings, not a single query. Query *count* is scaled by the AI Usage Tiers principle already established in `CLAUDE.md` (Light user: ~8 queries/day across the categories below; Normal: ~15; Heavy: ~25) rather than a fixed number for everyone — this is exactly the kind of per-call cost this codebase's tiering principle exists to bound.

### 15.3 Multi-Pass Search Categories

The planner buckets its generated queries into passes, each run through `web_search.py`, each producing independently-scored candidates:

- **Pass 1 — Local**: biased to `career_profiles.country` (Zambia default) and, when set, city/region — explicit queries for government (`GoZ Careers`), NGOs (World Vision Zambia, CARE Zambia, USAID partners, UN Zambia), banks, mines, telecoms, universities, and local startups/recruitment agencies. Reuses `career_employer_categories` (Phase 8, already seeded) as a query-generation input: for each employer category matching the user's target industries, the planner can generate one query per top-N known employer name (e.g. target_industries includes "banking" → queries for "{role} jobs Zanaco", "{role} jobs Stanbic Bank Zambia") — a direct, concrete reuse of already-seeded data, not new scope.
- **Pass 2 — Regional**: Zimbabwe, Botswana, Namibia, South Africa, Kenya — only generated when the user's profile doesn't explicitly rule out relocation/regional work.
- **Pass 3 — Remote Global**: only when `remote_preference != 'onsite'` — startups, remote-first company boards, US/Europe remote listings.
- **Pass 4 — Freelance/Contract**: only when the user's profile or opportunity history suggests openness to `contract`/`freelance` categories (already valid `career_opportunities.category` values from Phase 1) — Upwork, Toptal, PeoplePerHour, direct-contract phrasing.
- **Pass 5 — Hidden Opportunities**: search-engine-indexed (not API-authenticated) results from social/community sources — `site:` scoped queries against Twitter/X, LinkedIn posts, GitHub, Reddit for phrasing like "we're looking for a developer", "hiring soon", "need a [role]". This is an honest proxy, not real-time social API access (this codebase has no Twitter/LinkedIn/Reddit API integration) — search engines index a meaningful fraction of public posts on these platforms, which is what this pass actually searches, not a live social feed.

### 15.4 Extraction — Never Invent

Each promising search result's title/URL/snippet goes through one structured, **extraction-only** AI call (`EXTRACT_JOB_LISTING`) — pull title/company/location/salary-if-literally-stated/application-url/posting-date-if-stated straight from the text, `null` for anything not present. This is metadata extraction from real search text, not content generation — the same boundary `resume_studio.py`'s scoring functions already respect, applied to parsing instead of writing.

### 15.5 Freshness Filter

Every candidate carries a `posted_at`/`last_verified_at` pair when the search result states one (many job-board snippets literally say "posted 3 days ago" — extracted, not inferred). A listing older than 14 days is ranked lower; older than 30 days is dropped unless a same-day re-search still surfaces it (a simple "still findable today" proxy for "still open," since there's no application-status API for third-party postings). Listings with no extractable date are treated as unknown-freshness (a small ranking penalty, not a rejection) rather than assumed fresh.

### 15.6 Opportunity Scoring

`career_opportunities.match_score`/`match_breakdown` (already-existing, previously-unused columns from Phase 1) finally get a real writer: a deterministic score, not a second AI call — skills overlap (extracted skills vs. `career_profiles.skills`), location/remote fit, salary fit (stated salary vs. `salary_expectation_cents`), category fit (does it match `target_roles`/`target_industries`), and the freshness factor above, each stored in `match_breakdown` so the UI can show a checklist ("✓ React, ✓ Remote, ✓ Salary above target, ✗ Requires relocation") rather than a bare percentage — the same confidence-and-evidence discipline every score in this codebase already carries.

### 15.7 Duplicate Detection

The same posting frequently appears across multiple sources in one day's search batch. Within-batch dedup groups candidates by fuzzy title+company match (same discipline `action_bundles.py`'s new-product/supplier dedup already established) *before* the existing against-database dedup runs — keeping the candidate with the most complete extracted fields (an official company careers-page URL over an aggregator mirror, when both are present) as the canonical row; the others are dropped, not inserted as duplicates.

### 15.8 AI Summary

One structured call per surfaced opportunity condenses the (often long) source text into: company, role, salary (if stated), remote status, top 3–4 responsibilities, top required skills, and — separately labeled as inference rather than fact — a short "why this might suit you" / "potential concerns" pair grounded only in the extracted fields and the user's own profile (e.g. "requires relocation" is a concern *because* the profile says not open to relocating, not a fabricated downside). No "estimated competition" figure — that would be invented with no real signal behind it; deliberately not built (see §19).

### 15.9 Daily Opportunity Brief

Once a day's run completes, `companion_delivery.py`'s existing `deliver_initiated_message()` helper (same mechanism `career_coach.py`/`motivational_detector.py` already use) sends one Advisor-initiated summary grounded entirely in that run's real counts — e.g. *"I found 11 new opportunities. 4 are excellent matches. 2 were posted in Zambia yesterday. 3 are remote AI roles."* Every number in the brief is a literal count from the run, never a stylistic estimate. Wired as a new daily scheduler at **05:00 UTC** (07:00 in Zambia — a genuine morning slot; the next free hour among a otherwise fully-booked 03:00–20:00 UTC daily schedule) so the discovery run and the brief that reports on it happen together.

### 15.10 "Why This Job?" Explanation

Rendered directly from `match_breakdown` (§15.6) — no separate AI call. Each opportunity card shows its scoring checklist as the "why," with the `confidence` field (already a `career_opportunities` column) showing how sure the match is. Trust comes from this being a plain readout of the same deterministic score, not a separately-generated narrative that could drift from the actual number.

### 15.11 Auto CV Matching

When a new opportunity is scored (§15.6), it's also checked against the user's existing resumes (`match_resume_to_opportunities()`'s inverse direction — same cosine-similarity mechanism, just called opportunity→resumes instead of resume→opportunities) — if the best-matching resume scores below a threshold, the opportunity card surfaces *"Your '{resume title}' scores 72% for this — tailor a version to close the gap"* rather than silently using a weak-fit CV. This is a **suggestion to reorganize existing, real experience** into a new tailored variant (§8) — never "generate fake experience" to close the gap.

### 15.12 Application Readiness Checklist

A deterministic, non-AI check per opportunity: does the user have a resume, a cover letter, a populated portfolio/GitHub/LinkedIn URL, and (once §3's `career_certifications` table exists) any certifications the role's extracted requirements suggest are relevant. Missing pieces link straight to the relevant CV Studio step — same "exact thresholds over narrative" discipline as Studio's Zuri Insights.

### 15.13 Opportunity Timeline & Ghosting Detection

`career_opportunities.status`'s existing lifecycle (`detected→shortlisted→applied→interviewing→offered→accepted/rejected/withdrawn→archived`) already *is* this timeline — "saved" maps onto the existing `shortlisted` value rather than a new one. A new Reality-Engine-style check (same detect-and-surface-only shape as the existing `contradiction_stalled_application`, Career Growth Engine Phase 7) flags a company as a likely "ghoster" when an opportunity sits in `applied` well past the norm with zero interview rounds logged — this is a read on data the system already has, not a new tracking mechanism.

### 15.14 Company Intelligence

A new, small `company_intelligence.py` service, using `web_search.py` the same way as everywhere else in this section — searches "{company} culture reviews", "{company} recent news", "{company} interview process" and synthesizes a short structured summary **citing how many independent sources it drew from**, explicitly declining to state a culture/process claim with zero search evidence behind it rather than inventing a plausible-sounding one. Feeds directly into the existing Interview Coach context (`_career_context_line()`, Career Growth Engine Phase 5) and the interview-patterns lookup (Phase 4) — no new delivery mechanism, just a new context input to both.

### 15.15 Passive Opportunity Radar — Beyond Jobs

`career_opportunities.category`'s existing CHECK vocabulary already includes `partnership`/`speaking`/`consulting`/`investment`/`board_position`/`grant`/`scholarship`/`tender`/`research`/`mentorship` (Phase 1, unused for anything beyond `job`/`contract`/`freelance` so far) — the AI Search Planner (§15.2) generates queries across these categories too whenever a user's profile signals business/consulting/freelance interest (a `business_profile` exists, or `target_industries` suggests consulting/freelance work), turning "Career OS" into a genuine Opportunity OS for solopreneurs and consultants, not just traditional job seekers — with zero new schema, since the category vocabulary was already built this broad in Phase 1.

### 15.16 Zambian Localisation, Explicit Source List

Search queries explicitly bias toward: government (GoZ Careers), Zambia NGO vacancy boards, UN Zambia, World Vision Zambia, CARE Zambia, USAID partner organizations, the major banks/mines/telecoms already seeded in `career_employer_categories` (Zanaco, Stanbic, MTN Zambia, Airtel Zambia, Barrick, First Quantum, etc. — plus ZESCO, worth adding to that seed table as a utility-sector entry), universities, and known local recruitment agencies. When Pass 1 (Local) returns few or no strong matches, the planner automatically widens to Pass 2 (Regional) and then Pass 3 (Remote) in the same run — never silently returning nothing.

### 15.17 Job Search OS — The Broader Subsystem Framing

Positioned as its own named subsystem sitting *alongside* Career OS rather than folded invisibly into it — Career OS is long-term professional growth; Job Search OS is "get employed or win the next contract, starting today." Five pillars:

1. **Live AI Discovery Engine** — §15.1–§15.7, §15.16 (this section's core).
2. **Opportunity Intelligence** — dedup, scoring, summary, explanation, freshness (§15.6–§15.10).
3. **Application OS** — CV Studio (§2–§14) + Application Tracker (§16) + AI Tailoring (§8, §11) + Interview Prep (§15.14 + existing `career_interviews`).
4. **Market Intelligence** *(named, not designed here — see §19)* — salary trends, in-demand-skill trends, hiring hotspots, aggregated from the same search infrastructure over time rather than a licensed salary-data feed.
5. **Offer Intelligence** *(named, not designed here — see §19)* — comparing multiple simultaneous offers, negotiation support, benefits evaluation.

Pillars 1–3 are this plan's actual scope; 4–5 are real, named, and deliberately deferred (§19) rather than sketched half-built.

---

## 16. Application Tracker

Already real, from Career Growth Engine Phase 4 — `POST /api/career/opportunities/:id/apply` already turns an opportunity into a `projects` row with a default task template and reminders via the existing AI Daily Brief (`milestone_overdue`/`task_overdue` branches). This plan's job is making sure Job Search OS (§15) feeds opportunities *into* this existing tracker, and that the Application Readiness checklist (§15.12) and ghosting detection (§15.13) read from the same lifecycle — not building a second tracker.

---

## 17. Reprioritized Career OS Roadmap

Job Search OS (§15.17) becomes the daily-engagement surface; the rest of Career OS (already shipped across Career Growth Engine Phases 1–8) becomes supporting infrastructure underneath it.

1. **CV Studio** (this doc, §2–§14) — the foundation every other feature builds on.
2. **Job Discovery / Job Search OS** (§15) — **flagged highest urgency**; the daily reason to open the app.
3. **Application Tracker** (§16) — already shipped; wire Job Search OS into it.
4. **AI Tailoring** (§8, §11, §15.11) — adapt an existing CV/cover letter to a selected job without inventing experience.
5. **Interview Preparation** — already partly shipped (`career_interviews`, the interview-patterns lookup, `interview_success_likelihood`); Company Intelligence (§15.14) is the genuinely new piece.
6. **Networking & Referrals** — already shipped (Relationship-to-Opportunity Bridge, Career Growth Engine Phase 6).
7. **Passive Opportunity Radar** — already shipped for WhatsApp-passive detection (Career Growth Engine Phase 2); §15.15 adds the *active*, search-based, beyond-jobs counterpart.
8. **Career Coaching** — already shipped (Career Growth Engine Phase 5).

Concretely, items 3, 6, 8 need no new engineering; item 7's passive half and item 5's interview-memory half already exist too. This plan's real net-new engineering is item 1 in full, item 2 in full, item 4, and Company Intelligence within item 5.

---

## 18. Phased Build Order

**Phase 1 — Master Career Profile foundation** ✅ **Shipped**: migration `0081` for `career_employment_history`/`career_education_entries`/`career_certifications`/`career_skill_groups`/`career_awards`/`career_volunteer_work`/`career_memberships`/`career_publications`/`career_references`/`career_cvs`/`career_cv_sections`/`career_cv_project_links`/`career_cv_versions`, plus `career_profiles`' Step 1/Step 14 columns and `projects.is_portfolio_visible`; a real backfill from the Phase-1 flat `career_profiles.skills`/`certifications`/`education` JSONB arrays into the new tables. CRUD API: `services/api/src/lib/career-entry-crud.ts` is a shared factory (list/create/patch/delete) reused across all nine per-entry resources in the new `career-profile-entries.ts` — nine hand-written copies of an identical shape would have been pure duplication. `career-cvs.ts` covers the CV object model itself: create/patch/delete, whole-list-replace for sections/project-links (same convention as Services Management's workflow-stage PUT), duplicate, and version history (every `structuredContent` PATCH writes a new `career_cv_versions` row, restore copies an old snapshot forward — never destructive) — so the wizard (Phase 4) and Web Editor (Phase 7) inherit working version history for free rather than building it themselves. **Deliberately not done in this pass**: deleting `resume_studio.py`'s whole-document generation functions (`generate_resume_data`/`generate_cover_letter_data`) — the plan's own §1 says these are deleted "once this plan's wizard/editor ship a real replacement," and they're still the only working resume-generation path in production (Career Growth Engine Phase 3's shipped Resume Studio UI calls them directly) — deleting them now would regress a live feature with nothing to replace it. That deletion is deferred to Phase 4/5, once the wizard's own render pipeline is real.

**Phase 2 — Job Search OS, Core Discovery Loop** ✅ **Shipped** (§15.1–§15.10): AI Search Planner, multi-pass execution via `web_search.py`, extraction, freshness, scoring/`match_breakdown`, within-batch + against-DB dedup, AI Summary, Daily Opportunity Brief. The user's flagged top priority; independent of Phase 1, shipped first. `services/intelligence/app/services/job_discovery.py`'s `JobDiscoveryService` — `PLAN_JOB_SEARCHES`/`EXTRACT_JOB_LISTING` (`ai/prompts.py`) are the two AI calls per user per day (planner + one extraction-and-fit-summary call per candidate, deliberately combined into one call rather than two separate passes — the same "combine adjacent concerns into one structured call" judgment `CLASSIFY_ADVISOR_TURN` already made); everything else (dedup, freshness, the deterministic `match_score`/`match_breakdown` scorer, the Daily Opportunity Brief's wording) is plain code, no LLM call. Query volume is scaled by a Light/Normal/Heavy proxy read off the user's subscription plan's `ai_replies_per_day` limit (8/15/25 queries respectively) since no dedicated per-user tier signal exists yet — an honest stand-in, not the real thing. Regional/remote passes are gated in code against `relocation_preference`/`remote_preference` as a safety net beyond the planner's own prompt instruction. Wired as a tenth daily scheduler at 05:00 UTC (`daily_worker.py`/`main.py`), the next free slot on an otherwise fully-booked 03:00–20:00 UTC schedule, chosen so the run and the brief reporting on it land together as a genuine Zambia morning (07:00 local). The Daily Opportunity Brief itself is plain templated text (not an LLM call) grounded entirely in that run's literal counts, via the existing `companion_delivery.deliver_initiated_message()`. Frontend: `opportunity-card.tsx` gained a "why this job" expandable checklist rendered directly from `matchBreakdown` (§15.10) — tapping the match-score percentage reveals per-dimension checks and a missing-skills line, only enabled when a breakdown is actually present (i.e. `web_search`-sourced opportunities).

**Phase 3 — Job Search OS, Depth** ✅ **Shipped** (§15.11–§15.15): Auto CV Matching, Application Readiness checklist, ghosting detection, Company Intelligence, category-broadened Passive Radar. `resume_studio.py`'s `match_opportunity_to_resumes()` is the inverse of Career Growth Engine Phase 3's `match_resume_to_opportunities()` — same cosine-similarity mechanism, called opportunity→resumes; below a 70% best-match threshold it surfaces `suggestTailoring: true` rather than ever proposing invented experience. Application Readiness (`GET /api/career/opportunities/:id/readiness`) is plain deterministic SQL/Node — no AI call — checking for a resume, a cover letter, a portfolio/GitHub/LinkedIn URL, and listed certifications. Ghosting detection reuses Reality Engine's existing `contradiction_stalled_application` check (Career Growth Engine Phase 7, an opportunity stuck in `applied` 21+ days) rather than duplicating it — the new piece is `company_intelligence.py`'s own company-scoped ghosting read (a plain SQL aggregation of the user's own applications to that company, never a claim about the company's general reputation). `company_intelligence.py` (new intelligence service) runs three `web_search.py` queries ("{company} culture reviews"/"recent news"/"interview process") through one synthesis call (`SYNTHESIZE_COMPANY_INTELLIGENCE`) that declines any claim with no search evidence behind it rather than inventing a plausible one; `GET /api/career/opportunities/:id/company-intelligence` (Node) merges this with the existing interview-patterns lookup (Career Growth Engine Phase 4) into one response. The Passive Opportunity Radar's beyond-jobs extension needed no new schema — `PLAN_JOB_SEARCHES` gained a `beyond_jobs` query pass, gated in `job_discovery.py` on a `has_business_profile OR consulting-keyword` signal, generating queries across the already-seeded partnership/consulting/speaking/grant/tender/etc. category vocabulary from Phase 1. Frontend: `opportunity-card.tsx` grew three lazy-loaded panels (Readiness, Resume match, Company intel), extracted into `opportunity-insights.tsx` once the card file approached the 500-line threshold.

**Phase 4 — The Wizard** ✅ **Shipped** (§4) — 14 steps over Phase 1's tables, autosave, live preview pane. Eight of the fourteen steps (Employment, Education, Certifications, Skills, Awards, Volunteer Work, Memberships, Publications) share one generic `EntryListEditor` component — the same DRY discipline the backend's `career-entry-crud.ts` factory already established, carried into the frontend rather than eight near-identical hand-written forms. The remaining six (Personal Details, Summary, Objectives, Projects, References, Additional Info) are bespoke, since they touch `career_profiles` directly or need a picker over another resource (Projects checkbox-selects the user's own `projects` rows and writes `career_cv_project_links` via the whole-list-replace endpoint). A new `cv_assistant.py` intelligence service + `REWRITE_CV_TEXT`/`SUGGEST_METRIC_PROMPT`/`SUGGEST_SKILL_GROUPING` prompts (all prefixed with `CV_STUDIO_NEVER_INVENT_POLICY`) power the AI buttons on Summary/Objectives/Employment — Improve/Shorten/tone variants/ATS-optimise/fix-grammar/responsibilities-to-achievements, plus "Add Metrics" which asks a clarifying question rather than inventing a number. Live preview is a lightweight HTML/CSS mirror of the Professional template's layout (not a PDF round-trip per keystroke, per §9's own instruction) — `career_profiles` fields update instantly from local state, while the nine per-entry-table sections refresh right after each save via a `refreshKey` bump rather than true per-keystroke reactivity across nine separate tables, an honest simplification documented in the component itself. New routes: `/career/cv-studio` (CV list, create Master CV) and `/career/cv-studio/[id]` (the wizard). **Not built in this pass**: skill-group AI-suggested-grouping has no UI trigger yet (the endpoint exists, unused) — a small polish item for a later pass, not a scope gap in the wizard's core loop.

**Phase 5 — Templates + Render Pipeline** ✅ **Shipped** (§5) — three new React-PDF templates (`CvModern.tsx`, `CvExecutive.tsx`, `CvCreative.tsx`) alongside the existing Professional (`Resume.tsx`, which gained an optional `pageSize` prop for parity). A new `cv-context.ts`'s `buildCvRenderData()` assembles a CV's live data directly from the Phase 1 relational tables (career_profiles, all nine entry tables, and `career_cv_project_links` joined with `projects`) — a pure data read, no AI call. `render.ts`'s `renderCvPdf()` picks the template component by `career_cvs.template_key`. `GET /api/career/cvs/:id/pdf` renders fresh on every request and streams the PDF for download — deliberately not persisted as a `documents` row (unlike the older whole-document Resume Studio flow), matching §9's "the real render happens on-demand for download" framing. The wizard gained a template picker (PATCHes `templateKey`) and a Download PDF button; the live preview itself stays the same plain HTML mirror regardless of template — only the downloaded PDF differs visually.

**Phase 6 — ATS Analysis + CV Health** (§7) — mostly reuses existing `score_resume_text()`; adds the deterministic CV Health layer.

**Phase 7 — Web Editor + Version History** (§9, §10) — drag/hide/reorder, version chain.

**Phase 8 — Tailored Variants + Job Matching UI** (§8, §11) — the CV-to-opportunity loop, surfaced.

**Phase 9 — Cover Letter Studio + Supporting Documents** (§12, §13).

Each phase ships independently useful value, per this codebase's own established discipline.

---

## 19. Deferred Roadmap (Documented, Not Built)

**Market Intelligence** (§15.17 pillar 4) — salary trend/in-demand-skill/hiring-hotspot aggregation over time; needs a real historical data store built up from Job Search OS's own runs before it can say anything trustworthy, so it's necessarily downstream of §15 shipping first, not built alongside it. **Offer Intelligence** (§15.17 pillar 5) — multi-offer comparison and negotiation support; a genuinely new capability with its own UX, not sketched further here. Academic CV / International-ATS / Europass templates (§5); a true drag-and-drop *visual* page-layout editor beyond section reorder/hide (a full free-form canvas editor is a materially larger frontend investment than the structured section-editor this plan scopes); native Gemini/any-provider search-grounding (§15 explicitly uses the proven `web_search.py` path instead — revisit once grounding is wired platform-wide, per the same standing gap already noted in `docs/ADVISOR_COMPANION_PLAN.md`); a job-board-scraping pipeline or authenticated social-platform API integration beyond search-engine-indexed results (a real, separate data-sourcing project per `docs/CAREER_GROWTH_ENGINE_PLAN.md` §17); an "estimated competition" figure for a listing (would have zero real signal behind it — deliberately not built, see §15.8); salary benchmarking beyond what a job description states or search results surface; multi-user/team CV review or recruiter-facing features (out of scope — this is a job-seeker product).
