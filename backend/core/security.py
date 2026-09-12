from datetime import datetime, timedelta, timezone
from jose import jwt
from pwdlib import PasswordHash
from backend.core.config import settings

password_hash = PasswordHash.recommended()

def create_access_token(subject, expires_delta=None):
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    return jwt.encode({"exp": expire, "sub": str(subject)}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def verify_password(plain_password, hashed_password):
    return password_hash.verify(plain_password, hashed_password)

def get_password_hash(password):
    return password_hash.hash(password)
