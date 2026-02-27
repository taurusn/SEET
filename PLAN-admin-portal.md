# Admin Portal + White-Label — Implementation Plan

## Context
SEET needs an internal admin portal for the onboarding team to set up client shops — create shops, upload logos, configure AI context, connect platforms, and manage white-label branding. This is a separate frontend connected to the same API and database.

---

## Current Deployment Architecture

```
Internet
  │
  ▼
Cloudflare Quick Tunnel  (random *.trycloudflare.com URL)
  │
  ▼
nginx:80  ─────────────────────────────────────────────────
  │  /api/*        → api:8000         (FastAPI)
  │  /webhook/*    → api:8000
  │  /health       → api:8000
  │  /docs         → api:8000
  │  /ci/*         → woodpecker:8000  (CI/CD)
  │  /*            → frontend:3000    (Next.js shop dashboard)
  │
  ▼
api:8000  ─────────────────────────────────────────────────
  ├── db         (PostgreSQL 16, port 5432, volume: postgres_data)
  ├── redis      (Redis 7, port 6379, volume: redis_data)
  └── rabbitmq   (RabbitMQ 3, ports 5672/15672, volume: rabbitmq_data)

Workers (same Docker image as api, different CMD):
  ├── message-worker   (consumes incoming messages)
  ├── reply-worker     (sends AI replies)
  └── dlq-worker       (dead letter queue)
```

**Key patterns:**
- All services are internal (`expose`), only nginx publishes port 80
- API and workers share the same Dockerfile, workers override `command:`
- Frontend uses `NEXT_PUBLIC_API_URL=` (empty) — relative paths, nginx routes `/api/*`
- Frontend is Next.js 15 standalone build (multi-stage Dockerfile)
- `.env` file loaded by api + workers via `env_file: .env`
- Docker Compose infra services use `${VAR:-default}` from `.env`
- Woodpecker CI deploys on push: fetches code → `docker compose up --build -d`
- GitHub Actions runs test/lint/typecheck/frontend-build (no deploy)

---

## Target Architecture (after this plan)

```
Internet
  │
  ▼
Cloudflare Quick Tunnel
  │
  ▼
nginx:80  ─────────────────────────────────────────────────
  │  /api/*        → api:8000         (FastAPI)
  │  /webhook/*    → api:8000
  │  /health       → api:8000
  │  /docs         → api:8000
  │  /assets/*     → minio:9000       (object storage — logos, etc.)   ← NEW
  │  /admin/*      → admin:3001       (Next.js admin portal)           ← NEW
  │  /ci/*         → woodpecker:8000
  │  /*            → frontend:3000    (Next.js shop dashboard)
  │
  ▼
api:8000  ─────────────────────────────────────────────────
  ├── db         (PostgreSQL 16)
  ├── redis      (Redis 7)
  ├── rabbitmq   (RabbitMQ 3)
  └── minio      (MinIO, port 9000 API / 9001 console)               ← NEW

New services:
  ├── admin-frontend:3001   (Next.js admin portal, English/LTR)       ← NEW
  └── minio                 (S3-compatible object storage)             ← NEW
```

---

## Phase 1: Backend Foundation

### 1.1 Add dependencies
**File: `requirements.txt`** — Add:
- `bcrypt==4.2.1` (admin password hashing)
- `python-multipart==0.0.20` (file upload parsing)
- `minio==7.2.12` (MinIO Python SDK for object storage)

### 1.2 Add config settings
**File: `app/config.py`** — Add:
- `admin_frontend_url: str = "http://localhost:3001"` (CORS)
- `minio_endpoint: str = "minio:9000"` (internal Docker hostname)
- `minio_access_key: str = "seet-admin"` (MinIO root user)
- `minio_secret_key: str = "seet-secret-change-me"` (MinIO root password)
- `minio_bucket: str = "seet-assets"` (bucket name)
- `minio_public_url: str = "/assets"` (public URL prefix, served via nginx)

