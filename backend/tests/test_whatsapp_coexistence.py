import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import engine, Base


@pytest.mark.asyncio
async def test_embedded_signup_and_coexistence_echoes():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Step 1: Test token exchange endpoint with Embedded Signup payload
        exchange_res = await client.post(
            "/api/whatsapp/exchange-token",
            json={
                "code": "test_auth_code_mock",
                "phone_number_id": "104829102938472",
                "waba_id": "1811181826536139"
            }
        )
        assert exchange_res.status_code == 200
        data = exchange_res.json()
        assert data["success"] is True
        assert data["phone_number_id"] == "104829102938472"

        import uuid
        test_email = f"coex_{uuid.uuid4().hex[:8]}@example.com"
        test_phone = f"+447999{uuid.uuid4().int % 1000000:06d}"
        clean_phone = test_phone.lstrip("+")
        # Step 2: Register user and create a test lead to test coexistence echo
        reg_res = await client.post(
            "/api/auth/register",
            json={"name": "Coex Specialist", "email": test_email, "password": "securepassword"}
        )
        assert reg_res.status_code == 200
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        lead_res = await client.post(
            "/api/leads",
            json={
                "business_name": "York Artisan Bakery",
                "phone_number": test_phone,
                "formatted_phone": test_phone,
                "phone_type": "mobile",
                "address": "14 Fossgate, York YO1 9TA"
            },
            headers=headers
        )
        assert lead_res.status_code == 201
        lead_id = lead_res.json()["id"]

        # Step 3: Send smb_message_echoes payload to the webhook
        # (This simulates a message sent manually by the user on the WhatsApp Business phone app)
        webhook_payload = {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "id": "1811181826536139",
                    "changes": [
                        {
                            "field": "messages",
                            "value": {
                                "messaging_product": "whatsapp",
                                "metadata": {
                                    "display_phone_number": "447123456789",
                                    "phone_number_id": "104829102938472"
                                },
                                "smb_message_echoes": [
                                    {
                                        "from": "447123456789",
                                        "to": clean_phone,
                                        "id": "wamid.coex_echo_12345",
                                        "timestamp": "1725968400",
                                        "type": "text",
                                        "text": {
                                            "body": "Hi! I just sent this manually from my WhatsApp Business mobile app on my phone."
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        }

        webhook_res = await client.post("/api/whatsapp/webhook", json=webhook_payload)
        assert webhook_res.status_code == 200

        # Step 4: Verify that the echo message was synced into the lead's thread
        thread_res = await client.get(f"/api/messaging/threads/{lead_id}/messages", headers=headers)
        assert thread_res.status_code == 200
        thread_data = thread_res.json()
        assert len(thread_data["messages"]) >= 1

        last_msg = thread_data["messages"][-1]
        assert last_msg["direction"] == "outbound"
        assert "manually from my WhatsApp Business mobile app" in last_msg["content"]
        assert last_msg["whatsapp_message_id"] == "wamid.coex_echo_12345"
