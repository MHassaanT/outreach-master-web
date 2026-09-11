import uuid
from datetime import datetime, timezone
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


class SimulateReplyRequest(BaseModel):
    lead_id: int
    reply_text: str


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
