from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.core.database import get_db
from app.models.lead import Lead, LeadStatus
from app.models.message import Message, MessageDirection
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Count total leads
    total_leads_res = await db.execute(select(func.count(Lead.id)))
    total_leads = total_leads_res.scalar() or 0

    # Count by status
    new_res = await db.execute(select(func.count(Lead.id)).where(Lead.status == LeadStatus.NEW))
    new_count = new_res.scalar() or 0

    sent_res = await db.execute(select(func.count(Lead.id)).where(Lead.status == LeadStatus.OUTREACH_SENT))
    sent_count = sent_res.scalar() or 0

    ongoing_res = await db.execute(select(func.count(Lead.id)).where(Lead.status == LeadStatus.ONGOING))
    ongoing_count = ongoing_res.scalar() or 0

    finalized_res = await db.execute(select(func.count(Lead.id)).where(Lead.status == LeadStatus.FINALIZED))
    finalized_count = finalized_res.scalar() or 0

    # Total engaged outreach (sent + ongoing + finalized)
    contacted_total = sent_count + ongoing_count + finalized_count
    responded_total = ongoing_count + finalized_count
    response_rate = round((responded_total / contacted_total * 100), 1) if contacted_total > 0 else 0.0

    # Recent messages
    recent_msgs_res = await db.execute(
        select(Message)
        .order_by(desc(Message.timestamp))
        .limit(5)
    )
    recent_msgs = recent_msgs_res.scalars().all()

    recent_activities = []
    for msg in recent_msgs:
        # Fetch lead for business name
        lead_res = await db.execute(select(Lead).where(Lead.id == msg.lead_id))
        lead = lead_res.scalar_one_or_none()
        b_name = lead.business_name if lead else "Unknown Lead"
        recent_activities.append({
            "id": msg.id,
            "lead_id": msg.lead_id,
            "business_name": b_name,
            "direction": msg.direction.value,
            "content": msg.content[:100] + ("..." if len(msg.content) > 100 else ""),
            "timestamp": msg.timestamp.isoformat(),
            "status": msg.status.value
        })

    return {
        "metrics": {
            "total_leads": total_leads,
            "new_leads": new_count,
            "outreach_sent": sent_count,
            "ongoing_conversations": ongoing_count,
            "finalized": finalized_count,
            "response_rate": response_rate
        },
        "recent_activities": recent_activities
    }
