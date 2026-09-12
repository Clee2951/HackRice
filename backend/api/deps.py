from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from backend.core.config import settings
from backend.db.session import SessionLocal
from backend.models.user import User

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login/access-token")

def get_db():
    with SessionLocal() as db:
        yield db

def get_current_user(token: str = Depends(oauth2), db=Depends(get_db)):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, ValueError, KeyError, TypeError):
        raise HTTPException(401, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "User unavailable")
    return user
