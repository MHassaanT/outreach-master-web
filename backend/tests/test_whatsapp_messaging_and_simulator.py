import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import engine, Base
from app.services.whatsapp_api import whatsapp_service


@pytest.mark.asyncio
async def test_outreach_messaging_lifecycle():
    whatsapp_service.mock_mode = True
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


@pytest.mark.asyncio
async def test_whatsapp_webhook_matches_spaced_phone_lead():
    whatsapp_service.mock_mode = True
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_email = f"matcher_{uuid.uuid4().hex[:8]}@example.com"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg_res = await client.post(
            "/api/auth/register",
            json={"name": "Matcher Specialist", "email": test_email, "password": "securepassword"}
        )
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create lead with spaced phone number
        lead_res = await client.post(
            "/api/leads",
            json={
                "business_name": "Karikku Street Food",
                "phone_number": "+44 7349 625505",
                "rating": 4.9,
                "notes": "Food stall in Cambridge"
            },
            headers=headers
        )
        assert lead_res.status_code == 201
        lead_data = lead_res.json()
        lead_id = lead_data["id"]
        # Verify phone is normalized cleanly
        assert lead_data["phone_number"] == "+447349625505"

        # 2. Send outreach template
        template_res = await client.post(
            f"/api/messaging/threads/{lead_id}/send-template",
            json={
                "template_name": "outreach_template_1",
                "language_code": "en",
                "parameters": ["4.9", "Karikku Street Food"]
            },
            headers=headers
        )
        assert template_res.status_code == 200
        assert template_res.json()["success"] is True

        # 3. Webhook received from Meta with clean digits "447349625505" and profile "karikku"
        webhook_payload = {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "id": "1062154059927271",
                    "changes": [
                        {
                            "field": "messages",
                            "value": {
                                "messaging_product": "whatsapp",
                                "contacts": [
                                    {
                                        "profile": {"name": "karikku"},
                                        "wa_id": "447349625505"
                                    }
                                ],
                                "messages": [
                                    {
                                        "from": "447349625505",
                                        "id": "wamid.test_reply_12345",
                                        "timestamp": "1725969999",
                                        "type": "text",
                                        "text": {
                                            "body": "Thank you for contacting karikkustreetfood! We are interested."
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        }
        wb_res = await client.post("/api/whatsapp/webhook", json=webhook_payload)
        assert wb_res.status_code == 200

        # 4. Verify reply was attached to the SAME thread (lead_id)
        thread_res = await client.get(f"/api/messaging/threads/{lead_id}/messages", headers=headers)
        assert thread_res.status_code == 200
        thread_data = thread_res.json()
        assert thread_data["lead"]["status"] == "ongoing"
        assert thread_data["lead"]["window_active"] is True
        assert len(thread_data["messages"]) == 2
        assert thread_data["messages"][0]["direction"] == "outbound"
        assert thread_data["messages"][1]["direction"] == "inbound"
        assert "Thank you for contacting" in thread_data["messages"][1]["content"]

        # 5. Verify NO duplicate lead was created
        leads_res = await client.get("/api/leads", headers=headers)
        all_leads = leads_res.json()
        matching = [l for l in all_leads if "7349625505" in l["phone_number"]]
        assert len(matching) == 1
        assert matching[0]["business_name"] == "Karikku Street Food"


@pytest.mark.asyncio
async def test_auto_merge_existing_split_threads():
    whatsapp_service.mock_mode = True
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_email = f"merger_{uuid.uuid4().hex[:8]}@example.com"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        reg_res = await client.post(
            "/api/auth/register",
            json={"name": "Merger Specialist", "email": test_email, "password": "securepassword"}
        )
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Simulate pre-existing split leads in the database
        from app.core.database import AsyncSessionLocal
        from app.models.lead import Lead, LeadStatus
        from app.models.message import Message, MessageDirection, MessageStatus, MessageType
        from datetime import datetime, timezone

        unique_digits = f"{uuid.uuid4().int % 900000 + 100000}"
        spaced_phone = f"+44 7999 {unique_digits}"
        clean_phone = f"+447999{unique_digits}"
        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            # Lead 1: Original outreach with spaces
            lead1 = Lead(
                business_name="Artisan Bakery Original",
                phone_number=spaced_phone,
                formatted_phone=spaced_phone,
                phone_type="mobile",
                status=LeadStatus.OUTREACH_SENT,
                notes=""
            )
            session.add(lead1)
            await session.flush()

            msg1 = Message(
                lead_id=lead1.id,
                direction=MessageDirection.OUTBOUND,
                message_type=MessageType.TEMPLATE,
                content="Template: outreach_template_1 (Params: 4.9, Artisan Bakery Original)",
                status=MessageStatus.SENT,
                timestamp=now
            )
            session.add(msg1)

            # Lead 2: Auto-created from incoming reply
            lead2 = Lead(
                business_name="artisanbakery",
                phone_number=clean_phone,
                formatted_phone=clean_phone,
                phone_type="mobile",
                status=LeadStatus.ONGOING,
                notes="Auto-created from incoming WhatsApp message",
                last_reply_at=now
            )
            session.add(lead2)
            await session.flush()

            msg2 = Message(
                lead_id=lead2.id,
                direction=MessageDirection.INBOUND,
                message_type=MessageType.TEXT,
                content="Thank you for contacting artisanbakery! We are interested.",
                status=MessageStatus.DELIVERED,
                timestamp=now
            )
            session.add(msg2)
            await session.commit()
            lead1_id = lead1.id
            lead2_id = lead2.id

        # Call sync-threads API
        sync_res = await client.post("/api/messaging/sync-threads", headers=headers)
        assert sync_res.status_code == 200
        assert sync_res.json()["success"] is True

        # Verify duplicate lead is gone
        lead2_check = await client.get(f"/api/leads/{lead2_id}", headers=headers)
        assert lead2_check.status_code == 404

        # Verify primary lead has both messages and status ongoing
        primary_check = await client.get(f"/api/messaging/threads/{lead1_id}/messages", headers=headers)
        assert primary_check.status_code == 200
        data = primary_check.json()
        assert data["lead"]["status"] == "ongoing"
        assert len(data["messages"]) == 2
        assert data["messages"][0]["direction"] == "outbound"
        assert data["messages"][1]["direction"] == "inbound"
