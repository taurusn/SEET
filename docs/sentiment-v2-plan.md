# Sentiment V2 — Conversation-Aware Dual Sentiment Analysis

## Status

**Phases 1-9: BUILT & COMMITTED** (commit `11a9613`)
**Phase 10: Cleanup** — future PR (drop old `sentiment` column)
**Phase 11: Visit-Based Sessions** — NOT YET BUILT (see below)

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

## Phase 10: Cleanup (Separate PR, After Stable)

- Migration `007`: drop `sentiment` column from `conversations`
- Remove `sentiment` field from `ConversationResponse`
- Remove backward compat `"sentiment"` key from admin audit endpoint
- Remove `model_validator` from `ConversationResponse`

---

## Phase 11: Visit-Based Sentiment Sessions (NOT YET BUILT)

### Problem

Instagram/WhatsApp DMs are one continuous thread per customer. The system mirrors this: one `Conversation` row per `(shop, platform, customer)`, forever via `UniqueConstraint`.

This creates a problem for sentiment tracking:
- Customer complains in January (initial_sentiment = negative, current_sentiment = positive after AI resolves)
- Customer returns in March with a new question
- `initial_sentiment` is still locked from January — stale and meaningless
- The classifier sees old messages from January mixed with new ones
- Analytics show one conversation, but it's really two separate interactions

The system already partially detects "visits" — `customer_profiles.total_conversations` increments when `last_seen_at` is >24 hours ago. But this doesn't affect the conversation model or sentiment tracking.

### Solution: Visit Lifecycle

#### New Table: `conversation_visits`

```sql
CREATE TABLE conversation_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    shop_id UUID NOT NULL REFERENCES shops(id),
    visit_number INTEGER NOT NULL DEFAULT 1,
    initial_sentiment VARCHAR(20),
    current_sentiment VARCHAR(20),
    message_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    CONSTRAINT chk_visit_initial CHECK (initial_sentiment IN ('positive', 'neutral', 'negative')),
    CONSTRAINT chk_visit_current CHECK (current_sentiment IN ('positive', 'neutral', 'negative'))
);

CREATE INDEX ix_visits_conversation ON conversation_visits(conversation_id);
CREATE INDEX ix_visits_shop_started ON conversation_visits(shop_id, started_at DESC);
```

#### New Column on `conversations`

```sql
ALTER TABLE conversations ADD COLUMN current_visit_started_at TIMESTAMPTZ;
```

This tracks when the current visit began. The classifier uses this to filter messages.

#### Visit Detection Flow (in message_worker)

When a new inbound message arrives:

```
1. Load conversation from DB
2. Find the latest message timestamp for this conversation
3. If (now - latest_message_timestamp) > 24 hours:
   a. This is a NEW VISIT
   b. Snapshot current visit:
      - INSERT INTO conversation_visits (
          conversation_id, shop_id, visit_number,
          initial_sentiment, current_sentiment,
          message_count, started_at, ended_at
        )
      - message_count = count of messages since current_visit_started_at
      - ended_at = latest_message_timestamp
   c. Reset conversation for new visit:
      - convo.initial_sentiment = NULL
      - convo.current_sentiment = NULL
      - convo.current_visit_started_at = now()
   d. Log: "New visit started for convo=xyz (visit #N)"
4. If (now - latest_message_timestamp) <= 24 hours:
   a. Same visit — continue normally
5. Process message through pipeline as usual
```

#### Classifier Filtering

The classifier must only see messages from the CURRENT visit, not the entire history:

```python
# In ai_pipeline.py, before calling classify_sentiment:
visit_start = convo.current_visit_started_at

if visit_start:
    # Filter history to only current visit messages
    visit_history = [
        m for m in history
        if m.get("created_at") and m["created_at"] >= visit_start.isoformat()
    ]
else:
    visit_history = history

# Classifier gets current-visit messages only
sentiment_result = await classify_sentiment(visit_history, text)
```

**Important**: The main Gemini call still gets FULL history. Only the classifier is filtered. This way:
- Gemini remembers the customer across visits (can reference past interactions)
- Sentiment reflects only the current visit's mood

#### What Needs to Change in history

Currently `get_recent_messages()` returns `[{"direction": "...", "content": "..."}]` without timestamps. For visit filtering, messages need a `created_at` field:

```python
# In message_worker.py get_recent_messages():
history = [
    {
        "direction": m.direction,
        "content": m.content,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }
    for m in reversed(messages)
]
```

And the Redis cache format must include `created_at` too (append_to_history already needs updating).

#### Gemini Context

No change to Gemini. It still sees full history + summary of older messages. The `[عميل عائد — N محادثات سابقة]` enrichment tag already tells Gemini this is a returning customer.

#### Analytics: Visit-Level Insights

The `conversation_visits` table enables new queries:

