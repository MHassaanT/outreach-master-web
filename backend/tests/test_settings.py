import uuid
import os
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import engine, Base
from app.core.config import settings, ENV_FILE_PATH
from app.services.whatsapp_api import whatsapp_service


@pytest.mark.asyncio
async def test_update_settings_persists_to_env():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_email = f"settings_test_{uuid.uuid4().hex[:8]}@example.com"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg_res = await client.post(
            "/api/auth/register",
            json={"name": "Settings Tester", "email": test_email, "password": "securepassword"}
        )
        assert reg_res.status_code == 200
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        test_token = f"EAAG_TEST_TOKEN_{uuid.uuid4().hex[:12]}"
        test_phone_id = "998877665544332"
        test_waba_id = "112233445566778"

        # Update settings via API
        update_res = await client.post(
            "/api/settings",
            json={
                "whatsapp_access_token": test_token,
                "whatsapp_phone_number_id": test_phone_id,
                "whatsapp_business_account_id": test_waba_id,
                "whatsapp_mock_mode": False
            },
            headers=headers
        )
        assert update_res.status_code == 200
        assert update_res.json()["success"] is True

        # Check in-memory settings
        assert settings.WHATSAPP_ACCESS_TOKEN == test_token
        assert settings.WHATSAPP_PHONE_NUMBER_ID == test_phone_id
        assert settings.WHATSAPP_BUSINESS_ACCOUNT_ID == test_waba_id
        assert settings.WHATSAPP_MOCK_MODE is False

        # Check whatsapp_service singleton
        assert whatsapp_service.access_token == test_token
        assert whatsapp_service.phone_number_id == test_phone_id
        assert whatsapp_service.mock_mode is False
        assert test_phone_id in whatsapp_service.base_url

        # Check .env file contents
        assert os.path.exists(ENV_FILE_PATH)
        with open(ENV_FILE_PATH, "r", encoding="utf-8") as f:
            env_content = f.read()

        assert f'WHATSAPP_ACCESS_TOKEN="{test_token}"' in env_content
        assert f'WHATSAPP_PHONE_NUMBER_ID="{test_phone_id}"' in env_content
        assert f'WHATSAPP_BUSINESS_ACCOUNT_ID="{test_waba_id}"' in env_content
        assert 'WHATSAPP_MOCK_MODE=False' in env_content
