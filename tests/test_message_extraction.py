"""Tests for Instagram and WhatsApp message extraction."""

from app.services.instagram import extract_ig_messages
from app.services.whatsapp import extract_wa_messages


# ─── Instagram ────────────────────────────────────────────────────────────────


def test_ig_extract_text_message():
    payload = {
        "entry": [{
            "id": "PAGE_123",
            "messaging": [{
                "sender": {"id": "USER_456"},
                "recipient": {"id": "PAGE_123"},
                "message": {
                    "mid": "mid.abc123",
                    "text": "وش عندكم اليوم؟",
                },
            }],
        }],
    }
    result = extract_ig_messages(payload)
    assert len(result) == 1
    assert result[0]["sender_id"] == "USER_456"
    assert result[0]["text"] == "وش عندكم اليوم؟"
    assert result[0]["meta_message_id"] == "mid.abc123"
    assert result[0]["page_id"] == "PAGE_123"


def test_ig_extract_empty_message_skipped():
    """Messages with no text and no attachments must still be skipped."""
    payload = {
        "entry": [{
            "id": "PAGE_123",
            "messaging": [{
                "sender": {"id": "USER_456"},
                "recipient": {"id": "PAGE_123"},
                "message": {"mid": "mid.empty"},
            }],
        }],
    }
    result = extract_ig_messages(payload)
    assert len(result) == 0


def test_ig_extract_empty_payload():
    assert extract_ig_messages({}) == []
    assert extract_ig_messages({"entry": []}) == []


def test_ig_extract_skips_echoes():
    """Echoes of our own sent DMs must not be re-processed as customer messages."""
    payload = {
        "entry": [{
            "id": "PAGE_123",
            "messaging": [{
                "sender": {"id": "PAGE_123"},
                "recipient": {"id": "USER_456"},
                "message": {
                    "mid": "mid.echo",
                    "is_echo": True,
                    "text": "مرحبا بك",
                },
            }],
        }],
    }
    assert extract_ig_messages(payload) == []


def test_ig_extract_quick_reply_payload():
    """Tapping a quick-reply button delivers a payload that must be treated as text."""
    payload = {
        "entry": [{
            "id": "PAGE_123",
            "messaging": [{
                "sender": {"id": "USER_456"},
                "recipient": {"id": "PAGE_123"},
                "message": {
                    "mid": "mid.qr",
                    "text": "أبغى أعرف المنيو",
                    "quick_reply": {"payload": "SHOW_MENU"},
                },
            }],
        }],
    }
    result = extract_ig_messages(payload)
    assert len(result) == 1
    assert result[0]["text"] == "SHOW_MENU"


def test_ig_extract_attachment_placeholder():
    """Image-only messages should surface a placeholder for the AI to respond to."""
    payload = {
        "entry": [{
            "id": "PAGE_123",
            "messaging": [{
                "sender": {"id": "USER_456"},
                "recipient": {"id": "PAGE_123"},
                "message": {
                    "mid": "mid.img",
                    "attachments": [{"type": "image"}],
                },
            }],
        }],
    }
    result = extract_ig_messages(payload)
    assert len(result) == 1
    assert "image" in result[0]["text"]


def test_ig_extract_multiple_messages():
    payload = {
        "entry": [{
            "id": "PAGE_1",
            "messaging": [
                {
                    "sender": {"id": "U1"},
                    "recipient": {"id": "PAGE_1"},
                    "message": {"mid": "m1", "text": "msg1"},
                },
                {
                    "sender": {"id": "U2"},
                    "recipient": {"id": "PAGE_1"},
                    "message": {"mid": "m2", "text": "msg2"},
                },
            ],
        }],
    }
    result = extract_ig_messages(payload)
    assert len(result) == 2


# ─── WhatsApp ─────────────────────────────────────────────────────────────────


def test_wa_extract_text_message():
    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "metadata": {"phone_number_id": "PHONE_123"},
                    "messages": [{
                        "from": "966501234567",
                        "id": "wamid.abc123",
                        "type": "text",
                        "text": {"body": "السلام عليكم"},
                    }],
                },
            }],
        }],
    }
    result = extract_wa_messages(payload)
    assert len(result) == 1
    assert result[0]["sender_id"] == "966501234567"
    assert result[0]["text"] == "السلام عليكم"
    assert result[0]["meta_message_id"] == "wamid.abc123"
    assert result[0]["phone_number_id"] == "PHONE_123"


def test_wa_extract_media_placeholder():
    """Non-text messages (image, sticker, etc.) surface a placeholder."""
    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "metadata": {"phone_number_id": "PHONE_123"},
                    "messages": [{
                        "from": "966501234567",
                        "id": "wamid.img",
                        "type": "image",
                        "image": {"id": "img_123"},
                    }],
                },
            }],
        }],
    }
    result = extract_wa_messages(payload)
    assert len(result) == 1
    assert "image" in result[0]["text"]


def test_wa_extract_button_reply():
    """Tapping an interactive button delivers a title that must map to text."""
    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "metadata": {"phone_number_id": "PHONE_123"},
                    "messages": [{
                        "from": "966501234567",
                        "id": "wamid.btn",
                        "type": "interactive",
                        "interactive": {
                            "type": "button_reply",
                            "button_reply": {"id": "menu", "title": "شوف المنيو"},
                        },
                    }],
                },
            }],
        }],
    }
    result = extract_wa_messages(payload)
    assert len(result) == 1
    assert result[0]["text"] == "شوف المنيو"


def test_wa_extract_empty_payload():
    assert extract_wa_messages({}) == []
    assert extract_wa_messages({"entry": []}) == []
