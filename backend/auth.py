"""
Authentication utilities for ToolBox Pro.
JWT token management and password hashing.
Uses PBKDF2-SHA256 instead of bcrypt to avoid dependencies issues.
"""
import os
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, List
from jose import JWTError, jwt
from pydantic import BaseModel

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-in-production-please!")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Pydantic schemas
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None
    role: Optional[str] = None

class UserCreate(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    display_name: Optional[str]
    role: str
    is_active: bool
    tool_permissions: List[str] = []
    
    class Config:
        from_attributes = True

class GrantToolRequest(BaseModel):
    user_id: int
    tool_id: str

# Password utilities using PBKDF2-SHA256 (no external dependencies)
def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-SHA256."""
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return f"{salt.hex()}:{key.hex()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    try:
        salt_hex, key_hex = hashed_password.split(':')
        salt = bytes.fromhex(salt_hex)
        stored_key = bytes.fromhex(key_hex)
        computed_key = hashlib.pbkdf2_hmac('sha256', plain_password.encode('utf-8'), salt, 100000)
        return secrets.compare_digest(computed_key, stored_key)
    except Exception:
        return False

# JWT utilities
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_tokens(user_id: int, email: str, role: str) -> Token:
    """Create both access and refresh tokens for a user."""
    token_data = {"sub": str(user_id), "email": email, "role": role}
    return Token(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data)
    )

def verify_token(token: str, token_type: str = "access") -> Optional[TokenData]:
    """Verify a JWT token and extract data."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != token_type:
            return None
        user_id = int(payload.get("sub"))
        email = payload.get("email")
        role = payload.get("role")
        return TokenData(user_id=user_id, email=email, role=role)
    except JWTError:
        return None

def decode_token(token: str) -> Optional[dict]:
    """Decode a token without verification (for debugging)."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
