import os
import wave
import struct
import math
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.models.lead import Lead, LeadStatus
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/simulator", tags=["WhatsApp Simulator"])

MEDIA_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media", "voice_notes"))
os.makedirs(MEDIA_DIR, exist_ok=True)


def ensure_sample_audio() -> str:
    sample_path = os.path.join(MEDIA_DIR, "demo_voice_note.wav")
    if not os.path.exists(sample_path):
        sample_rate = 16000
        duration_s = 4.0
        n_samples = int(sample_rate * duration_s)
        try:
            with wave.open(sample_path, "w") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(sample_rate)
                for i in range(n_samples):
                    t = i / sample_rate
                    envelope = math.exp(-t * 0.7)
                    val = int(8000 * envelope * (0.6 * math.sin(2 * math.pi * 440 * t) + 0.4 * math.sin(2 * math.pi * 554.37 * t)))
                    wav_file.writeframes(struct.pack("<h", max(-32767, min(32767, val))))
        except Exception:
            pass
    return "/api/messaging/media/demo_voice_note.wav"


class SimulateReplyRequest(BaseModel):
    lead_id: int
    reply_text: str


class SimulateAudioReplyRequest(BaseModel):
    lead_id: int
    duration: Optional[int] = 4


@router.post("/reply")
async def simulate_lead_reply(
    body: SimulateReplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Simulates an incoming WhatsApp reply from a lead.
    Automatically transitions lead status to ONGOING, updates last_reply_at,
    and opens the 24-hour service window.
    """
    lead_res = await db.execute(select(Lead).where(Lead.id == body.lead_id))
    lead = lead_res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    now = datetime.now(timezone.utc)
    fake_wamid = f"wamid.sim_{uuid.uuid4().hex[:16]}"

    # Save simulated inbound message
    inbound_msg = Message(
        lead_id=lead.id,
        direction=MessageDirection.INBOUND,
        message_type=MessageType.TEXT,
        content=body.reply_text,
        whatsapp_message_id=fake_wamid,
        status=MessageStatus.DELIVERED,
        timestamp=now
    )
    db.add(inbound_msg)

    # Update lead status to ONGOING & record reply timestamp
    lead.last_reply_at = now
    lead.updated_at = now
    if lead.status != LeadStatus.FINALIZED:
        lead.status = LeadStatus.ONGOING

    await db.commit()
    await db.refresh(inbound_msg)

    # Dispatch FCM push notification
    try:
        from app.services.push_service import send_fcm_push
        await send_fcm_push(
            db=db,
            title=lead.business_name or "WhatsApp Lead",
            body=body.reply_text,
            lead_id=lead.id
        )
    except Exception as pe:
        pass

    return {
        "success": True,
        "lead_status": lead.status.value,
        "message": {
            "id": inbound_msg.id,
            "direction": inbound_msg.direction.value,
            "content": inbound_msg.content,
            "status": inbound_msg.status.value,
            "timestamp": inbound_msg.timestamp.isoformat()
        }
    }


@router.post("/mark-read/{lead_id}")
async def simulate_mark_read(
    lead_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Simulates that the lead read the latest outbound message (turning ticks blue).
    """
    msg_res = await db.execute(
        select(Message)
        .where(Message.lead_id == lead_id, Message.direction == MessageDirection.OUTBOUND)
        .order_by(desc(Message.timestamp))
        .limit(1)
    )
    msg = msg_res.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="No outbound message found to mark as read")

    msg.status = MessageStatus.READ
    await db.commit()
    return {"success": True, "message_id": msg.id, "status": "read"}


@router.post("/reply-audio")
async def simulate_lead_audio_reply(
    body: SimulateAudioReplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Simulates an incoming WhatsApp voice message from a lead.
    Automatically transitions lead status to ONGOING, updates last_reply_at,
    and opens the 24-hour service window.
    """
    lead_res = await db.execute(select(Lead).where(Lead.id == body.lead_id))
    lead = lead_res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    now = datetime.now(timezone.utc)
    fake_wamid = f"wamid.sim_voice_{uuid.uuid4().hex[:16]}"
    sample_url = ensure_sample_audio()
    dur = body.duration or 4

    inbound_msg = Message(
        lead_id=lead.id,
        direction=MessageDirection.INBOUND,
        message_type=MessageType.AUDIO,
        content=f"Voice note ({dur}s)",
        media_url=sample_url,
        media_duration=dur,
        whatsapp_message_id=fake_wamid,
        status=MessageStatus.DELIVERED,
        timestamp=now
    )
    db.add(inbound_msg)

    lead.last_reply_at = now
    lead.updated_at = now
    if lead.status != LeadStatus.FINALIZED:
        lead.status = LeadStatus.ONGOING

    await db.commit()
    await db.refresh(inbound_msg)

    # Dispatch FCM push notification
    try:
        from app.services.push_service import send_fcm_push
        await send_fcm_push(
            db=db,
            title=lead.business_name or "WhatsApp Lead",
            body=f"🎤 Voice note ({dur}s)",
            lead_id=lead.id
        )
    except Exception as pe:
        pass

    return {
        "success": True,
        "lead_status": lead.status.value,
        "message": {
            "id": inbound_msg.id,
            "direction": inbound_msg.direction.value,
            "message_type": inbound_msg.message_type.value,
            "content": inbound_msg.content,
            "media_url": inbound_msg.media_url,
            "media_duration": inbound_msg.media_duration,
            "status": inbound_msg.status.value,
            "timestamp": inbound_msg.timestamp.isoformat()
        }
    }
