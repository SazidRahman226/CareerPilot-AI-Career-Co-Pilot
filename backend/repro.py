"""Reproduce the user's exact issue from the frontend."""
import asyncio
import httpx
import time

BASE = "http://localhost:8000"

async def main():
    async with httpx.AsyncClient(timeout=180.0) as c:
        # Login as student1 (the user with a CV)
        r = await c.post(f"{BASE}/api/auth/login", json={
            "email": "student1@mail.com",
            "password": "password123",
        })
        print(f"Login: {r.status_code}")
        if r.status_code != 200:
            print(r.text[:500])
            return
        token = r.json()["access_token"]

        headers = {"Authorization": f"Bearer {token}"}

        # Send the EXACT question the user typed
        print("\n=== Sending: 'based on my cv what jobs fit me' ===")
        t0 = time.time()
        r = await c.post(
            f"{BASE}/api/chat",
            headers=headers,
            json={"message": "based on my cv what jobs fit me", "conversation_id": "repro-1"},
        )
        print(f"Status: {r.status_code}  ({time.time()-t0:.1f}s)")
        data = r.json()
        resp = data.get("response", "")
        print(f"\n--- RESPONSE ({len(resp)} chars) ---")
        print(resp[:2500])
        print(f"\n--- SOURCES ---")
        print(data.get("sources", []))

asyncio.run(main())
