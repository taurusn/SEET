import logging

import httpx

logger = logging.getLogger(__name__)

IG_GRAPH_API = "https://graph.instagram.com/v21.0"


class TokenExpiredError(Exception):
    pass


class RateLimitError(Exception):
    pass


async def send_ig_message(access_token: str, recipient_id: str, text: str) -> dict:
    """Send a message via the Instagram Messaging API."""
    url = f"{IG_GRAPH_API}/me/messages"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text},
    }
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(url, json=payload, headers=headers)

        if response.status_code == 401:
            raise TokenExpiredError("Instagram access token expired")
        if response.status_code == 429:
            raise RateLimitError("Instagram API rate limited")
        response.raise_for_status()

        data = response.json()
        logger.info("IG message sent to %s: %s", recipient_id, data.get("message_id"))
        return data


def extract_ig_messages(payload: dict) -> list[dict]:
    """Extract individual messages from an Instagram webhook payload."""
    messages = []
    for entry in payload.get("entry", []):
        for messaging in entry.get("messaging", []):
            message = messaging.get("message", {})
            if message and "text" in message:
                messages.append({
                    "sender_id": messaging["sender"]["id"],
                    "recipient_id": messaging["recipient"]["id"],
                    "text": message["text"],
                    "meta_message_id": message.get("mid", ""),
                    "page_id": entry.get("id", ""),
                })
    return messages
