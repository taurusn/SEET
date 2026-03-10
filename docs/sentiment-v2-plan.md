# Sentiment V2 — Conversation-Aware Dual Sentiment Analysis

## Status

**Phases 1-9: COMMITTED** (commit `11a9613`)
**Phases 10-11: COMMITTED** (cleanup + visit-based sessions)

---

## What Was Built (Phases 1-9)

### Problem
The old system classified each individual message independently and overwrote the conversation's single `sentiment` field. "Hi" → neutral, "your coffee was terrible" → negative, "thanks for the voucher" → positive — only "positive" survived. No way to measure AI effectiveness.

### Solution
Conversation-aware dual sentiment tracking using Gemini JSON mode:
- **initial_sentiment**: Why the customer reached out (locked after 3+ inbound messages)
- **current_sentiment**: How the customer feels now (updated every exchange)
- **Zero extra API calls** — classifier runs in parallel with main Gemini call
- **Transition tracking** — resolved (neg→pos) and worsened (pos→neg) counters in Redis

### Architecture

#### Classifier (`app/services/classifiers.py`)
- Receives first 3 + last 3 **inbound** messages from conversation history
- Each message truncated to 200 chars (sentiment is in the first sentence)
- For <6 inbound messages: sends all as a single group
- Uses Gemini JSON mode with `response_schema` enforcing enum validation:
  ```python
  response_schema={
      "type": "object",
      "properties": {
          "initial_mood": {"type": "string", "enum": ["positive", "neutral", "negative"]},
          "current_mood": {"type": "string", "enum": ["positive", "neutral", "negative"]},
      },
      "required": ["initial_mood", "current_mood"],
  }
  ```
- Prompt: hybrid Arabic (classification criteria) + English (output format)
- Config: `temperature=0.0`, `max_output_tokens=30`
- Fail-safe: returns `SentimentResult("neutral", "neutral")` on any error
- Returns `SentimentResult` dataclass with `.initial_mood` and `.current_mood`

#### Pipeline (`app/services/ai_pipeline.py`)
- `PipelineResult` has `initial_sentiment` and `current_sentiment` (replaced old `sentiment`)
- `asyncio.gather` runs main Gemini call + classifier in parallel
- Passes `history` + `text` to classifier (not just `text`)
- Business hours short-circuit returns `initial_sentiment="neutral", current_sentiment="neutral"`

#### Persistence Logic (in worker + playground, NOT in classifier)
```python
inbound_count = len([m for m in history if m.get("direction") == "inbound"]) + 1

# initial_sentiment: set on first classification, updateable until locked at 3+ messages
if result.initial_sentiment:
    if not convo.initial_sentiment or inbound_count <= 3:
        convo.initial_sentiment = result.initial_sentiment

# current_sentiment: always updated
if result.current_sentiment:
    convo.current_sentiment = result.current_sentiment

# Transition tracking: only when initial is locked (>3 messages) to avoid overcounting
locked_initial = convo.initial_sentiment if inbound_count > 3 else ""
```

#### Database (Migration 006)
- Added `initial_sentiment` and `current_sentiment` columns (String(20), nullable)
- CHECK constraints: values must be `IN ('positive', 'neutral', 'negative')`
- Composite index: `(shop_id, created_at DESC)` for transition queries + conversation listing
- Backfilled: copied existing `sentiment` → `current_sentiment`
- Old `sentiment` column kept for backward compatibility

#### Redis Analytics (`app/services/redis_client.py`)
- TTL increased from 35 to 45 days
- Existing keys unchanged: `analytics:{shop_id}:{date}:sentiment:{positive|neutral|negative}`
- New keys: `analytics:{shop_id}:{date}:transitions:{resolved|worsened}`
- `get_analytics()` returns `sentiment_transitions: {resolved: int, worsened: int}`

#### Pydantic Schema (`app/models/schemas.py`)
- `ConversationResponse` has three fields: `sentiment` (deprecated alias), `initial_sentiment`, `current_sentiment`
- `@model_validator(mode="after")` ensures `sentiment = current_sentiment` when `sentiment` is null (backward compat for old API consumers)

