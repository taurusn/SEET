"""
Business Hours — timezone-aware check for whether a shop is currently open.

Uses shop_context with context_type='business_hours', content stored as JSON:
{
  "timezone": "Asia/Riyadh",
  "schedule": {
    "sun": {"open": "07:00", "close": "23:00"},
    "mon": {"open": "07:00", "close": "23:00"},
    ...
    "fri": {"open": "14:00", "close": "23:00"}
  },
  "closed_message": "أهلاً! نحن مقفلين حالياً..."
}

Fail-open: if JSON is invalid or any error occurs, returns (True, None)
so messages are never blocked due to bad config.
"""

import json
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

# Python weekday: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
DAY_MAP = {
    0: "mon",
    1: "tue",
    2: "wed",
    3: "thu",
    4: "fri",
    5: "sat",
    6: "sun",
}

DEFAULT_CLOSED_MESSAGE = "أهلاً! نحن مقفلين حالياً. نسعد بخدمتك وقت الدوام!"


def check_business_hours(json_str: str) -> tuple[bool, str | None]:
    """Check if the shop is currently open based on business hours config.

    Returns:
        (is_open, closed_message) — if open, closed_message is None.
        Fail-open: returns (True, None) on any error.
    """
    try:
        config = json.loads(json_str)
        tz_name = config.get("timezone", "Asia/Riyadh")
        schedule = config.get("schedule", {})
        closed_message = config.get("closed_message", DEFAULT_CLOSED_MESSAGE)

        if not schedule:
            return True, None

        tz = ZoneInfo(tz_name)
        now = datetime.now(tz)
        day_key = DAY_MAP[now.weekday()]

        day_schedule = schedule.get(day_key)
        if not day_schedule:
            # No schedule for this day = closed
            return False, closed_message

        open_time = day_schedule.get("open", "00:00")
        close_time = day_schedule.get("close", "23:59")

        current_time = now.strftime("%H:%M")

        if open_time <= current_time < close_time:
            return True, None
        else:
            return False, closed_message

    except Exception as e:
        logger.warning("Business hours check failed (fail-open): %s", e)
        return True, None
