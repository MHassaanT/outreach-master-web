from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.models.lead import Lead, LeadStatus
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.api.deps import get_current_user
from app.models.user import User
from app.services.whatsapp_api import whatsapp_service

router = APIRouter(prefix="/messaging", tags=["Messaging"])


class SendTextRequest(BaseModel):
    content: str


class SendTemplateRequest(BaseModel):
    template_name: str
    language_code: str = "en_US"
    parameters: Optional[List[str]] = None


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@router.get("/threads")
async def get_threads(
    filter_status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Lead)
    if filter_status and filter_status != "all":
        try:
            query = query.where(Lead.status == LeadStatus(filter_status))
        except ValueError:
            pass

    result = await db.execute(query.order_by(desc(Lead.updated_at)))
    leads = result.scalars().all()

    threads = []
    now = datetime.now(timezone.utc)

    for lead in leads:
        # Get last message
        last_msg_res = await db.execute(
            select(Message)
            .where(Message.lead_id == lead.id)
            .order_by(desc(Message.timestamp))
            .limit(1)
        )
        last_msg = last_msg_res.scalar_one_or_none()

        # Calculate 24h customer care window
        window_active = False
        window_seconds_left = 0
        reply_at = ensure_utc(lead.last_reply_at)
        if reply_at:
            elapsed = (now - reply_at).total_seconds()
            if elapsed < 24 * 3600:
                window_active = True
                window_seconds_left = int(24 * 3600 - elapsed)

        threads.append({
            "lead_id": lead.id,
            "business_name": lead.business_name,
            "contact_name": lead.contact_name,
            "phone_number": lead.phone_number,
            "formatted_phone": lead.formatted_phone or lead.phone_number,
            "status": lead.status.value,
            "address": lead.address,
            "rating": lead.rating,
            "window_active": window_active,
            "window_seconds_left": window_seconds_left,
            "last_message": {
                "content": last_msg.content,
                "direction": last_msg.direction.value,
                "timestamp": last_msg.timestamp.isoformat(),
                "status": last_msg.status.value
            } if last_msg else None
        })

    return threads


@router.get("/threads/{lead_id}/messages")
async def get_lead_messages(
    lead_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    lead_res = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = lead_res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    messages_res = await db.execute(
        select(Message)
        .where(Message.lead_id == lead_id)
        .order_by(Message.timestamp.asc())
    )
    messages = messages_res.scalars().all()

    now = datetime.now(timezone.utc)
    window_active = False
    window_seconds_left = 0
    reply_at = ensure_utc(lead.last_reply_at)
    if reply_at:
        elapsed = (now - reply_at).total_seconds()
        if elapsed < 24 * 3600:
            window_active = True
            window_seconds_left = int(24 * 3600 - elapsed)

    return {
        "lead": {
            "id": lead.id,
            "business_name": lead.business_name,
            "contact_name": lead.contact_name,
            "phone_number": lead.phone_number,
            "formatted_phone": lead.formatted_phone,
            "status": lead.status.value,
            "address": lead.address,
            "rating": lead.rating,
            "notes": lead.notes,
            "window_active": window_active,
            "window_seconds_left": window_seconds_left
        },
        "messages": [
            {
                "id": m.id,
                "direction": m.direction.value,
                "message_type": m.message_type.value,
                "content": m.content,
                "template_name": m.template_name,
                "status": m.status.value,
                "error_details": m.error_details,
                "timestamp": m.timestamp.isoformat(),
                "whatsapp_message_id": m.whatsapp_message_id
            }
            for m in messages
        ]
    }


@router.post("/threads/{lead_id}/send-text")
async def send_text_message(
    lead_id: int,
    body: SendTextRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    lead_res = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = lead_res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Send via WhatsApp Service
    send_result = await whatsapp_service.send_text_message(
        to_phone=lead.phone_number,
        text=body.content
    )

    now = datetime.now(timezone.utc)
    new_message = Message(
        lead_id=lead.id,
        direction=MessageDirection.OUTBOUND,
        message_type=MessageType.TEXT,
        content=body.content,
        status=MessageStatus.SENT if send_result.get("success") else MessageStatus.FAILED,
        whatsapp_message_id=send_result.get("message_id"),
        error_details=send_result.get("error"),
        timestamp=now
    )
    db.add(new_message)

    lead.last_contacted_at = now
    lead.updated_at = now
    if lead.status == LeadStatus.NEW:
        lead.status = LeadStatus.OUTREACH_SENT

    await db.commit()
    await db.refresh(new_message)

    return {
        "success": send_result.get("success"),
        "message": {
            "id": new_message.id,
            "direction": new_message.direction.value,
            "content": new_message.content,
            "status": new_message.status.value,
            "timestamp": new_message.timestamp.isoformat(),
            "mock": send_result.get("mock", False)
        }
    }


@router.post("/threads/{lead_id}/send-template")
async def send_template_message(
    lead_id: int,
    body: SendTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    lead_res = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = lead_res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Handle template parameters
    header_params = None
    if body.template_name == "hello_world":
        params = None
        lang = body.language_code or "en_US"
    elif body.template_name == "outreach_template_1":
        lang = "en"
        header_params = [lead.business_name]
        rating_str = f"{lead.rating:.1f}" if lead.rating else "4.8"
        params = [rating_str, lead.business_name]
    else:
        lang = body.language_code or "en"
        params = body.parameters if body.parameters is not None else [lead.business_name]

    send_result = await whatsapp_service.send_template_message(
        to_phone=lead.phone_number,
        template_name=body.template_name,
        language_code=lang,
        body_parameters=params,
        header_parameters=header_params
    )

    now = datetime.now(timezone.utc)
    if params:
        display_content = f"Template: {body.template_name} (Params: {', '.join(params)})"
    else:
        display_content = f"Template: {body.template_name}"

    new_message = Message(
        lead_id=lead.id,
        direction=MessageDirection.OUTBOUND,
        message_type=MessageType.TEMPLATE,
        template_name=body.template_name,
        content=display_content,
        status=MessageStatus.SENT if send_result.get("success") else MessageStatus.FAILED,
        whatsapp_message_id=send_result.get("message_id"),
        error_details=send_result.get("error"),
        timestamp=now
    )
    db.add(new_message)

    lead.last_contacted_at = now
    lead.updated_at = now
    if lead.status == LeadStatus.NEW:
        lead.status = LeadStatus.OUTREACH_SENT

    await db.commit()
    await db.refresh(new_message)

    return {
        "success": send_result.get("success"),
        "message": {
            "id": new_message.id,
            "direction": new_message.direction.value,
            "content": new_message.content,
            "status": new_message.status.value,
            "timestamp": new_message.timestamp.isoformat(),
            "mock": send_result.get("mock", False)
        }
    }
