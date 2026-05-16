"""
auth_middleware.py — Supabase JWT verification for FastAPI.

Usage:
  Protected endpoint:  add `current_user: dict = Depends(get_current_user)`
  Optional auth:       add `user: dict | None = Depends(get_optional_user)`
"""
from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

security = HTTPBearer(auto_error=False)


async def verify_supabase_token(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    """
    Verifies the Supabase JWT token from the Authorization header.
    Returns the decoded user payload dict.
    Raises HTTP 401 if token is missing, expired, or invalid.
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return {
            "user_id": payload.get("sub"),
            "email": payload.get("email"),
            "role": payload.get("role"),
            "user_metadata": payload.get("user_metadata", {}),
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


async def get_current_user(
    user: dict = Depends(verify_supabase_token),
) -> dict:
    """Dependency that returns the current authenticated user. Raises 401 if not authenticated."""
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict | None:
    """
    Optional auth dependency.
    Returns the user dict if a valid token is present, None otherwise.
    Use for endpoints that work unauthenticated but offer enhanced features when logged in.
    """
    if not credentials:
        return None
    try:
        return await verify_supabase_token(credentials)
    except HTTPException:
        return None
