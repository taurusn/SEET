import logging

import httpx

from app.services.instagram import TokenExpiredError, RateLimitError

logger = logging.getLogger(__name__)

WA_GRAPH_API = "https://graph.facebook.com/v21.0"


async def send_wa_message(
    access_token: str,
    phone_number_id: str,
    recipient_wa_id: str,
    text: str,
) -> dict:
    """Send a text message via the WhatsApp Cloud API."""
    url = f"{WA_GRAPH_API}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient_wa_id,
        "type": "text",
        "text": {"body": text},
    }
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(url, json=payload, headers=headers)

        if response.status_code == 401:
            raise TokenExpiredError("WhatsApp access token expired")
        if response.status_code == 429:
            raise RateLimitError("WhatsApp API rate limited")
        response.raise_for_status()

        data = response.json()
        msg_id = data.get("messages", [{}])[0].get("id", "unknown")
        logger.info("WA message sent to %s: %s", recipient_wa_id, msg_id)
        return data


_WA_MEDIA_TYPES = {"image", "video", "audio", "document", "sticker", "location"}


def extract_wa_messages(payload: dict) -> list[dict]:
    """Extract individual messages from a WhatsApp webhook payload.

    Handles:
      - text messages
      - interactive button/list replies (maps the tapped title to text)
      - template button replies (type=button)
      - media/location — surfaced as a synthetic placeholder so the AI can
        reply naturally rather than silently dropping the event
    """
    messages = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            metadata = value.get("metadata", {})
            phone_number_id = metadata.get("phone_number_id", "")

            for msg in value.get("messages", []):
                msg_type = msg.get("type")
                text: str | None = None

                if msg_type == "text":
                    text = (msg.get("text") or {}).get("body")
                elif msg_type == "interactive":
                    interactive = msg.get("interactive", {})
                    kind = interactive.get("type")
                    if kind == "button_reply":
                        text = (interactive.get("button_reply") or {}).get("title")
                    elif kind == "list_reply":
                        text = (interactive.get("list_reply") or {}).get("title")
                elif msg_type == "button":
                    text = (msg.get("button") or {}).get("text")
                elif msg_type in _WA_MEDIA_TYPES:
                    text = f"[رسالة غير نصية: {msg_type}]"

                if not text:
                    continue

                messages.append({
                    "sender_id": msg["from"],
                    "text": text,
                    "meta_message_id": msg.get("id", ""),
                    "phone_number_id": phone_number_id,
                    "wa_id": msg["from"],
                })
    return messages
