# Sentiment V2 — Conversation-Aware Dual Sentiment Analysis

## Overview

Replace single per-message sentiment classification with conversation-aware dual sentiment (initial mood + current mood) using Gemini JSON mode. Zero extra API calls, zero added latency.

## Motivation

The current system classifies each individual message and overwrites the conversation's sentiment. This means:
- "Hi" → neutral, "your coffee was terrible" → negative, "thanks for the voucher" → positive. Only "positive" survives.
- Greetings and emojis produce meaningless "neutral" classifications
- No way to measure AI effectiveness (did the AI resolve a negative customer?)

## Architecture

### Classifier Changes
- **Input:** First 3 + last 3 inbound messages from conversation history (truncated to 200 chars each)
- **Output:** JSON mode with `response_schema` enforcing `{initial_mood, current_mood}` with enum validation
- **Prompt:** Hybrid Arabic (classification criteria) + English (output format)
- **Config:** `temperature=0.0`, `max_output_tokens=30`
- **Fail-safe:** Returns `("neutral", "neutral")` on any error
- **For <6 inbound messages:** Single group with note "هذي كل رسائل العميل"

### Persistence Logic (in worker, not classifier)
- `initial_sentiment`: Set on first classification, reset on conversation status change (reopen)
- `current_sentiment`: Updated on every exchange

### Database
- Add `initial_sentiment` and `current_sentiment` columns with CHECK constraints
- Add composite index `(shop_id, created_at DESC)`
- Keep old `sentiment` column during transition (drop in Phase 10)
- Backfill: copy `sentiment` → `current_sentiment`

### Redis Analytics
- Keep existing `sentiment:{value}` daily counters (track `current_sentiment`)
- Add `transitions:resolved` and `transitions:worsened` counters
- Increase TTL from 35 to 45 days

### Frontend
- Conversation list: single dot for `current_sentiment`, tooltip shows transition
- Conversation detail header: full transition badge when initial ≠ current
- Analytics: new "AI Resolution" metric from transition counters

---

## Phases

### Phase 1: Database Migration (006)
- Add columns, CHECK constraints, composite index
- Backfill current_sentiment from sentiment
- Do NOT drop sentiment column

### Phase 2: Classifier Rewrite
- Conversation-aware with JSON mode
- First 3 + last 3 inbound messages
- Hybrid Arabic/English prompt

### Phase 3: Pipeline Update
- PipelineResult: `initial_sentiment` + `current_sentiment`
- Pass history to classifier in asyncio.gather

### Phase 4: Message Worker
- Persistence logic (initial locks, current always updates)
- Reset initial on conversation reopen
- Redis analytics with transition tracking

### Phase 5: Playground
- Same persistence logic as worker

### Phase 6: Redis Analytics
- Transition counters in track_message_processed()
- get_analytics() returns transitions
- TTL bump to 45 days

### Phase 7: Backend API
- ORM + Pydantic schema updates
- Admin audit endpoint update
- Keep `sentiment` as backward compat alias

### Phase 8: Frontend — Shop Owner
- conversation-list.tsx: interface + single dot + tooltip
- conversations/page.tsx: interface + detail header transition badge
- analytics/page.tsx: AI resolution metric

### Phase 9: Frontend — Admin
- shops/[id]/page.tsx: ConvoItem interface + resolution metric
- page.tsx: platform-wide resolution metric

### Phase 10: Cleanup (separate PR)
- Migration 007: drop `sentiment` column
- Remove backward compat alias

---

## Files Modified

| File | Change |
|------|--------|
| `app/services/classifiers.py` | Rewrite: conversation-aware, JSON mode |
| `app/services/ai_pipeline.py` | PipelineResult fields, pass history to classifier |
| `app/models/schemas.py` | ORM + Pydantic: two new fields, keep old as alias |
| `app/workers/message_worker.py` | Persistence logic, Redis tracking params |
| `app/api/dashboard.py` | Playground persistence logic |
| `app/api/admin.py` | Conversation audit response fields |
| `app/services/redis_client.py` | Transition counters, TTL bump, analytics response |
| `frontend/src/components/conversation-list.tsx` | Interface, single dot + tooltip |
| `frontend/src/app/(dashboard)/conversations/page.tsx` | Interface, detail header transition badge |
| `frontend/src/app/(dashboard)/analytics/page.tsx` | AI resolution metric |
| `admin/src/app/(dashboard)/shops/[id]/page.tsx` | ConvoItem interface, resolution metric |
| `admin/src/app/(dashboard)/page.tsx` | Platform-wide resolution metric |

