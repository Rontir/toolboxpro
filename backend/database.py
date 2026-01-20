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
    # Use local file for persistence in development
    # Only use temp if we are on Render (detected via env var) or if explicitly requested
    if os.getenv("RENDER"):
        db_path = os.path.join(tempfile.gettempdir(), "toolboxpro.db")
        print(f"📁 Using ephemeral SQLite database at: {db_path}")
    else:
        # Local development - use persistent file
        base_dir = os.path.dirname(os.path.abspath(__file__))
        db_path = os.path.join(base_dir, "toolbox.db")
        print(f"📁 Using persistent SQLite database at: {db_path}")
    
    DATABASE_URL = f"sqlite:///{db_path}"

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
