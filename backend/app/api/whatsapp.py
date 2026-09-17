import os
import re
import logging
from datetime import datetime, timezone
from typing import Optional
import httpx
from fastapi import APIRouter, Request, Response, HTTPException, status, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.core.config import settings, persist_env_key
from app.core.database import get_db
from app.models.lead import Lead, LeadStatus
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.services.whatsapp_api import whatsapp_service
from app.services.lead_service import find_lead_by_phone
from app.services.phone_filter import normalize_phone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp Webhook & Embedded Signup"])


class ExchangeTokenRequest(BaseModel):
    code: str
    phone_number_id: Optional[str] = None
    waba_id: Optional[str] = None


@router.post("/exchange-token")
async def exchange_embedded_signup_token(body: ExchangeTokenRequest):
    """
    Exchanges the OAuth code returned by Meta Embedded Signup modal for a long-lived access token.
    Saves WABA ID, Phone Number ID, and token to memory and .env.
    """
    if not settings.WHATSAPP_APP_SECRET:
        logger.warning("No WHATSAPP_APP_SECRET configured. Storing received IDs.")
        if body.phone_number_id:
            settings.WHATSAPP_PHONE_NUMBER_ID = body.phone_number_id
            persist_env_key("WHATSAPP_PHONE_NUMBER_ID", body.phone_number_id)
        if body.waba_id:
            settings.WHATSAPP_BUSINESS_ACCOUNT_ID = body.waba_id
            persist_env_key("WHATSAPP_BUSINESS_ACCOUNT_ID", body.waba_id)

        return {
            "success": True,
            "message": "Received Embedded Signup IDs. Please configure your Meta App Secret in Settings to auto-exchange tokens, or paste your permanent access token.",
            "phone_number_id": body.phone_number_id,
            "waba_id": body.waba_id
        }

    token_url = f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/oauth/access_token"
    params = {
        "client_id": settings.WHATSAPP_APP_ID,
        "client_secret": settings.WHATSAPP_APP_SECRET,
        "code": body.code
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(token_url, params=params)
        data = res.json()

        if res.status_code != 200 or "access_token" not in data:
            err_detail = data.get("error", {}).get("message", res.text)
            logger.error("Meta Token Exchange Failed: %s", err_detail)
            raise HTTPException(status_code=400, detail=f"Meta Token Exchange Error: {err_detail}")

        access_token = data["access_token"]

    # Store credentials
    settings.WHATSAPP_ACCESS_TOKEN = access_token
    persist_env_key("WHATSAPP_ACCESS_TOKEN", access_token)

    if body.phone_number_id:
        settings.WHATSAPP_PHONE_NUMBER_ID = body.phone_number_id
        persist_env_key("WHATSAPP_PHONE_NUMBER_ID", body.phone_number_id)

    if body.waba_id:
        settings.WHATSAPP_BUSINESS_ACCOUNT_ID = body.waba_id
        persist_env_key("WHATSAPP_BUSINESS_ACCOUNT_ID", body.waba_id)

    # Disable mock mode for live operation
    settings.WHATSAPP_MOCK_MODE = False
    persist_env_key("WHATSAPP_MOCK_MODE", "False")

    # Refresh whatsapp service singleton
    whatsapp_service.phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
    whatsapp_service.access_token = settings.WHATSAPP_ACCESS_TOKEN
    whatsapp_service.mock_mode = False

    logger.info("Successfully configured WhatsApp Cloud API via Embedded Signup!")

    return {
        "success": True,
        "phone_number_id": settings.WHATSAPP_PHONE_NUMBER_ID,
        "waba_id": settings.WHATSAPP_BUSINESS_ACCOUNT_ID,
        "coexistence_enabled": True
    }


@router.get("/webhook")
async def verify_webhook(request: Request):
    """
    Webhook verification endpoint called by Meta when configuring the callback URL.
    """
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode == "subscribe" and token == settings.WHATSAPP_VERIFY_TOKEN:
        logger.info("WhatsApp Webhook verified successfully!")
        return Response(content=challenge, media_type="text/plain", status_code=200)

    logger.warning("WhatsApp Webhook verification failed. Token mismatch or wrong mode.")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")


@router.post("/webhook")
async def receive_webhook_payload(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Receives incoming WhatsApp events from Meta:
    1. Inbound messages from customers
    2. Coexistence echoes (smb_message_echoes) from the WhatsApp Business mobile app
    3. Delivery status updates (sent, delivered, read, failed)
    """
    try:
        payload = await request.json()
        logger.info("Incoming WhatsApp Webhook received: %s", payload)
    except Exception as e:
        logger.error("Failed to parse WhatsApp webhook payload: %s", e)
        return {"status": "ignored_non_json"}

    entries = payload.get("entry", [])
    now = datetime.now(timezone.utc)

    for entry in entries:
        changes = entry.get("changes", [])
        for change in changes:
            value = change.get("value", {})

            # 1. Process Inbound Messages (from Customers)
            messages = value.get("messages", [])
            for msg in messages:
                from_number = msg.get("from")  # e.g. "447123456789"
                msg_id = msg.get("id")
                msg_type = msg.get("type")
                body_text = ""

                if msg_type == "text":
                    body_text = msg.get("text", {}).get("body", "")
                elif msg_type == "button":
                    body_text = msg.get("button", {}).get("text", "")
                elif msg_type == "interactive":
                    interactive = msg.get("interactive", {})
                    body_text = (
                        interactive.get("button_reply", {}).get("title")
                        or interactive.get("list_reply", {}).get("title")
                        or "Interactive response"
                    )
                elif msg_type in ("audio", "voice"):
                    body_text = "Voice note"
                else:
                    body_text = f"[{msg_type} message]"

                msg_type_enum = MessageType.AUDIO if msg_type in ("audio", "voice") else MessageType.TEXT

                if from_number:
                    lead = await find_lead_by_phone(db, from_number)

                    if not lead:
                        contact_profile = value.get("contacts", [{}])[0].get("profile", {})
                        profile_name = contact_profile.get("name", f"WhatsApp User ({from_number})")
                        clean_e164, formatted = normalize_phone(from_number)
                        e164_fallback = f"+{from_number.lstrip('+')}"
                        lead = Lead(
                            business_name=profile_name,
                            phone_number=clean_e164 or e164_fallback,
                            formatted_phone=formatted or clean_e164 or e164_fallback,
                            phone_type="mobile",
                            status=LeadStatus.ONGOING,
                            notes="Auto-created from incoming WhatsApp message"
                        )
                        db.add(lead)
                        await db.flush()

                    inbound_msg = Message(
                        lead_id=lead.id,
                        direction=MessageDirection.INBOUND,
                        message_type=msg_type_enum,
                        content=body_text,
                        whatsapp_message_id=msg_id,
                        status=MessageStatus.DELIVERED,
                        timestamp=now
                    )
                    db.add(inbound_msg)

                    lead.last_reply_at = now
                    lead.updated_at = now
                    if lead.status != LeadStatus.FINALIZED:
                        lead.status = LeadStatus.ONGOING

            # 2. Process Meta Coexistence Echoes (smb_message_echoes / message_echoes)
            # Sent manually from the WhatsApp Business mobile app on your phone
            echoes = value.get("smb_message_echoes", []) or value.get("message_echoes", [])
            for echo in echoes:
                to_number = echo.get("to")
                echo_id = echo.get("id")
                echo_type = echo.get("type")
                echo_body = ""

                echo_msg_type = MessageType.AUDIO if echo_type in ("audio", "voice") else MessageType.TEXT
                if echo_type == "text":
                    echo_body = echo.get("text", {}).get("body", "")
                elif echo_type in ("audio", "voice"):
                    echo_body = "Voice note"
                else:
                    echo_body = f"[{echo_type} message from mobile app]"

                if to_number:
                    lead = await find_lead_by_phone(db, to_number)
                    if lead:
                        outbound_echo = Message(
                            lead_id=lead.id,
                            direction=MessageDirection.OUTBOUND,
                            message_type=echo_msg_type,
                            content=echo_body,
                            whatsapp_message_id=echo_id,
                            status=MessageStatus.DELIVERED,
                            timestamp=now
                        )
                        db.add(outbound_echo)
                        lead.last_contacted_at = now
                        lead.updated_at = now
                        if lead.status == LeadStatus.NEW:
                            lead.status = LeadStatus.OUTREACH_SENT

            # 3. Process Status Updates (sent, delivered, read, failed)
            statuses = value.get("statuses", [])
            for stat in statuses:
                wamid = stat.get("id")
                stat_val = stat.get("status")

                if wamid and stat_val:
                    msg_res = await db.execute(
                        select(Message).where(Message.whatsapp_message_id == wamid)
                    )
                    msg_obj = msg_res.scalar_one_or_none()
                    if msg_obj:
                        status_map = {
                            "sent": MessageStatus.SENT,
                            "delivered": MessageStatus.DELIVERED,
                            "read": MessageStatus.READ,
                            "failed": MessageStatus.FAILED
                        }
                        if stat_val in status_map:
                            msg_obj.status = status_map[stat_val]
                            if stat_val == "failed":
                                errors = stat.get("errors", [])
                                msg_obj.error_details = str(errors)

    await db.commit()
    return {"status": "ok"}
