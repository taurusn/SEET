# SEET — Multi-Tenant AI Messaging PaaS

A B2B platform that onboards coffee shops / small businesses and auto-replies to their Instagram DMs and WhatsApp messages using Gemini AI, with human handoff, digital vouchers, and white-label branding.

## Agent Team

When asked to spin up the product crew, read the team blueprint at:
`.claude/teams/product-crew/`

Follow `config.yml` for team shape and `coordination.md` for protocols.
Spawn teammates using their respective `.md` files as context.
Dashboard: `cd .claude/teams/product-crew/dashboard && ./start.sh`

## Quick Start (New Server)

```bash
# 1. Clone
git clone git@github.com:taurusn/SEET.git && cd SEET

# 2. Create .env from template, fill in secrets
cp .env.example .env
# Generate keys:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
#   python -c "import secrets; print(secrets.token_urlsafe(32))"

# 3. Bring everything up (15 containers)
docker compose -p seet up --build -d

# 4. Run database migrations
docker compose -p seet exec api alembic upgrade head

# 5. Seed the first admin account
curl -X POST http://localhost/api/v1/admin/seed \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@seet.sa","password":"seet@2026","name":"Admin"}'

# 6. Confirm the tunnel is up
docker compose -p seet logs tunnel --tail 20
```

Production runs behind a **Cloudflare named tunnel** at `https://seet.cloud`,
wired via `CLOUDFLARE_TUNNEL_TOKEN` in `.env` (see `docker-compose.yml`
service `tunnel`). The hostname is stable across restarts, so Meta webhook
subscriptions don't need re-pointing.

## Architecture

```
                    Cloudflare Tunnel (HTTPS)
                            │
                        nginx:80
              ┌─────────┬──┴──┬──────────┬───────────┐
              │         │     │          │           │
          /api/*    /admin/*  /assets/*  /webhook/*   /*
              │         │     │          │           │
          FastAPI   Admin    MinIO    FastAPI    Shop
          :8000    Next.js   :9000    :8000    Next.js
                   :3001                       :3000
              │
    ┌─────────┼─────────┐
    │         │         │
  Postgres  Redis   RabbitMQ
   :5432    :6379    :5672
                       │
              ┌────────┼────────┐
              │        │        │
          message   reply     dlq
          worker    worker   worker
```

## 15 Docker Containers

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| nginx | nginx:alpine | 80 | Reverse proxy, path-based routing |
| tunnel | cloudflared | — | Public HTTPS via Cloudflare |
| api | ./Dockerfile | 8000 | FastAPI backend |
| message-worker | ./Dockerfile | — | Consumes inbound messages, calls Gemini |
| reply-worker | ./Dockerfile | — | Sends replies via Meta Graph API |
| dlq-worker | ./Dockerfile | — | Dead letter queue handler |
| frontend | ./frontend/Dockerfile | 3000 | Shop owner portal (Next.js 15) |
| admin-frontend | ./admin/Dockerfile | 3001 | Admin portal (Next.js 15, basePath: /admin) |
| db | postgres:16-alpine | 5432 | PostgreSQL database |
| redis | redis:7-alpine | 6379 | Cache, rate limiting, conversation history |
| rabbitmq | rabbitmq:3-management | 5672, 15672 | Message queue with DLQ routing |
| minio | minio/minio | 9000, 9001 | S3-compatible object storage (logos) |
| woodpecker-server | woodpeckerci | 8080 | CI/CD server |
| woodpecker-agent | woodpeckerci | — | CI/CD runner (mounts Docker socket) |
| woodpecker-tunnel | cloudflared | — | Public URL for Woodpecker GitHub webhooks |

## Project Structure

