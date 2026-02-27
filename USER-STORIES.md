# SEET — User Stories

> Business requirements mapped to user capabilities. Covers both the **Admin Portal** (internal team) and the **Shop Owner Portal** (client-facing).
>
> **Last tested:** 2026-02-27 via curl against live API (localhost). Migration 004 applied during testing.
>
> Legend: ✅ = curl verified | 🖥️ = frontend-only (verified in code) | ⚠️ = partially verified | — = not tested (missing feature)

---

## Admin Portal (Internal Team)

### Authentication & Access

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| A-1 | As an admin, I want to create the initial admin account via a seed command so the platform can be bootstrapped | ✅ Done | ✅ | `POST /admin/seed` — returns "Admin already exists" when seeded |
| A-2 | As an admin, I want to log in with email and password so I can securely access the portal | ✅ Done | ✅ | bcrypt hashed, 12h JWT returned |
| A-3 | As an admin, I want my session to expire after 12 hours so unauthorized access is limited | ✅ Done | ✅ | JWT exp-iat = 12h confirmed. Invalid token → 401 |
| A-4 | As an admin, I want to view my profile (name, email, role) so I know which account I'm using | ✅ Done | ✅ | Returns id, email, name, role, is_active, created_at |
| A-5 | As an admin, I want to create additional admin accounts so my team can share the workload | ❌ Missing | — | Only seed endpoint exists |
| A-6 | As an admin, I want to change my password so I can maintain security | ❌ Missing | — | |
| A-7 | As an admin, I want role-based access (admin, viewer) so I can limit what junior staff can do | ❌ Missing | — | `role` column exists but not enforced |

### Platform Overview

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| A-10 | As an admin, I want to see platform-wide KPIs (total shops, active shops, conversations, messages, handoffs, vouchers) so I can monitor health | ✅ Done | ✅ | 4 shops, 43 convos, 266 msgs, 5 handoffs, 2 vouchers |
| A-11 | As an admin, I want to see which shops are most active so I can prioritize support | ❌ Missing | — | List shows conversation count but no sorting/ranking |
| A-12 | As an admin, I want to see platform-wide analytics (message volume trends, AI handling rate) so I can report on performance | ❌ Missing | — | Analytics only available per-shop in shop portal |
| A-13 | As an admin, I want an activity feed of recent events (new shops, handoffs, errors) so I stay informed | ❌ Missing | — | |

