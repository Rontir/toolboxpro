"""
Authentication utilities for ToolBox Pro.
JWT token management and password hashing.
"""
import os
from datetime import datetime, timedelta
from typing import Optional, List
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-in-production-please!")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Password hashing - disable truncate_error to allow longer passwords
pwd_context = CryptContext(
    schemes=["bcrypt"], 
    deprecated="auto",
    bcrypt__truncate_error=False  # Silently truncate instead of raising error
)

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

# Password utilities - using SHA256 pre-hash to avoid bcrypt 72 byte limit
import hashlib

def _prehash_password(password: str) -> str:
    """Pre-hash password with SHA256 to get exactly 64 hex chars (fits bcrypt 72 limit)."""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def hash_password(password: str) -> str:
    """Hash a password using bcrypt with SHA256 pre-hash."""
    # SHA256 produces 64 char hex string - always fits in bcrypt's 72 byte limit
    prehashed = _prehash_password(password)
    return pwd_context.hash(prehashed)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    prehashed = _prehash_password(plain_password)
    return pwd_context.verify(prehashed, hashed_password)

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