```
SEET/
├── app/                        # FastAPI backend
│   ├── main.py                 # Entry point, lifespan, CORS
│   ├── config.py               # Pydantic Settings (all env vars)
│   ├── db/database.py          # SQLAlchemy async engine
│   ├── models/schemas.py       # ORM models + Pydantic schemas
│   ├── api/
│   │   ├── webhooks.py         # Instagram & WhatsApp webhook handlers
│   │   ├── dashboard.py        # Shop owner endpoints
│   │   ├── admin.py            # Admin endpoints (shops CRUD, logo upload)
│   │   ├── auth.py             # Shop JWT auth (24h)
│   │   ├── admin_auth.py       # Admin email+password auth (bcrypt, 12h)
│   │   └── events.py           # SSE endpoint for real-time events (F4)
│   ├── services/
│   │   ├── ai_pipeline.py      # Agentic pipeline orchestrator (F0)
│   │   ├── classifiers.py      # Sentiment micro-classifier (F7)
│   │   ├── business_hours.py   # Timezone-aware hours check (F6)
│   │   ├── gemini.py           # Gemini 2.0 Flash + modular prompt composer
│   │   ├── instagram.py        # IG Graph API v21.0
│   │   ├── whatsapp.py         # WhatsApp Cloud API
│   │   ├── redis_client.py     # Cache, rate limit, circuit breaker, analytics, pub/sub
│   │   ├── encryption.py       # Fernet encrypt/decrypt for tokens
│   │   ├── handoff.py          # Human handoff detection + trigger
│   │   ├── voucher.py          # Voucher code generation
│   │   └── storage.py          # MinIO client (logo upload/delete)
│   ├── queue/rabbitmq.py       # RabbitMQ publish/consume/DLQ
│   └── workers/
│       ├── message_worker.py   # Inbound → pipeline → outbound (uses ai_pipeline)
│       ├── reply_worker.py     # Send via Meta API, retries, token refresh
│       └── dlq_worker.py       # Failed message logging
├── alembic/
│   └── versions/
│       ├── 001_initial_schema.py
│       ├── 002_add_compensation_tables.py
│       ├── 003_add_admin_and_whitelabel.py
│       └── 004_add_customer_profiles_and_sentiment.py
├── frontend/                   # Shop owner Next.js app
│   ├── Dockerfile              # Multi-stage, node:20-slim, PORT 3000
│   ├── next.config.mjs         # output: "standalone"
│   └── src/
│       ├── app/
│       │   ├── login/page.tsx
│       │   └── (dashboard)/    # Auth-guarded route group
│       │       ├── layout.tsx  # Auth guard, SSE connection, splash screen
│       │       ├── page.tsx    # Dashboard home with KPIs + AI performance
│       │       ├── conversations/
│       │       ├── handoffs/
│       │       ├── vouchers/
│       │       ├── analytics/  # Analytics dashboard (F5)
│       │       ├── settings/   # Profile, AI context, business hours, tiers
│       │       └── playground/
│       ├── components/
│       │   ├── conversation-list.tsx    # Conversation list with sentiment dots
│       │   ├── conversation-thread.tsx  # Thread + owner reply input (F2)
│       │   ├── business-hours-editor.tsx # Day-by-day hours picker (F6)
│       │   ├── context-editor.tsx       # AI context CRUD
│       │   ├── handoff-card.tsx         # Handoff card with deep link
│       │   ├── sidebar.tsx              # macOS dock-style nav (SSE-driven badge)
│       │   └── splash-screen.tsx        # White-label splash
│       └── lib/
│           ├── api.ts          # HTTP client, reads "token" from localStorage
│           ├── auth.tsx        # AuthProvider, validates token on load via /api/v1/shop
│           ├── sse.ts          # useSSE() hook + notifyHandoff() (F4)
│           └── utils.ts        # cn(), timeAgo(), formatDate()
├── admin/                      # Admin Next.js app
│   ├── Dockerfile              # Multi-stage, node:20-slim, PORT 3001
│   ├── next.config.mjs         # output: "standalone", basePath: "/admin", trailingSlash: true
│   └── src/
│       ├── app/
│       │   ├── login/page.tsx  # Email + password
│       │   └── (dashboard)/    # Auth-guarded route group
│       │       ├── shops/
│       │       │   ├── page.tsx         # List all shops
│       │       │   ├── [id]/page.tsx    # Shop detail + edit
│       │       │   └── onboard/page.tsx # 5-step onboarding wizard
│       │       └── settings/
│       └── lib/
│           ├── api.ts          # HTTP client, reads "admin_token" from localStorage
│           └── auth.tsx        # AdminAuthProvider, validates via /api/v1/admin/me
├── nginx/nginx.conf            # Routing rules for all services
├── docker-compose.yml          # All 15 services
├── .woodpecker.yml             # CI/CD pipeline (deploy, test, lint)
├── .env.example                # Environment variable template
├── requirements.txt            # Python deps
└── Dockerfile                  # Backend API container
```

