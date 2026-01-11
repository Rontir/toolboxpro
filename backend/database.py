"""
Database connection and session management for ToolBox Pro.
Uses PostgreSQL on Render, falls back to SQLite for local development.
"""
import os
import tempfile
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Database URL from environment or SQLite fallback in temp directory
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Use temp directory for SQLite (works on Render's ephemeral filesystem)
    db_path = os.path.join(tempfile.gettempdir(), "toolboxpro.db")
    DATABASE_URL = f"sqlite:///{db_path}"
    print(f"📁 Using SQLite database at: {db_path}")

# Fix for Render's postgres:// prefix (SQLAlchemy needs postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    pool_pre_ping=True
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

def get_db():
    """Dependency for FastAPI endpoints - yields database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)
