import pytest
from app.services.phone_filter import analyze_phone_number


def test_phone_filter_mobile_vs_landline():
    # York Landline (01904 is York area code)
    york_landline = "01904 624500"
    res_landline = analyze_phone_number(york_landline, default_region="GB")
    assert res_landline["is_valid"] is True
    assert res_landline["is_mobile"] is False
    assert res_landline["type_name"] == "FIXED_LINE"

    # UK Mobile (07xxx)
    uk_mobile = "07712 345678"
    res_mobile = analyze_phone_number(uk_mobile, default_region="GB")
    assert res_mobile["is_valid"] is True
    assert res_mobile["is_mobile"] is True
    assert res_mobile["type_name"] == "MOBILE"
    assert res_mobile["e164"] == "+447712345678"

    # International formatted UK Mobile (+44 7890 123456)
    intl_mobile = "+44 7890 123456"
    res_intl = analyze_phone_number(intl_mobile, default_region="GB")
    assert res_intl["is_valid"] is True
    assert res_intl["is_mobile"] is True

    # Empty / Invalid
    assert analyze_phone_number("")["is_valid"] is False
    assert analyze_phone_number("12345")["is_valid"] is False
