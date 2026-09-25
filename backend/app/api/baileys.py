import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.api.deps import get_current_user
from app.models.user import User
from app.services.baileys_client import baileys_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/baileys", tags=["Baileys WhatsApp Web Bridge"])


class VerifySingleRequest(BaseModel):
    number: str


class VerifyNumbersRequest(BaseModel):
    numbers: List[str]


@router.get("/status")
async def get_baileys_status(current_user: User = Depends(get_current_user)):
    """Get Baileys connection status, current pairing QR code, and connected user details."""
    return await baileys_service.get_status()


@router.post("/connect")
async def connect_baileys(current_user: User = Depends(get_current_user)):
    """Initialize Baileys WhatsApp socket and generate pairing QR code."""
    res = await baileys_service.connect()
    if res.get("status") == "unreachable":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baileys WhatsApp service is offline or unreachable on port 3001. Please make sure the service is running."
        )
    return res


@router.post("/disconnect")
async def disconnect_baileys(current_user: User = Depends(get_current_user)):
    """Disconnect Baileys socket and log out from WhatsApp Web."""
    return await baileys_service.disconnect()


@router.post("/verify-single")
async def verify_single_number(
    body: VerifySingleRequest,
    current_user: User = Depends(get_current_user)
):
    """Test whether a single phone number is registered on WhatsApp using onWhatsApp()."""
    status_info = await baileys_service.get_status()
    if not status_info.get("connected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WhatsApp is not connected. Please pair with QR code first."
        )
    return await baileys_service.verify_single(body.number)


@router.post("/verify-numbers")
async def verify_numbers_batch(
    body: VerifyNumbersRequest,
    current_user: User = Depends(get_current_user)
):
    """Verify a batch of phone numbers against onWhatsApp()."""
    status_info = await baileys_service.get_status()
    if not status_info.get("connected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WhatsApp is not connected. Please pair with QR code first."
        )
    return await baileys_service.verify_numbers(body.numbers)