#### Admin API (`app/api/admin.py`)
- Conversation audit endpoint returns `sentiment`, `initial_sentiment`, `current_sentiment`
- Platform-wide analytics aggregates `sentiment_transitions` across all shops

#### Frontend — Shop Owner
- **conversation-list.tsx**: Single dot for `current_sentiment` color, tooltip shows transition if initial ≠ current
- **conversations/page.tsx**: Transition badge in conversation detail header ("سلبي → إيجابي")
- **analytics/page.tsx**: "AI Resolution" card showing resolved/worsened counts + resolution rate %

#### Frontend — Admin
- **shops/[id]/page.tsx**: ConvoItem interface updated, AI Resolution card on shop analytics
- **page.tsx**: Platform-wide AI Resolution card

### Files Modified (Phases 1-9)

| File | Change |
|------|--------|
| `alembic/versions/006_add_dual_sentiment_columns.py` | **NEW** — migration |
| `app/services/classifiers.py` | Rewritten: conversation-aware, JSON mode, SentimentResult dataclass |
| `app/services/ai_pipeline.py` | PipelineResult with dual sentiment, passes history to classifier |
| `app/models/schemas.py` | ORM: two new columns + old kept. Pydantic: three fields + model_validator |
| `app/workers/message_worker.py` | Dual persistence logic, transition tracking |
| `app/api/dashboard.py` | Playground: same dual persistence logic |
| `app/api/admin.py` | Conversation audit + platform analytics with transitions |
| `app/services/redis_client.py` | Transition counters, TTL bump, get_analytics returns transitions |
| `frontend/src/components/conversation-list.tsx` | Interface, single dot + tooltip |
| `frontend/src/app/(dashboard)/conversations/page.tsx` | Interface, detail header transition badge |
| `frontend/src/app/(dashboard)/analytics/page.tsx` | AI Resolution metric card |
| `admin/src/app/(dashboard)/shops/[id]/page.tsx` | ConvoItem interface, AI Resolution card |
| `admin/src/app/(dashboard)/page.tsx` | Analytics interface, AI Resolution card |

---

## What Was Built (Phase 10: Cleanup)

### Changes
- **Migration 007**: Dropped deprecated `sentiment` column from `conversations` table. Downgrade restores and backfills from `current_sentiment`.
- **`app/models/schemas.py`**: Removed `sentiment` Column from `Conversation` ORM. Removed `sentiment` field, `model_validator` import, and `backfill_sentiment_alias` validator from `ConversationResponse`.
- **`app/api/admin.py`**: Removed backward compat `"sentiment"` key from conversation audit endpoint response.
- **`frontend/src/components/conversation-list.tsx`**: Removed `sentiment` from `Conversation` interface. Sentiment dot uses `current_sentiment` only.
- **`frontend/src/app/(dashboard)/conversations/page.tsx`**: Removed `sentiment` from `Conversation` interface.
- **`admin/src/app/(dashboard)/shops/[id]/page.tsx`**: Removed `sentiment` from `ConvoItem` interface.

---

## What Was Built (Phase 11: Visit-Based Sentiment Sessions)

### Problem
Instagram/WhatsApp DMs are one continuous thread per customer. The system mirrors this: one `Conversation` row per `(shop, platform, customer)`, forever via `UniqueConstraint`. Sentiment from January stays locked when a customer returns in March — stale and meaningless. The classifier sees old messages mixed with new ones.

### Solution
Visit lifecycle with 24-hour gap detection. When a customer returns after 24+ hours of inactivity, the old visit is snapshotted into `conversation_visits` and the conversation's sentiment resets for a fresh start.

### Database (Migration 008)

**New table: `conversation_visits`**
- `id`, `conversation_id` (FK), `shop_id` (FK), `visit_number`, `initial_sentiment`, `current_sentiment`, `message_count`, `started_at`, `ended_at`
- CHECK constraints on sentiment values (`positive`, `neutral`, `negative`)
- Indexes: `ix_visits_conversation` (by conversation_id), `ix_visits_shop_started` (by shop_id + started_at DESC)

