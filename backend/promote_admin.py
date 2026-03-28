import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import User, UserRole, Base

# Add current directory to path so we can import modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import DATABASE_URL

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Import models to register them with Base
from models import Base, User, UserRole

def log(msg):
    print(msg)
    with open("admin_log.txt", "a", encoding="utf-8") as f:
        f.write(msg + "\n")

# Create tables using our local engine
try:
    Base.metadata.create_all(bind=engine)
    log("Database tables checked/created.")
except Exception as e:
    log(f"Database init warning: {e}")

def promote_user(email):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            log(f"Found user: {user.email} (Current Role: {user.role.value})")
            if user.role != UserRole.OWNER:
                user.role = UserRole.OWNER
                db.commit()
                log(f"Successfully promoted {user.email} to OWNER.")
            else:
                log(f"User {user.email} is already an OWNER.")
        else:
            log(f"User {email} not found. They will be made OWNER automatically upon registration.")
    except Exception as e:
        log(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    target_email = "xmikezien@gmail.com"
    promote_user(target_email)
