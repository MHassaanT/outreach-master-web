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


def extract_phone_digits(raw_phone: str) -> str:
    """
    Extracts purely numeric digits from a phone string.
    """
    if not raw_phone:
        return ""
    import re
    return re.sub(r"\D", "", raw_phone)


def normalize_phone(raw_phone: str, default_region: str = "GB") -> tuple[str, str]:
    """
    Normalizes any input phone number string into:
    1. clean_e164: Standard E.164 string with '+' and strictly digits only (NO spaces, dashes, or parentheses)
    2. formatted: Human-readable display format (e.g. international format '+44 7349 625505')
    """
    if not raw_phone or not raw_phone.strip():
        return "", ""

    cleaned = raw_phone.strip()
    digits = extract_phone_digits(cleaned)
    if not digits:
        return "", ""

    # Try libphonenumber parse first
    try:
        region = None if cleaned.startswith("+") else default_region
        parsed = phonenumbers.parse(cleaned, region)
        if phonenumbers.is_valid_number(parsed):
            e164 = phonenumbers.format_number(parsed, PhoneNumberFormat.E164)
            intl = phonenumbers.format_number(parsed, PhoneNumberFormat.INTERNATIONAL)
            # Ensure e164 is strictly digits with leading '+'
            clean_e164 = "+" + extract_phone_digits(e164)
            return clean_e164, intl
    except Exception:
        pass

    # Fallback for numbers that fail strict validation or regional heuristics
    if cleaned.startswith("+"):
        return f"+{digits}", cleaned

    # If it starts with 0 and looks like a UK number (11 digits):
    if cleaned.startswith("0") and len(digits) == 11 and default_region == "GB":
        uk_e164 = f"+44{digits[1:]}"
        uk_display = f"+44 {digits[1:5]} {digits[5:]}"
        return uk_e164, uk_display

    # Default fallback: + prefix with all non-digit characters removed
    return f"+{digits}", cleaned

