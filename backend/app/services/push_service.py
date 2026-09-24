import os
import json
import base64
import time
import logging
from typing import Optional, List, Dict, Any, Tuple
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.config import settings
from app.models.device_token import DeviceToken

logger = logging.getLogger(__name__)

# Cache for OAuth2 bearer token when using Firebase HTTP v1 API
_cached_access_token: Optional[str] = None
_cached_token_expiry: float = 0.0

GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
FCM_V1_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
FCM_LEGACY_URL = "https://fcm.googleapis.com/fcm/send"


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _get_service_account_info() -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Attempts to retrieve and parse the Firebase service account info.
    Supports:
      1. FIREBASE_SERVICE_ACCOUNT_BASE64 (base64 encoded JSON string)
      2. FIREBASE_SERVICE_ACCOUNT_JSON (raw JSON string)
      3. File path if FIREBASE_SERVICE_ACCOUNT_JSON points to a file
    Returns (dict_info, project_id).
    """
    raw_json: Optional[str] = None

    # Check Base64 env first (e.g. deployed on Railway)
    b64_env = settings.FIREBASE_SERVICE_ACCOUNT_BASE64 or os.environ.get("FIREBASE_SERVICE_ACCOUNT_BASE64")
    if b64_env and b64_env.strip():
        try:
            decoded_bytes = base64.b64decode(b64_env.strip())
            raw_json = decoded_bytes.decode("utf-8")
        except Exception as exc:
            logger.error("Failed to base64-decode FIREBASE_SERVICE_ACCOUNT_BASE64: %s", exc)

    # Check raw JSON string or file path
    if not raw_json:
        json_env = settings.FIREBASE_SERVICE_ACCOUNT_JSON or os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if json_env and json_env.strip():
            if os.path.exists(json_env.strip()):
                try:
                    with open(json_env.strip(), "r", encoding="utf-8") as f:
                        raw_json = f.read()
                except Exception as exc:
                    logger.error("Failed to read service account file from %s: %s", json_env, exc)
            else:
                raw_json = json_env.strip()

    if not raw_json:
        return None, None

    try:
        sa_info = json.loads(raw_json)
        project_id = sa_info.get("project_id") or settings.FIREBASE_PROJECT_ID
        return sa_info, project_id
    except Exception as exc:
        logger.error("Failed to parse Firebase service account JSON: %s", exc)
        return None, None


async def _get_google_oauth2_token(sa_info: Dict[str, Any]) -> Optional[str]:
    """
    Acquires an OAuth2 Bearer access token for the Firebase Messaging scope.
    Uses cached token if still valid (cached for up to 55 minutes).
    """
    global _cached_access_token, _cached_token_expiry

    now = time.time()
    if _cached_access_token and now < (_cached_token_expiry - 60):
        return _cached_access_token

    client_email = sa_info.get("client_email")
    private_key_pem = sa_info.get("private_key")
    token_uri = sa_info.get("token_uri") or GOOGLE_TOKEN_URI

    if not client_email or not private_key_pem:
        logger.error("Service account JSON missing 'client_email' or 'private_key'")
        return None

    # First attempt: Try standard google-auth if installed
    try:
        from google.oauth2 import service_account
        import google.auth.transport.requests

        creds = service_account.Credentials.from_service_account_info(
            sa_info, scopes=[FCM_V1_SCOPE]
        )
        request = google.auth.transport.requests.Request()
        creds.refresh(request)
        _cached_access_token = creds.token
        _cached_token_expiry = now + 3500
        logger.info("Acquired Google OAuth2 token via google-auth library.")
        return _cached_access_token
    except ImportError:
        pass
    except Exception as exc:
        logger.warning("google-auth token acquisition failed (%s); falling back to direct RS256 JWT.", exc)

    # Fallback: RFC 7523 RS256 JWT assertion exchange using cryptography
    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.hazmat.primitives.serialization import load_pem_private_key

        iat = int(now)
        exp = iat + 3600

        header = {"alg": "RS256", "typ": "JWT"}
        claims = {
            "iss": client_email,
            "scope": FCM_V1_SCOPE,
            "aud": token_uri,
            "exp": exp,
            "iat": iat,
        }

        header_b64 = _b64url_encode(json.dumps(header).encode("utf-8"))
        claims_b64 = _b64url_encode(json.dumps(claims).encode("utf-8"))
        unsigned_sig_input = f"{header_b64}.{claims_b64}".encode("utf-8")

        key = load_pem_private_key(private_key_pem.encode("utf-8"), password=None)
        sig = key.sign(unsigned_sig_input, padding.PKCS1v15(), hashes.SHA256())
        sig_b64 = _b64url_encode(sig)

        jwt_assertion = f"{header_b64}.{claims_b64}.{sig_b64}"

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                token_uri,
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    "assertion": jwt_assertion,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                token = data.get("access_token")
                expires_in = data.get("expires_in", 3600)
                _cached_access_token = token
                _cached_token_expiry = now + expires_in
                logger.info("Acquired Google OAuth2 token via direct RS256 JWT exchange (expires in %ds).", expires_in)
                return token
            else:
                logger.error("OAuth2 token exchange error: HTTP %d %s", resp.status_code, resp.text)
                return None
    except Exception as exc:
        logger.error("Failed to generate and exchange Google OAuth2 JWT: %s", exc)
        return None


async def send_fcm_push(
    db: AsyncSession,
    title: str,
    body: str,
    lead_id: Optional[int] = None,
    user_id: Optional[int] = None,
    extra_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Dispatches a high-priority FCM push notification to all registered devices.
    Prioritizes modern Firebase HTTP v1 API with Service Account (e.g. from Railway FIREBASE_SERVICE_ACCOUNT_BASE64).
    Falls back to Firebase Legacy Server Key if provided.
    Google Play Services delivers this directly to Android's NotificationManager,
    waking the device and displaying notifications on lock screen/status bar even
    when the app is completely swiped away or closed.
    """
    # 1. Fetch tokens
    query = select(DeviceToken)
    if user_id:
        query = query.where(DeviceToken.user_id == user_id)

    result = await db.execute(query)
    device_tokens = result.scalars().all()

    if not device_tokens:
        logger.info("No registered mobile device tokens found for push notification.")
        return {"success": True, "sent_count": 0, "detail": "No registered devices"}

    # Prepare string-only custom data (FCM v1 requires all data values to be strings)
    custom_data: Dict[str, str] = {
        "leadId": str(lead_id) if lead_id is not None else "",
        "title": str(title),
        "body": str(body),
    }
    if extra_data:
        for k, v in extra_data.items():
            if v is not None:
                custom_data[str(k)] = str(v)

    # 2. Check for Firebase Service Account (FCM HTTP v1)
    sa_info, project_id = _get_service_account_info()
    if sa_info and project_id:
        access_token = await _get_google_oauth2_token(sa_info)
        if access_token:
            return await _send_fcm_v1(
                db=db,
                project_id=project_id,
                access_token=access_token,
                device_tokens=device_tokens,
                title=title,
                body=body,
                custom_data=custom_data
            )
        else:
            logger.warning("Service account detected but failed to generate Google OAuth2 token. Falling back...")

    # 3. Fallback: Firebase Legacy Server Key
    server_key = settings.FIREBASE_SERVER_KEY
    if server_key and server_key.strip():
        return await _send_fcm_legacy(
            db=db,
            server_key=server_key.strip(),
            device_tokens=device_tokens,
            title=title,
            body=body,
            custom_data=custom_data
        )

    logger.warning(
        "No valid Firebase credentials configured (FIREBASE_SERVICE_ACCOUNT_BASE64, "
        "FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_SERVER_KEY). "
        "Push notification skipped for %d device(s).",
        len(device_tokens)
    )
    return {
        "success": False,
        "sent_count": 0,
        "detail": "Firebase credentials not configured. Configure FIREBASE_SERVICE_ACCOUNT_BASE64 in Railway or FIREBASE_SERVER_KEY."
    }


