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


def test_ig_extract_no_text():
    """Image-only messages should be skipped."""
    payload = {
        "entry": [{
            "id": "PAGE_123",
            "messaging": [{
                "sender": {"id": "USER_456"},
                "recipient": {"id": "PAGE_123"},
                "message": {"mid": "mid.img", "attachments": [{"type": "image"}]},
            }],
        }],
    }
    result = extract_ig_messages(payload)
    assert len(result) == 0


def test_ig_extract_empty_payload():
    assert extract_ig_messages({}) == []
    assert extract_ig_messages({"entry": []}) == []


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


def test_wa_extract_non_text():
    """Non-text messages (image, sticker) should be skipped."""
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
    assert len(result) == 0


def test_wa_extract_empty_payload():
    assert extract_wa_messages({}) == []
    assert extract_wa_messages({"entry": []}) == []
