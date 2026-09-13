import time
from sqlalchemy import Column, Integer, String, Boolean, Float

from backend.db.base_class import Base

class User(Base):
    # Matches the Vultr MySQL "users" table the team agreed on. Note this
    # PK is "uid", not "id" -- CRUDBase's generic get()/remove() (which
    # assume `.id`) are never called for User (only CRUDUser's own
    # get_by_email/create/authenticate are used), so that's fine to leave.
    __tablename__ = "users"
    uid = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), nullable=False, unique=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    # Column name matches the agreed schema; the actual hashing lives in
    # core/security.py (pwdlib, argon2) same as before -- just renamed
    # from `hashed_password`.
    password_hash = Column(String(255), nullable=False)
    # Populated with the most recently issued JWT on login, for schema
    # compliance / support debugging ("what token did this user last get").
    # NOT used to authenticate requests -- auth stays stateless JWT
    # verification (see api/deps.py get_current_user), so a leaked old
    # value here can't be replayed and there's no server-side revocation
    # list to keep in sync. If you need real revocation later, check this
    # column's value against the incoming token's `sub`+iat here first.
    auth_token = Column(String(255), nullable=True)
    is_active = Column(Boolean(), default=True)
    created_at = Column(Float, default=time.time, nullable=False)
