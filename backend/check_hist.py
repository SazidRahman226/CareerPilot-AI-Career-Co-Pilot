"""Check chat history for student1 to confirm stale messages."""
import asyncio
import httpx

BASE = "http://localhost:8000"

async def main():
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.post(f"{BASE}/api/auth/login", json={
            "email": "student1@mail.com", "password": "password123",
        })
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        # Check all conversation_ids for this user
        for conv_id in ["test-jobs-1", "repro-1", "default"]:
            r = await c.get(f"{BASE}/api/chat/history/{conv_id}", headers=h)
            if r.status_code == 200:
                msgs = r.json().get("messages", [])
                print(f"\n=== conversation_id='{conv_id}': {len(msgs)} messages ===")
                for i, m in enumerate(msgs):
                    role = m.get("role", "?")
                    content = m.get("content", "")[:120].replace("\n", " ")
                    ts = m.get("created_at", "?")
                    print(f"  [{i}] {role} @ {ts}: {content!r}")

asyncio.run(main())
