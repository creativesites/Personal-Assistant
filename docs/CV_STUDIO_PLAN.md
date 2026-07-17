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

## 15. Job Discovery Engine — Zambia-First, "Must Be Implemented"

**Reuses the existing `web_search.py` (Tavily/SERP) infrastructure rather than newly wiring native Gemini search-grounding.** This mirrors the exact judgment already made and documented for `interest_companion.py` in the Advisor Companion Plan: *"its search deliberately uses only web_search.py (Tavily/SERP), not the plan's full 3-tier hybrid chain, since ai/client.py has no LiteLLM grounding/tool-calling wiring for any provider today and shipping an unverified new integration with no way to exercise real tool-call responses in this environment isn't a risk worth taking."* The same constraint is still true today — no provider has grounding/tool-calling wired in `ai/client.py`. Using the already-proven search client is lower-risk and ships faster than being the first feature to depend on unverified native grounding; "a search-capable AI finds you real jobs" is the actual user-facing promise, and that promise is met either way.

`services/intelligence/app/services/job_discovery.py`, a new cron (`run_job_discovery_for_all_users()`, wired at the next free daily-scheduler slot):
1. For each user with a `career_profiles` row and `target_roles`/`target_industries` set, builds search queries biased to `career_profiles.country` (defaulting to Zambia when unset) — e.g. `"{role} jobs Lusaka Zambia"`, `"{role} jobs Zambia site:linkedin.com/jobs OR site:indeed.com OR site:careers.co.zm"`, plus one broader remote-role query when `remote_preference != 'onsite'`.
2. `web_search.py`'s `WebSearchClient.search()` returns real result snippets/URLs; one structured AI call (`EXTRACT_JOB_LISTING`, extraction-only — pull title/company/location/salary-if-stated/application-url straight from the snippet text, `null` for anything not literally present) turns each promising result into a `career_opportunities`-shaped row.
3. Dedup against the user's existing `career_opportunities` by title+company_or_org fuzzy match (same discipline `action_bundles.py`'s new-product/supplier dedup already uses) before inserting — new rows land with `source='web_search'`, `status='detected'`, `confidence` from the extraction call.
4. Surfaces through the *existing* "Zuri Noticed" `business_events`/activity-feed pattern (`event_type='job_discovered'`) — no new frontend mechanism, same card system Studio/Career already share.

Credit-gated via the existing `try_consume_credit(..., 'nudge')` convention (Pricing doc), same as every other proactive insertion site. Local-first by explicit design choice, not an accident: the plan's own §17 in `docs/CAREER_GROWTH_ENGINE_PLAN.md` already deferred "multi-source job discovery" (scraping job boards directly) as a real, separate data-sourcing project — this stays a search-and-extract pattern, not a scraper, and is honestly scoped as "as good as the search results genuinely available," not an exhaustive job board.

---

## 16. Application Tracker

Already real, from Career Growth Engine Phase 4 — `POST /api/career/opportunities/:id/apply` already turns an opportunity into a `projects` row with a default task template and reminders via the existing AI Daily Brief (`milestone_overdue`/`task_overdue` branches). No new work needed here; this plan's job is making sure Job Discovery (§15) feeds opportunities *into* this existing tracker, not building a second one.

---

## 17. Reprioritized Career OS Roadmap

Job search becomes the daily-engagement surface; the rest of Career OS (already shipped) becomes supporting infrastructure underneath it.

1. **CV Studio** (this doc, §2–§14) — the foundation every other feature builds on.
2. **Job Discovery** (§15) — **flagged highest urgency** by the user; the daily reason to open the app.
3. **Application Tracker** (§16) — already shipped (Career Growth Engine Phase 4); wire Job Discovery into it.
4. **AI Tailoring** (§8, §11) — adapt an existing CV/cover letter to a selected job without inventing experience.
5. **Interview Preparation** — already partly shipped (`career_interviews`, the interview-patterns lookup, `interview_success_likelihood`); company-research and salary-guidance additions are the genuinely new pieces, reusing `web_search.py` the same way §15 does.
6. **Networking & Referrals** — already shipped (Relationship-to-Opportunity Bridge, Career Growth Engine Phase 6).
7. **Passive Opportunity Radar** — already shipped (passive WhatsApp detection, Career Growth Engine Phase 2); §15 adds the *active* search-based counterpart.
8. **Career Coaching** — already shipped (Career Growth Engine Phase 5).

Concretely, items 3, 6, 7, 8 need no new engineering — they already exist. This plan's real net-new engineering is items 1, 2, 4, and the research/salary-guidance half of item 5.

---

## 18. Phased Build Order

**Phase 1 — Master Career Profile foundation**: migration for `career_employment_history`/`career_education_entries`/`career_certifications`/`career_skill_groups`/`career_awards`/`career_volunteer_work`/`career_memberships`/`career_publications`/`career_references`/`career_cvs`/`career_cv_sections`/`career_cv_project_links`/`career_cv_versions`; CRUD API for each; delete `resume_studio.py`'s whole-document generation functions (keep scoring/matching/extraction).

**Phase 2 — Job Discovery Engine** (§15) — the user's flagged top priority; genuinely independent of Phase 1's UI work, can ship in parallel.

**Phase 3 — The Wizard** (§4) — 14 steps over Phase 1's tables, autosave, live preview pane.

**Phase 4 — Templates + Render Pipeline** (§5) — Modern/Executive/Creative templates alongside the existing Professional (`Resume.tsx`).

**Phase 5 — ATS Analysis + CV Health** (§7) — mostly reuses existing `score_resume_text()`; adds the deterministic CV Health layer.

**Phase 6 — Web Editor + Version History** (§9, §10) — drag/hide/reorder, version chain.

**Phase 7 — Tailored Variants + Job Matching** (§8, §11) — the CV-to-opportunity loop.

**Phase 8 — Cover Letter Studio + Supporting Documents** (§12, §13).

**Phase 9 — Interview Prep enrichment** (§17 item 5) — company research + salary guidance via `web_search.py`.

Each phase ships independently useful value, per this codebase's own established discipline.

---

## 19. Deferred Roadmap (Documented, Not Built)

Academic CV / International-ATS / Europass templates (§5); a true drag-and-drop *visual* page-layout editor beyond section reorder/hide (a full free-form canvas editor is a materially larger frontend investment than the structured section-editor this plan scopes); native Gemini/any-provider search-grounding (§15 explicitly uses the proven `web_search.py` path instead — revisit once grounding is wired platform-wide, per the same standing gap already noted in `docs/ADVISOR_COMPANION_PLAN.md`); a job-board-scraping pipeline beyond search-and-extract (a real, separate data-sourcing project per `docs/CAREER_GROWTH_ENGINE_PLAN.md` §17); salary benchmarking beyond what a job description states or search results surface (needs a real salary-data source, not invented ranges); multi-user/team CV review or recruiter-facing features (out of scope — this is a job-seeker product).