## Database (PostgreSQL)

9 tables, 4 Alembic migrations.

| Table | Purpose |
|-------|---------|
| shops | Multi-tenant root. Stores IG/WA credentials (encrypted), white-label settings |
| admins | Admin portal users (email + bcrypt password) |
| shop_context | AI knowledge base per shop (menu, hours, FAQ, tone, sales, business_hours) |
| conversations | Message threads per customer per platform. Has `sentiment` column (positive/neutral/negative) |
| messages | Individual messages (inbound/outbound, sender_type: customer/ai/human) |
| handoff_requests | Human escalation records |
| compensation_tiers | Voucher templates per shop (label, SAR value, validity) |
| vouchers | Issued compensation codes (CAFE-XXXX-XXXX format) |
| customer_profiles | Per-shop customer metadata (display_name, notes, total_conversations, first/last_seen) |

Run migrations: `docker compose -p seet exec api alembic upgrade head`
Create migration: `docker compose -p seet exec api alembic revision --autogenerate -m "description"`

## Nginx Routing

| Path | Upstream | Notes |
|------|----------|-------|
| `/api/v1/shop/events` | api:8000 | SSE endpoint (proxy_buffering off, 86400s timeout) |
| `/api/*` | api:8000 | FastAPI backend |
| `/webhook/*` | api:8000 | Meta webhook handlers |
| `/health` | api:8000 | Health check |
| `/docs`, `/redoc` | api:8000 | Swagger UI |
| `/assets/*` | minio:9000 | Rewrites to `/seet-assets/*`, 7d cache |
| `/admin` | 301 → `/admin/` | Trailing slash redirect (prevents loop) |
| `/admin/*` | admin-frontend:3001 | Admin portal |
| `/ci/*` | woodpecker-server:8000 | CI/CD dashboard |
| `/*` | frontend:3000 | Shop owner portal (catch-all) |

## Message Flow

1. Customer sends message on Instagram/WhatsApp
2. Meta sends webhook to `/webhook/{platform}` → HMAC-SHA256 verified
3. Published to RabbitMQ `inbound_messages` queue
4. **message-worker** runs the agentic pipeline:
   - **Pre-processors**: business hours check (short-circuit if closed), customer profile upsert
   - **Prompt composition**: modular prompt (core ~45 lines + conditional sales module + shop data)
   - **Parallel AI calls**: main Gemini conversation + sentiment micro-classifier (`asyncio.gather`)
   - **Post-processors**: extract handoff token, clean response, track analytics in Redis
   - Publishes SSE events (`new_message`, `handoff_triggered`) via Redis pub/sub
   - Saves to DB → publishes to `outbound_replies`
5. **reply-worker**: decrypts shop tokens → sends via Meta Graph API → retries up to 3x → DLQ on failure
6. **dlq-worker**: logs failures, tracks metrics in Redis
7. **SSE**: Shop owner dashboard receives live updates via `EventSource` → real-time conversation refresh + browser notifications

## Auth

Two separate auth systems:

**Shop owners** — JWT (24h expiry), stored as `token` in localStorage
- Login by shop name: `POST /api/v1/auth/login`
- Token carries `shop_id` claim
- Frontend validates on load by calling `GET /api/v1/shop`

**Admins** — JWT (12h expiry), stored as `admin_token` in localStorage
- Login by email+password: `POST /api/v1/admin/login`
- Passwords hashed with bcrypt, trimmed with `.strip()` before hashing/comparing
- Token carries `admin_id` and `role` claims
- Admin frontend validates on load by calling `GET /api/v1/admin/me`

## Environment Variables

See `.env.example` for the full template. Key secrets to generate:

| Variable | How to generate |
|----------|----------------|
| ENCRYPTION_KEY | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| JWT_SECRET | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| WOODPECKER_AGENT_SECRET | `python -c "import secrets; print(secrets.token_hex(32))"` |
| META_APP_SECRET | From Meta Developer Console |
| GEMINI_API_KEY | From Google AI Studio |

