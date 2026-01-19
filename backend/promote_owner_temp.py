import os
import sys
import tempfile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import User, UserRole, Base

# Database setup - TEMP DIR
db_path = os.path.join(tempfile.gettempdir(), "toolboxpro.db")
DATABASE_URL = f"sqlite:///{db_path}"
print(f"Targeting TEMP database at: {DATABASE_URL}")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def promote_user(email):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            print(f"Found user: {user.email} (Current Role: {user.role.value})")
            if user.role != UserRole.OWNER:
                user.role = UserRole.OWNER
                db.commit()
                print(f"Successfully promoted {user.email} to OWNER.")
            else:
                print(f"User {user.email} is already an OWNER.")
        else:
            print(f"User {email} not found in TEMP database.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    target_email = "xmikezien@gmail.com"
    promote_user(target_email)
