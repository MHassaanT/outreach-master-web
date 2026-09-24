import io
import uuid
import openpyxl
from unittest.mock import patch, AsyncMock
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import engine, Base
from app.core.config import settings

MOCK_RAW_PLACES = [
    {
        "id": "place_sample_1",
        "displayName": {"text": "York Artisan Bakery"},
        "formattedAddress": "14 Fossgate, York YO1 9TA, UK",
        "nationalPhoneNumber": "07712 345678",
        "internationalPhoneNumber": "+44 7712 345678",
        "websiteUri": None,
        "rating": 4.8,
        "userRatingCount": 92
    },
    {
        "id": "place_sample_2",
        "displayName": {"text": "Stonegate Traditional Bistro"},
        "formattedAddress": "28 Stonegate, York YO1 8AS, UK",
        "nationalPhoneNumber": "01904 623456",
        "internationalPhoneNumber": "+44 1904 623456",
        "websiteUri": None,
        "rating": 4.5,
        "userRatingCount": 140
    }
]


@pytest.mark.asyncio
async def test_agent_lead_search_and_pipeline_import():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    orig_gkey = settings.GOOGLE_MAPS_API_KEY
    settings.GOOGLE_MAPS_API_KEY = "test_gmaps_api_key_12345"

    try:
        test_email = f"researcher_{uuid.uuid4().hex[:8]}@example.com"
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Register user
            reg_res = await client.post(
                "/api/auth/register",
                json={"name": "Lead Researcher", "email": test_email, "password": "securepassword"}
            )
            token = reg_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            with patch("app.services.places.PlacesService.search_places", new_callable=AsyncMock) as mock_search:
                mock_search.return_value = MOCK_RAW_PLACES

                agent_res = await client.post(
                    "/api/agent/chat",
                    json={"message": "Find me 10 food points in York that does not have a website and do have a phone number not landline"},
                    headers=headers
                )
                assert agent_res.status_code == 200
                agent_data = agent_res.json()
                assert "reply" in agent_data
                leads = agent_data.get("leads", [])
                assert len(leads) == 1

                # Verify lead has no website and is mobile verified
                lead = leads[0]
                assert lead["website"] is None or lead["website"] == ""
                assert lead["is_mobile"] is True
                assert lead["phone_number"].startswith("+447")

                # Bulk import leads to pipeline
                import_res = await client.post(
                    "/api/leads/bulk-import",
                    json=leads,
                    headers=headers
                )
                assert import_res.status_code == 200
                res_json = import_res.json()
                assert res_json["imported_count"] == 1

                # Verify leads in pipeline
                pipeline_res = await client.get("/api/leads", headers=headers)
                assert pipeline_res.status_code == 200
                pipeline_leads = pipeline_res.json()
                assert len(pipeline_leads) == 1
                assert pipeline_leads[0]["business_name"] == "York Artisan Bakery"
    finally:
        settings.GOOGLE_MAPS_API_KEY = orig_gkey


@pytest.mark.asyncio
async def test_csv_lead_import():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_email = f"importer_csv_{uuid.uuid4().hex[:8]}@example.com"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg_res = await client.post(
            "/api/auth/register",
            json={"name": "CSV Importer", "email": test_email, "password": "securepassword"}
        )
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create sample CSV with Name, Phone Number, Location
        csv_data = (
            "Name,Phone Number,Location\n"
            "The Artisan Coffee Roast,+44 7700 900123,\"15 Regent Street, London\"\n"
            "Harbor Seafood Grill,07700900456,\"22 Ocean Way, Bristol\"\n"
            "The Artisan Coffee Roast,+44 7700 900123,\"Duplicate row in same file\"\n"
        ).encode("utf-8")

        files = {"file": ("leads_test.csv", csv_data, "text/csv")}
        res = await client.post("/api/leads/import-file", files=files, headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["total_rows"] == 3
        assert data["imported_count"] == 2
        assert data["skipped_count"] == 1  # 1 duplicate within file

        # Check imported leads in database
        leads_res = await client.get("/api/leads", headers=headers)
        assert leads_res.status_code == 200
        leads = leads_res.json()
        names = [l["business_name"] for l in leads]
        assert "The Artisan Coffee Roast" in names
        assert "Harbor Seafood Grill" in names

        # Check location was mapped to address
        artisan = next(l for l in leads if l["business_name"] == "The Artisan Coffee Roast")
        assert "Regent Street" in artisan["address"]
        assert artisan["status"] == "new"


@pytest.mark.asyncio
async def test_excel_lead_import():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_email = f"importer_xlsx_{uuid.uuid4().hex[:8]}@example.com"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg_res = await client.post(
            "/api/auth/register",
            json={"name": "Excel Importer", "email": test_email, "password": "securepassword"}
        )
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create an in-memory .xlsx file using openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Leads"
        ws.append(["Name", "Phone Number", "Location"])
        ws.append(["Piccadilly Bakery", "+44 7700 900789", "Piccadilly Circus, London"])
        ws.append(["Soho Burger Bar", "+44 7700 900999", "Dean Street, Soho"])

        excel_buffer = io.BytesIO()
        wb.save(excel_buffer)
        excel_bytes = excel_buffer.getvalue()

        files = {"file": ("prospects.xlsx", excel_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        res = await client.post("/api/leads/import-file", files=files, headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["imported_count"] == 2
        assert data["skipped_count"] == 0

        # Verify second upload of the same file reports them as duplicates
        res2 = await client.post("/api/leads/import-file", files=files, headers=headers)
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["imported_count"] == 0
        assert data2["skipped_count"] == 2

