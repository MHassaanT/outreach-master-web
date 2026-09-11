from typing import Optional, Dict, Any
import phonenumbers
from phonenumbers import PhoneNumberType, PhoneNumberFormat


def analyze_phone_number(raw_phone: str, default_region: str = "GB") -> Dict[str, Any]:
    """
    Parses and checks if a phone number is valid and whether it is a mobile number or landline.
    Uses Google's libphonenumber port.
    """
    if not raw_phone or not raw_phone.strip():
        return {
            "is_valid": False,
            "is_mobile": False,
            "type_name": "NO_NUMBER",
            "e164": None,
            "national": None,
            "international": None
        }

    cleaned = raw_phone.strip()
    try:
        # If number starts with +, parse with None region, otherwise use default_region
        region = None if cleaned.startswith("+") else default_region
        parsed = phonenumbers.parse(cleaned, region)

        if not phonenumbers.is_valid_number(parsed):
            return {
                "is_valid": False,
                "is_mobile": False,
                "type_name": "INVALID",
                "e164": None,
                "national": cleaned,
                "international": cleaned
            }

        num_type = phonenumbers.number_type(parsed)
        type_str_map = {
            PhoneNumberType.FIXED_LINE: "FIXED_LINE",
            PhoneNumberType.MOBILE: "MOBILE",
            PhoneNumberType.FIXED_LINE_OR_MOBILE: "FIXED_LINE_OR_MOBILE",
            PhoneNumberType.TOLL_FREE: "TOLL_FREE",
            PhoneNumberType.PREMIUM_RATE: "PREMIUM_RATE",
            PhoneNumberType.SHARED_COST: "SHARED_COST",
            PhoneNumberType.VOIP: "VOIP",
            PhoneNumberType.PERSONAL_NUMBER: "PERSONAL_NUMBER",
            PhoneNumberType.PAGER: "PAGER",
            PhoneNumberType.UAN: "UAN",
            PhoneNumberType.VOICEMAIL: "VOICEMAIL",
            PhoneNumberType.UNKNOWN: "UNKNOWN"
        }
        type_name = type_str_map.get(num_type, "UNKNOWN")

        # Mobile check: MOBILE or FIXED_LINE_OR_MOBILE (some countries map certain ranges to both)
        # Definitely reject pure FIXED_LINE (landlines like York 01904, London 020, etc.)
        is_mobile = num_type in (PhoneNumberType.MOBILE, PhoneNumberType.FIXED_LINE_OR_MOBILE)

        e164 = phonenumbers.format_number(parsed, PhoneNumberFormat.E164)
        national = phonenumbers.format_number(parsed, PhoneNumberFormat.NATIONAL)
        international = phonenumbers.format_number(parsed, PhoneNumberFormat.INTERNATIONAL)

        return {
            "is_valid": True,
            "is_mobile": is_mobile,
            "type_name": type_name,
            "e164": e164,
            "national": national,
            "international": international,
            "country_code": parsed.country_code
        }
    except phonenumbers.NumberParseException:
        return {
            "is_valid": False,
            "is_mobile": False,
            "type_name": "PARSE_ERROR",
            "e164": None,
            "national": cleaned,
            "international": cleaned
        }
