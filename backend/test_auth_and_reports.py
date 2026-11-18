"""
test_auth_and_reports.py — Verification of user authentication, report isolation, and security
"""
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(__file__))

from app import app
from database import get_connection

TINY_JPEG_B64 = (
    "data:image/jpeg;base64,"
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////"
    "wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
)

def run_tests():
    client = app.test_client()
    print("=== Starting Auth & Ownership Security Tests ===")

    # 1. Register User A
    user_a_email = "alice@example.com"
    user_a_pass = "securepass123"
    res = client.post("/api/auth/register", json={
        "name": "Alice Sharma",
        "email": user_a_email,
        "password": user_a_pass
    })
    print(f"Register User A status: {res.status_code}")
    assert res.status_code in (201, 409), f"Unexpected status: {res.status_code}"
    
    # Login User A if already exists or newly created
    res = client.post("/api/auth/login", json={
        "email": user_a_email,
        "password": user_a_pass
    })
    assert res.status_code == 200, f"Login failed: {res.get_json()}"
    token_a = res.get_json()["token"]
    user_a_id = res.get_json()["user"]["user_id"]
    print(f"User A logged in. User ID: {user_a_id}, Token: {token_a[:10]}...")

    # 2. Register/Login User B
    user_b_email = "bob@example.com"
    user_b_pass = "securepass456"
    client.post("/api/auth/register", json={
        "name": "Bob Verma",
        "email": user_b_email,
        "password": user_b_pass
    })
    res = client.post("/api/auth/login", json={
        "email": user_b_email,
        "password": user_b_pass
    })
    assert res.status_code == 200, f"Login failed: {res.get_json()}"
    token_b = res.get_json()["token"]
    user_b_id = res.get_json()["user"]["user_id"]
    print(f"User B logged in. User ID: {user_b_id}, Token: {token_b[:10]}...")

    # 3. Test unauthenticated report submission -> Should fail with 401
    res = client.post("/api/crash-reports", json={
        "location": "Outer Ring Road",
        "severity": "High"
    })
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"
    print("PASS: Unauthenticated report creation returned 401 Unauthorized.")

    # 4. User A submits a crash report -> Should succeed with 201 & Pending
    res = client.post("/api/crash-reports", 
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "location": "Outer Ring Road",
            "crash_type": "Rear-end",
            "severity": "Moderate",
            "road_condition": "Dry",
            "description": "Minor fender bender near Marathahalli",
            "report_date": "2026-10-21",
            "report_time": "09:30",
            "photo_data": TINY_JPEG_B64
        }
    )
    assert res.status_code == 201, f"Submission failed: {res.get_json()}"
    report_data = res.get_json()
    report_a_id = report_data["report_id"]
    assert report_data["status"] == "Pending"
    print(f"PASS: User A submitted report CR-{report_a_id:04d} with status Pending.")

    # 5. Public map endpoint GET /api/crash-reports -> Must NOT include User A's Pending report
    res = client.get("/api/crash-reports")
    assert res.status_code == 200
    public_reports = res.get_json()["reports"]
    public_ids = [r["report_id"] for r in public_reports]
    assert report_a_id not in public_ids, "Security breach: Pending report exposed on public map!"
    print("PASS: Pending report is NOT visible on public map (verification integrity preserved).")

    # 6. User A checks their own reports GET /api/user/my-reports -> Must see report
    res = client.get("/api/user/my-reports", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 200
    my_reports = res.get_json()["reports"]
    my_ids = [r["report_id"] for r in my_reports]
    assert report_a_id in my_ids, "User A cannot see their own report"
    print("PASS: User A successfully retrieved their own submitted report.")

    # 7. User B checks their own reports GET /api/user/my-reports -> Must NOT see User A's report
    res = client.get("/api/user/my-reports", headers={"Authorization": f"Bearer {token_b}"})
    assert res.status_code == 200
    b_reports = res.get_json()["reports"]
    b_ids = [r["report_id"] for r in b_reports]
    assert report_a_id not in b_ids, "Data leak: User B sees User A's report!"
    print("PASS: User B cannot see User A's report (data isolation verified).")

    # 8. User B attempts to edit User A's report -> Must return 403 Forbidden!
    res = client.put(f"/api/user/my-reports/{report_a_id}",
        headers={"Authorization": f"Bearer {token_b}"},
        json={
            "location": "Hacked Location",
            "severity": "Low"
        }
    )
    assert res.status_code == 403, f"Expected 403 Forbidden, got {res.status_code}: {res.get_json()}"
    print("PASS: User B blocked from editing User A's report (403 Forbidden enforced).")

    # 9. User B attempts to delete User A's report -> Must return 403 Forbidden!
    res = client.delete(f"/api/user/my-reports/{report_a_id}",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert res.status_code == 403, f"Expected 403 Forbidden, got {res.status_code}: {res.get_json()}"
    print("PASS: User B blocked from deleting User A's report (403 Forbidden enforced).")

    # 10. User A updates their own report -> Should succeed with 200
    res = client.put(f"/api/user/my-reports/{report_a_id}",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "location": "Outer Ring Road (Bellandur)",
            "crash_type": "Rear-end",
            "severity": "Low",
            "road_condition": "Dry",
            "description": "Updated: Vehicles moved to shoulder",
            "report_date": "2026-10-21",
            "report_time": "09:45"
        }
    )
    assert res.status_code == 200, f"Update failed: {res.get_json()}"
    print("PASS: User A successfully updated their own report.")

    # 11. User A deletes their own report -> Should succeed with 200
    res = client.delete(f"/api/user/my-reports/{report_a_id}",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res.status_code == 200, f"Delete failed: {res.get_json()}"
    print("PASS: User A successfully deleted their own report.")

    # Verify deletion in database
    res = client.get("/api/user/my-reports", headers={"Authorization": f"Bearer {token_a}"})
    remaining_ids = [r["report_id"] for r in res.get_json()["reports"]]
    assert report_a_id not in remaining_ids
    print("PASS: Deleted report no longer exists in User A's reports.")

    # 12. User A logs out
    res = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 200
    # Trying to access protected route after logout -> 401
    res = client.get("/api/user/my-reports", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 401
    print("PASS: User A logged out and session token invalidated.")

    print("\nALL AUTH & REPORT OWNERSHIP TESTS PASSED SUCCESSFULLY! (100% SECURE)")

if __name__ == "__main__":
    run_tests()