**New column on `conversations`**: `current_visit_started_at` (TIMESTAMPTZ, nullable). Backfilled from `created_at` for all existing conversations.

### Visit Detection (`app/workers/message_worker.py`)

New function `detect_and_snapshot_visit(db, convo)` runs before message processing:
1. Queries `MAX(messages.created_at)` for the conversation
2. If no messages exist (first ever): sets `current_visit_started_at = now()`, returns
3. If gap <= 24 hours: same visit, returns
4. If gap > 24 hours (new visit detected):
   - Counts messages since `current_visit_started_at` (or `created_at` fallback)
   - Determines visit number from existing `conversation_visits` count
   - Inserts snapshot into `conversation_visits` with sentiment + message count + time range
   - Resets `convo.initial_sentiment = None`, `convo.current_sentiment = None`, `convo.current_visit_started_at = now()`
   - Logs the transition with visit details

Handles timezone-naive datetimes from PostgreSQL by replacing `tzinfo` with UTC when needed.

### Message History Timestamps

- `get_recent_messages()`: DB fallback now includes `created_at` in history dicts (ISO format)
- `save_message()`: Redis `append_to_history` now includes `created_at` in cached entries
- Old Redis cache entries without `created_at` are handled gracefully via `has_timestamps` checks

### Classifier Filtering (`app/services/ai_pipeline.py`)

New `visit_started_at` parameter on `AIPipeline.process()`. Before the parallel `asyncio.gather`:
- If `visit_started_at` is set and history has timestamps: filter to messages with `created_at >= visit_started_at`
- If filtered result is empty (e.g., all messages from old visit): fall back to full history
- If no timestamps in cache (old entries): fall back to full history
- **Gemini still gets full unfiltered history** — remembers customer across visits
- **Classifier gets current-visit history only** — fresh sentiment per visit

### Visit-Aware Inbound Count (worker + playground)

The `inbound_count` for sentiment locking (initial_sentiment locked after 3+ messages) is filtered by current visit:
```python
if visit_start_iso:
    has_timestamps = any(m.get("created_at") for m in history)
    if has_timestamps:
        visit_inbound = [m for m in history if m.get("direction") == "inbound"
                         and m.get("created_at") and m["created_at"] >= visit_start_iso]
        inbound_count = len(visit_inbound) + 1
    else:
        inbound_count = len([m for m in history if m.get("direction") == "inbound"]) + 1
```

This prevents inflated counts from old-visit messages after a visit reset. The `has_timestamps` check distinguishes "old cache without timestamps" (fallback to all) from "all timestamps before visit start" (correctly count zero).

### Playground (`app/api/dashboard.py`)

- `detect_and_snapshot_visit(db, convo)` called before handoff check in `playground_chat`
- Same `visit_start_iso` passed to `ai_pipeline.process()`
- Same visit-aware `inbound_count` logic
- `delete_playground_conversation` deletes `ConversationVisit` rows before messages (FK constraint)

### API Endpoints

- **Shop owner**: `GET /api/v1/shop/conversations/{id}/visits` — returns visit history ordered by visit_number DESC
- **Admin**: `GET /api/v1/admin/shops/{shop_id}/conversations/{id}/visits` — same for admin audit view
- Both verify conversation ownership before returning data

### Frontend — Shop Owner (`conversations/page.tsx`)

- `Visit` interface with `id`, `visit_number`, `initial_sentiment`, `current_sentiment`, `message_count`, `started_at`, `ended_at`
- Fetches visits on conversation selection via `useEffect`
- Collapsible `<details>` section: "سجل الزيارات (N زيارة سابقة)"
- Each visit shows: visit number, date, message count, sentiment arrow with resolved (✓) / worsened (✗) indicators

### Frontend — Admin (`shops/[id]/page.tsx`)

- `VisitItem` interface matching the shop owner's
- Fetches visits when conversation is selected in the conversations tab
- Collapsible "Visit History (N past visits)" section above message thread
- Same visit display format with sentiment arrows and resolved/worsened indicators

