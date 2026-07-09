# Zuri Expansion: Zuri WhatsApp + Zuri Marketing

**Date**: July 2026  
**Status**: Draft — Phase 1 Planning

## Vision

Transform Zuri from a WhatsApp-centric AI Relationship OS into a **full Social Commerce Operating System** for small businesses in Zambia and similar markets.

- **Zuri WhatsApp** (existing): Inbox, conversations, relationships, proactive AI, CRM, agents.
- **Zuri Marketing** (new): AI-powered content creation, multi-platform scheduling (FB/IG/TikTok), ad management, funnel analytics that feeds back into WhatsApp.

**Unified Product**: One login, shared customer data, seamless flow from marketing → WhatsApp sales → repeat business.

## Market Fit (Zambia Electronics Example)

- Facebook Marketplace + Groups dominate discovery.
- WhatsApp closes deals.
- Reels/Short video drive engagement.
- Opportunity: AI automates content at scale for small shops.

## High-Level Architecture

### Shared Core (Existing + Extensions)
- Auth, Users, Billing, Team (Clerk + existing).
- Intelligence Service (LiteLLM, profiles, analysis) — extended for content gen.
- DB (Supabase) — new tables for products, campaigns, posts.
- WhatsApp integration (core strength).
- Redis/BullMQ queues.
- Frontend monorepo (`apps/web`).

### Zuri WhatsApp (Renamed/Refactored Existing)
- Current dashboard becomes default "WhatsApp" view.
- Inbox, Relationships, Proactive, Analytics (messaging-focused).

### Zuri Marketing (New)
- Content Generator.
- Scheduler & Publisher (Meta + TikTok APIs).
- Campaign Management.
- Analytics (cross-funnel: post → WhatsApp lead → sale).

### Master Dashboard (New Home)
- Overview widgets for both products.
- Quick actions.
- Unified metrics.

## Phase 1 Scope (MVP — 4-6 weeks)

1. **Product Catalog** (shared)
   - Basic inventory: name, specs, price, images, IMEI/serial.
   - Link to existing contacts/CRM.

2. **AI Content Generator**
   - Upload product → AI generates:
     - FB/IG post text.
     - Reel/TikTok script (15/30/60s).
     - Captions, carousels.
     - WhatsApp catalogue description.
   - Image variants (backgrounds, lifestyle).

3. **Publishing & Scheduling**
   - Connect FB Page + IG Business + TikTok (OAuth).
   - Schedule posts (Meta Business Suite API + direct Graph API).
   - Queue worker for background publishing.

4. **Basic Dashboard Updates**
   - New master home.
   - Product switcher (WhatsApp / Marketing).
   - Unified CRM view.

5. **Funnel Tracking**
   - Tag leads from posts → WhatsApp.
   - Simple ROI (posts → inquiries).

## Technical Implementation Notes

- **New Routes** in `apps/web/src/app/(marketing)` mirroring existing structure.
- Extend Intelligence service with content-specific prompts/services.
- New BullMQ queues for scheduling.
- Reuse existing hooks (`use-zuri-session`, API client).

## Phase 2 Ideas

- Full ad management (Marketing API).
- Advanced analytics + recommendations ("Best posting time").
- TikTok deeper integration.
- Inventory → accounting sync.
- Multi-business / team features.
- Expand to other verticals (fashion, furniture, etc.).

## Risks & Dependencies

- Meta/TikTok API approvals & rate limits.
- Content quality — needs good prompting + human review loop.
- Billing model (add-on pricing).

## Next Actions

1. Finalize this doc + get feedback.
2. Create DB migrations for products/campaigns.
3. Build AI Content Generator PoC.
4. Design master dashboard UI.
5. Update ROADMAP.md.

This expansion leverages Zuri's existing strengths while opening a much larger TAM. Let's execute.

--- 

**Approval / Comments**: [Space for Winston]
