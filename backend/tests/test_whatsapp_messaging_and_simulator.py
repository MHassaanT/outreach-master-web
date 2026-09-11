import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import engine, Base


@pytest.mark.asyncio
async def test_outreach_messaging_lifecycle():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_email = f"specialist_{uuid.uuid4().hex[:8]}@example.com"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg_res = await client.post(
            "/api/auth/register",
            json={"name": "Outreach Specialist", "email": test_email, "password": "securepassword"}
        )
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create a lead in NEW status
        lead_res = await client.post(
            "/api/leads",
            json={
                "business_name": "York Smokehouse Barbecue",
                "phone_number": "+447955667788",
                "formatted_phone": "07955 667788",
                "phone_type": "mobile",
                "address": "Castlegate, York YO1 9RN, UK"
            },
            headers=headers
        )
        assert lead_res.status_code == 201
        lead_id = lead_res.json()["id"]

        # Step 1: Send cold outreach template
        template_res = await client.post(
            f"/api/messaging/threads/{lead_id}/send-template",
            json={
                "template_name": "initial_outreach",
                "language_code": "en_US",
                "parameters": ["York Smokehouse Barbecue"]
            },
            headers=headers
        )
        assert template_res.status_code == 200
        assert template_res.json()["success"] is True

        # Check that lead status transitioned to OUTREACH_SENT
        lead_check = await client.get(f"/api/leads/{lead_id}", headers=headers)
        assert lead_check.json()["status"] == "outreach_sent"

        # Step 2: Simulate WhatsApp customer reply from this lead
        sim_res = await client.post(
            "/api/simulator/reply",
            json={
                "lead_id": lead_id,
                "reply_text": "Hi, we are very interested. What are your pricing plans?"
            },
            headers=headers
        )
        assert sim_res.status_code == 200
        assert sim_res.json()["lead_status"] == "ongoing"

        # Check that lead status transitioned to ONGOING and thread reflects the reply
        thread_res = await client.get(f"/api/messaging/threads/{lead_id}/messages", headers=headers)
        assert thread_res.status_code == 200
        thread_data = thread_res.json()
        assert thread_data["lead"]["status"] == "ongoing"
        assert thread_data["lead"]["window_active"] is True
        assert len(thread_data["messages"]) == 2  # 1 outbound template, 1 inbound reply

        # Step 3: Send freeform response (within active 24h window)
        text_res = await client.post(
            f"/api/messaging/threads/{lead_id}/send-text",
            json={"content": "Great to hear! Here is a link to our catalog."},
            headers=headers
        )
        assert text_res.status_code == 200
        assert text_res.json()["success"] is True

        # Step 4: Mark lead as FINALIZED
        status_res = await client.patch(
            f"/api/leads/{lead_id}/status",
            json={"status": "finalized"},
            headers=headers
        )
        assert status_res.status_code == 200
        assert status_res.json()["status"] == "finalized"

        # Step 5: Verify dashboard statistics accurately reflect the finalized lead and conversation
        dash_res = await client.get("/api/dashboard/stats", headers=headers)
        metrics = dash_res.json()["metrics"]
        assert metrics["finalized"] >= 1
        assert metrics["response_rate"] > 0
