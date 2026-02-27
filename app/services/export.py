"""Shared CSV/transcript export utilities for conversations and analytics."""

import csv
import io
from datetime import datetime


SENDER_LABELS = {
    "customer": "العميل",
    "ai": "الموظف",
    "human": "المسؤول",
}


def messages_to_transcript(messages: list[dict]) -> str:
    """Convert messages to a plain-text transcript with timestamps and Arabic sender labels."""
    lines = []
    for msg in messages:
        ts = msg.get("created_at", "")
        if isinstance(ts, datetime):
            ts = ts.strftime("%Y-%m-%d %H:%M")
        elif isinstance(ts, str) and len(ts) > 16:
            ts = ts[:16].replace("T", " ")

        sender = SENDER_LABELS.get(msg.get("sender_type", ""), msg.get("sender_type", ""))
        content = msg.get("content", "")
        lines.append(f"[{ts}] {sender}: {content}")
    return "\n".join(lines)


def messages_to_csv(messages: list[dict]) -> str:
    """Convert messages to CSV format."""
    output = io.StringIO()
    writer = csv.writer(output)
    has_convo_id = any("conversation_id" in m for m in messages[:1])
    if has_convo_id:
        writer.writerow(["conversation_id", "timestamp", "direction", "sender_type", "content"])
    else:
        writer.writerow(["timestamp", "direction", "sender_type", "content"])
    for msg in messages:
        ts = msg.get("created_at", "")
        if isinstance(ts, datetime):
            ts = ts.isoformat()
        row = [
            ts,
            msg.get("direction", ""),
            msg.get("sender_type", ""),
            msg.get("content", ""),
        ]
        if has_convo_id:
            row.insert(0, msg.get("conversation_id", ""))
        writer.writerow(row)
    return output.getvalue()


def analytics_to_csv(data: dict) -> str:
    """Flatten analytics dict to CSV."""
    output = io.StringIO()
    writer = csv.writer(output)

    # Summary
    writer.writerow(["Section", "Metric", "Value"])
    writer.writerow(["Summary", "total_messages", data.get("total_messages", 0)])
    writer.writerow(["Summary", "total_escalations", data.get("total_escalations", 0)])
    writer.writerow(["Summary", "ai_handled_pct", data.get("ai_handled_pct", 0)])
    writer.writerow(["Summary", "avg_response_time_ms", data.get("avg_response_time_ms", 0)])

    # Sentiment
    sentiment = data.get("sentiment_breakdown", {})
    for k, v in sentiment.items():
        writer.writerow(["Sentiment", k, v])

    # Daily breakdown
    writer.writerow([])
    writer.writerow(["Date", "Messages", "Escalations"])
    for day in data.get("messages_by_day", []):
        writer.writerow([day.get("date", ""), day.get("messages", 0), day.get("escalations", 0)])

    # Hourly breakdown
    writer.writerow([])
    writer.writerow(["Hour", "Messages"])
    for i, val in enumerate(data.get("messages_by_hour", [])):
        writer.writerow([f"{i:02d}:00", val])

    return output.getvalue()
