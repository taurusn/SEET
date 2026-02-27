# SEET — User Stories

> Business requirements mapped to user capabilities. Covers both the **Admin Portal** (internal team) and the **Shop Owner Portal** (client-facing).

---

## Admin Portal (Internal Team)

### Authentication & Access

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| A-1 | As an admin, I want to create the initial admin account via a seed command so the platform can be bootstrapped | ✅ Done | `POST /admin/seed` — only works when 0 admins exist |
| A-2 | As an admin, I want to log in with email and password so I can securely access the portal | ✅ Done | bcrypt hashed, 12h JWT |
| A-3 | As an admin, I want my session to expire after 12 hours so unauthorized access is limited | ✅ Done | JWT expiry |
| A-4 | As an admin, I want to view my profile (name, email, role) so I know which account I'm using | ✅ Done | Read-only settings page |
| A-5 | As an admin, I want to create additional admin accounts so my team can share the workload | ❌ Missing | Only seed endpoint exists |
| A-6 | As an admin, I want to change my password so I can maintain security | ❌ Missing | |
| A-7 | As an admin, I want role-based access (admin, viewer) so I can limit what junior staff can do | ❌ Missing | `role` column exists but not enforced |

### Platform Overview

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| A-10 | As an admin, I want to see platform-wide KPIs (total shops, active shops, conversations, messages, handoffs, vouchers) so I can monitor health | ✅ Done | Admin dashboard with 6 cards |
| A-11 | As an admin, I want to see which shops are most active so I can prioritize support | ❌ Missing | List shows conversation count but no sorting/ranking |
| A-12 | As an admin, I want to see platform-wide analytics (message volume trends, AI handling rate) so I can report on performance | ❌ Missing | Analytics only available per-shop in shop portal |
| A-13 | As an admin, I want an activity feed of recent events (new shops, handoffs, errors) so I stay informed | ❌ Missing | |

