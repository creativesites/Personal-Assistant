# Zuri Marketing Expansion: From WhatsApp CRM to Social Commerce Operating System

**Date**: July 2026
**Status**: Phase A (public marketing site) shipped and live. Phase B's original MVP scope (§10/Appendix: Product Catalog, AI Content Generator, Publishing & Scheduling, Dashboard Updates, Funnel Tracking) is fully shipped end to end, including the dashboard-integration half of "Dashboard Updates" that §12.5 originally only planned — see §13 for the build log and the one consistent, clearly-flagged gap across all of it (no real Meta/TikTok developer app). Now building into the Appendix's "Phase 2 Ideas" — first pick: Advanced analytics + recommendations, shipped (§13). §12 covers how it integrates into the existing dashboard, since both products need to feel like one system, not two apps bolted together.

---

## 1. The Insight This Is Built On

Winston's framing of the electronics-reseller conversation is the thesis for this entire expansion, generalized beyond one shop:

> "I wouldn't approach it as 'let's find software.' I'd approach it as 'let's build a customer acquisition system.' The software is just there to make that system easier."

The laptop/phone business is one example, not the target market. The target market is **any small business in Zambia (and similar markets) that discovers customers on Facebook/Instagram/TikTok and closes sales on WhatsApp** — boutiques, furniture stores, appliance retailers, car dealerships, electronics resellers, and more. Zuri already owns the WhatsApp side of that funnel (that's the whole existing product). This expansion is about owning the *other end* — the content and discovery side — so the same customer stays inside one system from "saw a Reel" to "repeat buyer."

## 2. The Funnel Zuri Should Own End to End

```
Products
   │
   ▼
Content Creation  (photos, Reels, captions, scripts)
   │
   ▼
Facebook + Instagram + TikTok  (discovery)
   │
   ▼
Messenger / WhatsApp  (conversation → close)
   │
   ▼
Sales
   │
   ▼
Repeat Customers  (CRM, broadcasts, follow-ups)
```

Everything upstream should feed into WhatsApp, because that's where Zambian customers actually convert. Zuri's existing intelligence layer (contact profiles, business facts, relationship memory, agent memory — see `docs/MEMORY_ENGINE_PLAN.md`) already models the *conversation and close* half of this funnel in depth. What's missing is the *content and discovery* half, plus the connective tissue that lets a post's performance inform the CRM and vice versa.

## 3. What a Business Owner Does Manually Today (and What Zuri Automates)

This grounds the product spec in reality — every module below exists to remove a specific manual step, not because it's a cool AI feature.

| Manual step today | Tool a solo owner uses | What Zuri Marketing does instead |
|---|---|---|
| Writing a caption for each product | Nothing / copy-paste | AI Product Writer generates FB post, WhatsApp status text, IG caption, Marketplace description, and a Reel script from a product upload |
| Editing a 30s Reel | CapCut (auto captions, background noise removal, music, zoom effects, AI voice, auto-cut-silence) | AI Video Script Generator + templated video assembly; CapCut/InShot remain valid manual fallbacks, not replaced on day one |
| Making a promo poster | Canva | AI Image Generator produces background variants (white/studio/lifestyle/desk) from one product photo |
| Posting daily to Marketplace + 3 Groups + Reels + Story + Feed | Manual, or Meta Business Suite / Buffer / Metricool | One-click / scheduled publishing across connected Facebook, Instagram, and (where the API allows) TikTok |
| Remembering who asked about what | Nothing, or a notebook | Already built: contact profiles, business facts, relationship memory (Phase 0–5 of the Memory Engine) |
| Weekly "new stock arrived" broadcast | Manual WhatsApp broadcast list | Already partially built (broadcasts.ts); extend with performance data from the content side |
| Knowing which posts actually produce sales | Guesswork | Funnel analytics: post → inquiry → sale, tying content performance directly to CRM outcomes |

## 4. Product Structure

- **Zuri WhatsApp** (existing, unchanged): Inbox, conversations, relationships, proactive AI, CRM, agents, memory engine.
- **Zuri Marketing** (new): AI content generation, multi-platform scheduling (Facebook/Instagram/TikTok), campaign/ad assistance, funnel analytics — feeding leads and content-performance data back into the same CRM.
- **One product, one login.** A customer doesn't buy "two apps" — Zuri Marketing is a module that lights up inside the same account, same contacts, same conversations.

### ⚠️ Naming collision to resolve before writing any code

The original draft of this doc said new routes should live in `apps/web/src/app/(marketing)` — but that folder is **already the public marketing *website*** (homepage, pricing, industry pages, `MarketingNav`/`MarketingFooter`). Reusing that name for the new *authenticated in-app feature* (content generator, scheduler dashboard) would not just be confusing, it would literally collide at the routing level: Next.js route groups don't appear in the URL, so `(marketing)/social/page.tsx` and `(dashboard)/social/page.tsx` would both resolve to `/social` and the build would fail.

**Resolution:** the new authenticated feature lives under `(dashboard)/marketing-studio/` (or similar — final name TBD, avoid `marketing` alone). The public-facing sales page for it lives under the *existing* `(marketing)/` route group, at a distinct slug — `/social-commerce` (see §8). No further ambiguity: `(marketing)` always means the public website; the in-app feature gets its own name.

## 5. Content Creation — Phase 1 Reference (What the Business Owner Does)

The starting principle: **one product should generate 5–10 pieces of content**, not one photo. Per product:

- Photos (multiple angles)
- 15-second Reel
- 30-second Reel
- 60-second review-style video
- Carousel images

**Tool reference** (what exists today, useful for the AI Product Writer's script prompts and for onboarding content until in-app generation ships):
- **CapCut** — primary video tool: auto captions, background noise removal, music, zoom effects, templates, AI voice, auto-cut-silence. Best fit for Reels.
- **Canva** — posters, stories, ad graphics, price graphics, promotions; has video editing now too.
- **InShot** — simple on-phone editing.
- **Captions (app)** — auto-generates professional talking-head videos with subtitles.
- **ElevenLabs / CapCut AI Voice** — narration for owners who don't want to talk on camera.
- **Script generation today**: ChatGPT with a prompt like *"Create a 30-second Facebook Reel selling a Dell Latitude 5420, i5 11th Gen, 16GB RAM, 512GB SSD, for Zambian customers."* Zuri's AI Video Script Generator (§6) formalizes and specializes this exact prompt pattern, backed by the product's actual catalog data instead of manual re-typing specs.
- **Scheduling today**: Meta Business Suite (free, sufficient to start), Buffer, Metricool. Zuri's publishing module (§7) replaces this once built, but there's no reason to block a pilot business from using Meta Business Suite manually in the meantime.

**Daily posting cadence a well-run shop should hit** (informs what "good" looks like for the analytics module in §9): 2 Marketplace listings, 3 Facebook Group posts, 2 Reels, 1 Story, 1 Feed post.

**WhatsApp Business setup checklist** (already achievable manually today, worth turning into an onboarding checklist inside Zuri): product catalogue, quick replies, greeting message, away message, labels (e.g. New Customer / Interested / Negotiating / Paid / Delivered).

## 6. AI Modules (Core of Zuri Marketing)

1. **Inventory Management** — product, specs, price, images; for electronics specifically also IMEI, serial number, supplier, cost price, selling price, profit, warranty. Generalizes to any small-business catalog (boutique SKU, furniture piece, vehicle listing).
2. **AI Product Description Generator** — one upload → Facebook post, WhatsApp status text, Instagram caption, Marketplace description.
3. **AI Video Script Generator** — short (15/30s) and long (60s) Reel/TikTok scripts from the same product data.
4. **AI Image Generator** — one product photo → background variants (white/studio/lifestyle/office/desk-setup) for ad-ready graphics.
5. **Social Media Post Generator** — assembles the above into platform-ready posts (correct aspect ratios, caption length limits per platform).
6. **One-click Publishing** — Facebook, Instagram, TikTok (where each platform's API and app-review status allow — see §7 for the real constraints, not an optimistic assumption).
7. **CRM** — already built (this is the existing Zuri WhatsApp core). Marketing leads land in the same contact/lead pipeline, not a separate database.
8. **Customer Follow-up Reminders** — already built (relationship clocks, proactive queue). Extend with "this contact came from post X" provenance.
9. **Sales Dashboard** — already partially built (Business Intelligence Platform, Phase 9). Extend with content-attributed revenue.
10. **Profit Tracking** — cost price vs. selling price at the inventory-item level; new for electronics/retail-style businesses.
11. **Repeat Customer Marketing** — broadcasts already exist; extend targeting using content-engagement + purchase-history segments.
12. **Analytics: which products/posts drive inquiries** — the actual differentiator (§9) — most scheduler tools stop at "post published," not "post produced 4 WhatsApp leads and 1 sale."

### The end-to-end workflow this adds up to

```
Upload product
      │
      ▼
AI writes descriptions (FB / IG / WhatsApp / Marketplace)
      │
      ▼
AI generates video script + image variants
      │
      ▼
Schedule / publish to connected platforms
      │
      ▼
Leads land in WhatsApp inbox (existing Zuri core)
      │
      ▼
Conversation tracked, profile + memory built (existing)
      │
      ▼
Sale marked → customer enters CRM with full provenance
      │
      ▼
Future promotions target this customer, attributed back to what content worked
```

This is deliberately not "just another post scheduler" — the moat is that inventory, content, publishing, conversation, and CRM all share one data model. A competitor selling only a scheduler can't tell a shop owner which specific Reel produced which specific sale; Zuri can, because the WhatsApp conversation that closed the sale already lives in the same system as the post that generated the lead.

## 7. Platform Integration Reality Check

This section exists to prevent overpromising in both the product and the marketing copy — Meta and TikTok have real, different constraints.

### Meta Graph API (Facebook + Instagram) — the mature path
- **Facebook Pages API**: publish text/photo/video posts, schedule, read engagement, manage comments (with the right permissions).
- **Instagram Graph API**: publish images, carousels, and Reels (eligible business/professional accounts only), schedule content, read insights (views, reach, likes).
- **Marketing API**: campaign/ad-set/ad creation, budgets, targeting, performance monitoring — this is the eventual "Boost this product" feature, not organic posting.
- **WhatsApp Business Platform**: template messages, conversation replies, media, automated notifications. **Not available**: posting to WhatsApp Status via the official API — there is no legitimate way to automate that specific surface.

### TikTok — the immature path
TikTok's developer platform supports video upload, publishing (gated by app review/approval), analytics, and user auth — but it is meaningfully more restrictive than Meta's, with real approval friction. **Do not commit to "one-click TikTok publishing" as a launch promise** — plan for TikTok read/analytics access first, with publish access as a stretch goal contingent on approval, and design the UI so a business can still get an AI-written TikTok caption/script and just paste it in manually if native publishing isn't approved yet.

### Architecture implication
```
AI Content Generator
                       │
        ┌──────────────┼──────────────┐
        │              │              │
     Facebook      Instagram       TikTok
    (mature API)  (mature API)   (limited API —
                                  script/caption
                                  export as fallback)
        │              │              │
        └──────────────┼──────────────┘
                       │
                WhatsApp Business (existing Zuri core)
                       │
                      CRM (existing Zuri core)
```

## 8. Frontend Marketing Pages — Phase A (shipped)

The public site (`apps/web/src/app/(marketing)/`) was 100% "reply faster on WhatsApp" positioned before this phase — zero mention of content creation, social scheduling, or the funnel described above, no SEO metadata anywhere, and the old homepage manually re-imported nav/footer instead of using the shared layout. What actually shipped, across three iterations (the first attempt — bolting a teaser onto the old homepage — was wrong and got reverted):

1. **Three separate pages, not one homepage with a teaser**: the original homepage content moved unchanged to `(marketing)/whatsapp/page.tsx` (the dedicated "Zuri WhatsApp" product page); `(marketing)/marketing/page.tsx` is the dedicated "Zuri Marketing" product page (funnel diagram, module grid, platform-integration honesty section, workflow, CTA); `(marketing)/page.tsx` is a genuinely new unified homepage at `/` that explains both products with real substance (a condensed funnel section, expanded product cards) and routes visitors to whichever product page they want to explore — not a thin hub page.
2. **CTA discipline, enforced consistently**: every "Explore" or product-named button goes to that product's own page, never straight to sign-up. Exactly one "Get started" action exists, at the bottom of the homepage, going to `/register`. The Zuri Marketing page's CTA says "Get early access" rather than "Start free," since the feature isn't built yet — existing WhatsApp customers get first access as it rolls out; that's a promise about rollout order, not a false claim about current capability.
3. **A routing collision, caught before it became a second one**: the *public* sales page for Zuri Marketing lives at `/marketing`. This means the future *authenticated* in-app feature (§12) cannot also be named `/marketing` — Next.js route groups don't appear in the URL, so `(dashboard)/marketing` and `(marketing)/marketing` would collide at build time. §12 uses `/studio` for the authenticated side specifically to avoid this.
4. **A live bug, found and fixed**: Clerk's `middleware.ts` guards every route via a hardcoded public-route allowlist. Both new pages were missing from it, so logged-out visitors clicking any nav link to either product got redirected straight to `/login` instead of seeing the page. Fixed by adding `/whatsapp(.*)` and `/marketing(.*)` to `isPublicRoute`.
5. Per-page `metadata` export added to all three new pages — the first pages on the site to have one. Broader SEO work (sitemap, robots, OG images, metadata on every *other* existing page) is still greenfield and out of scope here.

**Known pre-existing issues surfaced but not fixed in this phase** (flagging rather than scope-creeping): `docs/PRODUCT_VISION.md`'s USD pricing model doesn't match the live Kwacha pricing on `/pricing` and the `/whatsapp` page — a business decision, not a docs bug; `/contact` is linked from two pricing CTAs but the page doesn't exist and isn't in the middleware allowlist either; the homepage's old inline pricing block and the dedicated `/pricing` page still carry separately-drifting copies of the same three plans.

## 9. Analytics — the Differentiator, Not an Afterthought

Once publishing goes through Zuri's own APIs rather than manual posting, the dashboard can show what a plain scheduler can't: total posts published, reach, likes, comments, shares, video views, **clicks to WhatsApp**, **leads generated**, **best-performing products**, **best posting times**, and — the part that actually matters to a shop owner — **which specific posts led to which specific sales**, because the WhatsApp conversation and the CRM sale record already live in the same system as the post. This is the design principle §12's analytics integration follows: extend the existing analytics area, don't build a second, disconnected one.

## 10. Data Model for Phase B (Not Built Yet)

In Zuri's actual conventions (migrations in `db/migrations/`, BullMQ queue naming `domain.action`, services split between `services/api` and `services/intelligence`) — none of this is implemented yet, sketched here so Phase B has a concrete starting point.

**New tables:**
- `products` — catalog item (name, specs, price, images, IMEI/serial for electronics-style inventory). Links to `users`, optionally to `contacts` the same way existing tables do.
- `social_accounts` — per-user OAuth connection per platform: platform, Facebook Page ID / IG Business Account ID, access token, refresh info, token expiry, granted permissions.
- `social_posts` — the scheduling queue: product reference, image/caption/video, target platforms, scheduled time, **status** (`draft | scheduled | sending | sent | failed | cancelled` — the exact lifecycle `broadcasts` already uses for WhatsApp sends, reused deliberately, see §12), platform post ID once published.
- `content_generations` — AI output audit trail (what was generated, from what input, which model), mirroring the provenance discipline already used for `business_facts`/`contact_insights` in the Memory Engine.
- `marketing_access` — an entitlement column on `users` (`none | waitlisted | beta | enabled`), or a small `product_entitlements` table if more add-on products are expected later. See §12 for why this can't reuse the existing `mode` column.

**Scheduling worker**: a BullMQ queue (`social.publish_post`) — check every minute for due posts, publish via the relevant platform API, record success/failure + the returned platform post ID, retry on failure. Same "queue-backed, not synchronous" discipline already used for `send.reply` in the WhatsApp send path — do not repeat the "post immediately on click" mistake §7's research explicitly warns against.

**Where this plugs into the existing Memory Engine**: content performance data is exactly the kind of "business memory" the Memory Engine (`docs/MEMORY_ENGINE_PLAN.md`) already models — a "which products/posts convert" fact is structurally the same shape as a `business_facts` row (confidence rises with more evidence). Rather than a parallel analytics-only data model, Phase B should extend the existing `business_facts` categories (already has `'product'`, `'promotion'`) to hold content-performance facts, surfaced to reply generation and agent context through the same `memory/retrieval_service.py` — a Reel that's converting well is exactly what a sales agent should know when a customer asks "what's popular right now."

## 11. Known Conflicts to Resolve

- **Pricing**: `docs/PRODUCT_VISION.md` §6 describes USD pricing (Personal Free/$19, Pro $49, Business $149, Enterprise $500+) tied to "Intelligence Engine" tiers. The live site uses Kwacha pricing (Personal K200, Business K400, Enterprise K1,800) with different tier names/features. Genuinely different models, not copy-paste drift — someone needs to decide which is current. Zuri Marketing pricing (whenever it's set) needs to land in both the homepage and `/pricing`, not just one.
- **Terms of Service**: dead `/terms` link in the footer, pre-existing.
- **`/contact`**: linked from two pricing CTAs, page doesn't exist, not in the middleware allowlist.

---

## 12. Dashboard Integration Architecture

This section exists because of one explicit requirement: **Zuri WhatsApp and Zuri Marketing must feel like one system, not two apps sharing a login.** That means deciding, concretely, which dashboard pages are shared, which are new, and how access to the new feature is gated — grounded in how the dashboard actually works today, not assumptions.

### 12.1 What the dashboard actually does today (verified, not assumed)

- The sidebar (`(dashboard)/layout.tsx`) is a static `NAV_GROUPS` array. Gating is **group-level only**, via `showForModes: WorkspaceMode[]` (`business`/`personal`/`hybrid`) — there's no per-item gating today.
- `mode` is a plain column on `users`, surfaced through Clerk-sync into `useZuriSession().data.mode`. Confirmed by reading every backend route that touches it: **it is a pure client-side display filter today.** No API endpoint branches on it. It decides what's rendered in the sidebar and a couple of dashboard sections — nothing else.
- `<FeatureGate modes tiers>` exists as a component, but `tiers` is an accepted prop that does nothing (comment: "tier check wired in Phase 3 when subscription data is in the session"), and `<FeatureGate>` itself is **not used anywhere** in the actual dashboard — all real gating in practice happens via `NAV_GROUPS.showForModes` and ad hoc `mode === '...'` checks inside individual pages.
- `automation/page.tsx` ("AI Workforce") is the codebase's own precedent for "new feature area, one nav item": it consolidates agents + rules + escalations into **one hub page with multiple in-page sections**, rather than exploding into several top-level nav items. `agents/page.tsx` is now a redirect stub to `/automation` — a sign this consolidation happened deliberately, not by accident.
- `broadcasts/page.tsx` already has almost exactly the status lifecycle a social-post scheduler needs: `draft → scheduled → sending → sent/failed`, just targeting WhatsApp contacts instead of social platforms.
- `analytics/page.tsx` already has a self-contained `SUB_NAV` + sticky-tab pattern (Overview/Sales/Customers/Chats/Operations/Opportunities/Predictions/Health/ROI/Reports) — a clean extension point, not something to duplicate.
- `settings/page.tsx` is a flat `tabs` array with a lazy-load-per-tab convention already used for `enterprise`/`auto_responses`/`memory`/`privacy`.

### 12.2 Why `mode` can't gate Zuri Marketing access

`mode` (business/personal/hybrid) describes *how someone uses WhatsApp* — it is not a product-entitlement flag, and it's enforced nowhere on the backend today. Reusing it to gate a second paid/rolling-out product would be both semantically wrong (a "personal" mode user could legitimately want Zuri Marketing for a side hustle) and a real security gap (mode is client-controlled state with zero server enforcement — anyone could flip it and see gated content). **Zuri Marketing needs its own entitlement dimension**, not an overload of `mode`. This is also the moment to finally build the `tiers` half of `FeatureGate` that's been stubbed since it was written.

### 12.3 The entitlement model

New column: `users.marketing_access` — `none | waitlisted | beta | enabled`. Default `none`. This is deliberately simpler than a generic tiers/permissions table for now, matching the actual rollout story already promised on the public `/marketing` page ("existing customers get first access as it rolls out"):
- `none` → nav item hidden, `/studio` shows the same "join the waitlist" pitch as the public `/marketing` page (not a 404 — a logged-in user clicking through should never hit a dead end).
- `waitlisted` → same UI, but recorded as "asked for it" for rollout prioritization.
- `beta` / `enabled` → full `/studio` access.

`FeatureGate` gets a real implementation for a new `entitlements` prop (or reuses `tiers`, renamed if it's clearer) that checks this field, alongside the existing `modes` check it already has.

### 12.4 Routing decision: `/studio`, not `/marketing`

The public sales page already owns `/marketing` (`(marketing)/marketing/page.tsx`). The authenticated feature is a new top-level route `(dashboard)/studio/` — one hub page, following the `automation/page.tsx` precedent exactly: Product Catalog, AI Content Generator, Scheduled Posts, and Connected Accounts as in-page sections of one page, not four separate nav items. `middleware.ts` needs `/studio(.*)` added as an **authenticated** route (Clerk-protected, the default — unlike `/whatsapp` and `/marketing` which needed adding to the *public* allowlist, `/studio` needs no allowlist change since the default behavior for unlisted routes is already "require login").

### 12.5 Shared pages — what integrates where, and why

| Existing page | Integration | Why |
|---|---|---|
| **Contacts** (`/contacts`) | Shared, additively extended | Already the mode-agnostic, single source of truth for lead/health/tag data (`/api/contacts`). Add an optional `leadSource` field (which post/campaign, if any, brought this contact in) — additive, doesn't touch existing WhatsApp-only contacts. |
| **Analytics** (`/analytics`) | Shared, new sub-nav tab | Add a "Campaigns" tab to the existing `SUB_NAV` array, next to Sales/Customers/Operations — not a second, disconnected analytics area. This is where post→lead→sale attribution (§9) actually gets shown. |
| **Settings** (`/settings`) | Shared, new tab | Add a `connected_accounts` tab (Facebook/Instagram/TikTok OAuth) following the exact lazy-load-per-tab pattern already used for `enterprise`/`memory`/etc. |
| **Billing** (`/billing`) | Shared | Same subscription system gates `marketing_access`; Zuri Marketing is priced as an add-on or higher tier, not a separate bill. |
| **Notifications** (`/notifications`) | Shared | New notification types (post published, post failed, new social-sourced lead) flow through the existing notification center, not a separate inbox. |
| **Calendar** (`/calendar`) | Shared | Scheduled posts appear as a new event type alongside existing WhatsApp-derived calendar events — one calendar, not two. |
| **Dashboard home** (`/dashboard`) | Shared, extended | New KPI widgets (posts this week, leads from social, top-performing product) render when `marketing_access` is `beta`/`enabled`, next to existing WhatsApp KPIs — same page, same pattern `mode === 'hybrid'` conditionals already use there. |

### 12.6 New, dedicated pages

- **`/studio`** — the one new hub page. In-page sections: **Products** (catalog CRUD), **Content Generator** (upload a product → AI descriptions/scripts/images, per §6), **Scheduled Posts** (the `social_posts` queue, reusing `broadcasts/page.tsx`'s draft→scheduled→sending→sent/failed UI pattern), **Connected Accounts** (or this lives in Settings instead — one or the other, not both, to avoid a duplicated OAuth UI; current recommendation is Settings, per 12.5, with `/studio` linking to it).
- Nav: one new group (e.g. "Marketing") containing one item ("Studio" → `/studio`), gated on `marketing_access !== 'none'` via the new entitlement check in `NavGroup`/`NavItem` (extending the type to support this alongside the existing `showForModes`).

### 12.7 What this deliberately avoids

No separate "Zuri Marketing dashboard" with its own shell, its own contacts list, its own settings, its own billing. The entire point of one login and shared data (§4) is that a lead from a Facebook post and a WhatsApp regular are the same contact record, visible in the same place, analyzed by the same intelligence layer — building a second silo would recreate exactly the disconnected-tools problem §12's own precedent research (and §9's "differentiator" argument) explicitly identifies as the thing competitors already have.

---

## 13. Build Log

**Phase 0 — Foundation.** `marketing_access` entitlement column + `products` table (migration `0031`), `/studio` dashboard route with the waitlist pitch (§12.3), Studio nav item gated on the entitlement (§12.4/12.6), `FeatureGate`'s `entitlements` prop wired to real data, and a minimal products API behind the `beta`/`enabled` gate.

**Phase 1 — AI Content Generator.** `content_generations` audit-trail table (migration `0032`), a `services/intelligence` route (`POST /internal/content/generate`, via `AIClient`/`model_router`) that turns a product into a description, a social caption, and a video script, an API proxy that persists each as its own row, and a live "Generate content" flow inside `/studio`'s product cards.

**Phase 2 — Publishing & Scheduling.** `social_accounts` + `social_posts` tables (migration `0033`, same draft/scheduled/sending/sent/failed/cancelled lifecycle as `broadcasts`), API routes for connecting accounts and creating/scheduling/cancelling posts, a minute-by-minute polling worker (`services/api/src/workers/social-publish-worker.ts` — a plain sleep-and-check loop matching this codebase's existing house style rather than a BullMQ repeatable job) that publishes due posts, a Settings "Connected Accounts" tab, and a "Scheduled Posts" composer + list inside `/studio`.
**Caveat**: no Meta/TikTok developer app is configured anywhere in this repo, so real OAuth and real Graph API publishing are not wired end to end — connecting an account records a row directly (no OAuth redirect), and the publish worker's Facebook code path only calls the real Graph API when `social_accounts.access_token` is non-null, which today it never is; every publish currently succeeds via a mock `platformPostId`. The full pipeline (data model, UI, scheduling, status transitions, retry/cancel) is real and testable today — swapping in real credentials later only touches the connect flow and `access_token`.

**Phase 3 — Funnel Tracking.** `contacts.source_product_id`/`source_social_post_id` (migration `0034`) let a contact be attributed to the product/post that brought them in — set manually (in the contact's Edit panel, gated on `marketing_access`) since there's no live click-tracking to do it automatically. `GET /api/analytics/campaigns` aggregates leads and sales per sent post and per product, surfaced in a "Campaigns" tab added to all 11 existing Analytics pages' sub-nav.
**Caveat**: what's shown is real attribution data (leads/sales a human tagged), not real engagement metrics (reach/likes/comments/video views) — those require live Graph API Insights calls this repo has no credentials for, so they were deliberately not fabricated.

This completes the Appendix's original Phase 1 MVP scope end to end, with real Meta/TikTok credentials being the one consistently-flagged gap across all of it.

**Dashboard integration (§12.5's "Dashboard Updates" — actually built, not just planned).** The main `/dashboard` page (Zuri WhatsApp's home) now fetches `/api/analytics/campaigns` when `marketing_access` is `beta`/`enabled` and shows a "Zuri Marketing" stat row (posts sent, leads, sales, top product) plus an "Open Studio" quick action — right next to the existing WhatsApp KPIs, same page, same `mode === 'hybrid'`-style conditional rendering already used there. Waitlisted accounts see a small teaser card instead. In the other direction, `/studio` itself gained an overview stat row (products, connected accounts, leads, sales — reusing the same `getCampaignStats()`-backed endpoint) and a Quick Actions section linking to Campaign analytics and Connected Accounts settings, plus an explicit "same Contacts list as WhatsApp" callout linking to `/contacts`. Neither page duplicates data or logic — both read from the same `/api/analytics/campaigns`/`/api/contacts` endpoints the other pages already use.

**Phase 2 Ideas, first pick — Advanced analytics + recommendations.** Extended `getCampaignStats()` (shared by the campaigns GET and the new recommendations POST, so they never drift apart) with a `postingTimes` bucket (day-of-week × hour-of-day, ranked by attributed leads) and a `conversionRate` per product (`sales / leads`). Added `POST /internal/content/recommendations` in `services/intelligence` — takes the exact stats JSON the Campaigns page shows and asks the model for 3-5 specific, data-grounded suggestions (not generic advice); proxied through `POST /api/analytics/campaigns/recommendations`, on-demand rather than computed on every page load. The Campaigns page gets a "Best posting times" table and a "Generate recommendations" button + list.

---

## Appendix: Original July 2026 Draft (superseded by the above, kept for history)

### Vision
Transform Zuri from a WhatsApp-centric AI Relationship OS into a full Social Commerce Operating System for small businesses in Zambia and similar markets.

### Phase 1 Scope (MVP — 4-6 weeks, as originally drafted)
1. Product Catalog (shared)
2. AI Content Generator
3. Publishing & Scheduling
4. Basic Dashboard Updates
5. Funnel Tracking

### Phase 2 Ideas (as originally drafted)
- Full ad management (Marketing API)
- ✅ Advanced analytics + recommendations — shipped, see §13
- TikTok deeper integration
- Inventory → accounting sync
- Multi-business / team features
- Expand to other verticals

### Risks & Dependencies (as originally drafted)
- Meta/TikTok API approvals & rate limits
- Content quality — needs good prompting + human review loop
- Billing model (add-on pricing)
