import uuid
from unittest.mock import patch, AsyncMock
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import engine, Base
from app.models.lead import Lead, LeadStatus


@pytest.mark.asyncio
async def test_baileys_status_and_verification_endpoints():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg_res = await client.post(
            "/api/auth/register",
            json={"name": "Baileys Tester", "email": f"baileys_{uuid.uuid4().hex[:8]}@example.com", "password": "password123"}
        )
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Mock get_status
        with patch("app.services.baileys_client.BaileysClient.get_status", new_callable=AsyncMock) as mock_status:
            mock_status.return_value = {
                "status": "connected",
                "connected": True,
                "qr": None,
                "user": {"phone": "+447700900111", "name": "Test Device"}
            }

            status_res = await client.get("/api/baileys/status", headers=headers)
            assert status_res.status_code == 200
            assert status_res.json()["connected"] is True
            assert status_res.json()["user"]["phone"] == "+447700900111"

        # Mock single verify
        with patch("app.services.baileys_client.BaileysClient.get_status", new_callable=AsyncMock) as mock_status:
            mock_status.return_value = {"connected": True}
            with patch("app.services.baileys_client.BaileysClient.verify_single", new_callable=AsyncMock) as mock_single:
                mock_single.return_value = {
                    "number": "+44 7700 900222",
                    "exists": True,
                    "jid": "447700900222@s.whatsapp.net"
                }

                verify_res = await client.post(
                    "/api/baileys/verify-single",
                    json={"number": "+44 7700 900222"},
                    headers=headers
                )
                assert verify_res.status_code == 200
                assert verify_res.json()["exists"] is True
                assert verify_res.json()["jid"] == "447700900222@s.whatsapp.net"


@pytest.mark.asyncio
async def test_csv_import_with_on_whatsapp_filtering():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg_res = await client.post(
            "/api/auth/register",
            json={"name": "WhatsApp Filter Tester", "email": f"filter_{uuid.uuid4().hex[:8]}@example.com", "password": "password123"}
        )
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # CSV with two leads: one on WhatsApp, one not on WhatsApp
        csv_data = (
            "Name,Phone Number,Location,Rating\n"
            "Active WhatsApp Cafe,+44 7700 900555,\"1 Baker St, London\",4.8\n"
            "Non WhatsApp Landline,+44 20 7946 0999,\"2 Offline Rd, London\",4.2\n"
        ).encode("utf-8")

        files = {"file": ("leads.csv", csv_data, "text/csv")}

        with patch("app.services.baileys_client.BaileysClient.get_status", new_callable=AsyncMock) as mock_status:
            mock_status.return_value = {"connected": True}

            with patch("app.services.baileys_client.BaileysClient.verify_numbers", new_callable=AsyncMock) as mock_batch:
                # Active WhatsApp Cafe exists, Landline does not exist
                mock_batch.return_value = {
                    "+447700900555": True,
                    "+442079460999": False
                }

                res = await client.post(
                    "/api/leads/import-file?verify_whatsapp=true",
                    files=files,
                    headers=headers
                )
                assert res.status_code == 200
                data = res.json()
                assert data["success"] is True
                assert data["total_rows"] == 2
                assert data["imported_count"] == 1
                assert data["filtered_non_whatsapp_count"] == 1
                assert data["skipped_count"] == 1

                # Check leads in database: only Active WhatsApp Cafe should be added
                pipeline_res = await client.get("/api/leads", headers=headers)
                assert pipeline_res.status_code == 200
                leads = pipeline_res.json()
                lead_names = [l["business_name"] for l in leads]
                assert "Active WhatsApp Cafe" in lead_names
                assert "Non WhatsApp Landline" not in lead_names


