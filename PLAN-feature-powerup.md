# SEET — 7 Feature Power-Up Plan

> **Prerequisite:** [PLAN-agentic-pipeline.md](./PLAN-agentic-pipeline.md) — the agentic AI pipeline architecture (F0) that must be built first. It trims the system prompt from 98→45 lines, adds modular prompt composition, and moves sentiment/analytics/customer profiling to pipeline stages.

## Why This Plan Exists

SEET's core works: customer sends DM → AI replies in Saudi Najdi dialect → escalates when needed → shop owner resolves → voucher issued. But the product isn't **sticky** or **cool** enough to sell. Shop owners can't prove ROI, can't reply to customers during handoff, don't get notified of urgent issues, and the AI only handles support — it can't sell.

This plan adds 7 features that transform SEET from "a chatbot" into "a business tool shop owners can't live without." All features are built on top of the [agentic pipeline](./PLAN-agentic-pipeline.md).

### Current State (What Works)
- Gemini 2.0 Flash AI with Saudi Najdi dialect, temp 0.3, 256 token cap
- Instagram + WhatsApp integration via Meta webhooks
- Message queue (RabbitMQ) with inbound → AI → outbound pipeline
- Handoff system (AI → human mode → resolve → back to AI)
- Voucher/compensation system end-to-end
- Admin portal for onboarding shops
- White-label branding (logo, color, splash screen)
- Redis caching (history, context, dedup, rate limit, circuit breaker)

### Current Gaps (What's Missing)
- AI can't sell or recommend products
- Shop owners can't reply to customers during handoff
- No returning customer detection
- No sentiment tracking
- No real-time updates (conversations load once, no push)
- No notifications for handoffs
- No analytics beyond basic counts
- No business hours auto-reply

---

## Build Order

```
Phase 0 (Architecture — build first):
  F0: Agentic AI Pipeline     [M]  ✅ DONE  ← see PLAN-agentic-pipeline.md

Phase 1 (Features on new pipeline):
  F1: AI Sales Mode              [S]  ✅ DONE
  F6: Business Hours Auto-reply  [S]  ✅ DONE
  F3+F7: Customer Recognition    [M]  ✅ DONE
         + Sentiment Tracking

Phase 2 (Requires Phase 1):
  F2: Live Owner Reply           [S]  ✅ DONE
  F5: Analytics Dashboard        [L]  ✅ DONE

Phase 3 (Benefits from everything being in place):
  F4: Real-time + Notifications  [L]  ✅ DONE
```

---

## F1: AI Sales Mode [S]

