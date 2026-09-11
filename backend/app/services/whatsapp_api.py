import uuid
import logging
from typing import Dict, Any, Optional, List
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


class WhatsAppService:
    def __init__(
        self,
        phone_number_id: Optional[str] = None,
        access_token: Optional[str] = None,
        api_version: Optional[str] = None,
        mock_mode: Optional[bool] = None
    ):
        self._phone_number_id = phone_number_id
        self._access_token = access_token
        self._api_version = api_version
        self._mock_mode = mock_mode

    @property
    def phone_number_id(self) -> Optional[str]:
        return self._phone_number_id or settings.WHATSAPP_PHONE_NUMBER_ID

    @phone_number_id.setter
    def phone_number_id(self, val: Optional[str]):
        self._phone_number_id = val

    @property
    def access_token(self) -> Optional[str]:
        return self._access_token or settings.WHATSAPP_ACCESS_TOKEN

    @access_token.setter
    def access_token(self, val: Optional[str]):
        self._access_token = val

    @property
    def api_version(self) -> str:
        return self._api_version or settings.WHATSAPP_API_VERSION

    @api_version.setter
    def api_version(self, val: Optional[str]):
        self._api_version = val

    @property
    def mock_mode(self) -> bool:
        if self._mock_mode is not None:
            return self._mock_mode
        return bool(settings.WHATSAPP_MOCK_MODE or not self.phone_number_id or not self.access_token)

    @mock_mode.setter
    def mock_mode(self, val: Optional[bool]):
        self._mock_mode = val

    @property
    def base_url(self) -> str:
        return f"https://graph.facebook.com/{self.api_version}/{self.phone_number_id}/messages"

    async def send_text_message(self, to_phone: str, text: str) -> Dict[str, Any]:
        """
        Sends freeform text message (used within 24h customer service window).
        """
        # Clean phone number (strip + and spaces)
        recipient = to_phone.replace("+", "").replace(" ", "").replace("-", "")

        if self.mock_mode:
            logger.info("[MOCK] Sending WhatsApp text message to %s: %s", recipient, text)
            fake_msg_id = f"wamid.mock_{uuid.uuid4().hex[:16]}"
            return {
                "success": True,
                "message_id": fake_msg_id,
                "status": "sent",
                "mock": True
            }

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient,
            "type": "text",
            "text": {"preview_url": False, "body": text}
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(self.base_url, headers=headers, json=payload)
            data = response.json()
            if response.status_code not in (200, 201):
                logger.error("WhatsApp API Error: %d %s", response.status_code, response.text)
                err_msg = data.get("error", {}).get("message", response.text)
                return {
                    "success": False,
                    "error": f"WhatsApp API Error: {err_msg}",
                    "details": data
                }

            msg_id = data.get("messages", [{}])[0].get("id")
            return {
                "success": True,
                "message_id": msg_id,
                "status": "sent",
                "mock": False
            }

    async def send_template_message(
        self,
        to_phone: str,
        template_name: str = "hello_world",
        language_code: str = "en_US",
        body_parameters: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Sends WhatsApp approved template message (Required for business-initiated cold outreach).
        """
        recipient = to_phone.replace("+", "").replace(" ", "").replace("-", "")

        if self.mock_mode:
            logger.info(
                "[MOCK] Sending WhatsApp template '%s' (%s) to %s with params: %s",
                template_name, language_code, recipient, body_parameters
            )
            fake_msg_id = f"wamid.mock_{uuid.uuid4().hex[:16]}"
            return {
                "success": True,
                "message_id": fake_msg_id,
                "status": "sent",
                "mock": True
            }

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        template_payload: Dict[str, Any] = {
            "name": template_name,
            "language": {"code": language_code}
        }

        if body_parameters:
            template_payload["components"] = [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": str(p)} for p in body_parameters]
                }
            ]

        payload = {
            "messaging_product": "whatsapp",
            "to": recipient,
            "type": "template",
            "template": template_payload
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(self.base_url, headers=headers, json=payload)
            data = response.json()
            if response.status_code not in (200, 201):
                logger.error("WhatsApp API Error: %d %s", response.status_code, response.text)
                err_msg = data.get("error", {}).get("message", response.text)
                return {
                    "success": False,
                    "error": f"WhatsApp API Error: {err_msg}",
                    "details": data
                }

            msg_id = data.get("messages", [{}])[0].get("id")
            return {
                "success": True,
                "message_id": msg_id,
                "status": "sent",
                "mock": False
            }


whatsapp_service = WhatsAppService()
