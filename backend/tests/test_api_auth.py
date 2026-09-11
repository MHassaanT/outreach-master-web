import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import engine, Base


@pytest.mark.asyncio
async def test_auth_flow_and_protected_routes():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_email = f"sarah_{uuid.uuid4().hex[:8]}@example.com"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Health check
        health = await client.get("/health")
        assert health.status_code == 200

        # Unauthenticated access to dashboard should fail
        unauth_dash = await client.get("/api/dashboard/stats")
        assert unauth_dash.status_code == 401

        # Register a new user
        reg_res = await client.post(
            "/api/auth/register",
            json={
                "name": "Sarah Connor",
                "email": test_email,
                "password": "Password123!"
            }
        )
        assert reg_res.status_code == 200
        reg_data = reg_res.json()
        assert "access_token" in reg_data
        token = reg_data["access_token"]

        # Duplicate registration should return 400
        dup_res = await client.post(
            "/api/auth/register",
            json={
                "name": "Sarah Connor",
                "email": test_email,
                "password": "Password123!"
            }
        )
        assert dup_res.status_code == 400

        # Login with credentials
        login_res = await client.post(
            "/api/auth/login",
            json={
                "email": test_email,
                "password": "Password123!"
            }
        )
        assert login_res.status_code == 200
        assert "access_token" in login_res.json()

        # Access dashboard with token
        headers = {"Authorization": f"Bearer {token}"}
        dash_res = await client.get("/api/dashboard/stats", headers=headers)
        assert dash_res.status_code == 200
        metrics = dash_res.json()["metrics"]
        assert "total_leads" in metrics
        assert "ongoing_conversations" in metrics
        assert "finalized" in metrics
