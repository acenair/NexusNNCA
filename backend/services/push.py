"""Services / push — extracted from server.py without behavior changes."""
from core import VAPID_CLAIMS_EMAIL
from core import VAPID_PRIVATE_KEY
from core import VAPID_PUBLIC_KEY
from core import db
import json
from core import logger

async def send_push_to_user(user_id: str, title: str, body: str, url: str = "/", tag: str = "nn-notif"):
    """Send a push notification to all subscriptions of a specific user."""
    from pywebpush import webpush, WebPushException

    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.warning("VAPID keys not configured, skipping push")
        return 0

    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(20)
    sent = 0
    payload = json.dumps({
        "title": title,
        "body": body,
        "url": url,
        "tag": tag,
        "icon": "/nn-icon-192.png",
        "badge": "/nn-icon-192.png",
    })

    for sub_doc in subs:
        sub_info = sub_doc.get("subscription", {})
        try:
            webpush(
                subscription_info=sub_info,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CLAIMS_EMAIL},
            )
            sent += 1
        except WebPushException as e:
            logger.warning(f"Push failed for {sub_doc.get('user_email')}: {e}")
            # If subscription is expired/invalid (410 Gone), remove it
            if hasattr(e, 'response') and e.response is not None and e.response.status_code in (404, 410):
                endpoint = sub_info.get("endpoint", "")
                await db.push_subscriptions.delete_one({"user_id": user_id, "endpoint": endpoint})
        except Exception as e:
            logger.warning(f"Push error: {e}")

    return sent