### 1.3 MinIO storage service
**New file: `app/services/storage.py`**
- `get_minio_client() -> Minio` — creates MinIO client from settings
- `ensure_bucket()` — create `seet-assets` bucket if not exists, set public read policy on `logos/` prefix
- `upload_logo(shop_id, file_data, content_type, ext) -> str` — uploads to `logos/{shop_id}.{ext}`, returns public URL path `/assets/logos/{shop_id}.{ext}`
- `delete_logo(shop_id)` — delete logo object(s) for shop
- Call `ensure_bucket()` on app startup

### 1.4 Add Admin model + white-label columns
**File: `app/models/schemas.py`**

New `Admin` ORM model:
```
admins table:
  id          UUID PK
  email       String(255) unique, not null
  password_hash Text not null
  name        String(255) not null
  role        String(50) default "admin"  (future: "superadmin", "viewer")
  is_active   Boolean default True
  created_at  DateTime server_default now()
```

New columns on `Shop` model:
```
  logo_url      String(500) nullable   — e.g. "/assets/logos/{shop_id}.png"
  brand_color   String(7) nullable     — e.g. "#8B4513"
  splash_text   String(255) nullable   — custom welcome text
```

New Pydantic schemas:
- `AdminCreate(email, password, name)`
- `AdminLogin(email, password)`
- `AdminTokenResponse(access_token, token_type, admin_id, name, expires_at)`
- `AdminShopCreate(name, logo_url?, brand_color?, splash_text?, ig_page_id?, wa_phone_number_id?, ...)`
- `AdminShopResponse` (full shop detail including white-label fields + stats)
- Update existing `ShopResponse` to include `logo_url`, `brand_color`, `splash_text`
- Update existing `ShopUpdate` to include `logo_url`, `brand_color`, `splash_text`

### 1.5 Alembic migration
**New file: `alembic/versions/003_add_admin_and_whitelabel.py`**
- Create `admins` table
- Add `logo_url`, `brand_color`, `splash_text` columns to `shops`

### 1.6 Admin auth module
**New file: `app/api/admin_auth.py`**
- `hash_password(password) -> str` (bcrypt)
- `verify_password(password, hash) -> bool` (bcrypt)
- `create_admin_token(admin_id, name) -> AdminTokenResponse` — JWT with `{admin_id, role: "admin", name, exp, iat}`
- `decode_admin_token(token) -> AdminTokenPayload`
- `get_current_admin(credentials, db) -> Admin` — Dependency for admin routes. Decodes JWT, verifies admin exists + is_active

### 1.7 Admin API routes
**New file: `app/api/admin.py`** — Router with prefix `/api/v1/admin`

| Endpoint | Method | Purpose |
|---|---|---|
| `/admin/seed` | POST | Create first admin (only works if 0 admins exist) |
| `/admin/login` | POST | Admin login → JWT |
| `/admin/me` | GET | Get current admin profile |
| `/admin/shops` | GET | List all shops with basic stats (conversations count, active handoffs) |
| `/admin/shops` | POST | Create new shop (onboarding) |
| `/admin/shops/{id}` | GET | Full shop detail + stats + context |
| `/admin/shops/{id}` | PATCH | Update shop (name, platforms, white-label, tokens) |
| `/admin/shops/{id}/toggle` | POST | Activate/deactivate shop |
| `/admin/shops/{id}/logo` | POST | Upload logo (multipart file → MinIO) |
| `/admin/shops/{id}/logo` | DELETE | Remove logo (delete from MinIO) |
| `/admin/shops/{id}/context` | GET | List shop's AI context |
| `/admin/shops/{id}/context` | POST | Add context item |
| `/admin/shops/{id}/context/{ctx_id}` | DELETE | Delete context item |
| `/admin/stats` | GET | Platform-wide stats (total shops, conversations, messages, handoffs) |

Logo upload flow: multipart file → API → MinIO `seet-assets/logos/{shop_id}.{ext}` → store `/assets/logos/{shop_id}.{ext}` in `shop.logo_url` → served via nginx proxy to MinIO.

### 1.8 Wire into main app
**File: `app/main.py`**
- Import and register `admin_router`
- Add `admin_frontend_url` to CORS origins
- Call `ensure_bucket()` on startup (create MinIO bucket if needed)
- ~~No StaticFiles mount needed — nginx proxies `/assets/*` directly to MinIO~~

---

## Phase 2: Shop Dashboard White-Label

