import pytest
from app.services.places import PlacesService

SAMPLE_PLACES = [
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
    },
    {
        "id": "place_sample_3",
        "displayName": {"text": "Micklegate Gourmet Burgers"},
        "formattedAddress": "55 Micklegate, York YO1 6LJ, UK",
        "nationalPhoneNumber": "07888 123456",
        "internationalPhoneNumber": "+44 7888 123456",
        "websiteUri": "https://micklegategourmet.co.uk",
        "rating": 4.2,
        "userRatingCount": 78
    }
]


def test_places_qualification_filter():
    service = PlacesService(api_key="test_key")
    result = service.filter_and_format_leads(
        raw_places=SAMPLE_PLACES,
        require_no_website=True,
        require_mobile_only=True,
        target_count=10,
        default_region="GB"
    )

    # Assert qualified leads are returned
    assert result["qualified_count"] == 1
    assert len(result["leads"]) == 1

    # Ensure qualified lead has no website and is mobile verified
    lead = result["leads"][0]
    assert lead["website"] is None or lead["website"] == ""
    assert lead["is_mobile"] is True
    assert lead["phone_number"] == "+447712345678"

    # Verify that landlines and website owners were recorded in stats
    stats = result["filtered_out_stats"]
    assert stats["landline_rejected"] == 1  # Stonegate was landline (01904)
    assert stats["has_website"] == 1       # Micklegate had website