async def _send_fcm_v1(
    db: AsyncSession,
    project_id: str,
    access_token: str,
    device_tokens: List[DeviceToken],
    title: str,
    body: str,
    custom_data: Dict[str, str]
) -> Dict[str, Any]:
    """
    Sends FCM push notifications using Google's modern FCM HTTP v1 API.
    URL: https://fcm.googleapis.com/v1/projects/{project_id}/messages:send
    """
    v1_url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    sent_count = 0
    failed_count = 0
    stale_token_ids = []

    async with httpx.AsyncClient(timeout=10.0) as client:
        for dt in device_tokens:
            payload = {
                "message": {
                    "token": dt.token,
                    "notification": {
                        "title": title,
                        "body": body,
                    },
                    "data": custom_data,
                    "android": {
                        "priority": "HIGH",
                        "notification": {
                            "channel_id": "messages",
                            "sound": "default",
                            "default_sound": True,
                            "notification_priority": "PRIORITY_MAX",
                            "click_action": "FCM_PLUGIN_ACTIVITY",
                        },
                    },
                }
            }

            try:
                res = await client.post(v1_url, headers=headers, json=payload)
                if res.status_code == 200:
                    sent_count += 1
                    logger.info("FCM v1 push successfully sent to device token %s... (platform=%s)", dt.token[:15], dt.platform)
                else:
                    failed_count += 1
                    err_text = res.text
                    logger.warning("FCM v1 delivery error HTTP %d for device %s...: %s", res.status_code, dt.token[:12], err_text)
                    # Detect stale/invalid token
                    if res.status_code in (400, 404):
                        if any(phrase in err_text for phrase in ["UNREGISTERED", "INVALID_ARGUMENT", "not a valid FCM registration token"]):
                            stale_token_ids.append(dt.id)
            except Exception as exc:
                failed_count += 1
                logger.error("Network error sending FCM v1 to token %s...: %s", dt.token[:12], exc)

    # Prune stale tokens if any
    if stale_token_ids:
        try:
            await db.execute(delete(DeviceToken).where(DeviceToken.id.in_(stale_token_ids)))
            await db.commit()
            logger.info("Cleaned up %d unregistered/stale FCM device token(s)", len(stale_token_ids))
        except Exception as e:
            logger.warning("Failed to clean up stale device tokens: %s", e)

    return {
        "success": sent_count > 0 or failed_count == 0,
        "sent_count": sent_count,
        "failed_count": failed_count,
        "total_devices": len(device_tokens),
        "api_version": "v1",
        "project_id": project_id
    }