### Shop Onboarding

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| A-20 | As an admin, I want to onboard a new shop through a guided wizard so nothing is missed | ✅ Done | 5-step wizard |
| A-21 | As an admin, I want to set the shop name in step 1 so the shop is identified | ✅ Done | |
| A-22 | As an admin, I want to upload a logo and set brand color/splash text in step 2 so the shop is branded | ✅ Done | Logo → MinIO, served via nginx |
| A-23 | As an admin, I want to connect Instagram (Page ID + Access Token) in step 3 so the shop receives DMs | ✅ Done | Tokens Fernet-encrypted at rest |
| A-24 | As an admin, I want to connect WhatsApp (Phone Number ID + WABA ID + Access Token) in step 3 so the shop receives messages | ✅ Done | Tokens Fernet-encrypted at rest |
| A-25 | As an admin, I want to seed AI context (menu, hours, FAQ, tone, sales) in step 4 so the AI is ready from day one | ✅ Done | Dropdown with context_type options |
| A-26 | As an admin, I want to review all details in step 5 before submitting so I can catch mistakes | ✅ Done | Summary view before creation |
| A-27 | As an admin, I want onboarding to be non-blocking (logo/context failures don't fail shop creation) so partial setups are saved | ✅ Done | |

### Shop Management

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| A-30 | As an admin, I want to search shops by name so I can find them quickly | ✅ Done | Debounced search in shops list |
| A-31 | As an admin, I want to see all shops in a table with platform connections, status, and conversation count | ✅ Done | |
| A-32 | As an admin, I want to view a shop's full detail (profile, context, stats) so I understand their setup | ✅ Done | Tabbed detail page |
| A-33 | As an admin, I want to edit a shop's name, platform credentials, and white-label settings after creation | ✅ Done | |
| A-34 | As an admin, I want to activate/deactivate a shop so I can control access | ✅ Done | Toggle endpoint + UI |
| A-35 | As an admin, I want to upload/replace/delete a shop's logo so branding stays current | ✅ Done | MinIO storage |
| A-36 | As an admin, I want to manage a shop's AI context (add/delete items) so I can tune the AI | ✅ Done | |
| A-37 | As an admin, I want to view a shop's conversation and handoff counts so I monitor their activity | ✅ Done | Stats tab in shop detail |
| A-38 | As an admin, I want to view a shop's actual conversations and messages so I can audit quality | ❌ Missing | Admin can only see counts, not message content |
| A-39 | As an admin, I want to export shop data (conversations, analytics) so I can create reports | ❌ Missing | |
| A-40 | As an admin, I want to see per-shop analytics (AI handling %, response time, sentiment) so I can compare performance | ❌ Missing | Analytics endpoint exists but admin portal doesn't surface it |

---

## Shop Owner Portal (Client-Facing)

### Authentication & Onboarding

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| S-1 | As a shop owner, I want to log in with my shop name so I can access my dashboard | ✅ Done | 24h JWT |
| S-2 | As a shop owner, I want to see a branded splash screen on first login so the platform feels like mine | ✅ Done | Logo + brand_color + splash_text, sessionStorage flag |
| S-3 | As a shop owner, I want to be redirected to login if my session expires so I re-authenticate | ✅ Done | Layout guard + auth context |
| S-4 | As a shop owner, I want to change my shop's login credentials so I maintain security | ❌ Missing | No password/credential change UI |

### Dashboard

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| S-10 | As a shop owner, I want to see KPIs (total messages, conversations, pending handoffs, active vouchers) at a glance | ✅ Done | 4 stat cards |
| S-11 | As a shop owner, I want to see a handoff alert banner if there are pending handoffs so I take action fast | ✅ Done | Yellow banner with link |
| S-12 | As a shop owner, I want to see AI performance summary (% handled by AI, avg response time) so I know ROI | ✅ Done | Mini analytics from 7d data |
| S-13 | As a shop owner, I want to see recent conversations so I can quickly jump to active threads | ✅ Done | Last 5 conversations widget |

### Conversations

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| S-20 | As a shop owner, I want to see all customer conversations in a list so I can browse them | ✅ Done | Split pane layout |
| S-21 | As a shop owner, I want to filter conversations by platform (Instagram/WhatsApp) so I focus on one channel | ✅ Done | Dropdown filter |
| S-22 | As a shop owner, I want to filter conversations by status (AI/Human/Closed) so I see what needs attention | ✅ Done | Dropdown filter |
| S-23 | As a shop owner, I want to view a conversation thread with all messages so I understand the full context | ✅ Done | Thread pane with scroll |
| S-24 | As a shop owner, I want to see distinct styling for customer, AI, and human messages so I know who said what | ✅ Done | Color-coded bubbles + icons |
| S-25 | As a shop owner, I want to see returning customer badges ("عميل عائد — X محادثات") so I recognize loyal customers | ✅ Done | Customer profile lookup |
| S-26 | As a shop owner, I want to see sentiment indicators (green/gray/red) per conversation so I spot unhappy customers | ✅ Done | Colored dots in list |
| S-27 | As a shop owner, I want to reply to a customer during a human handoff so they're not left waiting | ✅ Done | Reply input shows when status=human |
| S-28 | As a shop owner, I want conversations to update in real-time so I don't have to refresh the page | ✅ Done | SSE events drive live updates |
| S-29 | As a shop owner, I want to copy conversation text with sender labels so I can share transcripts | ✅ Done | Custom copy handler with العميل/المسؤول/الموظف labels |
| S-30 | As a shop owner, I want to deep-link to a specific conversation (from handoff card) so I have immediate context | ✅ Done | `?id=` query param |
| S-31 | As a shop owner, I want to close a conversation manually so I can mark resolved issues | ❌ Missing | Only AI→human→AI transitions exist |
| S-32 | As a shop owner, I want to search conversations by customer name or content so I find specific threads | ❌ Missing | |
| S-33 | As a shop owner, I want to label/tag customers with notes so I remember who they are | ⚠️ Partial | API exists (`PATCH /customers/{platform}/{customer_id}`) but no UI |
| S-34 | As a shop owner, I want to export a conversation transcript so I can share it or keep records | ❌ Missing | |

### Handoffs

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| S-40 | As a shop owner, I want to see all pending handoffs with reasons so I know what needs attention | ✅ Done | Handoffs page with reason display |
| S-41 | As a shop owner, I want to receive browser notifications when a handoff happens so I respond quickly | ✅ Done | Push notification via Notification API |
| S-42 | As a shop owner, I want to navigate from a handoff card to the full conversation so I have context | ✅ Done | "عرض المحادثة" deep link |
| S-43 | As a shop owner, I want to resolve a handoff so the conversation returns to AI mode | ✅ Done | Resolve button |
| S-44 | As a shop owner, I want to issue a compensation voucher from a handoff so I can recover the customer | ✅ Done | Issue voucher modal with tier selection |
| S-45 | As a shop owner, I want the handoff badge in the nav to update live so I see new handoffs immediately | ✅ Done | SSE-driven badge in dock |

### Vouchers & Compensation

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| S-50 | As a shop owner, I want to see monthly voucher stats (issued, redeemed, expired, budget spent in SAR) | ✅ Done | KPI cards at top of vouchers page |
| S-51 | As a shop owner, I want to filter vouchers by status (all/active/redeemed/expired) so I find specific ones | ✅ Done | Tab filter |
| S-52 | As a shop owner, I want to see voucher details (code, customer, platform, dates) in a table | ✅ Done | |
| S-53 | As a shop owner, I want to redeem a voucher when a customer presents it | ✅ Done | Redeem button per voucher |
| S-54 | As a shop owner, I want voucher codes sent to the customer automatically after issuance | ✅ Done | Auto-sends via platform (IG/WA) |

### Analytics

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| S-60 | As a shop owner, I want to see what % of messages the AI handled so I can prove ROI | ✅ Done | KPI card |
| S-61 | As a shop owner, I want to see average response time so I know customer wait times | ✅ Done | KPI card |
| S-62 | As a shop owner, I want to see total messages and escalation count so I track volume | ✅ Done | KPI cards |
| S-63 | As a shop owner, I want to see message volume by hour (24h chart) so I know peak times | ✅ Done | CSS bar chart |
| S-64 | As a shop owner, I want to see message trends over days so I spot growth | ✅ Done | CSS bar chart |
| S-65 | As a shop owner, I want to see sentiment breakdown (positive/neutral/negative %) so I gauge customer mood | ✅ Done | Proportional bars |
| S-66 | As a shop owner, I want to switch between today/7d/30d views so I analyze different periods | ✅ Done | Pill selector |
| S-67 | As a shop owner, I want to export analytics data so I can include it in reports | ❌ Missing | |

### Settings & Configuration

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| S-70 | As a shop owner, I want to view my shop profile (name, platform connections) | ✅ Done | Profile tab |
| S-71 | As a shop owner, I want to manage AI context (menu, FAQ, tone, sales instructions) so the AI stays accurate | ✅ Done | Context tab with add/delete |
| S-72 | As a shop owner, I want to set business hours per day so the AI sends auto-replies when closed | ✅ Done | Dedicated business hours editor |
| S-73 | As a shop owner, I want to customize the closed-hours message so it matches my brand voice | ✅ Done | Textarea in business hours editor |
| S-74 | As a shop owner, I want to create compensation tiers (label, SAR value, validity days) as templates for vouchers | ✅ Done | Compensation tab in settings |
| S-75 | As a shop owner, I want to edit/delete compensation tiers so I adjust values over time | ✅ Done | |

### AI Playground

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| S-80 | As a shop owner, I want to test AI replies in a sandbox so I verify behavior before going live | ✅ Done | Playground with test conversations |
| S-81 | As a shop owner, I want to create multiple test conversations so I test different scenarios | ✅ Done | |
| S-82 | As a shop owner, I want to delete test conversations so I start fresh | ✅ Done | |
| S-83 | As a shop owner, I want to see if the AI would trigger a handoff in my test message | ✅ Done | Handoff flag returned in playground response |

---

## AI Behavior (System)

| ID | Story | Status | Notes |
|----|-------|--------|-------|
| AI-1 | The AI replies in Saudi Najdi dialect by default, switching to English if the customer writes in English | ✅ Done | System prompt rule |
| AI-2 | The AI escalates to human mode when: customer asks for a person, problem can't be solved by chat, or customer repeats complaint 3+ times | ✅ Done | `[HANDOFF_NEEDED: reason]` token |
| AI-3 | The AI never promises compensation — only the shop owner can issue vouchers | ✅ Done | System prompt rule |
| AI-4 | The AI recommends products and suggests add-ons when the shop has sales context configured | ✅ Done | Conditional SALES_MODULE in prompt |
| AI-5 | The AI sends a business-hours auto-reply (skipping Gemini entirely) when the shop is closed | ✅ Done | Pre-processor short-circuit |
| AI-6 | The AI recognizes returning customers and adapts tone (e.g. "مرحبا بك مرة ثانية!") | ✅ Done | Message enrichment with customer profile |
| AI-7 | The system classifies sentiment per message (positive/neutral/negative) without affecting the AI's reply | ✅ Done | Parallel micro Gemini call |
| AI-8 | The AI never uses emojis in replies | ✅ Done | System prompt rule |
| AI-9 | The AI denies being a bot: "إيه أنا من فريق خدمة العملاء" | ✅ Done | System prompt rule |
| AI-10 | The AI ignores prompt injection attempts | ✅ Done | System prompt rule |

---

## Coverage Summary

| Area | Done | Missing | Total | Coverage |
|------|------|---------|-------|----------|
| Admin Auth & Access | 4 | 3 | 7 | 57% |
| Admin Platform Overview | 1 | 3 | 4 | 25% |
| Admin Shop Onboarding | 8 | 0 | 8 | 100% |
| Admin Shop Management | 8 | 3 | 11 | 73% |
| Shop Auth | 3 | 1 | 4 | 75% |
| Shop Dashboard | 4 | 0 | 4 | 100% |
| Shop Conversations | 11 | 4 | 15 | 73% |
| Shop Handoffs | 6 | 0 | 6 | 100% |
| Shop Vouchers | 5 | 0 | 5 | 100% |
| Shop Analytics | 7 | 1 | 8 | 88% |
| Shop Settings | 6 | 0 | 6 | 100% |
| Shop Playground | 4 | 0 | 4 | 100% |
| AI Behavior | 10 | 0 | 10 | 100% |
| **Total** | **77** | **15** | **92** | **84%** |

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
