"""Tests for handoff trigger detection."""

from app.services.handoff import needs_human_handoff


def test_english_human_keyword():
    assert needs_human_handoff("I want to talk to a human") is True


def test_english_agent_keyword():
    assert needs_human_handoff("Can I speak to an agent?") is True


def test_english_complaint():
    assert needs_human_handoff("I have a complaint about my order") is True


def test_english_manager():
    assert needs_human_handoff("Let me speak to the manager") is True


def test_english_real_person():
    assert needs_human_handoff("I need a real person") is True


def test_arabic_handoff():
    assert needs_human_handoff("أريد التحدث مع شخص") is True


def test_arabic_complaint():
    assert needs_human_handoff("عندي شكوى") is True


def test_arabic_manager():
    assert needs_human_handoff("أبي أكلم المدير") is True


def test_normal_message_no_trigger():
    assert needs_human_handoff("What are your hours?") is False


def test_arabic_normal_message():
    assert needs_human_handoff("كم سعر القهوة؟") is False


def test_empty_message():
    assert needs_human_handoff("") is False


def test_case_insensitive():
    assert needs_human_handoff("I WANT A HUMAN") is True


def test_partial_word_no_match():
    # "humanity" should not trigger — \bhuman\b has word boundaries
    assert needs_human_handoff("I believe in humanity") is False
