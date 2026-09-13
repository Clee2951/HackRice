from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend import crud, schemas
from backend.api import deps
from backend.core.security import create_access_token

router = APIRouter()

@router.post("/login/access-token", response_model=schemas.Token)
def login_access_token(
    db: Session = Depends(deps.get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
):
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    user = crud.user.authenticate(
        db, email=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    token = create_access_token(user.uid)
    # Schema compliance / debugging aid only -- see the comment on
    # User.auth_token in models/user.py. Not consulted during auth.
    user.auth_token = token
    db.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
    }

@router.post("/signup", response_model=schemas.User)
def create_user(
    *, 
    db: Session = Depends(deps.get_db),
    user_in: schemas.UserCreate
):
    """
    Create new user.
    """
    user = crud.user.get_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists.",
        )
    try:
        user = crud.user.create(db, obj_in=user_in)
    except IntegrityError:
        # users.username is unique too, and nothing above checks it. The
        # frontend defaults the display name to the email's local part, so
        # two people signing up as alex@a.com and alex@b.com collide here
        # -- which is a name clash, not a server fault.
        db.rollback()
        raise HTTPException(status_code=400, detail="That display name is taken. Pick another.")
    return user