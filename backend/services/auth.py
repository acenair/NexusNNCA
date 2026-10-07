"""Services / auth — extracted from server.py without behavior changes."""
from typing import Optional
import secrets
import string

MIN_PASSWORD_LENGTH = 10


def _extract_token(authorization: Optional[str], session_token: Optional[str]) -> Optional[str]:
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ")[1]
    return session_token


def _generate_temp_secret(length: int = 12, digits_only: bool = False) -> str:
    if digits_only:
        return ''.join(secrets.choice(string.digits) for _ in range(6))
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))
