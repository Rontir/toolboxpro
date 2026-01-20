import requests
import sys

email = "xmikezien@gmail.com"
password = "somepassword" # Doesn't matter if it's wrong, we just want to see if it connects

try:
    print(f"Attempting login for {email}...")
    response = requests.post(
        "http://localhost:8000/api/auth/login",
        json={"email": email, "password": password},
        timeout=5
    )
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