### 2.1 Update frontend auth types
**File: `frontend/src/lib/auth.tsx`**
- Add `logo_url?`, `brand_color?`, `splash_text?` to `Shop` interface

### 2.2 Splash screen component
**New file: `frontend/src/components/splash-screen.tsx`**
- Shows shop logo (or SEET logo fallback) centered on screen
- 2-second display with fade-out animation
- Uses `brand_color` as background accent if set
- Controlled by parent via state

### 2.3 Integrate splash into dashboard layout
**File: `frontend/src/app/(dashboard)/layout.tsx`**
- On first load after login, show splash for 2s, then fade to dashboard
- Use `sessionStorage` flag so it only shows once per session

---

## Phase 3: Admin Frontend

### 3.1 Scaffold project
**New directory: `admin/`** — Same stack as `frontend/` (Next.js 15, React 19, Tailwind 4, TypeScript)

Key differences from shop frontend:
- **English UI**, LTR direction (`lang="en" dir="ltr"`)
- **Inter font** instead of IBM Plex Sans Arabic
- **Indigo color scheme** (to distinguish from teal shop dashboard)
- **`basePath: "/admin"`** in next.config.mjs (nginx routes `/admin/` here)
- Port 3001

Files to create:
```
admin/
├── package.json
├── tsconfig.json
├── next.config.mjs        (basePath: "/admin")
├── postcss.config.mjs
├── eslint.config.mjs
├── Dockerfile             (same multi-stage pattern as frontend, PORT=3001)
├── public/
│   └── seet-logo.png      (copy from frontend)
├── src/
│   ├── app/
│   │   ├── layout.tsx     (root: English, LTR, Inter font, AuthProvider)
│   │   ├── globals.css    (indigo theme)
│   │   ├── login/
│   │   │   └── page.tsx   (email + password)
│   │   └── (dashboard)/
│   │       ├── layout.tsx (auth guard, sidebar nav, header)
│   │       ├── page.tsx   (admin dashboard — platform stats)
│   │       ├── shops/
│   │       │   ├── page.tsx        (shops table with search)
│   │       │   ├── [id]/
│   │       │   │   └── page.tsx    (shop detail/edit)
│   │       │   └── onboard/
│   │       │       └── page.tsx    (onboarding wizard)
│   │       └── settings/
│   │           └── page.tsx        (admin account settings)
│   ├── components/
│   │   ├── admin-sidebar.tsx   (vertical sidebar, not dock)
│   │   ├── shop-table.tsx      (sortable shops list)
│   │   ├── shop-form.tsx       (edit shop fields + white-label)
│   │   ├── logo-uploader.tsx   (drag-and-drop logo upload)
│   │   ├── context-manager.tsx (manage shop AI context)
│   │   └── stats-card.tsx      (reuse pattern from shop frontend)
│   └── lib/
│       ├── api.ts          (same ApiClient, adjusted for admin auth)
│       ├── auth.tsx        (AdminAuthContext — email-based, admin JWT)
│       └── utils.ts        (cn, formatDate — same utilities)
```

### 3.2 Admin auth context
**File: `admin/src/lib/auth.tsx`**
- `AdminAuthProvider` with `login(email, password)`, `logout()`
- Stores admin JWT + admin profile in localStorage
- `useAdmin()` hook

### 3.3 Pages

**Login** — Email + password form, POST to `/api/v1/admin/login`

**Dashboard** — Platform-wide stats: total shops (active/inactive), total conversations, total messages, total handoffs, recent activity feed

**Shops list** — Table with columns: name, platform connections (IG/WA icons), status (active/inactive badge), conversations count, created date. Search by name. Click row → shop detail.

**Shop detail** — Tabs:
- **Profile**: Edit name, platform IDs, tokens, white-label (logo, brand_color, splash_text)
- **AI Context**: View/add/delete context items (reuse pattern from shop settings)
- **Stats**: Shop-specific stats (conversations, messages, handoffs, vouchers)

**Onboarding wizard** — 5 steps:
1. Shop info (name)
2. Upload logo + set brand color
3. Connect platforms (Instagram page ID + token, WhatsApp phone ID + token)
4. Seed AI context (menu, hours, FAQ, tone)
5. Review + activate

