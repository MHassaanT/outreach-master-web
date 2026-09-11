import os
import re
import logging
from typing import Optional, Any, Dict
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

ENV_FILE_PATH = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))


class Settings(BaseSettings):
    PROJECT_NAME: str = "Outreach Master"
    API_V1_STR: str = "/api"
    SECRET_KEY: str = "outreach-master-super-secret-key-for-jwt-signing-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    DATABASE_URL: str = "sqlite+aiosqlite:///./outreach_master.db"

    # AI & Google APIs
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GOOGLE_MAPS_API_KEY: Optional[str] = None

    # WhatsApp Cloud API & Embedded Signup
    WHATSAPP_APP_ID: str = "2258621364910411"
    WHATSAPP_CONFIG_ID: str = "1811181826536139"
    WHATSAPP_APP_SECRET: Optional[str] = None
    WHATSAPP_PHONE_NUMBER_ID: Optional[str] = None
    WHATSAPP_BUSINESS_ACCOUNT_ID: Optional[str] = None
    WHATSAPP_ACCESS_TOKEN: Optional[str] = None
    WHATSAPP_VERIFY_TOKEN: str = "outreach_master_verify_token"
    WHATSAPP_API_VERSION: str = "v21.0"
    WHATSAPP_MOCK_MODE: bool = True  # Allows offline testing/simulation

    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH,
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()


def persist_env_keys(updates: Dict[str, Any]) -> None:
    """
    Persists configuration keys into the backend .env file.
    """
    content = ""
    if os.path.exists(ENV_FILE_PATH):
        try:
            with open(ENV_FILE_PATH, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            logger.warning("Failed to read .env file at %s: %s", ENV_FILE_PATH, e)

    for key, value in updates.items():
        if value is None:
            continue
        if isinstance(value, bool):
            val_str = "True" if value else "False"
            new_line = f"{key}={val_str}"
        else:
            val_str = str(value).replace('"', '\\"')
            new_line = f'{key}="{val_str}"'

        pattern = rf'^{re.escape(key)}=.*$'
        if re.search(pattern, content, flags=re.MULTILINE):
            content = re.sub(pattern, new_line, content, flags=re.MULTILINE)
        else:
            if content and not content.endswith("\n"):
                content += "\n"
            content += f"{new_line}\n"

    try:
        with open(ENV_FILE_PATH, "w", encoding="utf-8") as f:
            f.write(content)
        logger.info("Persisted %d keys to %s", len(updates), ENV_FILE_PATH)
    except Exception as e:
        logger.warning("Failed to persist keys to .env at %s: %s", ENV_FILE_PATH, e)


def persist_env_key(key: str, value: Any) -> None:
    """
    Persists a single configuration key into the backend .env file.
    """
    persist_env_keys({key: value})