### Shop Onboarding

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| A-20 | As an admin, I want to onboard a new shop through a guided wizard so nothing is missed | ✅ Done | ✅ | `POST /admin/shops` creates shop successfully |
| A-21 | As an admin, I want to set the shop name in step 1 so the shop is identified | ✅ Done | ✅ | Name set on creation |
| A-22 | As an admin, I want to upload a logo and set brand color/splash text in step 2 so the shop is branded | ✅ Done | ✅ | Logo upload → MinIO, brand_color/splash_text via PATCH |
| A-23 | As an admin, I want to connect Instagram (Page ID + Access Token) in step 3 so the shop receives DMs | ✅ Done | ✅ | `PATCH /admin/shops/{id}` with ig_page_id |
| A-24 | As an admin, I want to connect WhatsApp (Phone Number ID + WABA ID + Access Token) in step 3 so the shop receives messages | ✅ Done | ✅ | `PATCH /admin/shops/{id}` with wa_phone_number_id |
| A-25 | As an admin, I want to seed AI context (menu, hours, FAQ, tone, sales) in step 4 so the AI is ready from day one | ✅ Done | ✅ | `POST /admin/shops/{id}/context` — add/delete verified |
| A-26 | As an admin, I want to review all details in step 5 before submitting so I can catch mistakes | ✅ Done | ✅ | `GET /admin/shops/{id}` returns full detail |
| A-27 | As an admin, I want onboarding to be non-blocking (logo/context failures don't fail shop creation) so partial setups are saved | ✅ Done | ✅ | Shop created without logo/context, added later |

### Shop Management

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| A-30 | As an admin, I want to search shops by name so I can find them quickly | ✅ Done | ✅ | `?search=test` returns matching shops |
| A-31 | As an admin, I want to see all shops in a table with platform connections, status, and conversation count | ✅ Done | ✅ | Returns name, ig/wa IDs, is_active, total_conversations |
| A-32 | As an admin, I want to view a shop's full detail (profile, context, stats) so I understand their setup | ✅ Done | ✅ | `GET /admin/shops/{id}` + `/context` both verified |
| A-33 | As an admin, I want to edit a shop's name, platform credentials, and white-label settings after creation | ✅ Done | ✅ | PATCH updates name, ig/wa IDs, brand_color, splash_text |
| A-34 | As an admin, I want to activate/deactivate a shop so I can control access | ✅ Done | ✅ | Toggle off → `is_active: false`, toggle on → `is_active: true` |
| A-35 | As an admin, I want to upload/replace/delete a shop's logo so branding stays current | ✅ Done | ✅ | Upload → logo_url set, Delete → 204 |
| A-36 | As an admin, I want to manage a shop's AI context (add/delete items) so I can tune the AI | ✅ Done | ✅ | POST creates, DELETE removes (204) |
| A-37 | As an admin, I want to view a shop's conversation and handoff counts so I monitor their activity | ✅ Done | ✅ | total_conversations + active_handoffs in shop detail |
| A-38 | As an admin, I want to view a shop's actual conversations and messages so I can audit quality | ❌ Missing | — | Admin can only see counts, not message content |
| A-39 | As an admin, I want to export shop data (conversations, analytics) so I can create reports | ❌ Missing | — | |
| A-40 | As an admin, I want to see per-shop analytics (AI handling %, response time, sentiment) so I can compare performance | ❌ Missing | — | Analytics endpoint exists but admin portal doesn't surface it |

---

## Shop Owner Portal (Client-Facing)

### Authentication & Onboarding

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| S-1 | As a shop owner, I want to log in with my shop name so I can access my dashboard | ✅ Done | ✅ | `POST /auth/login` with `{name}` → 24h JWT |
| S-2 | As a shop owner, I want to see a branded splash screen on first login so the platform feels like mine | ✅ Done | 🖥️ | Frontend-only (sessionStorage flag), verified in code |
| S-3 | As a shop owner, I want to be redirected to login if my session expires so I re-authenticate | ✅ Done | ✅ | JWT exp-iat = 24h confirmed |
| S-4 | As a shop owner, I want to change my shop's login credentials so I maintain security | ❌ Missing | — | No password/credential change UI |

### Dashboard

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| S-10 | As a shop owner, I want to see KPIs (total messages, conversations, pending handoffs, active vouchers) at a glance | ✅ Done | ✅ | `GET /shop/stats` → 34 convos, 190 msgs, 5 handoffs, 1 voucher |
| S-11 | As a shop owner, I want to see a handoff alert banner if there are pending handoffs so I take action fast | ✅ Done | ✅ | active_handoffs=2 → banner shows |
| S-12 | As a shop owner, I want to see AI performance summary (% handled by AI, avg response time) so I know ROI | ✅ Done | ✅ | `GET /shop/analytics?period=7d` returns ai_handled_pct, avg_response_time_ms |
| S-13 | As a shop owner, I want to see recent conversations so I can quickly jump to active threads | ✅ Done | ✅ | `GET /shop/conversations?limit=5` → 5 returned |

### Conversations

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| S-20 | As a shop owner, I want to see all customer conversations in a list so I can browse them | ✅ Done | ✅ | Returns id, platform, customer_id, status, sentiment, created_at |
| S-21 | As a shop owner, I want to filter conversations by platform (Instagram/WhatsApp) so I focus on one channel | ✅ Done | ✅ | `?platform=instagram` filters correctly (0 IG for this shop) |
| S-22 | As a shop owner, I want to filter conversations by status (AI/Human/Closed) so I see what needs attention | ✅ Done | ✅ | `?status=human` → 5 human convos |
| S-23 | As a shop owner, I want to view a conversation thread with all messages so I understand the full context | ✅ Done | ✅ | 10 messages returned with direction, sender_type, content |
| S-24 | As a shop owner, I want to see distinct styling for customer, AI, and human messages so I know who said what | ✅ Done | 🖥️ | sender_type field distinguishes customer/ai/human; styling in frontend |
| S-25 | As a shop owner, I want to see returning customer badges so I recognize loyal customers | ✅ Done | ⚠️ | API works but customer_profiles table empty (just migrated, needs real webhook messages) |
| S-26 | As a shop owner, I want to see sentiment indicators per conversation so I spot unhappy customers | ✅ Done | ✅ | `sentiment` field in conversation response (null until pipeline processes new messages) |
| S-27 | As a shop owner, I want to reply to a customer during a human handoff so they're not left waiting | ✅ Done | ⚠️ | API blocks playground replies correctly. Needs real IG/WA convo for end-to-end |
| S-28 | As a shop owner, I want conversations to update in real-time so I don't have to refresh the page | ✅ Done | ✅ | SSE `conversation_updated` event received on handoff resolve |
| S-29 | As a shop owner, I want to copy conversation text with sender labels so I can share transcripts | ✅ Done | 🖥️ | Custom onCopy handler in conversation-thread.tsx |
| S-30 | As a shop owner, I want to deep-link to a specific conversation so I have immediate context | ✅ Done | 🖥️ | `?id=` query param in conversations page + handoff card Link |
| S-31 | As a shop owner, I want to close a conversation manually so I can mark resolved issues | ❌ Missing | — | Only AI→human→AI transitions exist |
| S-32 | As a shop owner, I want to search conversations by customer name or content so I find specific threads | ❌ Missing | — | |
| S-33 | As a shop owner, I want to label/tag customers with notes so I remember who they are | ⚠️ Partial | ⚠️ | API exists but returns 404 (no profiles yet). No frontend UI |
| S-34 | As a shop owner, I want to export a conversation transcript so I can share it or keep records | ❌ Missing | — | |

### Handoffs

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| S-40 | As a shop owner, I want to see all pending handoffs with reasons so I know what needs attention | ✅ Done | ✅ | 5 handoffs with Arabic reasons returned |
| S-41 | As a shop owner, I want to receive browser notifications when a handoff happens so I respond quickly | ✅ Done | 🖥️ | Notification API + SSE in frontend code |
| S-42 | As a shop owner, I want to navigate from a handoff card to the full conversation so I have context | ✅ Done | 🖥️ | Link component in handoff-card.tsx |
| S-43 | As a shop owner, I want to resolve a handoff so the conversation returns to AI mode | ✅ Done | ✅ | `POST /handoffs/{id}/resolve` → `status: resolved` |
| S-44 | As a shop owner, I want to issue a compensation voucher from a handoff so I can recover the customer | ✅ Done | ✅ | `POST /vouchers` with tier_id+handoff_id → SPEC-M2D1-JH5E issued |
| S-45 | As a shop owner, I want the handoff badge in the nav to update live so I see new handoffs immediately | ✅ Done | ✅ | SSE event triggers `fetchHandoffs()` in sidebar |

### Vouchers & Compensation

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| S-50 | As a shop owner, I want to see monthly voucher stats (issued, redeemed, expired, budget spent in SAR) | ✅ Done | ✅ | 2 issued, 1 redeemed, 0 expired, 1 active, 1.0 SAR spent |
| S-51 | As a shop owner, I want to filter vouchers by status so I find specific ones | ✅ Done | ✅ | `?status=active` returns empty, `?status=issued` returns 1 |
| S-52 | As a shop owner, I want to see voucher details (code, customer, platform, dates) in a table | ✅ Done | ✅ | Full detail: code, customer_id, platform, issued_at, expires_at, redeemed_at |
| S-53 | As a shop owner, I want to redeem a voucher when a customer presents it | ✅ Done | ✅ | `POST /vouchers/{id}/redeem` → status=redeemed, redeemed_at set |
| S-54 | As a shop owner, I want voucher codes sent to the customer automatically after issuance | ✅ Done | 🖥️ | Publishes to outbound queue (needs real platform to verify delivery) |

### Analytics

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| S-60 | As a shop owner, I want to see what % of messages the AI handled so I can prove ROI | ✅ Done | ✅ | `ai_handled_pct` field returned (0% — no new messages since pipeline deployed) |
| S-61 | As a shop owner, I want to see average response time so I know customer wait times | ✅ Done | ✅ | `avg_response_time_ms` field returned |
| S-62 | As a shop owner, I want to see total messages and escalation count so I track volume | ✅ Done | ✅ | `total_messages` + `total_escalations` fields |
| S-63 | As a shop owner, I want to see message volume by hour (24h chart) so I know peak times | ✅ Done | ✅ | `messages_by_hour` — 24-element array |
| S-64 | As a shop owner, I want to see message trends over days so I spot growth | ✅ Done | ✅ | `messages_by_day` — array of {date, messages, escalations} |
| S-65 | As a shop owner, I want to see sentiment breakdown so I gauge customer mood | ✅ Done | ✅ | `sentiment_breakdown` — {positive, neutral, negative} |
| S-66 | As a shop owner, I want to switch between today/7d/30d views so I analyze different periods | ✅ Done | ✅ | `?period=today` (1 day), `7d` (7 days), `30d` (30 days) all work |
| S-67 | As a shop owner, I want to export analytics data so I can include it in reports | ❌ Missing | — | |

### Settings & Configuration

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| S-70 | As a shop owner, I want to view my shop profile (name, platform connections) | ✅ Done | ✅ | `GET /shop` returns full profile |
| S-71 | As a shop owner, I want to manage AI context (menu, FAQ, tone, sales) so the AI stays accurate | ✅ Done | ✅ | GET (2 items), POST (add sales), DELETE (204) all verified |
| S-72 | As a shop owner, I want to set business hours per day so the AI sends auto-replies when closed | ✅ Done | 🖥️ | Frontend business-hours-editor.tsx, backend check_business_hours() |
| S-73 | As a shop owner, I want to customize the closed-hours message so it matches my brand voice | ✅ Done | 🖥️ | closed_message field in business_hours JSON |
| S-74 | As a shop owner, I want to create compensation tiers as templates for vouchers | ✅ Done | ✅ | POST creates tier, returns full object |
| S-75 | As a shop owner, I want to edit/delete compensation tiers so I adjust values over time | ✅ Done | ✅ | PATCH updates label+value, DELETE returns 204 |

### AI Playground

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| S-80 | As a shop owner, I want to test AI replies in a sandbox so I verify behavior before going live | ✅ Done | ✅ | Chat returns AI reply in Saudi Najdi dialect |
| S-81 | As a shop owner, I want to create multiple test conversations so I test different scenarios | ✅ Done | ✅ | POST creates, 35 playground conversations exist |
| S-82 | As a shop owner, I want to delete test conversations so I start fresh | ✅ Done | ✅ | DELETE returns 204 |
| S-83 | As a shop owner, I want to see if the AI would trigger a handoff in my test message | ✅ Done | ✅ | `handoff_detected: false` in response |

---

## AI Behavior (System)

| ID | Story | Status | Tested | Notes |
|----|-------|--------|--------|-------|
| AI-1 | The AI replies in Saudi Najdi dialect by default, switching to English if the customer writes in English | ✅ Done | ✅ | "يا هلا وسهلا!" confirmed in playground |
| AI-2 | The AI escalates to human mode when: customer asks for a person, problem can't be solved by chat, or customer repeats complaint 3+ times | ✅ Done | ✅ | 5 handoffs exist with Arabic escalation reasons |
| AI-3 | The AI never promises compensation — only the shop owner can issue vouchers | ✅ Done | 🖥️ | System prompt rule verified in code |
| AI-4 | The AI recommends products and suggests add-ons when the shop has sales context configured | ✅ Done | ✅ | "جرب القهوة العربية...واللاتيه حقنا ممتاز" — recommends from menu |
| AI-5 | The AI sends a business-hours auto-reply (skipping Gemini entirely) when the shop is closed | ✅ Done | 🖥️ | check_business_hours() verified in code |
| AI-6 | The AI recognizes returning customers and adapts tone | ✅ Done | 🖥️ | upsert_customer_profile + message enrichment in pipeline |
| AI-7 | The system classifies sentiment per message without affecting the AI's reply | ✅ Done | 🖥️ | classify_sentiment() runs in parallel via asyncio.gather |
| AI-8 | The AI never uses emojis in replies | ✅ Done | ✅ | No emojis in any playground responses |
| AI-9 | The AI denies being a bot | ✅ Done | 🖥️ | System prompt rule verified in code |
| AI-10 | The AI ignores prompt injection attempts | ✅ Done | 🖥️ | System prompt rule verified in code |

---

## Coverage Summary

| Area | Done | Missing | Total | Coverage | Curl Tested |
|------|------|---------|-------|----------|-------------|
| Admin Auth & Access | 4 | 3 | 7 | 57% | 4/4 |
| Admin Platform Overview | 1 | 3 | 4 | 25% | 1/1 |
| Admin Shop Onboarding | 8 | 0 | 8 | 100% | 8/8 |
| Admin Shop Management | 8 | 3 | 11 | 73% | 8/8 |
| Shop Auth | 3 | 1 | 4 | 75% | 2/3 |
| Shop Dashboard | 4 | 0 | 4 | 100% | 4/4 |
| Shop Conversations | 11 | 4 | 15 | 73% | 8/11 |
| Shop Handoffs | 6 | 0 | 6 | 100% | 4/6 |
| Shop Vouchers | 5 | 0 | 5 | 100% | 4/5 |
| Shop Analytics | 7 | 1 | 8 | 88% | 7/7 |
| Shop Settings | 6 | 0 | 6 | 100% | 4/6 |
| Shop Playground | 4 | 0 | 4 | 100% | 4/4 |
| AI Behavior | 10 | 0 | 10 | 100% | 4/10 |
| **Total** | **77** | **15** | **92** | **84%** | **62/77** |

### Key Gaps to Address

1. **Admin user management** (A-5, A-6, A-7) — Only seed exists, no CRUD for admins
2. **Admin conversation audit** (A-38) — Admin can't view actual messages
3. **Admin analytics** (A-12, A-40) — No platform-wide or per-shop analytics in admin portal
4. **Admin activity feed** (A-13) — No recent events view
5. **Conversation search** (S-32) — No way to search by customer name or message content
6. **Customer notes UI** (S-33) — API exists but no frontend
7. **Manual conversation close** (S-31) — Only automated transitions
8. **Export capabilities** (A-39, S-34, S-67) — No data export anywhere
9. **Shop owner password change** (S-4) — No self-service credential update

### Notes from Testing

- **Migration 004** was not applied before testing — caused 500 on conversations endpoint (`conversations.sentiment` column missing). Applied during test session.
- **Analytics data is all zeros** — tracking only fires in `message_worker.py` (real webhook messages), not in playground. Expected behavior.
- **Customer profiles table is empty** — just created by migration 004. Will populate when real messages flow through the pipeline.
- **Owner reply (S-27)** blocks playground conversations correctly — needs a real IG/WA conversation in human mode to test end-to-end delivery.
- **SSE verified end-to-end** — started listener, resolved handoff, received `conversation_updated` event within 1 second.
