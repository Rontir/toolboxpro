import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import User, UserRole, Base
from database import DATABASE_URL

print(f"Checking database at: {DATABASE_URL}")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def check_user(email):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            print(f"User: {user.email}")
            print(f"Role: {user.role.value}")
        else:
            print(f"User {email} not found.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_user("xmikezien@gmail.com")
