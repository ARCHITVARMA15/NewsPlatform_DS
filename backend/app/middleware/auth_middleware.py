"""
auth_middleware.py — Supabase JWT verification for FastAPI.

Verifies tokens via the Supabase /auth/v1/user endpoint so it works
regardless of JWT algorithm (RS256 or HS256).

Usage:
  Protected endpoint:  add `current_user: dict = Depends(get_current_user)`
  Optional auth:       add `user: dict | None = Depends(get_optional_user)`
"""
from __future__ import annotations

import httpx
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

security = HTTPBearer(auto_error=False)


async def verify_supabase_token(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    """
    Verifies the Bearer token by calling Supabase's /auth/v1/user endpoint.
    Works with both RS256 (new projects) and HS256 (legacy) tokens.
    Returns the user payload dict. Raises HTTP 401 if invalid.
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_service_key,
            },
            timeout=10.0,
        )

    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_data = response.json()
    return {
        "user_id":       user_data.get("id"),
        "email":         user_data.get("email"),
        "role":          user_data.get("role"),
        "user_metadata": user_data.get("user_metadata", {}),
    }


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
