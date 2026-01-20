import requests
import sys

email = "xmikezien@gmail.com"
password = "somepassword" 

try:
    print(f"Attempting login to PRODUCTION for {email}...")
    response = requests.post(
        "https://toolboxpro-api.onrender.com/api/auth/login",
        json={"email": email, "password": password},
        timeout=10
    )
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
