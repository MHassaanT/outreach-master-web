import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.device_token import DeviceToken
from app.services.push_service import send_fcm_push

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["Mobile Push Notifications"])


class RegisterDeviceTokenRequest(BaseModel):
    token: str
    platform: Optional[str] = "android"


class TestPushRequest(BaseModel):
    title: Optional[str] = "Test Push Notification"
    body: Optional[str] = "This is a closed-app WhatsApp style notification from Outreach Master!"
    lead_id: Optional[int] = None


@router.post("/device-token")
async def register_device_token(
    body: RegisterDeviceTokenRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Registers or updates the mobile device FCM token for closed-app push notifications.
    """
    if not body.token or not body.token.strip():
        raise HTTPException(status_code=400, detail="Device token is required")

    clean_token = body.token.strip()
    now = datetime.now(timezone.utc)

    # Check if token already exists
    res = await db.execute(select(DeviceToken).where(DeviceToken.token == clean_token))
    existing = res.scalar_one_or_none()

    if existing:
        existing.user_id = current_user.id
        existing.platform = body.platform or "android"
        existing.updated_at = now
    else:
        new_token = DeviceToken(
            user_id=current_user.id,
            token=clean_token,
            platform=body.platform or "android",
            created_at=now,
            updated_at=now,
        )
        db.add(new_token)

    await db.commit()
    logger.info("Registered FCM device token for user %s (platform=%s)", current_user.email, body.platform)

    return {
        "success": True,
        "message": "Device token registered successfully for closed-app push notifications.",
        "platform": body.platform or "android",
    }


@router.delete("/device-token")
async def unregister_device_token(
    body: RegisterDeviceTokenRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Removes device token upon logout.
    """
    await db.execute(delete(DeviceToken).where(DeviceToken.token == body.token.strip()))
    await db.commit()
    return {"success": True, "message": "Device token removed."}


@router.post("/test-push")
async def send_test_push(
    body: Optional[TestPushRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dispatches an immediate test push to all registered devices for the current user.
    """
    title = body.title if body and body.title else "Outreach Master Test"
    message_body = body.body if body and body.body else "Closed-app push notification test successful!"
    lead_id = body.lead_id if body else None

    result = await send_fcm_push(
        db=db,
        title=title,
        body=message_body,
        lead_id=lead_id,
        user_id=current_user.id,
    )

    return result
