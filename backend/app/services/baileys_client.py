import logging
from typing import List, Dict, Optional, Any
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


class BaileysClient:
    """Client for communicating with the Baileys WhatsApp Node.js service."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.BAILEYS_SERVICE_URL).rstrip("/")

    async def get_status(self) -> Dict[str, Any]:
        """Fetch connection status, active QR code data URL, and logged-in user info."""
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.get(f"{self.base_url}/api/status")
                if res.status_code == 200:
                    return res.json()
                logger.warning("Baileys /api/status returned HTTP %s", res.status_code)
                return {"status": "error", "connected": False, "qr": None, "user": None}
        except Exception as e:
            logger.debug("Baileys service unreachable at %s: %s", self.base_url, e)
            return {"status": "unreachable", "connected": False, "qr": None, "user": None, "error": str(e)}

    async def connect(self) -> Dict[str, Any]:
        """Request socket initialization and QR code generation."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(f"{self.base_url}/api/connect")
                if res.status_code == 200:
                    return res.json()
                return {"status": "error", "connected": False, "qr": None, "error": res.text}
        except Exception as e:
            logger.error("Baileys connect error: %s", e)
            return {"status": "unreachable", "connected": False, "qr": None, "error": str(e)}

    async def disconnect(self) -> Dict[str, Any]:
        """Disconnect WhatsApp socket and clear saved authentication state."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(f"{self.base_url}/api/logout")
                if res.status_code == 200:
                    return res.json()
                return {"success": False, "error": res.text}
        except Exception as e:
            logger.error("Baileys disconnect error: %s", e)
            return {"success": False, "error": str(e)}

    async def verify_single(self, number: str) -> Dict[str, Any]:
        """Verify if a single phone number exists on WhatsApp using onWhatsApp()."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(
                    f"{self.base_url}/api/verify-single",
                    json={"number": number}
                )
                if res.status_code == 200:
                    return res.json()
                err_msg = res.json().get("error", res.text) if res.headers.get("content-type") == "application/json" else res.text
                return {"number": number, "exists": False, "error": err_msg}
        except Exception as e:
            logger.error("Baileys single verify error: %s", e)
            return {"number": number, "exists": False, "error": str(e)}

    async def verify_numbers(self, numbers: List[str]) -> Dict[str, bool]:
        """Verify a batch of phone numbers against onWhatsApp(). Returns mapping { phone: bool }."""
        if not numbers:
            return {}

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                res = await client.post(
                    f"{self.base_url}/api/verify-numbers",
                    json={"numbers": numbers}
                )
                if res.status_code == 200:
                    data = res.json()
                    return data.get("results", {})
                logger.error("Baileys batch verify failed: %s %s", res.status_code, res.text)
                return {num: False for num in numbers}
        except Exception as e:
            logger.error("Baileys verify_numbers error: %s", e)
            return {num: False for num in numbers}


baileys_service = BaileysClient()
