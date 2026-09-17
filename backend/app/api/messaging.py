import os
import uuid
import mimetypes
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.models.lead import Lead, LeadStatus
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.api.deps import get_current_user
from app.models.user import User
from app.services.whatsapp_api import whatsapp_service
from app.services.lead_service import sanitize_and_merge_existing_leads

router = APIRouter(prefix="/messaging", tags=["Messaging"])

MEDIA_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media", "voice_notes"))
os.makedirs(MEDIA_DIR, exist_ok=True)


@router.post("/sync-threads")
async def sync_threads(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Scans threads and merges any split duplicate threads resulting from whitespace/phone formatting.
    """
    stats = await sanitize_and_merge_existing_leads(db)
    return {"success": True, **stats}


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


@router.get("/media/{filename}")
async def get_media_file(filename: str):
    clean_name = os.path.basename(filename)
    file_path = os.path.join(MEDIA_DIR, clean_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Media file not found")
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "audio/webm"
    return FileResponse(file_path, media_type=mime_type)


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

        last_msg_display = None
        if last_msg:
            content_display = last_msg.content
            if last_msg.message_type == MessageType.AUDIO:
                dur = f" ({last_msg.media_duration}s)" if last_msg.media_duration else ""
                content_display = f"🎤 Voice message{dur}"

            last_msg_display = {
                "content": content_display,
                "direction": last_msg.direction.value,
                "message_type": last_msg.message_type.value,
                "media_url": last_msg.media_url,
                "media_duration": last_msg.media_duration,
                "timestamp": last_msg.timestamp.isoformat(),
                "status": last_msg.status.value
            }

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
            "last_message": last_msg_display
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
                "media_url": m.media_url,
                "media_duration": m.media_duration,
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
        if body.parameters and len(body.parameters) >= 2:
            rating_val = str(body.parameters[0])
            bname = str(body.parameters[1])
        elif body.parameters and len(body.parameters) == 1:
            rating_val = f"{lead.rating:.1f}" if lead.rating else "4.8"
            bname = str(body.parameters[0])
        else:
            rating_val = f"{lead.rating:.1f}" if lead.rating else "4.8"
            bname = lead.business_name

        header_params = [bname]
        params = [rating_val, bname]
    elif body.template_name == "outreach_follow_up_1":
        lang = "en"
        params = None
        header_params = None
    elif body.template_name == "outreach_follow_up_2":
        lang = "en"
        topic = "the website demo"
        header_val = topic
        body_val = topic
        if body.parameters:
            if len(body.parameters) >= 2:
                header_val = str(body.parameters[0])
                body_val = str(body.parameters[1])
            elif len(body.parameters) == 1 and body.parameters[0]:
                header_val = str(body.parameters[0])
                body_val = str(body.parameters[0])

        header_params = [header_val]
        params = [body_val]
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


@router.post("/threads/{lead_id}/send-audio")
async def send_audio_message(
    lead_id: int,
    audio_file: UploadFile = File(...),
    duration: Optional[int] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    lead_res = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = lead_res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    orig_ext = os.path.splitext(audio_file.filename or "")[1]
    if not orig_ext:
        content_type = audio_file.content_type or ""
        if "webm" in content_type:
            orig_ext = ".webm"
        elif "ogg" in content_type:
            orig_ext = ".ogg"
        elif "mp4" in content_type or "m4a" in content_type:
            orig_ext = ".m4a"
        elif "wav" in content_type:
            orig_ext = ".wav"
        else:
            orig_ext = ".webm"

    unique_filename = f"voice_{uuid.uuid4().hex}_{int(datetime.now(timezone.utc).timestamp())}{orig_ext}"
    saved_path = os.path.join(MEDIA_DIR, unique_filename)

    file_bytes = await audio_file.read()
    with open(saved_path, "wb") as f:
        f.write(file_bytes)

    media_url = f"/api/messaging/media/{unique_filename}"

    send_result = await whatsapp_service.send_audio_message(
        to_phone=lead.phone_number,
        audio_path=saved_path,
        audio_url=media_url,
        mime_type=audio_file.content_type or "audio/webm"
    )

    now = datetime.now(timezone.utc)
    dur_display = f" ({duration}s)" if duration else ""
    new_message = Message(
        lead_id=lead.id,
        direction=MessageDirection.OUTBOUND,
        message_type=MessageType.AUDIO,
        content=f"Voice note{dur_display}",
        media_url=media_url,
        media_duration=duration,
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
            "message_type": new_message.message_type.value,
            "content": new_message.content,
            "media_url": new_message.media_url,
            "media_duration": new_message.media_duration,
            "status": new_message.status.value,
            "timestamp": new_message.timestamp.isoformat(),
            "mock": send_result.get("mock", False)
        }
    }
