import re
import json
import logging
from typing import Dict, Any, List, Optional
from app.core.config import settings
from app.services.places import PlacesService

logger = logging.getLogger(__name__)


class GeminiLeadAgent:
    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key
        self.places_service = PlacesService()

    @property
    def api_key(self) -> Optional[str]:
        return self._api_key or settings.GEMINI_API_KEY

    @api_key.setter
    def api_key(self, val: Optional[str]):
        self._api_key = val

    def parse_intent_regex(self, user_message: str) -> Dict[str, Any]:
        """
        Regex intent parser to extract search terms, location, count, and filters.
        No hardcoded locations or cities.
        """
        text = user_message.strip()
        lower = text.lower()

        # Extract target count
        count = 10
        count_match = re.search(r'\b(\d+)\b', lower)
        if count_match:
            try:
                count = int(count_match.group(1))
            except ValueError:
                count = 10

        # Filter flags
        no_website = any(k in lower for k in ["no website", "does not have a website", "without website", "no web", "without a website"])
        mobile_only = any(k in lower for k in ["not landline", "mobile", "no landline", "cell", "non-landline"])

        # Extract location if pattern 'in <location>' exists
        location = ""
        loc_match = re.search(r'\bin\s+([a-zA-Z\s]+?)(?:\s+(?:that|who|with|which|and|without|where)|\.|\?|$)', text, re.IGNORECASE)
        if loc_match:
            location = loc_match.group(1).strip()

        # Build clean search query for Places API
        # Remove filler words and target count number from user query
        cleaned_query = re.sub(r'\b(find|search|get|me|give|that|does|not|have|a|do|and|with|without|website|phone|number|landline|mobile)\b', '', text, flags=re.IGNORECASE)
        cleaned_query = re.sub(rf'\b{count}\b', '', cleaned_query)
        cleaned_query = re.sub(r'\s+', ' ', cleaned_query).strip()
        if not cleaned_query:
            cleaned_query = text

        return {
            "query": cleaned_query,
            "location": location,
            "target_count": min(max(count, 1), 20),
            "require_no_website": no_website,
            "require_mobile_only": mobile_only,
            "country_code": "GB" if ("uk" in lower or "united kingdom" in lower) else "GB"
        }

    async def chat(self, user_message: str, history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        """
        Main agent chat loop.
        Connects strictly to live Gemini AI model and live Google Places API.
        """
        # Validate API keys
        if not settings.GOOGLE_MAPS_API_KEY or not settings.GOOGLE_MAPS_API_KEY.strip():
            return {
                "reply": "⚠️ **Google Maps API Key is required.** Please add your `GOOGLE_MAPS_API_KEY` in the **Settings** page to search places live on Google Maps.",
                "leads": [],
                "stats": {},
                "parsed_query": {}
            }

        # Step 1: Parse intent using Gemini if key is provided, or regex parser
        parsed = None
        if self.api_key and not self.api_key.startswith("YOUR_") and self.api_key.strip():
            try:
                from google import genai
                client = genai.Client(api_key=self.api_key)

                parse_prompt = (
                    f"Analyze this user lead prospecting request: '{user_message}'\n"
                    "Extract the search parameters into valid JSON with these exact keys:\n"
                    "- query: string (the optimized search query to send to Google Places API, e.g. 'restaurants in Leeds')\n"
                    "- location: string (the city/area, or empty string if not specified)\n"
                    "- target_count: integer (default 10)\n"
                    "- require_no_website: boolean (true if user requested places with no website)\n"
                    "- require_mobile_only: boolean (true if user requested mobile phone numbers / no landline)\n"
                    "- country_code: string (2-letter ISO country code, default 'GB')\n"
                    "Respond with ONLY the JSON object."
                )

                response = client.models.generate_content(
                    model=settings.GEMINI_MODEL,
                    contents=parse_prompt
                )
                text_clean = response.text.strip()
                if "```json" in text_clean:
                    text_clean = text_clean.split("```json")[1].split("```")[0].strip()
                elif "```" in text_clean:
                    text_clean = text_clean.split("```")[1].split("```")[0].strip()
                parsed = json.loads(text_clean)
            except Exception as e:
                logger.warning("Gemini parsing failed, using direct parser: %s", e)
                parsed = self.parse_intent_regex(user_message)
        else:
            parsed = self.parse_intent_regex(user_message)

        # Step 2: Query Live Google Places API
        try:
            self.places_service.api_key = settings.GOOGLE_MAPS_API_KEY
            raw_places = await self.places_service.search_places(
                query=parsed.get("query", user_message),
                page_size=20
            )
            search_result = self.places_service.filter_and_format_leads(
                raw_places=raw_places,
                require_no_website=parsed.get("require_no_website", True),
                require_mobile_only=parsed.get("require_mobile_only", True),
                target_count=parsed.get("target_count", 10),
                default_region=parsed.get("country_code", "GB")
            )
        except Exception as e:
            logger.error("Places API execution error: %s", e)
            return {
                "reply": f"⚠️ **Places API Error:** {str(e)}",
                "leads": [],
                "stats": {},
                "parsed_query": parsed
            }

        leads = search_result.get("leads", [])
        stats = search_result.get("filtered_out_stats", {})
        total_found = search_result.get("qualified_count", 0)

        # Step 3: Generate Summary
        if self.api_key and not self.api_key.startswith("YOUR_") and self.api_key.strip():
            try:
                from google import genai
                client = genai.Client(api_key=self.api_key)

                summary_prompt = (
                    f"User asked: '{user_message}'\n\n"
                    f"Search Query: {parsed.get('query')}\n"
                    f"Results: Found {total_found} qualified leads.\n"
                    f"- Excluded (has website): {stats.get('has_website', 0)}\n"
                    f"- Excluded (landline): {stats.get('landline_rejected', 0)}\n"
                    f"- Sample Business Names: {', '.join([l['business_name'] for l in leads[:4]])}\n\n"
                    "Provide a brief, professional summary of the live Google Places search results."
                )

                resp = client.models.generate_content(
                    model=settings.GEMINI_MODEL,
                    contents=summary_prompt
                )
                agent_text = resp.text
            except Exception as e:
                agent_text = (
                    f"Found **{total_found} verified leads** for **'{parsed.get('query')}'** from Google Places API.\n\n"
                    f"• {stats.get('has_website', 0)} businesses with websites excluded.\n"
                    f"• {stats.get('landline_rejected', 0)} landlines excluded."
                )
        else:
            loc_label = f" in **{parsed.get('location').title()}**" if parsed.get('location') else ""
            agent_text = (
                f"Found **{total_found} qualified leads**{loc_label} from Google Places API.\n\n"
                f"• {stats.get('has_website', 0)} businesses with websites excluded.\n"
                f"• {stats.get('landline_rejected', 0)} landline numbers excluded."
            )

        if total_found == 0 and stats.get('has_website', 0) > 0:
            agent_text += (
                f"\n\n💡 *Note: All {stats.get('has_website', 0)} businesses returned by Google Maps in this search already have a website or online ordering link. "
                "To find leads without websites, try searching for smaller independent niches like 'takeaways', 'food trucks', or 'sandwich bars' in specific areas (e.g. 'takeaways in Acomb York').*"
            )

        return {
            "reply": agent_text,
            "leads": leads,
            "stats": search_result,
            "parsed_query": parsed
        }


gemini_agent = GeminiLeadAgent()
