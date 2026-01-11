"""
SQLAlchemy models for ToolBox Pro authentication system.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum as SQLEnum, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum

class UserRole(str, enum.Enum):
    """User role levels."""
    GUEST = "guest"
    USER = "user"
    PREMIUM = "premium"
    ADMIN = "admin"

# Many-to-many relationship for user tool permissions
user_tool_permissions = Table(
    'user_tool_permissions',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('tool_id', String, primary_key=True)  # Tool identifier like 'piko_empiko'
)

class User(Base):
    """User model for authentication."""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    role = Column(SQLEnum(UserRole), default=UserRole.USER, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Tools this user has explicit access to (beyond their role)
    tool_permissions = relationship(
        "ToolPermission",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    
    def has_tool_access(self, tool_id: str) -> bool:
        """Check if user has access to a specific tool."""
        # Admins have access to everything
        if self.role == UserRole.ADMIN:
            return True
        
        # Premium users have access to all tools
        if self.role == UserRole.PREMIUM:
            return True
        
        # Check explicit permissions
        return any(perm.tool_id == tool_id for perm in self.tool_permissions)

class ToolPermission(Base):
    """Explicit tool permission for a user."""
    __tablename__ = "tool_permissions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tool_id = Column(String, nullable=False)  # e.g., 'piko_empiko', 'structure_matcher'
    granted_at = Column(DateTime(timezone=True), server_default=func.now())
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    user = relationship("User", back_populates="tool_permissions", foreign_keys=[user_id])

# List of premium/restricted tools
RESTRICTED_TOOLS = [
    "piko_empiko",
    "structure_matcher"  # Dopasowywacz
]