@pytest.mark.asyncio
async def test_lead_edit_and_bulk_delete():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg_res = await client.post(
            "/api/auth/register",
            json={"name": "Manager", "email": f"manager_{uuid.uuid4().hex[:8]}@example.com", "password": "password123"}
        )
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create 3 leads
        created_ids = []
        for i in range(1, 4):
            c_res = await client.post(
                "/api/leads",
                json={
                    "business_name": f"Lead Number {i}",
                    "phone_number": f"+44 7700 900{i:03d}",
                    "address": f"Address {i}"
                },
                headers=headers
            )
            assert c_res.status_code in (200, 201)
            created_ids.append(c_res.json()["id"])

        # Edit first lead
        lead1_id = created_ids[0]
        update_res = await client.put(
            f"/api/leads/{lead1_id}",
            json={
                "business_name": "Updated Lead Number 1",
                "contact_name": "Alice Smith",
                "phone_number": "+44 7700 900888",
                "rating": 4.9,
                "notes": "Premium prospect",
                "status": "ongoing"
            },
            headers=headers
        )
        assert update_res.status_code == 200
        updated_data = update_res.json()
        assert updated_data["business_name"] == "Updated Lead Number 1"
        assert updated_data["contact_name"] == "Alice Smith"
        assert updated_data["rating"] == 4.9
        assert updated_data["status"] == "ongoing"
        assert updated_data["notes"] == "Premium prospect"

        # Bulk delete remaining 2 leads
        delete_ids = [created_ids[1], created_ids[2]]
        bulk_del_res = await client.post(
            "/api/leads/bulk-delete",
            json={"lead_ids": delete_ids},
            headers=headers
        )
        assert bulk_del_res.status_code == 200
        del_data = bulk_del_res.json()
        assert del_data["success"] is True
        assert del_data["deleted_count"] == 2

        # Verify only lead1 remains and deleted leads are gone
        leads_res = await client.get("/api/leads", headers=headers)
        leads = leads_res.json()
        remaining_ids = {l["id"] for l in leads}
        assert lead1_id in remaining_ids
        assert created_ids[1] not in remaining_ids
        assert created_ids[2] not in remaining_ids


@pytest.mark.asyncio
async def test_uk_phone_normalization_07xxx_conversion():
    from app.services.phone_filter import normalize_phone

    # Direct unit tests for normalize_phone
    test_cases = [
        ("07123456789", "+447123456789", "+44 7123 456789"),
        ("07123 456789", "+447123456789", "+44 7123 456789"),
        ("7123456789", "+447123456789", "+44 7123 456789"),
        ("+44 (0) 7123 456789", "+447123456789", "+44 7123 456789"),
        ("00447123456789", "+447123456789", "+44 7123 456789"),
        ("+447123456789", "+447123456789", "+44 7123 456789"),
        ("07123456789.0", "+447123456789", "+44 7123 456789"),
    ]
    for raw, expected_e164, expected_formatted in test_cases:
        e164, formatted = normalize_phone(raw)
        assert e164 == expected_e164, f"Failed e164 for {raw}: got {e164}"
        assert formatted == expected_formatted, f"Failed formatted for {raw}: got {formatted}"

    # Test CSV import with 07xxx format
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        reg_res = await client.post(
            "/api/auth/register",
            json={"name": "UK Format Tester", "email": f"uk_{uuid.uuid4().hex[:8]}@example.com", "password": "password123"}
        )
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Generate two distinct random unique 9 digits for UK mobile leads
        rand_a = f"91{uuid.uuid4().int % 10000000:07d}"
        rand_b = f"92{uuid.uuid4().int % 10000000:07d}"
        raw_bakery = f"07{rand_a}"
        raw_shop = f"7{rand_b}"
        raw_update = f"078{rand_a[1:]}"

        csv_content = (
            "Name,Phone Number,Location,Rating\n"
            f"Domestic UK Bakery,{raw_bakery},\"10 King St, Manchester\",4.9\n"
            f"Excel Domestic Shop,{raw_shop},\"12 Queen St, Birmingham\",4.8\n"
        ).encode("utf-8")

        files = {"file": ("domestic_leads.csv", csv_content, "text/csv")}
        import_res = await client.post(
            "/api/leads/import-file?verify_whatsapp=false",
            files=files,
            headers=headers
        )
        assert import_res.status_code == 200
        data = import_res.json()
        assert data["imported_count"] == 2

        # Verify converted format in database
        leads_res = await client.get("/api/leads", headers=headers)
        assert leads_res.status_code == 200
        leads = leads_res.json()

        bakery = next(l for l in leads if l["business_name"] == "Domestic UK Bakery")
        assert bakery["phone_number"] == f"+447{rand_a}"
        assert bakery["formatted_phone"].startswith("+44 7")

        shop = next(l for l in leads if l["business_name"] == "Excel Domestic Shop")
        assert shop["phone_number"] == f"+447{rand_b}"
        assert shop["formatted_phone"].startswith("+44 7")

        # Update lead with domestic format via PUT endpoint
        update_res = await client.put(
            f"/api/leads/{bakery['id']}",
            json={"phone_number": raw_update},
            headers=headers
        )
        assert update_res.status_code == 200
        updated = update_res.json()
        assert updated["phone_number"] == f"+4478{rand_a[1:]}"
        assert updated["formatted_phone"].startswith("+44 7")

