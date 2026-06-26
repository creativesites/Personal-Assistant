# Zuri — AI Relationship Operating System

> Zuri continuously understands people, remembers what matters, reasons about every relationship, stays aware of the outside world, plans interactions, and executes communication — for your personal life, your business, or your team.

---

## What It Does

Zuri is not a chatbot. It is not a CRM. It is an **AI operating system for relationships** built on top of WhatsApp.

Twelve intelligence engines work continuously in the background:

| Engine | What It Does |
|--------|-------------|
| **Relationship Intelligence** | Builds living psychological profiles — personality, communication style, mood patterns, life context |
| **Temporal Intelligence** | Per-relationship clocks that understand each contact's unique rhythm and proactively prompt at the right moment |
| **Opportunity Detection** | Scans conversations for buying signals, churn risk, upsell moments, birthdays, and life events |
| **World Knowledge** | Connects live news, stocks, sports results, and trending content to specific relationships |
| **Conversation Strategy** | Plans multi-step conversations toward defined relationship goals |
| **Autonomous Agents** | Sales, support, and community manager agents that work within defined permission boundaries |
| **Knowledge Engine** | Indexes business docs, policies, and FAQs so agents give accurate, policy-compliant answers |
| **Business Intelligence** | Funnel analytics, agent performance, revenue attribution, proactive impact reporting |
| **Automation Engine** | Visual workflow builder for complex multi-step conversation automations |
| **Multi-Channel** | (Roadmap) Unified relationship view across WhatsApp, Instagram, Telegram, Email, and more |
| **Governance & Privacy** | AI Memory Explorer, per-contact privacy levels, explainability, data control center |
| **Learning & Optimization** | Learns from accepted/rejected suggestions to improve timing, tone, and model routing |

**Core experience:**
- Voice-matched reply suggestions that sound like you, not a bot
- Proactive "morning coffee" feed of relationship maintenance opportunities
- Real-time inbox with 3 suggested replies and contact mood analysis
- Relationship health scoring with trend visualization
- Business: shared team inbox, autonomous customer care, CRM sync

---

## Who It's For

| User | Use Case |
|------|---------|
| Individuals | Maintain personal and professional relationships without the cognitive overhead |
| Freelancers & solopreneurs | Never drop a lead or let a client relationship go cold |
| Small businesses | Customer engagement that feels personal at scale |
| Sales teams | Intent scoring, conversation strategy, follow-up automation |
| Support teams | Autonomous first-line response with intelligent escalation |

---

## Tech Stack

**Frontend:** Next.js 15 (web dashboard) · React Native + Expo (mobile)  
**Backend:** Node.js + Fastify (API) · Node.js + open-wa (WhatsApp) · Python + FastAPI (AI/analytics)  
**Infrastructure:** PostgreSQL 16 + pgvector · Redis + BullMQ · Socket.io  
**AI:** LiteLLM (Anthropic, OpenAI, Google — provider-agnostic)  
**Auth:** Clerk (web) · JWT (API)  
**Deployment:** Vercel (web) · Alibaba Cloud ECS (services, Docker Compose)

---

## Project Structure

```
apps/
  web/            Next.js SaaS dashboard → Vercel
  mobile/         React Native + Expo
  companion/      Kotlin Android notification relay
services/
  api/            Node.js REST + WebSocket server
  whatsapp/       open-wa session manager
  intelligence/   Python AI service (FastAPI + LiteLLM + 10 engines)
packages/
  shared-types/   TypeScript types shared across services
db/
  migrations/     PostgreSQL migration files (28 tables)
docs/
  ARCHITECTURE.md     System design and service responsibilities
  ROADMAP.md          Build phases and current status
  SCHEMA.md           Full database schema reference
  PRODUCT_VISION.md   Full product specification and feature matrix
  NEXT_PHASE.md       Detailed implementation plan for active phases
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

# Run migrations
npm run db:migrate

# Start all services
npm run dev
```

Web dashboard: http://localhost:3002  
API server: http://localhost:3000  
Intelligence service: http://localhost:8000

> **Note:** `apps/mobile` is excluded from the root npm workspace (React Native requires React 18, conflicting with the web app's React 19). Run `npm install` inside `apps/mobile` separately for mobile development.

---

## Documentation

| Doc | Contents |
|-----|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, the ten engines, queue design, deployment |
| [ROADMAP.md](docs/ROADMAP.md) | Build phases, milestones, current status |
| [SCHEMA.md](docs/SCHEMA.md) | Full database schema (28 tables, 8 domains) |
| [PRODUCT_VISION.md](docs/PRODUCT_VISION.md) | Complete product spec, pricing tiers, feature matrix |
| [NEXT_PHASE.md](docs/NEXT_PHASE.md) | Detailed implementation plan for the active sprint |
| [CLAUDE.md](CLAUDE.md) | Context and conventions for Claude Code development sessions |

---

## Current Status

The backend pipeline (WhatsApp ingestion → database → queue) and web dashboard (Clerk auth, deployed to Vercel) are working. The AI intelligence layer is the active build target.

See [ROADMAP.md](docs/ROADMAP.md) for full status.

---

## Deployment

- **Web dashboard** — auto-deploys to Vercel on push to `main`
- **Backend services** — Docker Compose on Alibaba Cloud ECS
- See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for full deployment configuration

---

## License

Private — all rights reserved.
