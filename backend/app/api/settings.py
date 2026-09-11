from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.core.config import settings, persist_env_keys
from app.api.deps import get_current_user
from app.models.user import User
from app.services.whatsapp_api import whatsapp_service

router = APIRouter(prefix="/settings", tags=["Settings"])


class SettingsUpdate(BaseModel):
    gemini_api_key: Optional[str] = None
    google_maps_api_key: Optional[str] = None
    whatsapp_app_id: Optional[str] = None
    whatsapp_config_id: Optional[str] = None
    whatsapp_app_secret: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_business_account_id: Optional[str] = None
    whatsapp_access_token: Optional[str] = None
    whatsapp_verify_token: Optional[str] = None
    whatsapp_mock_mode: Optional[bool] = None


@router.get("")
@router.get("/")
async def get_settings(current_user: User = Depends(get_current_user)):
    # Mask sensitive keys for UI display
    def mask(val: Optional[str]) -> Optional[str]:
        if not val:
            return ""
        if len(val) <= 8:
            return "••••••••"
        return val[:4] + "••••••••" + val[-4:]

    return {
        "gemini_api_key_configured": bool(settings.GEMINI_API_KEY and not settings.GEMINI_API_KEY.startswith("YOUR_")),
        "google_maps_api_key_configured": bool(settings.GOOGLE_MAPS_API_KEY and not settings.GOOGLE_MAPS_API_KEY.startswith("YOUR_")),
        "whatsapp_configured": bool(settings.WHATSAPP_PHONE_NUMBER_ID and settings.WHATSAPP_ACCESS_TOKEN),
        "whatsapp_app_id": settings.WHATSAPP_APP_ID,
        "whatsapp_config_id": settings.WHATSAPP_CONFIG_ID,
        "whatsapp_app_secret_configured": bool(settings.WHATSAPP_APP_SECRET),
        "whatsapp_phone_number_id": settings.WHATSAPP_PHONE_NUMBER_ID or "",
        "whatsapp_business_account_id": settings.WHATSAPP_BUSINESS_ACCOUNT_ID or "",
        "whatsapp_verify_token": settings.WHATSAPP_VERIFY_TOKEN,
        "whatsapp_mock_mode": settings.WHATSAPP_MOCK_MODE,
        "gemini_masked": mask(settings.GEMINI_API_KEY),
        "google_maps_masked": mask(settings.GOOGLE_MAPS_API_KEY),
        "whatsapp_token_masked": mask(settings.WHATSAPP_ACCESS_TOKEN),
        "whatsapp_secret_masked": mask(settings.WHATSAPP_APP_SECRET)
    }


@router.post("")
@router.post("/")
async def update_settings(body: SettingsUpdate, current_user: User = Depends(get_current_user)):
    updates_to_persist = {}

    if body.gemini_api_key is not None and body.gemini_api_key.strip():
        settings.GEMINI_API_KEY = body.gemini_api_key.strip()
        updates_to_persist["GEMINI_API_KEY"] = settings.GEMINI_API_KEY
    if body.google_maps_api_key is not None and body.google_maps_api_key.strip():
        settings.GOOGLE_MAPS_API_KEY = body.google_maps_api_key.strip()
        updates_to_persist["GOOGLE_MAPS_API_KEY"] = settings.GOOGLE_MAPS_API_KEY
    if body.whatsapp_app_id is not None and body.whatsapp_app_id.strip():
        settings.WHATSAPP_APP_ID = body.whatsapp_app_id.strip()
        updates_to_persist["WHATSAPP_APP_ID"] = settings.WHATSAPP_APP_ID
    if body.whatsapp_config_id is not None and body.whatsapp_config_id.strip():
        settings.WHATSAPP_CONFIG_ID = body.whatsapp_config_id.strip()
        updates_to_persist["WHATSAPP_CONFIG_ID"] = settings.WHATSAPP_CONFIG_ID
    if body.whatsapp_app_secret is not None and body.whatsapp_app_secret.strip():
        settings.WHATSAPP_APP_SECRET = body.whatsapp_app_secret.strip()
        updates_to_persist["WHATSAPP_APP_SECRET"] = settings.WHATSAPP_APP_SECRET
    if body.whatsapp_phone_number_id is not None:
        settings.WHATSAPP_PHONE_NUMBER_ID = body.whatsapp_phone_number_id.strip()
        updates_to_persist["WHATSAPP_PHONE_NUMBER_ID"] = settings.WHATSAPP_PHONE_NUMBER_ID
    if body.whatsapp_business_account_id is not None:
        settings.WHATSAPP_BUSINESS_ACCOUNT_ID = body.whatsapp_business_account_id.strip()
        updates_to_persist["WHATSAPP_BUSINESS_ACCOUNT_ID"] = settings.WHATSAPP_BUSINESS_ACCOUNT_ID
    if body.whatsapp_access_token is not None and body.whatsapp_access_token.strip():
        settings.WHATSAPP_ACCESS_TOKEN = body.whatsapp_access_token.strip()
        updates_to_persist["WHATSAPP_ACCESS_TOKEN"] = settings.WHATSAPP_ACCESS_TOKEN
    if body.whatsapp_verify_token is not None and body.whatsapp_verify_token.strip():
        settings.WHATSAPP_VERIFY_TOKEN = body.whatsapp_verify_token.strip()
        updates_to_persist["WHATSAPP_VERIFY_TOKEN"] = settings.WHATSAPP_VERIFY_TOKEN
    if body.whatsapp_mock_mode is not None:
        settings.WHATSAPP_MOCK_MODE = body.whatsapp_mock_mode
        updates_to_persist["WHATSAPP_MOCK_MODE"] = settings.WHATSAPP_MOCK_MODE

    # Persist all updated configurations to backend .env file
    if updates_to_persist:
        persist_env_keys(updates_to_persist)

    # Immediately sync the WhatsApp API service singleton
    whatsapp_service.phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
    whatsapp_service.access_token = settings.WHATSAPP_ACCESS_TOKEN
    whatsapp_service.mock_mode = settings.WHATSAPP_MOCK_MODE

    return {"success": True, "message": "Settings saved to .env and applied successfully"}