**Created:** 1 migration (006), later 1 cleanup migration (007)

---

## Expected Logs

### Classifier
```
INFO  classifiers: Sentiment classified: initial=negative, current=positive (conversation has 7 inbound messages, sent 6 to classifier)
WARN  classifiers: Sentiment classification failed: <error>. Returning neutral/neutral fallback.
INFO  classifiers: Short conversation (2 inbound messages), sent all as single group
```

### Pipeline
```
INFO  ai_pipeline: Pipeline result: initial_sentiment=negative, current_sentiment=positive, handoff=False, time=1240ms, reply='والله آسفين...'
INFO  ai_pipeline: Shop closed — skipping Gemini, sending auto-reply (sentiment=neutral/neutral)
```

### Message Worker
```
INFO  message_worker: Sentiment update: initial=negative (locked), current=positive (shop=abc convo=xyz)
INFO  message_worker: Sentiment update: initial=negative (already set, skipped), current=neutral (shop=abc convo=xyz)
INFO  message_worker: Sentiment update: initial=positive (reset on reopen), current=positive (shop=abc convo=xyz)
INFO  message_worker: Transition tracked: resolved (neg→pos) for shop=abc
```

### Redis Analytics
```
INFO  redis_client: Analytics tracked: sentiment=positive, transition=resolved (shop=abc date=2026-03-10)
```

---

## Expected Product Behavior

### Conversation List (Shop Owner)
- Each conversation shows a single colored dot next to customer ID
  - Green = current mood positive
  - Gray = current mood neutral
  - Red = current mood negative
- Hovering the dot shows tooltip: "سلبي → إيجابي" (if initial ≠ current)
- Existing conversations: dot shows current_sentiment (backfilled from old sentiment), no tooltip (initial is null)

### Conversation Detail
- Header area shows transition badge when initial ≠ current:
  - "🔴 → 🟢 تحسّن المزاج" (mood improved)
  - "🟢 → 🔴 ساء المزاج" (mood worsened)
- No badge when initial = current or initial is null

### Analytics Dashboard (Shop Owner)
- Existing sentiment breakdown (positive/neutral/negative progress bars) — unchanged
- New "AI Resolution" card:
  - "X محادثات تحسّنت" (conversations improved: negative → positive)
  - "Y محادثات ساءت" (conversations worsened: positive → negative)
  - Resolution rate: X / (X + Y) as percentage

### Admin Dashboard
- Same metrics aggregated across all shops
- Per-shop detail shows that shop's resolution metrics

### Edge Cases in Product
- **New conversation (1 message):** Single dot, no tooltip. initial = current = same value.
- **Greeting-only conversation:** Both sentiments = neutral. Gray dot, no transition badge.
- **Returning customer (conversation reused):** initial_sentiment resets when conversation reopens. Fresh tracking starts.
- **Business hours closed:** Auto-reply sent, sentiment stays at previous values (no classification runs).
- **Gemini failure:** Sentiment stays at previous values. Fallback neutral/neutral only written if no previous sentiment exists.
- **Rapid messages:** Race condition on initial_sentiment is benign (both early messages, either value is valid).

### What Shop Owners See Day-to-Day
1. Open dashboard → conversation list shows colored dots → glance at overall mood
2. See a red dot → tap conversation → header shows "started negative, now negative" → take action (reply manually, issue voucher)
3. See analytics → "85% AI resolution rate this week" → confidence that AI is handling complaints well
4. See analytics → "3 conversations worsened" → investigate what went wrong

### What Admins See
1. Platform dashboard → aggregate resolution rate across all shops
2. Per-shop detail → that shop's resolution rate and transitions
3. Identify shops where AI is underperforming (low resolution rate) → adjust context/prompts