```sql
-- Are returning customers getting happier over time?
SELECT
    visit_number,
    AVG(CASE WHEN current_sentiment = 'positive' THEN 1 ELSE 0 END) as positive_rate
FROM conversation_visits
WHERE shop_id = :shop_id
GROUP BY visit_number
ORDER BY visit_number;

-- Per-customer sentiment journey
SELECT visit_number, initial_sentiment, current_sentiment, started_at
FROM conversation_visits
WHERE conversation_id = :conversation_id
ORDER BY visit_number;

-- Visit-over-visit resolution rate
SELECT
    COUNT(*) FILTER (WHERE initial_sentiment = 'negative' AND current_sentiment = 'positive') as resolved,
    COUNT(*) FILTER (WHERE initial_sentiment = 'positive' AND current_sentiment = 'negative') as worsened,
    COUNT(*) as total_visits
FROM conversation_visits
WHERE shop_id = :shop_id AND started_at >= :start_date;
```

#### Frontend: Visit History (future)

In the conversation detail view, a "Visit History" section could show:

```
Visit 3 (current) — started 10 Mar 2026
  Mood: neutral

Visit 2 — 15 Feb 2026 (4 messages)
  Mood: negative → positive ✓

Visit 1 — 20 Jan 2026 (8 messages)
  Mood: negative → negative ✗
```

This gives the shop owner a customer satisfaction timeline.

### Phase 11 Implementation Steps

#### Step 1: Migration 007 (or 008 if cleanup runs first)
- Create `conversation_visits` table with indexes
- Add `current_visit_started_at` column to `conversations`
- Backfill: set `current_visit_started_at = created_at` for all existing conversations

#### Step 2: Update message history format
- Add `created_at` to message history dicts (worker + Redis cache)
- Update `get_recent_messages()` to include timestamps
- Update `append_to_history()` to include timestamps

#### Step 3: Visit detection in message_worker
- Before processing, check time gap since last message
- If >24h: snapshot visit, reset sentiment, start new visit
- Log visit transitions

#### Step 4: Update playground (dashboard.py)
- Same visit detection logic for playground conversations

#### Step 5: Filter classifier input
- In `ai_pipeline.py`, filter history by `current_visit_started_at` before passing to classifier
- Main Gemini call still gets full unfiltered history

#### Step 6: Visit analytics API endpoints
- `GET /api/v1/shop/conversations/{id}/visits` — visit history for a conversation
- Update analytics endpoints to optionally include visit-level metrics

#### Step 7: Frontend — visit history display
- Conversation detail: "Visit History" section showing sentiment per visit
- Analytics: visit-over-visit satisfaction trends

### Phase 11 Files to Modify

| File | Change |
|------|--------|
| `alembic/versions/007_or_008_add_visits.py` | **NEW** — migration for visits table + column |
| `app/models/schemas.py` | New `ConversationVisit` ORM model + Pydantic schema, add `current_visit_started_at` to Conversation |
| `app/workers/message_worker.py` | Visit detection logic, snapshot + reset, include created_at in history |
| `app/api/dashboard.py` | Visit detection in playground, new visits endpoint |
| `app/services/ai_pipeline.py` | Filter history for classifier by visit start |
| `app/services/redis_client.py` | Update cache format to include created_at |
| `app/services/classifiers.py` | No change (receives pre-filtered history) |
| `frontend/src/app/(dashboard)/conversations/page.tsx` | Visit history section |
| `admin/src/app/(dashboard)/shops/[id]/page.tsx` | Visit history in admin audit |

### Phase 11 Edge Cases

- **First ever message**: No previous visit exists. `current_visit_started_at` = now. No snapshot needed.
- **Rapid messages after 24h gap**: First message triggers visit snapshot. Subsequent messages within the same burst are part of the new visit.
- **Handoff across visits**: If a handoff is open when a new visit starts, the old visit gets snapshotted with the handoff state. The new visit starts fresh with `status="ai"` (or should it keep `status="human"`?). Decision: keep current status — handoff spans visits if unresolved.
- **Playground conversations**: Playground messages don't have real 24h gaps (testing happens in bursts). Visit detection should still work but won't trigger often.
- **Multiple messages in queue during gap detection**: Two workers processing messages simultaneously for the same conversation near the 24h boundary. Both might try to create a visit snapshot. Solution: use a Redis lock or DB upsert with `ON CONFLICT` on `(conversation_id, started_at)`.

### Phase 11 Expected Logs

```
INFO  message_worker: New visit detected for convo=xyz (24h+ gap). Snapshotting visit #2 (initial=negative, current=positive, 8 messages). Starting visit #3.
INFO  message_worker: Same visit continues for convo=xyz (last message 2h ago)
INFO  ai_pipeline: Classifier filtered to current visit: 3 inbound messages (visit started 2026-03-10T14:00:00Z)
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
| 10 | ⏳ LATER | Cleanup: drop old sentiment column (separate PR) |
| 11 | ⏳ TODO | Visit-based sessions: visits table, gap detection, classifier filtering, visit history UI |

### Key Design Decisions

1. **Gemini sees full history, classifier sees current visit only** — AI remembers the customer but sentiment is fresh per visit
2. **24-hour gap threshold** — matches the existing `customer_profiles` session detection
3. **Visit snapshots preserve history** — old sentiments never lost, enables trend analysis
4. **One conversation row per customer** — matches Instagram/WhatsApp single-thread reality
5. **Visits table is append-only** — simple, no update conflicts, easy to query
6. **Transition counters only fire when initial_sentiment is locked** — prevents per-message overcounting
