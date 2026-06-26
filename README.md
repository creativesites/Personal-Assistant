# Zuri — WhatsApp AI Relationship Intelligence

> Your relationships, maintained. An always-on AI co-pilot that monitors your WhatsApp, learns the people you communicate with, and helps you never let an important relationship go cold.

---

## What It Does

Zuri is not a chatbot. It is a **relationship intelligence layer** on top of WhatsApp that:

- **Reads and understands** every conversation — sentiment, intent, commitments made, topics discussed
- **Builds deep profiles** of your contacts over time — their communication style, mood patterns, known triggers, current life context
- **Mirrors your voice** — when it suggests a reply, it sounds like you, not a bot
- **Proactively surfaces** relationship maintenance opportunities: dormant connections, upcoming birthdays, promises you made but haven't followed up, life events worth acknowledging
- **Lets you stay in control** — every suggested reply requires your approval, or you can configure auto-send rules for specific contacts

### Who It's For

| User | Use case |
|------|----------|
| Individuals | Maintaining personal and professional relationships without the cognitive overhead |
| Freelancers & solopreneurs | Never dropping a lead or client relationship |
| Small businesses | Customer engagement that feels personal at scale |

---

## Tech Stack

**Frontend:** Next.js 15 (web dashboard) · React Native + Expo (mobile)  
**Backend:** Node.js + Fastify (API) · Node.js + open-wa (WhatsApp) · Python + FastAPI (AI/analytics)  
**Infrastructure:** PostgreSQL 16 + pgvector · Redis + BullMQ · Socket.io  
**AI:** LiteLLM (Anthropic, OpenAI, Google — provider-agnostic)  
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
  intelligence/   Python AI service (FastAPI + LiteLLM)
packages/
  shared-types/   TypeScript types shared across services
db/
  migrations/     PostgreSQL migration files
docs/
  ARCHITECTURE.md
  ROADMAP.md
  SCHEMA.md
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.12+
- Docker + Docker Compose

### Setup

```bash
# Clone and install
git clone https://github.com/creativesites/personal-assistant.git
cd personal-assistant
pnpm install

# Copy environment files
cp services/api/.env.example services/api/.env
cp services/whatsapp/.env.example services/whatsapp/.env
cp services/intelligence/.env.example services/intelligence/.env
cp apps/web/.env.example apps/web/.env.local

# Start infrastructure
docker compose up -d postgres redis

# Run migrations
pnpm db:migrate

# Start all services
pnpm dev
```

Web dashboard: http://localhost:3000  
API: http://localhost:3001  
Intelligence service: http://localhost:8000

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — System design, service communication, deployment
- [Roadmap](docs/ROADMAP.md) — Build phases, milestones, current status
- [Schema](docs/SCHEMA.md) — Full database schema (28 tables)
- [CLAUDE.md](CLAUDE.md) — Context for Claude Code development sessions

---

## Deployment

- **Web dashboard** deploys to Vercel automatically on push to `main`
- **Backend services** deploy to Alibaba Cloud ECS via Docker Compose
- See [Architecture docs](docs/ARCHITECTURE.md) for full deployment configuration

---

## License

Private — all rights reserved.