### 3.4 Navigation
**Admin sidebar** — Vertical left sidebar (not dock), with:
- Dashboard
- Shops
- New Shop (onboard)
- Settings (admin profile)
- Logout

---

## Phase 4: Infrastructure

### 4.1 MinIO service
**File: `docker-compose.yml`** — Add `minio` service:
```yaml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  expose:
    - "9000"      # S3 API (internal, nginx proxies to it)
  ports:
    - "9001:9001" # MinIO Console (admin access for debugging)
  environment:
    MINIO_ROOT_USER: ${MINIO_ROOT_USER:-seet-admin}
    MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-seet-secret-change-me}
  volumes:
    - minio_data:/data
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
    interval: 10s
    timeout: 5s
    retries: 5
  restart: unless-stopped
```

### 4.2 Admin frontend service
**File: `docker-compose.yml`** — Add `admin-frontend` service:
```yaml
admin-frontend:
  build: ./admin
  expose:
    - "3001"
  environment:
    - NEXT_PUBLIC_API_URL=
  depends_on:
    - api
  restart: unless-stopped
```

### 4.3 Update existing services
**File: `docker-compose.yml`**:
- Add `minio` to `api` depends_on (with `condition: service_healthy`)
- Add `admin-frontend` to `nginx` depends_on
- Add `minio_data` to `volumes:` section

### 4.4 Nginx routing
**File: `nginx/nginx.conf`** — Add two new location blocks (before the catch-all `/`):

```nginx
# MinIO assets (logos, etc.) — public read
location /assets/ {
    set $minio_upstream http://minio:9000;
    rewrite ^/assets/(.*)$ /seet-assets/$1 break;
    proxy_pass $minio_upstream;
    proxy_set_header Host minio:9000;
    proxy_hide_header x-amz-request-id;
    proxy_hide_header x-amz-id-2;
    expires 7d;
    add_header Cache-Control "public, immutable";
}

# Admin portal → admin-frontend
location /admin/ {
    set $admin_upstream http://admin-frontend:3001;
    proxy_pass $admin_upstream;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### 4.5 Environment
**File: `.env.example`** — Add:
```bash
# Admin Portal
ADMIN_FRONTEND_URL=http://localhost:3001

# MinIO (S3-compatible object storage)
MINIO_ROOT_USER=seet-admin
MINIO_ROOT_PASSWORD=seet-secret-change-me
MINIO_ENDPOINT=minio:9000
MINIO_BUCKET=seet-assets
```

**File: `.env`** — Add same vars with real values.

### 4.6 GitHub Actions
**File: `.github/workflows/ci.yml`** — Add `admin-frontend` job (same pattern as `frontend` job, `working-directory: admin`).

---

## Build Order

1. `requirements.txt` — add bcrypt, python-multipart, minio
2. `app/config.py` — add admin_frontend_url, MinIO settings
3. `app/services/storage.py` — MinIO storage service
4. `app/models/schemas.py` — Admin model, Shop white-label columns, Pydantic schemas
5. `alembic/versions/003_...py` — migration
6. `app/api/admin_auth.py` — admin auth logic
7. `app/api/admin.py` — all admin routes (logo upload uses MinIO)
8. `app/main.py` — wire router, CORS, MinIO bucket init
9. `frontend/` changes — splash screen + white-label types
10. `admin/` — scaffold entire admin frontend
11. `docker-compose.yml` — add minio + admin-frontend services
12. `nginx/nginx.conf` — add /assets/ and /admin/ routes
13. `.env.example` + `.env` — add MinIO + admin env vars
14. `.github/workflows/ci.yml` — add admin-frontend CI job

---

## Verification

1. Run migration: `alembic upgrade head`
2. Start MinIO: verify `seet-assets` bucket is auto-created
3. Seed admin: `POST /api/v1/admin/seed` with email + password
4. Login to admin portal: email + password → JWT
5. Create shop via onboarding wizard
6. Upload logo → verify file in MinIO (`http://localhost:9001` console)
7. Access logo via public URL: `http://localhost/assets/logos/{shop_id}.png`
8. Login to shop dashboard → verify splash screen shows logo for 2s
9. Verify shop data isolation (admin sees all shops, shop sees only own data)