async def _send_fcm_legacy(
    db: AsyncSession,
    server_key: str,
    device_tokens: List[DeviceToken],
    title: str,
    body: str,
    custom_data: Dict[str, str]
) -> Dict[str, Any]:
    """
    Sends FCM push notifications using the legacy FCM API.
    URL: https://fcm.googleapis.com/fcm/send
    """
    headers = {
        "Authorization": f"key={server_key}",
        "Content-Type": "application/json",
    }

    sent_count = 0
    failed_count = 0
    stale_token_ids = []

    async with httpx.AsyncClient(timeout=10.0) as client:
        for dt in device_tokens:
            payload = {
                "to": dt.token,
                "priority": "high",
                "notification": {
                    "title": title,
                    "body": body,
                    "sound": "default",
                    "badge": 1,
                    "android_channel_id": "messages",
                    "click_action": "FCM_PLUGIN_ACTIVITY",
                },
                "data": custom_data,
            }

            try:
                res = await client.post(FCM_LEGACY_URL, headers=headers, json=payload)
                resp_json = res.json() if res.status_code == 200 else {}

                if res.status_code == 200 and resp_json.get("success", 0) >= 1:
                    sent_count += 1
                    logger.info("FCM legacy push successfully sent to device (platform=%s)", dt.platform)
                else:
                    failed_count += 1
                    error_msg = resp_json.get("results", [{}])[0].get("error", res.text)
                    logger.warning("FCM legacy delivery failure for device %s...: %s", dt.token[:12], error_msg)

                    if error_msg in ("NotRegistered", "InvalidRegistration", "MismatchSenderId"):
                        stale_token_ids.append(dt.id)
            except Exception as exc:
                failed_count += 1
                logger.error("Error communicating with legacy FCM endpoint for token %s: %s", dt.token[:12], exc)

    if stale_token_ids:
        try:
            await db.execute(delete(DeviceToken).where(DeviceToken.id.in_(stale_token_ids)))
            await db.commit()
            logger.info("Cleaned up %d unregistered/stale FCM device token(s)", len(stale_token_ids))
        except Exception as e:
            logger.warning("Failed to clean up stale device tokens: %s", e)

    return {
        "success": sent_count > 0 or failed_count == 0,
        "sent_count": sent_count,
        "failed_count": failed_count,
        "total_devices": len(device_tokens),
        "api_version": "legacy"
    }