## Common Operations

```bash
# All commands use project name "seet"
COMPOSE="docker compose -p seet"

# Bring up / rebuild everything
$COMPOSE up --build -d

# Rebuild specific services
$COMPOSE up --build -d api admin-frontend frontend

# View logs
$COMPOSE logs -f api
$COMPOSE logs tunnel --tail 20  # check named tunnel status (seet.cloud)

# Run migrations
$COMPOSE exec api alembic upgrade head

# Restart nginx after config change
$COMPOSE exec nginx nginx -s reload

# Check health
curl http://localhost/health

# Seed admin
curl -X POST http://localhost/api/v1/admin/seed \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@seet.sa","password":"seet@2026","name":"Admin"}'

# Access services directly
# RabbitMQ management: http://localhost:15672 (cafe_mq / cafe_mq_pass)
# MinIO console: http://localhost:9001 (seet-admin / seet-secret-change-me)
# PostgreSQL: localhost:5432 (cafe_user / cafe_pass / cafe_reply)
# Swagger docs: http://localhost/docs
```

## CI/CD (Woodpecker)

Self-hosted on Docker. Pipeline defined in `.woodpecker.yml`.

**Trigger**: push to `claude/multi-tenant-messaging-platform-hhjM8`

**Steps**:
1. **deploy** — pulls latest, runs `docker compose -p seet up --build -d`
2. **test** — `pytest tests/ -x -q`
3. **lint** — `ruff check app/`

Woodpecker needs a GitHub OAuth app for authentication. The agent mounts the Docker socket and the SEET directory.

**Gotcha**: Woodpecker agent runs as root, which can create git objects owned by root. Fix with: `sudo chown -R $USER:$USER .git/objects/`

## Known Gotchas

1. **Admin basePath**: The admin Next.js app uses `basePath: "/admin"` and `trailingSlash: true`. Internal routes must NOT include `/admin` prefix — `router.push("/")` not `router.push("/admin/")`. The basePath is auto-prepended.

2. **Trailing slash redirect loop**: Without `trailingSlash: true` in admin config, Next.js 308-redirects `/admin/` → `/admin`, which nginx routes to the shop frontend, which 301-redirects back → infinite loop.

3. **401 handling in frontends**: The `api.ts` clients must NOT do `window.location.href` redirects on 401. They just `throw new Error("Unauthorized")`. The auth context `.catch()` handles cleanup, and the dashboard layout handles redirect to login. Doing a hard redirect in api.ts causes loops because it fires before the auth context can clear localStorage.

4. **Tunnel is a Cloudflare named tunnel at seet.cloud**: runs via `CLOUDFLARE_TUNNEL_TOKEN`, stable across restarts. Meta webhook subscriptions should always point at `https://seet.cloud/webhook/instagram` and `https://seet.cloud/webhook/whatsapp`.

5. **Password handling**: Admin passwords are `.strip()`-ed before bcrypt hash/compare. This prevents login failures from trailing whitespace (common on mobile).

6. **Token encryption**: Shop IG/WA access tokens are Fernet-encrypted before DB storage. The ENCRYPTION_KEY must be the same key that encrypted them — losing it means re-entering all shop tokens.

7. **MinIO bucket init**: The API's startup event calls `ensure_bucket()` which creates the `seet-assets` bucket and sets public-read policy on `logos/*`. If MinIO isn't ready, it logs a warning but doesn't crash.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLAlchemy 2.0, Alembic, Pydantic, sse-starlette |
| AI | Google Gemini 2.0 Flash (agentic pipeline + parallel sentiment classifier) |
| Queue | RabbitMQ (inbound → outbound → DLQ) |
| Cache | Redis 7 (history, dedup, rate limit, circuit breaker, analytics, pub/sub) |
| Database | PostgreSQL 16 |
| Storage | MinIO (S3-compatible) |
| Frontend | Next.js 15, React 19, Tailwind CSS 4 |
| Real-time | SSE via Redis pub/sub → EventSource (auto-reconnect, browser notifications) |
| Proxy | Nginx |
| Tunnel | Cloudflare cloudflared |
| CI/CD | Woodpecker CI |
| Runtime | Docker Compose (15 containers) |
