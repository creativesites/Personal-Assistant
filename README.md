# Zuri — AI Relationship & Business Operating System

> Zuri continuously understands people, remembers what matters, reasons about every relationship, stays aware of the outside world, plans interactions, and executes communication & business operations — for your personal life, your business, or your team.

---

## What It Does

Zuri is an **AI operating system for relationships and business operations** built on top of WhatsApp and modern web workspaces.

Twelve intelligence engines work continuously in the background alongside comprehensive Business, ERP, Document Management, and Career modules:

| Engine / Module | What It Does |
|-----------------|-------------|
| **Relationship Intelligence** | Builds living psychological profiles — personality, communication style, mood patterns, life context |
| **Temporal Intelligence** | Per-relationship clocks that understand each contact's unique rhythm and proactively prompt at the right moment |
| **Opportunity Detection** | Scans conversations for buying signals, churn risk, upsell moments, birthdays, and life events |
| **World Knowledge** | Connects live news, stocks, sports results, and trending content to specific relationships |
| **Conversation Strategy** | Plans multi-step conversations toward defined relationship goals |
| **Autonomous Agents** | Sales, support, and community manager agents that work within defined permission boundaries |
| **Knowledge Engine & Brain** | Indexes business docs, policies, spreadsheets, and FAQs with vector search & discovery |
| **Business Intelligence** | Executive health scoring (0-100), funnel analytics, agent performance, revenue attribution |
| **Business ERP & Sales Engine** | Quotations, Invoices, Sales Orders, Purchase Orders, Bill of Materials, Inventory tracking |
| **Document Studio & E-Signatures** | 15 Document types, quote-to-receipt lifecycle, smooth 1:1 e-signatures, auto-dunning |
| **Shared Team Inbox & Organizations** | Active conversation locking, collision warnings, Clerk Organization workspace scoping |
| **Career OS & CV Studio** | Job scraping, readiness checklists, AI cover letters, resume studio |
| **BYOK (Bring Your Own Key)** | Securely connect Anthropic, OpenAI, Gemini, and DashScope API keys |

**Core experience:**
- Voice-matched reply suggestions that sound like you, not a bot
- Proactive "morning coffee" feed of relationship maintenance opportunities
- Real-time shared inbox with suggested replies, collision alerts, and contact mood analysis
- Relationship health scoring with trend visualization
- Business: shared team inbox, autonomous customer care, CRM sync, sales orders, inventory, e-signatures

---

## Tech Stack

**Frontend:** Next.js 15 App Router (30+ pages SaaS dashboard) · React Native + Expo (mobile)  
**Backend:** Node.js + Fastify 5 (API) · Node.js + Baileys (WhatsApp) · Python + FastAPI (AI/analytics)  
**Infrastructure:** PostgreSQL 16 + pgvector (115 migrations) · Redis + BullMQ · Socket.io  
**AI:** LiteLLM (Anthropic, OpenAI, Google Gemini, Qwen/DashScope — provider-agnostic) + BYOK  
**Auth & Teams:** Clerk SSO & Clerk Organizations (web) · JWT (API)  
**E-Signatures:** Canvas HTML5 + Bézier Stroke Smoothing  
**Deployment:** Vercel (web) · Alibaba Cloud ECS (services, Docker Compose)

---

## Monorepo Structure

```
apps/
  web/            Next.js 15 SaaS dashboard → Vercel
  mobile/         React Native + Expo
  companion/      Kotlin Android notification relay
services/
  api/            Node.js REST + Fastify API server
  whatsapp/       Baileys session manager
  intelligence/   Python AI service (FastAPI + LiteLLM + 12 engines)
packages/
  shared-types/   TypeScript types shared across services
db/
  migrations/     PostgreSQL migration files (115 sequential SQL migrations)
docs/
  ARCHITECTURE.md              System design and service responsibilities
  ROADMAP.md                   Build phases and current status
  SCHEMA.md                    Full database schema reference (100+ tables)
  UI_SYSTEM_AND_COMPONENTS.md  UI design system, component library & responsive patterns
  PRODUCT_VISION.md            Full product specification and feature matrix
  NEXT_PHASE.md                Detailed implementation plan for active phases
```

---

## Getting Started

### Prerequisites

- Node.js 22+
- npm 10+
- Python 3.12+
- Docker + Docker Compose

### Setup

```bash
# Clone and install
git clone https://github.com/creativesites/personal-assistant.git
cd personal-assistant
npm install --legacy-peer-deps

# Copy environment files
cp services/api/.env.example services/api/.env
cp services/whatsapp/.env.example services/whatsapp/.env
cp services/intelligence/.env.example services/intelligence/.env
cp apps/web/.env.example apps/web/.env.local

# Start infrastructure
docker compose up -d postgres redis

# Run database migrations
npm run db:migrate

# Start all services
npm run dev
```

Web dashboard: http://localhost:3002  
API server: http://localhost:3000  
Intelligence service: http://localhost:8000

---

## Current Status

- ✅ Full monorepo and Vercel deployment live
- ✅ PostgreSQL database with 115 migrations applied (Supabase managed)
- ✅ WhatsApp service with Baileys session management & history sync
- ✅ Web dashboard with 30+ production routes (Inbox, CRM, Leads, ERP, Documents, E-Signatures, Knowledge Brain, BYOK, Admin, Career OS)
- ✅ 12 AI Intelligence engines running with LiteLLM & pgvector
- ✅ Production backend running on Alibaba Cloud ECS

See [ROADMAP.md](docs/ROADMAP.md) for full status.

---

## License

Private — all rights reserved.
