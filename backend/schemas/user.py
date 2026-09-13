from pydantic import BaseModel, EmailStr, Field, ConfigDict

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    # NOTE: unrelated to OAuth2PasswordRequestForm's "username" field used
    # at login (auth.py login_access_token) -- that form field actually
    # carries the email, per the OAuth2 password-grant spec's generic
    # naming. This `username` is the real profile field from the agreed
    # users table (uid/username/email/...), never used for login lookup.
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=8, max_length=128)

class UserUpdate(UserBase):
    pass

class User(UserBase):
    model_config = ConfigDict(from_attributes=True)
    uid: int
    username: str
    is_active: bool