### Why
The AI currently only handles support. When a customer asks "وش الأفضل عندكم؟" (what's your best?), it gives a generic answer. With sales mode, the AI becomes a revenue generator — recommending products, suggesting add-ons, and driving upsells naturally.

### Current State
- System prompt (`app/services/gemini.py:20-98`) focuses entirely on customer service
- Shop context (`shop_context` table) supports free-form `context_type` — no schema restriction
- `get_shop_context()` already loads all context types into a dict by key
- `_build_system_prompt()` appends shop-specific context to the base prompt

### Implementation

**No migration needed.** Uses existing `shop_context` table with `context_type='sales'`.

**Backend — handled by [agentic pipeline](./PLAN-agentic-pipeline.md):**
The `SALES_MODULE` in `build_modular_prompt()` is conditionally injected when `context.get("sales")` exists. No extra prompt changes needed — the pipeline already defines the sales module. `get_shop_context()` already loads all context types into the dict.

**Frontend:**
- `frontend/src/components/context-editor.tsx` — add `sales: "المبيعات والتوصيات"` to labels with placeholder examples
- `admin/src/app/(dashboard)/shops/onboard/page.tsx` — add `<option value="sales">Sales</option>` to context type dropdown
- `admin/src/app/(dashboard)/shops/[id]/page.tsx` — same dropdown update

### Business Impact
Shop owner adds: "إذا العميل طلب قهوة، نوّه عن الخلطة الجديدة بـ45 ريال. دايم اقترح معجنات مع أي مشروب."
→ AI starts naturally recommending and upselling. Measurable revenue increase.

---

## F6: Business Hours Auto-reply [S]

### Why
Right now, if a customer messages at 2 AM, the AI engages in full conversation even though the shop is closed. This wastes Gemini API calls and sets false expectations. With business hours, the AI sends a clean "we're closed, here are our hours" reply — zero Gemini cost.

### Current State
- `message_worker.py` processes every message through Gemini regardless of time
- `shop_context` table can store any context_type
- No timezone awareness anywhere in the system

### Implementation

**No migration needed.** Uses `shop_context` with `context_type='business_hours'`, content stored as JSON:
```json
{
  "timezone": "Asia/Riyadh",
  "schedule": { "sun": {"open":"07:00","close":"23:00"}, "fri": {"open":"14:00","close":"23:00"}, ... },
  "closed_message": "أهلاً! نحن مقفلين حالياً. أوقات عملنا: السبت-الخميس ٧ص-١١م، الجمعة ٢م-١١م. نسعد بخدمتك وقت الدوام!"
}
```

**New file: `app/services/business_hours.py`**
- `check_business_hours(json_str) -> (is_open: bool, closed_message: str | None)`
- Uses `zoneinfo.ZoneInfo` for timezone-aware check (Saudi = Asia/Riyadh, UTC+3)
- Fail-open: if JSON parsing fails, returns `(True, None)` — never blocks messages due to bad config
- Day mapping: Python weekday (Mon=0, Sun=6) → schedule keys

**`app/workers/message_worker.py`** — add check BEFORE Gemini call:
```python
business_hours_json = context.get("business_hours")
if business_hours_json:
    is_open, closed_msg = check_business_hours(business_hours_json)
    if not is_open:
        # Send closed_msg directly, skip Gemini entirely → saves money
        save_message → publish to outbound queue → continue
```

**Frontend:**
- New component: `frontend/src/components/business-hours-editor.tsx` — day-by-day schedule picker with time inputs + closed message textarea
- `frontend/src/app/(dashboard)/settings/page.tsx` — add "ساعات العمل" tab using the new editor
- `frontend/src/components/context-editor.tsx` — filter out `business_hours` from free-form editor (has its own dedicated UI now)
- Admin onboarding: add `business_hours` to context type dropdown

### Business Impact
- Saves Gemini API costs during off-hours (could be 30-40% of messages)
- Professional experience — customers know exactly when to come back
- Shop owners don't wake up to conversations from 3 AM that set wrong expectations

---

## F3: Customer Recognition [M] + F7: Sentiment Tracking [M]

### Why (F3)
Every customer is treated as a stranger. A loyal customer who's messaged 10 times gets "أهلاً! كيف أقدر أساعدك؟" — same as someone messaging for the first time. Customer recognition lets the AI say "مرحبا بك مرة ثانية!" and builds loyalty.

### Why (F7)
Shop owners have zero visibility into customer mood. They can't tell if customers are happy or frustrated. Sentiment tracking gives them a live pulse on customer satisfaction — green/gray/red dots on every conversation, plus trends over time.

### Current State
- `conversations` table has `customer_id` (platform-specific: IG user ID or WA phone number)
- Unique constraint on `(shop_id, platform, customer_id)` — same customer reuses the same conversation
- No customer name, no returning flag, no interaction count
- No sentiment anywhere in the system
- Gemini already outputs structured tokens like `[HANDOFF_NEEDED: reason]` — same pattern works for `[SENTIMENT: ...]`

### Implementation — Combined Migration

**New file: `alembic/versions/004_add_customer_profiles_and_sentiment.py`**
```sql
CREATE TABLE customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id),
  platform VARCHAR(20) NOT NULL,
  customer_id VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  notes TEXT,
  total_conversations INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(shop_id, platform, customer_id)
);
CREATE INDEX ix_customer_profiles_lookup ON customer_profiles(shop_id, platform, customer_id);

ALTER TABLE conversations ADD COLUMN sentiment VARCHAR(20);
```

**`app/models/schemas.py`**
- New `CustomerProfile` ORM model + `CustomerProfileResponse` Pydantic schema
- Add `sentiment = Column(String(20), nullable=True)` to `Conversation` model
- Add `sentiment: Optional[str] = None` to `ConversationResponse`

### F3: Customer Recognition — Backend

**Handled by [agentic pipeline](./PLAN-agentic-pipeline.md) pre-processor:**

**`app/services/ai_pipeline.py`** — `upsert_customer_profile()` as pre-processor:
- Runs in pipeline BEFORE Gemini call
- Upserts to `customer_profiles` table (INSERT ON CONFLICT UPDATE)
- Returns `customer_info: {total_conversations, first_seen_at, last_seen_at}`
- Race condition safe with IntegrityError catch (same pattern as `get_or_create_conversation()`)

**Message enrichment (NOT system prompt):**
- Pipeline prepends to the user message: `[عميل عائد — 5 محادثات سابقة]` or `[عميل جديد]`
- Gemini naturally adapts tone without explicit rules — zero extra prompt lines

**`app/api/dashboard.py`** — new endpoints:
- `GET /shop/customers/{platform}/{customer_id}` — get customer profile
- `PATCH /shop/customers/{platform}/{customer_id}` — update display_name/notes (shop owner can label customers)

### F7: Sentiment Tracking — Backend

**Handled by [agentic pipeline](./PLAN-agentic-pipeline.md) — NO prompt changes, NO `[SENTIMENT:]` token.**

**`app/services/classifiers.py`** — `classify_sentiment(text)`:
- Separate micro Gemini call with focused 1-line Arabic prompt
- Classifies the CUSTOMER's message (not the AI reply)
- Runs in PARALLEL with main Gemini call via `asyncio.gather()` → zero added latency
- `temperature=0.0`, `max_output_tokens=5` → deterministic, ~1 token response
- Returns `"positive"` / `"neutral"` / `"negative"`
- Handles Saudi dialect nuance (sarcasm, indirect complaints) that keyword matching can't
- Fail-safe: returns `"neutral"` on any error — never blocks the pipeline

**`app/services/ai_pipeline.py`** — stores sentiment in `PipelineResult`:
- Worker reads `result.sentiment` and updates `convo.sentiment`
- Analytics (F5) reads from `PipelineResult` directly

### Frontend (both F3 + F7)
- `frontend/src/app/(dashboard)/conversations/page.tsx` — show returning customer badge ("عميل عائد (X محادثات)") in thread header, fetch customer profile on selection
- `frontend/src/components/conversation-list.tsx` — add sentiment colored dot (green=positive, gray=neutral, red=negative) per conversation
- Update `Conversation` TypeScript interface to include `sentiment: string | null`

### Business Impact
- Returning customers feel valued → retention
- Shop owners see customer mood at a glance → faster response to problems
- Data foundation for analytics (F5)

---

## F2: Live Owner Reply [S]

### Why
Right now when a handoff happens, the shop owner can only resolve it or issue a voucher. They **cannot talk to the customer**. The customer is waiting for a human response and gets... silence. This is the single most frustrating gap in the product.

### Current State
- **Backend endpoint already exists:** `POST /api/v1/shop/conversations/{id}/reply` at `app/api/dashboard.py:238-287`
- Creates outbound `Message` with `sender_type='human'`, publishes to outbound queue
- Only works when conversation `status == 'human'`
- **Frontend has no UI for it** — this is purely a frontend gap

### Implementation

**`app/services/handoff.py`** — minor text update:
Change default bridge note to: `[المسؤول رد على العميل وحل الموضوع. المحادثة رجعت للوضع العادي.]`

**`frontend/src/components/conversation-thread.tsx`** — main work:
- Accept `conversationStatus` prop
- When `status === 'human'`, show reply input bar at bottom of thread
- Style `sender_type='human'` messages distinctly (labeled "المسؤول", different bg color like warning/amber)
- `handleOwnerReply` → POST to `/api/v1/shop/conversations/{id}/reply`

**`frontend/src/app/(dashboard)/conversations/page.tsx`:**
- Pass `conversationStatus` to `ConversationThread`

**`frontend/src/app/(dashboard)/handoffs/page.tsx`:**
- Add "عرض المحادثة" button → navigate to conversations page with that conversation pre-selected

### Business Impact
Shop owners can actually communicate with customers. This turns handoffs from a dead-end into a conversation.

---

## F5: Analytics Dashboard [L]

### Why
Shop owners can't prove ROI. "How many messages did the AI handle?" "What's the average response time?" "Are customers happy?" Without answers, they can't justify the cost. Analytics is the "aha" moment that converts free users to paid.

### Current State
- Only basic counts: total_conversations, total_messages, active_handoffs, active_vouchers
- Monthly voucher stats (issued, redeemed, expired, budget)
- No response time tracking, no AI accuracy, no sentiment trends, no hourly breakdowns
- Redis already used heavily — natural fit for time-series counters

### Implementation

**`app/services/redis_client.py`** — analytics tracking:
New method `track_message_processed(shop_id, response_time_ms, was_escalated, sentiment, hour)`:
- Redis keys per shop per day: `analytics:{shop_id}:{date}:messages`, `:escalations`, `:rt_sum`, `:rt_count`, `:hourly:{hour}`, `:sentiment:{type}`
- TTL 35 days (keeps ~1 month of data)
- Pipeline for atomic batch writes (single round-trip)

New method `get_analytics(shop_id, days) -> dict`:
- Aggregates over N days: total_messages, total_escalations, ai_handled_pct, avg_response_time_ms, messages_by_hour (24-slot array), messages_by_day, sentiment_breakdown

**`app/workers/message_worker.py`**
Track timing: `time.monotonic()` before Gemini call, compute `response_time_ms` after. Call `redis_client.track_message_processed()` with all metrics including sentiment from F7.

**`app/api/dashboard.py`** — new endpoint:
`GET /shop/analytics?period=today|7d|30d` → calls `redis_client.get_analytics()`

**New file: `frontend/src/app/(dashboard)/analytics/page.tsx`**
- Period selector (today / 7 days / 30 days) as pill buttons
- KPI cards: AI handled %, avg response time, total messages, escalation rate
- Hourly distribution bar chart (pure CSS bars — no chart library)
- Daily trend chart
- Sentiment breakdown bars (from F7) — green/gray/red proportional bars
- All in Arabic

**`frontend/src/components/sidebar.tsx`** — add analytics nav item:
`{ href: "/analytics", label: "التحليلات", icon: BarChart3 }`

**`frontend/src/app/(dashboard)/page.tsx`** — add mini analytics summary on dashboard home

### Business Impact
"الذكاء الاصطناعي تعامل مع 87% من الرسائل هالأسبوع. متوسط الرد: 4 ثواني." — that's how you sell.

---

## F4: Real-time + Notifications [L]

### Why
Shop owners currently have to refresh the page to see new messages. When a handoff happens, they don't know unless they're staring at the dashboard. This means urgent customer issues go unanswered for hours. Real-time updates and browser notifications fix this completely.

### Current State
- Only a 30-second poll in dock component (`sidebar.tsx:37-48`) for handoff badge count
- No WebSocket, no SSE, no conversation-level polling
- Conversations load once on component mount
- `requirements.txt` has no real-time library
- RabbitMQ and Redis infrastructure already exist — both support pub/sub

### Implementation

**`requirements.txt`** — add: `sse-starlette==2.1.3`

Why SSE over WebSocket:
- Simpler (one-directional: server → client, which is all we need)
- Works through nginx and Cloudflare tunnel without special config
- Native browser `EventSource` API, auto-reconnect built-in
- No need for socket.io complexity

**`app/services/redis_client.py`** — pub/sub methods:
- `publish_event(shop_id, event_dict)` → `PUBLISH events:{shop_id} json`
- `subscribe_events(shop_id)` → returns async pubsub iterator

**New file: `app/api/events.py`**
SSE endpoint: `GET /api/v1/shop/events?token=...`
- Token via query param (EventSource doesn't support Authorization header)
- Manual JWT decode from query param
- Subscribes to `events:{shop_id}` Redis channel
- Yields events: `new_message`, `handoff_triggered`, `conversation_updated`
- 15s keepalive ping to prevent timeout
- Checks `request.is_disconnected()` to clean up

**`app/main.py`** — register events router

**`nginx/nginx.conf`** — add SSE-specific proxy config BEFORE general `/api/` block:
```nginx
location /api/v1/shop/events {
    proxy_pass http://api:8000;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400s;
    chunked_transfer_encoding off;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
}
```

**`app/workers/message_worker.py`** — publish events at key points:
- After saving inbound message → `{type: "new_message", direction: "inbound", ...}`
- After saving outbound message → `{type: "new_message", direction: "outbound", ...}`
- After triggering handoff → `{type: "handoff_triggered", reason: ..., ...}`

**`app/api/dashboard.py`** — publish events:
- In `owner_reply()` → `{type: "new_message", sender_type: "human", ...}`
- In `resolve_handoff()` → `{type: "conversation_updated", new_status: "ai"}`

**New file: `frontend/src/lib/sse.ts`** — `useSSE()` React hook:
- Connects to SSE endpoint with JWT token
- Dispatches events to handlers
- Auto-reconnect on error (10s delay)
- Browser `Notification` API for handoff alerts (with permission request)

**`frontend/src/app/(dashboard)/layout.tsx`** — SSE connection at layout level, notification permission request on mount

**`frontend/src/app/(dashboard)/conversations/page.tsx`** — SSE-driven updates:
- Auto-refresh messages when active conversation gets new message
- Move conversation to top of list on new activity
- Update conversation status badges live

**`frontend/src/components/sidebar.tsx`** — remove 30s polling, rely on SSE for handoff badge

### Business Impact
- Shop owners get instant browser notifications: "تحويل جديد — عميل يحتاج رد بشري"
- Conversations update live — feels like WhatsApp, not a dashboard
- No more missed handoffs

---

## File Manifest

### New Files (8)
| File | Feature | Purpose |
|------|---------|---------|
| `app/services/ai_pipeline.py` | F0 | Pipeline orchestrator (see [agentic pipeline](./PLAN-agentic-pipeline.md)) |
| `app/services/classifiers.py` | F0 | AI-powered sentiment classifier + future classifiers |
| `alembic/versions/004_add_customer_profiles_and_sentiment.py` | F3+F7 | Migration: customer_profiles table + conversations.sentiment |
| `app/services/business_hours.py` | F6 | Timezone-aware business hours check |
| `app/api/events.py` | F4 | SSE endpoint for real-time events |
| `frontend/src/lib/sse.ts` | F4 | React hook for SSE connection |
| `frontend/src/app/(dashboard)/analytics/page.tsx` | F5 | Analytics dashboard page |
| `frontend/src/components/business-hours-editor.tsx` | F6 | Day-by-day schedule picker UI |

### Modified Files (20)
| File | Features | Key Changes |
|------|----------|-------------|
| `requirements.txt` | F4 | Add `sse-starlette` |
| `app/models/schemas.py` | F3, F7 | CustomerProfile model, Conversation.sentiment |
| `app/services/gemini.py` | F0 | Modular prompt, accept pre-built system prompt |
| `app/services/redis_client.py` | F4, F5 | Pub/sub methods, analytics tracking/retrieval |
| `app/services/handoff.py` | F2 | Bridge message text |
| `app/workers/message_worker.py` | F0, F3, F5, F6 | Use pipeline, customer upsert, analytics, business hours |
| `app/api/dashboard.py` | F2, F3, F5 | Customer profile endpoints, analytics endpoint |
| `app/main.py` | F4 | Register events router |
| `nginx/nginx.conf` | F4 | SSE proxy configuration |
| `frontend/src/components/context-editor.tsx` | F1, F6 | Sales label, filter business_hours |
| `frontend/src/components/conversation-thread.tsx` | F2 | Owner reply input, human message styling |
| `frontend/src/components/conversation-list.tsx` | F7 | Sentiment dot indicator |
| `frontend/src/components/sidebar.tsx` | F4, F5 | Analytics nav, remove polling |
| `frontend/src/app/(dashboard)/layout.tsx` | F4 | SSE connection, notification permission |
| `frontend/src/app/(dashboard)/page.tsx` | F5 | Mini analytics section |
| `frontend/src/app/(dashboard)/conversations/page.tsx` | F2, F3, F4 | Owner reply, customer profile, SSE |
| `frontend/src/app/(dashboard)/settings/page.tsx` | F6 | Business hours tab |
| `frontend/src/app/(dashboard)/handoffs/page.tsx` | F2 | View conversation button |
| `admin/src/app/(dashboard)/shops/onboard/page.tsx` | F1, F6 | Sales + business_hours context options |
| `admin/src/app/(dashboard)/shops/[id]/page.tsx` | F1, F6 | Same dropdown updates |

### Critical Hub Files
- `app/services/ai_pipeline.py` — the new orchestrator all features flow through (see [agentic pipeline](./PLAN-agentic-pipeline.md))
- `app/workers/message_worker.py` — touched by F0, F3, F5, F6, F4. Uses pipeline instead of direct Gemini calls.

## Verification

0. **F0 (Pipeline)**: Send any message → pipeline processes it → reply identical to current behavior (no regression). System prompt ~45 lines. `PipelineResult` logged with timing + sentiment. See [agentic pipeline](./PLAN-agentic-pipeline.md).
1. **F1 (Sales)**: Add sales context → playground → "وش الأفضل عندكم؟" → AI recommends specific items with upsell
2. **F6 (Hours)**: Set hours to close now → message → get auto-reply with hours (check Gemini wasn't called)
3. **F3 (Customers)**: Same customer messages twice → second time shows "عميل عائد" in enriched message
4. **F7 (Sentiment)**: Send "شكرا الله يعطيك العافية" → check conversation.sentiment = "positive" in DB. Confirm NO `[SENTIMENT:]` token in AI reply.
5. **F2 (Reply)**: Trigger handoff → open conversation → type reply → message reaches customer via Meta API
6. **F5 (Analytics)**: Process messages → GET `/api/v1/shop/analytics?period=today` → real metrics with sentiment breakdown
7. **F4 (Real-time)**: Open dashboard → trigger handoff from playground → browser notification pops + conversation list updates live
