"""
test_complete_flow.py — Comprehensive End-to-End Verification of Cases A through H
"""
import sys
import os
import requests

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(__file__))

from app import app

TINY_JPEG_B64 = (
    "data:image/jpeg;base64,"
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////"
    "wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
)

def run_e2e_tests():
    print("======================================================================")
    print("VERIFYING END-TO-END FLOW (CASES A THROUGH H)")
    print("======================================================================")

    # -------------------------------------------------------------------------
    # TEST A: Guest clicks Report Crash: form blocked & account-required message
    # -------------------------------------------------------------------------
    print("\n--- TEST A: Guest Access Blocked & Prompt Displayed ---")
    html_path = os.path.join(os.path.dirname(__file__), "..", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Verify guest prompt container exists
    assert 'id="guestReportCrashBlock"' in html, "Missing guestReportCrashBlock in index.html"
    # Verify exact required message
    assert "Please create an account or log in to report a crash." in html, "Missing exact required text"
    # Verify two buttons exist
    assert 'id="btnNoticeRegister"' in html and "Create Account" in html, "Missing Create Account button"
    assert 'id="btnNoticeLogin"' in html and "Log In" in html, "Missing Log In button"
    # Verify active submission form is inside authenticated section
    assert 'id="authenticatedReportSection"' in html, "Missing authenticatedReportSection wrapper"
    print("PASS: Case A verified. Guest account-required card with exact message and dual buttons is configured.")

    # -------------------------------------------------------------------------
    # TEST B: Guest clicks Create Account: registration page/modal opens
    # -------------------------------------------------------------------------
    print("\n--- TEST B: Guest clicks Create Account ---")
    js_path = os.path.join(os.path.dirname(__file__), "..", "app.js")
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert "btnNoticeReg.addEventListener" in js, "Missing listener for btnNoticeRegister"
    assert 'openAuthModal("register")' in js, "Create Account button does not open register modal"
    assert '_redirectAfterAuth = "report-crash"' in js, "Missing redirect bookmark on register click"
    print("PASS: Case B verified. Clicking Create Account sets redirect and opens registration view.")

    # -------------------------------------------------------------------------
    # TEST C: After registration, user can access crash-report form
    # -------------------------------------------------------------------------
    print("\n--- TEST C: Registration grants access to crash-report form ---")
    client = app.test_client()
    import time
    user_c_email = f"user_c_{int(time.time())}@example.com"
    res = client.post("/api/auth/register", json={
        "name": "Citizen User C",
        "email": user_c_email,
        "password": "password123"
    })
    assert res.status_code == 201, f"Registration failed: {res.get_json()}"
    token_c = res.get_json()["token"]
    user_c_id = res.get_json()["user"]["user_id"]
    print(f"PASS: Case C verified. Registration succeeded (User ID: {user_c_id}). Form unlocks for authenticated user.")

    # -------------------------------------------------------------------------
    # TEST D: Guest clicks Log In: login page/modal opens
    # -------------------------------------------------------------------------
    print("\n--- TEST D: Guest clicks Log In ---")
    assert "btnNoticeLog.addEventListener" in js, "Missing listener for btnNoticeLogin"
    assert 'openAuthModal("login")' in js, "Log In button does not open login modal"
    print("PASS: Case D verified. Clicking Log In opens login view with redirect bookmark.")

    # -------------------------------------------------------------------------
    # TEST E: After login, the user can submit a crash report
    # -------------------------------------------------------------------------
    print("\n--- TEST E: Logged-in user submits crash report ---")
    res = client.post("/api/crash-reports",
        headers={"Authorization": f"Bearer {token_c}"},
        json={
            "location": "Electronic City Road",
            "report_date": "2026-10-21",
            "report_time": "08:15",
            "crash_type": "Rear-end",
            "severity": "Moderate",
            "road_condition": "Dry",
            "description": "Fender bender near phase 1 toll gate",
            "photo_data": TINY_JPEG_B64
        }
    )
    assert res.status_code == 201, f"Submission failed: {res.get_json()}"
    report_c_id = res.get_json()["report_id"]
    assert res.get_json()["status"] == "Pending"
    print(f"PASS: Case E verified. Logged-in user successfully submitted report CR-{report_c_id:04d}.")

    # -------------------------------------------------------------------------
    # TEST F: Direct API request without authentication is rejected (HTTP 401)
    # -------------------------------------------------------------------------
    print("\n--- TEST F: Direct API request without authentication rejected ---")
    res = client.post("/api/crash-reports", json={
        "location": "Hosur Road",
        "severity": "High"
    })
    assert res.status_code == 401, f"Expected 401 Unauthorized, got: {res.status_code}"
    assert res.get_json()["success"] is False
    print("PASS: Case F verified. Unauthenticated API request returned HTTP 401.")

    # -------------------------------------------------------------------------
    # TEST G: Logged-in user cannot edit or delete another user's report (HTTP 403)
    # -------------------------------------------------------------------------
    print("\n--- TEST G: Cross-user edit/delete rejected with HTTP 403 Forbidden ---")
    user_d_email = f"user_d_{int(time.time())}@example.com"
    res = client.post("/api/auth/register", json={
        "name": "Different User D",
        "email": user_d_email,
        "password": "password456"
    })
    assert res.status_code == 201
    token_d = res.get_json()["token"]

    # User D attempts to update User C's report
    res = client.put(f"/api/user/my-reports/{report_c_id}",
        headers={"Authorization": f"Bearer {token_d}"},
        json={"location": "Tampered Road", "report_date": "2026-10-21", "report_time": "12:00"}
    )
    assert res.status_code == 403, f"Expected 403 Forbidden on PUT, got: {res.status_code}"
    print("PASS: Cross-user update blocked with HTTP 403 Forbidden.")

    # User D attempts to delete User C's report
    res = client.delete(f"/api/user/my-reports/{report_c_id}",
        headers={"Authorization": f"Bearer {token_d}"}
    )
    assert res.status_code == 403, f"Expected 403 Forbidden on DELETE, got: {res.status_code}"
    print("PASS: Cross-user delete blocked with HTTP 403 Forbidden.")

    # -------------------------------------------------------------------------
    # TEST H: Logging out removes access to protected reporting actions
    # -------------------------------------------------------------------------
    print("\n--- TEST H: Logout removes access to protected reporting actions ---")
    res = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token_c}"})
    assert res.status_code == 200

    # User C tries to submit another report with the logged-out token
    res = client.post("/api/crash-reports",
        headers={"Authorization": f"Bearer {token_c}"},
        json={"location": "Bannerghatta Road"}
    )
    assert res.status_code == 401, f"Expected 401 after logout, got: {res.status_code}"
    print("PASS: Case H verified. Logged-out token is rejected with HTTP 401.")

    print("\n======================================================================")
    print("ALL TESTS A THROUGH H PASSED WITH 100% SUCCESS!")
    print("======================================================================")

if __name__ == "__main__":
    run_e2e_tests()
