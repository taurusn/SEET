# SEET

Production-ready multi-tenant AI messaging PaaS for Saudi coffee shops.

## What it does

Automates Instagram DM and WhatsApp replies using **Gemini 2.0 Flash** with Najdi dialect support. Designed as a white-label B2B platform — onboard a shop, connect its socials, and the AI handles customer conversations 24/7.

## Key Features

- **Agentic AI pipeline** — modular prompt composition, parallel sentiment classification, business-hours awareness
- **Najdi dialect support** — culturally tuned responses for Saudi customers
- **Multi-platform** — Instagram DMs + WhatsApp Cloud API
- **Human handoff** — automatic escalation with real-time SSE notifications
- **Automated vouchers** — compensation codes (CAFE-XXXX-XXXX) with configurable tiers
- **Sentiment tracking** — dual conversation + message-level sentiment analysis
- **White-label deployment** — custom branding per shop (logo, splash screen, colors)
- **15 Docker containers** — single `docker compose up` brings everything online

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI, SQLAlchemy 2.0, Alembic |
| AI | Gemini 2.0 Flash |
| Queue | RabbitMQ (inbound → outbound → DLQ) |
| Cache | Redis 7 |
| Database | PostgreSQL 16 |
| Storage | MinIO (S3-compatible) |
| Frontend | Next.js 15, React 19, Tailwind CSS 4 |
| Real-time | SSE via Redis pub/sub |
| Proxy | Nginx + Cloudflare Tunnel |
| CI/CD | Woodpecker CI |

## Quick Start

```bash
git clone git@github.com:taurusn/SEET.git && cd SEET
cp .env.example .env   # fill in secrets
docker compose -p seet up --build -d
docker compose -p seet exec api alembic upgrade head
```

See `.env.example` for required environment variables and `CLAUDE.md` for full architecture docs.

## License

Proprietary. All rights reserved.