### Edge Cases Handled

- **First ever message**: No snapshot, just initializes `current_visit_started_at`
- **Timezone-naive DB timestamps**: Replaced with UTC before gap calculation
- **Old Redis cache without `created_at`**: `has_timestamps` check falls back to counting all messages
- **FK on playground delete**: Visits deleted before messages and conversation
- **Handoff across visits**: Keeps current handoff status — handoff spans visits if unresolved

### Files Modified (Phases 10-11)

| File | Change |
|------|--------|
| `alembic/versions/007_drop_deprecated_sentiment_column.py` | **NEW** — drops `sentiment` column |
| `alembic/versions/008_add_conversation_visits.py` | **NEW** — visits table, indexes, `current_visit_started_at` column, backfill |
| `app/models/schemas.py` | Removed `sentiment` Column/field/validator. Added `ConversationVisit` ORM, `current_visit_started_at`, `ConversationVisitResponse` |
| `app/workers/message_worker.py` | `detect_and_snapshot_visit()`, `created_at` in history/cache, visit-aware `inbound_count` |
| `app/services/ai_pipeline.py` | `visit_started_at` param, classifier history filtering with `has_timestamps` guard |
| `app/api/dashboard.py` | Playground visit detection, visit-aware `inbound_count`, visits endpoint, FK-safe delete |
| `app/api/admin.py` | Removed `sentiment` backward compat, admin visits endpoint |
| `frontend/src/components/conversation-list.tsx` | Removed `sentiment` from interface |
| `frontend/src/app/(dashboard)/conversations/page.tsx` | Removed `sentiment`, added `Visit` interface + visit history UI |
| `admin/src/app/(dashboard)/shops/[id]/page.tsx` | Removed `sentiment`, added `VisitItem` interface + visit history UI |
| `docs/sentiment-v2-plan.md` | Updated status and outcomes |

### Useful Queries Enabled

```sql
-- Per-customer sentiment journey
SELECT visit_number, initial_sentiment, current_sentiment, started_at
FROM conversation_visits WHERE conversation_id = :id ORDER BY visit_number;

-- Visit-over-visit resolution rate
SELECT
    COUNT(*) FILTER (WHERE initial_sentiment = 'negative' AND current_sentiment = 'positive') as resolved,
    COUNT(*) FILTER (WHERE initial_sentiment = 'positive' AND current_sentiment = 'negative') as worsened,
    COUNT(*) as total_visits
FROM conversation_visits WHERE shop_id = :shop_id AND started_at >= :start_date;
```

---

## Summary of Full Sentiment V2 Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ DONE | Migration 006: dual sentiment columns, constraints, index |
| 2 | ✅ DONE | Classifier rewrite: conversation-aware, JSON mode |
| 3 | ✅ DONE | Pipeline: PipelineResult with dual sentiment |
| 4 | ✅ DONE | Message worker: dual persistence + locking + transition tracking |
| 5 | ✅ DONE | Playground: same logic |
| 6 | ✅ DONE | Redis: transition counters, TTL bump |
| 7 | ✅ DONE | Backend API: schemas, admin audit, backward compat |
| 8 | ✅ DONE | Frontend shop owner: dot, tooltip, transition badge, resolution card |
| 9 | ✅ DONE | Frontend admin: interfaces, resolution card |
| 10 | ✅ DONE | Cleanup: drop old sentiment column (migration 007) |
| 11 | ✅ DONE | Visit-based sessions: visits table, gap detection, classifier filtering, visit history UI (migration 008) |

### Key Design Decisions

1. **Gemini sees full history, classifier sees current visit only** — AI remembers the customer but sentiment is fresh per visit
2. **24-hour gap threshold** — matches the existing `customer_profiles` session detection
3. **Visit snapshots preserve history** — old sentiments never lost, enables trend analysis
4. **One conversation row per customer** — matches Instagram/WhatsApp single-thread reality
5. **Visits table is append-only** — simple, no update conflicts, easy to query
6. **Transition counters only fire when initial_sentiment is locked** — prevents per-message overcounting
