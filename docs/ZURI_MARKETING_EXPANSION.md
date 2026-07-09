# Zuri Marketing Expansion: From WhatsApp CRM to Social Commerce Operating System

**Date**: July 2026
**Status**: Expanded plan — supersedes the July draft below. Phase A (frontend marketing pages) is in progress; everything past that is design, not yet built.

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

## 8. Frontend Marketing Pages — Phase A (this round of work)

The existing public site (`apps/web/src/app/(marketing)/` + the homepage at `apps/web/src/app/page.tsx`) is 100% "reply faster on WhatsApp" positioned today — there is currently zero mention of content creation, social scheduling, or the funnel described above. Verified during this pass:
- No dedicated page for this capability exists.
- Homepage nav (`MarketingNav.tsx`) and footer (`MarketingFooter.tsx`) have no link to it.
- SEO is greenfield across the whole marketing site — no per-page `metadata`, no sitemap, no robots.txt, no OG tags anywhere. Not fixed wholesale in this pass (real, separate scope), but the new page gets its own `metadata` export as a starting example.
- Pricing is duplicated (near-identically, not exactly) between the homepage's inline pricing block and `/pricing`'s dedicated page — a pre-existing inconsistency, not something this pass needs to fix, but worth flagging: **do not add Zuri Marketing pricing to only one of the two** without remembering the other exists.

**What ships in this pass:**
1. New page `apps/web/src/app/(marketing)/social-commerce/page.tsx` — the dedicated sales page for this capability: hero, the funnel diagram from §2, the module grid from §6, the platform-integration honesty section from §7 (framed positively, not as a wall of caveats), a workflow walkthrough, and a CTA.
2. **Honesty constraint on the CTA**: this feature does not exist in the shipped product yet — only the plan does. The page must not say "Start free" as if it's usable today. CTA is "Get early access" → `/register`, with copy that existing Zuri WhatsApp customers get first access as it rolls out. This is a promise about *order of rollout*, not a false claim about current capability.
3. Nav link added to `MarketingNav.tsx` (desktop + mobile), footer link added to `MarketingFooter.tsx`'s Product column.
4. Homepage teaser section added between "How it works" and "Pricing," linking to the new page — introduces the idea without overhauling the existing, working reply-speed narrative.
5. Per-page `metadata` export on the new page (title/description) — the first page on the site to have one; broader SEO work (sitemap, robots, OG images, per-page metadata everywhere else) is out of scope here and tracked as a follow-up below.

## 9. Analytics — the Differentiator, Not an Afterthought

Once publishing goes through Zuri's own APIs rather than manual posting, the dashboard can show what a plain scheduler can't: total posts published, reach, likes, comments, shares, video views, **clicks to WhatsApp**, **leads generated**, **best-performing products**, **best posting times**, and — the part that actually matters to a shop owner — **which specific posts led to which specific sales**, because the WhatsApp conversation and the CRM sale record already live in the same system as the post.

## 10. Technical Notes for Later Build Phases (Not Built Yet)

Sketched here so Phase B+ has a concrete starting point, in Zuri's actual conventions (migrations in `db/migrations/`, BullMQ queue naming `domain.action`, services split between `services/api` and `services/intelligence`) — none of this is implemented in this pass.

**New tables** (rough sketch, will need real design pass): `products` (catalog item, links to `contacts`/leads the same way existing tables do), `social_accounts` (per-user OAuth tokens per platform — Facebook Page ID, IG Business Account ID, access token, refresh info, token expiry, granted permissions), `social_posts` (image/caption/video/platforms/scheduled_time/status/platform_post_id — a queue-backed table, not fire-and-forget), `content_generations` (AI output audit trail, mirroring the provenance discipline already used for `business_facts`/`contact_insights` in the Memory Engine).

**Scheduling worker**: a BullMQ queue (e.g. `social.publish_post`) — check every minute for due posts, publish via the relevant platform API, record success/failure + the returned platform post ID, retry on failure. This is the same "queue-backed, not synchronous" discipline already used for `send.reply` in the existing WhatsApp send path — do not repost the mistake of "post immediately on click" that this doc's own research above says to avoid.

**Auth**: OAuth per business, one-time connect, tokens stored per `social_accounts` row, refreshed per platform's token lifecycle.

**Where this plugs into the existing Memory Engine**: content performance data is exactly the kind of "business memory" the Memory Engine (`docs/MEMORY_ENGINE_PLAN.md`) already models — a "which products/posts convert" fact is structurally the same shape as a `business_facts` row (confidence rises with more data, evidence-backed). Rather than building a parallel analytics-only data model, Phase B+ should extend the existing `business_facts` categories (already has `'product'`, `'promotion'`) to hold content-performance facts, and let the same retrieval service (`memory/retrieval_service.py`) surface them to reply generation and agent context — a Reel that's converting well is exactly the kind of thing a sales agent should know about when a customer asks "what's popular right now."

## 11. Known Conflicts to Resolve (Not Fixed in This Pass)

- **Pricing**: `docs/PRODUCT_VISION.md` §6 describes USD pricing (Personal Free/$19, Pro $49, Business $149, Enterprise $500+) tied to "Intelligence Engine" tiers. The live site (`/pricing`, homepage) uses Kwacha pricing (Personal K200, Business K400, Enterprise K1,800) with different tier names/features. These are genuinely different models, not a copy-paste drift. Someone needs to decide which is current and update the other — not addressed here since it's a business decision, not a docs bug.
- **Terms of Service**: `MarketingFooter.tsx` links to `/terms`, which does not exist as a route. Pre-existing dead link, unrelated to this expansion, noted because a new page launch is a good moment to also fix nearby rot — not fixed in this pass to keep scope matched to what was asked.
- **Homepage duplicate pricing block**: the homepage's inline pricing section and the dedicated `/pricing` page maintain separate, drifting copies of the same three plans. Pre-existing, not fixed here.

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
- Advanced analytics + recommendations
- TikTok deeper integration
- Inventory → accounting sync
- Multi-business / team features
- Expand to other verticals

### Risks & Dependencies (as originally drafted)
- Meta/TikTok API approvals & rate limits
- Content quality — needs good prompting + human review loop
- Billing model (add-on pricing)
