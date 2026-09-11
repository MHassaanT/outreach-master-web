import logging
from typing import List, Dict, Any, Optional
import httpx
from app.core.config import settings
from app.services.phone_filter import analyze_phone_number

logger = logging.getLogger(__name__)


class PlacesService:
    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key
        self.new_places_url = "https://places.googleapis.com/v1/places:searchText"

    @property
    def api_key(self) -> Optional[str]:
        return self._api_key or settings.GOOGLE_MAPS_API_KEY

    @api_key.setter
    def api_key(self, val: Optional[str]):
        self._api_key = val

    async def search_places(self, query: str, page_size: int = 20) -> List[Dict[str, Any]]:
        """
        Executes Google Places API (New) text search against live Google Maps Platform.
        Requires a valid GOOGLE_MAPS_API_KEY.
        """
        if not self.api_key or self.api_key.startswith("YOUR_") or self.api_key.strip() == "":
            raise ValueError(
                "Google Maps Places API Key is not configured. "
                "Please configure your GOOGLE_MAPS_API_KEY in Settings to perform live searches."
            )

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": (
                "places.id,places.displayName,places.formattedAddress,"
                "places.nationalPhoneNumber,places.internationalPhoneNumber,"
                "places.websiteUri,places.rating,places.userRatingCount,"
                "places.types,places.businessStatus"
            )
        }
        payload = {
            "textQuery": query,
            "pageSize": min(page_size, 20)
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(self.new_places_url, headers=headers, json=payload)
            if response.status_code != 200:
                logger.error("Places API error: %d %s", response.status_code, response.text)
                raise RuntimeError(f"Google Places API error ({response.status_code}): {response.text}")

            data = response.json()
            return data.get("places", [])

    def filter_and_format_leads(
        self,
        raw_places: List[Dict[str, Any]],
        require_no_website: bool = True,
        require_mobile_only: bool = True,
        target_count: int = 10,
        default_region: str = "GB"
    ) -> Dict[str, Any]:
        """
        Filters raw Google Places results according to criteria:
        - No website (websiteUri is empty or None)
        - Has phone number
        - Phone number is verified MOBILE (rejects landline)
        """
        qualified_leads = []
        filtered_out_stats = {
            "has_website": 0,
            "no_phone": 0,
            "landline_rejected": 0,
            "invalid_phone": 0
        }

        for place in raw_places:
            display_name = place.get("displayName", {})
            business_name = display_name.get("text") if isinstance(display_name, dict) else str(display_name or "Unknown")
            website = place.get("websiteUri")
            formatted_address = place.get("formattedAddress")
            rating = place.get("rating")
            user_ratings_total = place.get("userRatingCount")
            raw_phone = place.get("internationalPhoneNumber") or place.get("nationalPhoneNumber")

            # Check website requirement
            if require_no_website and website and str(website).strip():
                filtered_out_stats["has_website"] += 1
                continue

            # Check phone requirement
            if not raw_phone:
                filtered_out_stats["no_phone"] += 1
                continue

            # Analyze phone with phonenumbers
            phone_analysis = analyze_phone_number(raw_phone, default_region=default_region)
            if not phone_analysis["is_valid"]:
                filtered_out_stats["invalid_phone"] += 1
                continue

            if require_mobile_only and not phone_analysis["is_mobile"]:
                filtered_out_stats["landline_rejected"] += 1
                continue

            lead_data = {
                "google_place_id": place.get("id"),
                "business_name": business_name,
                "phone_number": phone_analysis["e164"],
                "formatted_phone": phone_analysis["national"] or phone_analysis["international"],
                "phone_type": phone_analysis["type_name"],
                "is_mobile": phone_analysis["is_mobile"],
                "address": formatted_address,
                "website": website,
                "rating": rating,
                "user_ratings_total": user_ratings_total,
                "types": place.get("types", [])
            }
            qualified_leads.append(lead_data)

            if len(qualified_leads) >= target_count:
                break

        return {
            "total_searched": len(raw_places),
            "qualified_count": len(qualified_leads),
            "filtered_out_stats": filtered_out_stats,
            "leads": qualified_leads
        }
