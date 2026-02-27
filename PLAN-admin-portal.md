# Admin Portal + White-Label — Implementation Plan

## Context
SEET needs an internal admin portal for the onboarding team to set up client shops — create shops, upload logos, configure AI context, connect platforms, and manage white-label branding. This is a separate frontend connected to the same API and database.

---

## Phase 1: Backend Foundation

### 1.1 Add dependencies
**File: `requirements.txt`** — Add `bcrypt==4.2.1` and `python-multipart==0.0.20`

### 1.2 Add config settings
**File: `app/config.py`** — Add:
- `admin_frontend_url: str = "http://localhost:3001"` (CORS)
- `upload_dir: str = "uploads"` (logo storage path)

### 1.3 Add Admin model + white-label columns
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
  logo_url      String(500) nullable   — e.g. "/uploads/logos/{shop_id}.png"
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

### 1.4 Alembic migration
**New file: `alembic/versions/003_add_admin_and_whitelabel.py`**
- Create `admins` table
- Add `logo_url`, `brand_color`, `splash_text` columns to `shops`

### 1.5 Admin auth module
**New file: `app/api/admin_auth.py`**
- `hash_password(password) -> str` (bcrypt)
- `verify_password(password, hash) -> bool` (bcrypt)
- `create_admin_token(admin_id, name) -> AdminTokenResponse` — JWT with `{admin_id, role: "admin", name, exp, iat}`
- `decode_admin_token(token) -> AdminTokenPayload`
- `get_current_admin(credentials, db) -> Admin` — Dependency for admin routes. Decodes JWT, verifies admin exists + is_active

### 1.6 Admin API routes
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
| `/admin/shops/{id}/logo` | POST | Upload logo (multipart file) |
| `/admin/shops/{id}/logo` | DELETE | Remove logo |
| `/admin/shops/{id}/context` | GET | List shop's AI context |
| `/admin/shops/{id}/context` | POST | Add context item |
| `/admin/shops/{id}/context/{ctx_id}` | DELETE | Delete context item |
| `/admin/stats` | GET | Platform-wide stats (total shops, conversations, messages, handoffs) |

Logo upload: Save to `uploads/logos/{shop_id}.{ext}`, update `shop.logo_url`.

### 1.7 Wire into main app
**File: `app/main.py`**
- Import and register `admin_router`
- Add `StaticFiles` mount at `/uploads` → `uploads/` directory
- Add `admin_frontend_url` to CORS origins
- Create `uploads/logos/` directory on startup

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
├── Dockerfile             (same pattern, PORT=3001)
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

### 4.1 Docker Compose
**File: `docker-compose.yml`**
- Add `admin-frontend` service (build: `./admin`, expose 3001, depends on api)
- Add `uploads` volume mounted to api service at `/app/uploads`
- Add `admin-frontend` to nginx depends_on

### 4.2 Nginx routing
**File: `nginx/nginx.conf`**
- Add `/admin/` location → `admin-frontend:3001`
- Add `/uploads/` location → `api:8000` (static files)
- Keep `/` → `frontend:3000` unchanged

### 4.3 Environment
- Add `ADMIN_FRONTEND_URL=http://localhost:3001` to `.env`

---

## Build Order

1. `requirements.txt` — add bcrypt, python-multipart
2. `app/config.py` — add admin_frontend_url, upload_dir
3. `app/models/schemas.py` — Admin model, Shop white-label columns, Pydantic schemas
4. `alembic/versions/003_...py` — migration
5. `app/api/admin_auth.py` — admin auth logic
6. `app/api/admin.py` — all admin routes
7. `app/main.py` — wire router, static files, CORS
8. `frontend/` changes — splash screen + white-label types
9. `admin/` — scaffold entire admin frontend
10. `docker-compose.yml` + `nginx/nginx.conf` — infrastructure

---

## Verification

1. Run migration: `alembic upgrade head`
2. Seed admin: `POST /api/v1/admin/seed` with email + password
3. Login to admin portal: email + password → JWT
4. Create shop via onboarding wizard
5. Upload logo, set brand color
6. Login to shop dashboard → verify splash screen shows logo for 2s
7. Verify shop data isolation (admin sees all shops, shop sees only own data)
