"""
Database connection and session management for ToolBox Pro.
Prefers an explicit DATABASE_URL, otherwise uses a persistent SQLite file.
"""
import os
import tempfile
import shutil
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

def resolve_default_sqlite_path() -> str:
    data_dir = os.getenv("TOOLBOX_DATA_DIR", "/data")
    preferred_path = os.path.join(data_dir, "toolbox.db")

    if os.getenv("RENDER"):
        return os.path.join(tempfile.gettempdir(), "toolboxpro.db")

    if os.path.isdir(data_dir) or data_dir.startswith("/"):
        os.makedirs(data_dir, exist_ok=True)
        return preferred_path

    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, "toolbox.db")


def migrate_legacy_sqlite_if_needed(target_path: str) -> None:
    if os.path.exists(target_path):
        return

    base_dir = os.path.dirname(os.path.abspath(__file__))
    legacy_path = os.path.join(base_dir, "toolbox.db")

    if os.path.exists(legacy_path) and os.path.realpath(legacy_path) != os.path.realpath(target_path):
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        shutil.copy2(legacy_path, target_path)
        print(f"📦 Migrated legacy SQLite database from {legacy_path} to {target_path}")


def resolve_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    db_path = resolve_default_sqlite_path()
    migrate_legacy_sqlite_if_needed(db_path)
    print(f"📁 Using persistent SQLite database at: {db_path}")
    return f"sqlite:///{db_path}"


DATABASE_URL = resolve_database_url()

# Fix for Render's postgres:// prefix (SQLAlchemy needs postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("sqlite:///"):
    sqlite_path = DATABASE_URL.replace("sqlite:///", "", 1)
    if sqlite_path:
        migrate_legacy_sqlite_if_needed(sqlite_path)
        os.makedirs(os.path.dirname(sqlite_path), exist_ok=True)

DATABASE_ENGINE = (
    "sqlite" if DATABASE_URL.startswith("sqlite")
    else "postgresql" if DATABASE_URL.startswith("postgresql")
    else "unknown"
)
DATABASE_PATH = DATABASE_URL.replace("sqlite:///", "", 1) if DATABASE_ENGINE == "sqlite" else None

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


def get_database_info() -> dict:
    return {
        "url": DATABASE_URL,
        "engine": DATABASE_ENGINE,
        "path": DATABASE_PATH,
    }
