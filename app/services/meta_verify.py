"""
Meta credential verification.

Called during shop onboarding before flipping is_active to True. Each
verifier hits a lightweight Graph endpoint with the shop's decrypted
token and returns a structured result the admin UI can render as a
per-check list.
"""

import logging
from dataclasses import dataclass, asdict, field
from typing import Any

import httpx

IG_GRAPH_API = "https://graph.instagram.com/v21.0"
FB_GRAPH_API = "https://graph.facebook.com/v21.0"

logger = logging.getLogger(__name__)


@dataclass
class Check:
    name: str
    ok: bool
    detail: str = ""


@dataclass
class VerifyResult:
    platform: str
    ok: bool
    checks: list[Check] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "platform": self.platform,
            "ok": self.ok,
            "checks": [asdict(c) for c in self.checks],
        }


async def _get(url: str, token: str) -> tuple[int, dict]:
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, headers=headers)
        except httpx.RequestError as e:
            return 0, {"error": {"message": f"network error: {e}"}}
    try:
        data = resp.json()
    except ValueError:
        data = {}
    return resp.status_code, data


async def verify_ig_credentials(token: str, expected_page_id: str) -> VerifyResult:
    """Verify an Instagram access token and that it belongs to the claimed page.

    Checks:
      1. Token is accepted by Graph API (/me)
      2. Returned id matches the shop's ig_page_id
    """
    result = VerifyResult(platform="instagram", ok=False)

    if not token:
        result.checks.append(Check("token_present", False, "No IG access token on record"))
        return result
    result.checks.append(Check("token_present", True))

    if not expected_page_id:
        result.checks.append(Check("page_id_present", False, "No IG page id on record"))
        return result
    result.checks.append(Check("page_id_present", True))

    status, data = await _get(f"{IG_GRAPH_API}/me?fields=id,username", token)

    if status == 0:
        result.checks.append(Check("token_valid", False, data.get("error", {}).get("message", "")))
        return result
    if status == 401:
        result.checks.append(Check("token_valid", False, "401 unauthorized — token rejected or expired"))
        return result
    if status != 200:
        err = data.get("error", {}).get("message", f"HTTP {status}")
        result.checks.append(Check("token_valid", False, err))
        return result

    result.checks.append(Check("token_valid", True, f"username={data.get('username', '?')}"))

    actual_id = str(data.get("id", ""))
    if actual_id != str(expected_page_id):
        result.checks.append(
            Check(
                "page_id_match",
                False,
                f"Token belongs to id={actual_id}, shop is configured for id={expected_page_id}",
            )
        )
        return result
    result.checks.append(Check("page_id_match", True))

    result.ok = True
    return result


async def verify_wa_credentials(token: str, phone_number_id: str) -> VerifyResult:
    """Verify a WhatsApp token + phone_number_id pair.

    Checks:
      1. Token is accepted and can read the phone number metadata
      2. Returned display_phone_number is non-empty (sanity)
    """
    result = VerifyResult(platform="whatsapp", ok=False)

    if not token:
        result.checks.append(Check("token_present", False, "No WA access token on record"))
        return result
    result.checks.append(Check("token_present", True))

    if not phone_number_id:
        result.checks.append(Check("phone_number_id_present", False, "No WA phone_number_id on record"))
        return result
    result.checks.append(Check("phone_number_id_present", True))

    status, data = await _get(
        f"{FB_GRAPH_API}/{phone_number_id}?fields=display_phone_number,verified_name",
        token,
    )

    if status == 0:
        result.checks.append(Check("token_valid", False, data.get("error", {}).get("message", "")))
        return result
    if status == 401:
        result.checks.append(Check("token_valid", False, "401 unauthorized — token rejected or expired"))
        return result
    if status == 404:
        result.checks.append(
            Check("phone_number_accessible", False, "phone_number_id not found with this token")
        )
        return result
    if status != 200:
        err = data.get("error", {}).get("message", f"HTTP {status}")
        result.checks.append(Check("token_valid", False, err))
        return result

    result.checks.append(Check("token_valid", True))

    display = data.get("display_phone_number", "")
    if not display:
        result.checks.append(Check("phone_number_accessible", False, "Empty display_phone_number"))
        return result
    result.checks.append(
        Check(
            "phone_number_accessible",
            True,
            f"display={display}, verified_name={data.get('verified_name', '?')}",
        )
    )

    result.ok = True
    return result
