import re
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
    1. clean_e164: Standard E.164 string with '+' and strictly digits only (e.g. '+447123456789')
    2. formatted: Human-readable display format in '+44 7xxx' format (e.g. '+44 7123 456789').
       Whenever a UK mobile number is in 07xxx format (or missing leading 0 from Excel),
       it automatically standardizes to '+44 7xxx'.
    """
    if not raw_phone:
        return "", ""

    # Clean quotes, whitespace, and Excel float artifact e.g. ".0"
    cleaned = str(raw_phone).strip().strip("'\"")
    if cleaned.endswith(".0"):
        cleaned = cleaned[:-2]

    # Handle UK domestic trunk notation "+44 (0) 7..." -> "+44 7..."
    cleaned = re.sub(r"\+44\s*\(\s*0\s*\)", "+44 ", cleaned)

    digits = extract_phone_digits(cleaned)
    if not digits:
        return "", ""

    # Specifically detect UK mobile numbers in 07xxx, 7xxx (Excel), 447xxx, 00447xxx formats
    is_uk_mobile = False
    uk_national_digits = None

    if digits.startswith("00447") and len(digits) >= 12:
        is_uk_mobile = True
        uk_national_digits = digits[4:]  # e.g. 7123456789
    elif digits.startswith("447") and len(digits) >= 11:
        is_uk_mobile = True
        uk_national_digits = digits[2:]  # e.g. 7123456789
    elif digits.startswith("07") and len(digits) >= 10:
        is_uk_mobile = True
        uk_national_digits = digits[1:]  # e.g. 7123456789
    elif digits.startswith("7") and len(digits) == 10 and default_region == "GB":
        # Excel often truncates leading 0 from 07xxx
        is_uk_mobile = True
        uk_national_digits = digits      # e.g. 7123456789

    if is_uk_mobile and uk_national_digits:
        clean_e164 = f"+44{uk_national_digits}"
        # Try standard libphonenumber formatting for clean display
        try:
            parsed = phonenumbers.parse(clean_e164, None)
            intl = phonenumbers.format_number(parsed, PhoneNumberFormat.INTERNATIONAL)
            return clean_e164, intl
        except Exception:
            # Fallback formatting: +44 7xxx xxxxxx
            if len(uk_national_digits) == 10:
                intl = f"+44 {uk_national_digits[:4]} {uk_national_digits[4:]}"
            else:
                intl = f"+44 {uk_national_digits}"
            return clean_e164, intl

    # For other numbers, try libphonenumber parse first
    try:
        region = None if cleaned.startswith("+") else default_region
        parsed = phonenumbers.parse(cleaned, region)
        if phonenumbers.is_valid_number(parsed):
            e164 = phonenumbers.format_number(parsed, PhoneNumberFormat.E164)
            intl = phonenumbers.format_number(parsed, PhoneNumberFormat.INTERNATIONAL)
            clean_e164 = "+" + extract_phone_digits(e164)
            return clean_e164, intl
    except Exception:
        pass

    # Fallback for numbers that fail strict validation or regional heuristics
    if cleaned.startswith("+"):
        return f"+{digits}", cleaned

    if cleaned.startswith("0") and len(digits) == 11 and default_region == "GB":
        uk_e164 = f"+44{digits[1:]}"
        uk_display = f"+44 {digits[1:5]} {digits[5:]}"
        return uk_e164, uk_display

    return f"+{digits}", cleaned

