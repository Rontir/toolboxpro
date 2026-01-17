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

# Many-to-many: users <-> groups
user_groups = Table(
    'user_groups',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('group_id', Integer, ForeignKey('groups.id'), primary_key=True)
)

# Many-to-many: groups <-> tools
group_tools = Table(
    'group_tools',
    Base.metadata,
    Column('group_id', Integer, ForeignKey('groups.id'), primary_key=True),
    Column('tool_id', String, primary_key=True)
)

# Legacy: user tool permissions (kept for backward compatibility)
user_tool_permissions = Table(
    'user_tool_permissions',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('tool_id', String, primary_key=True)
)

class Group(Base):
    """Group/Role model - like Discord roles."""
    __tablename__ = "groups"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    color = Column(String, default="#6366f1")  # Hex color for badge
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Tools this group has access to
    tool_ids = Column(String, default="")  # Comma-separated tool IDs
    
    # Users in this group
    users = relationship("User", secondary=user_groups, back_populates="groups")
    
    def get_tool_list(self):
        """Get list of tool IDs this group has access to."""
        if not self.tool_ids:
            return []
        return [t.strip() for t in self.tool_ids.split(",") if t.strip()]
    
    def set_tool_list(self, tools: list):
        """Set list of tool IDs for this group."""
        self.tool_ids = ",".join(tools)

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
    
    # Groups this user belongs to
    groups = relationship("Group", secondary=user_groups, back_populates="users")
    
    # Tools this user has explicit access to (beyond their role/groups)
    tool_permissions = relationship(
        "ToolPermission",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="ToolPermission.user_id"
    )
    
    def has_tool_access(self, tool_id: str) -> bool:
        """Check if user has access to a specific tool."""
        # Admins have access to everything
        if self.role == UserRole.ADMIN:
            return True
        
        # Premium users have access to all tools
        if self.role == UserRole.PREMIUM:
            return True
        
        # Check group permissions
        for group in self.groups:
            if tool_id in group.get_tool_list():
                return True
        
        # Check explicit individual permissions
        return any(perm.tool_id == tool_id for perm in self.tool_permissions)
    
    def get_all_accessible_tools(self):
        """Get all tool IDs user has access to."""
        tools = set()
        # From groups
        for group in self.groups:
            tools.update(group.get_tool_list())
        # From individual permissions
        for perm in self.tool_permissions:
            tools.add(perm.tool_id)
        return list(tools)

class ToolPermission(Base):
    """Explicit tool permission for a user (individual, not group-based)."""
    __tablename__ = "tool_permissions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tool_id = Column(String, nullable=False)
    granted_at = Column(DateTime(timezone=True), server_default=func.now())
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    user = relationship("User", back_populates="tool_permissions", foreign_keys=[user_id])

# List of premium/restricted tools
RESTRICTED_TOOLS = [
    "piko_empiko",
    "structure_matcher"  # Dopasowywacz
]

class ActivityLog(Base):
    """Activity log for tracking user actions."""
    __tablename__ = "activity_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Null for anonymous
    action = Column(String, nullable=False)  # login, logout, tool_use, password_change, etc.
    details = Column(String, nullable=True)  # JSON or text with additional info
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User", backref="activity_logs", foreign_keys=[user_id])
