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
    """Initialize database tables and run migrations."""
    from sqlalchemy import text
    
    # Run migrations for PostgreSQL enum types
    if "postgresql" in DATABASE_URL:
        try:
            with engine.connect() as conn:
                # Check if OWNER exists in the enum
                result = conn.execute(text(
                    "SELECT enumlabel FROM pg_enum WHERE enumtypid = "
                    "(SELECT oid FROM pg_type WHERE typname = 'userrole')"
                ))
                existing_values = [row[0] for row in result]
                
                if 'OWNER' not in existing_values:
                    print("🔧 Adding OWNER to userrole enum...")
                    conn.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'OWNER'"))
                    conn.commit()
                    print("✅ OWNER added to userrole enum")
                else:
                    print("✅ OWNER already exists in userrole enum")
        except Exception as e:
            print(f"⚠️ Enum migration skipped (may not exist yet): {e}")
    
    Base.metadata.create_all(bind=engine)
