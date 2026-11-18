"""
test_camera_upload.py — Integration Tests for In-App Camera Photo Uploads
"""
import urllib.request
import urllib.error
import json
import os
import time

BASE_URL = "http://127.0.0.1:5000"

TINY_JPEG_B64 = (
    "data:image/jpeg;base64,"
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////"
    "wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
)

def make_request(path, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    url = f"{BASE_URL}{path}"
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read()
            return response.status, json.loads(res_body.decode("utf-8")) if response.headers.get_content_type() == "application/json" else res_body
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, err_body

def test_full_camera_flow():
    print("[1] Registering test user...")
    test_email = f"camtest_{int(time.time())}@example.com"
    status, res = make_request("/api/auth/register", "POST", {
        "name": "Camera Tester",
        "email": test_email,
        "password": "Password123!"
    })
    assert status == 201, f"Register failed: {res}"
    token = res["token"]
    auth_headers = {"Authorization": f"Bearer {token}"}
    print("   -> Registered and authenticated successfully.")

    print("[2] Submitting crash report with captured accident photo and GPS metadata...")
    captured_timestamp = "2026-10-21T10:55:00.000Z"
    status, res = make_request("/api/crash-reports", "POST", {
        "location": "Outer Ring Road",
        "report_date": "2026-10-21",
        "report_time": "10:55",
        "crash_type": "Vehicle Collision",
        "severity": "Moderate",
        "road_condition": "Dry",
        "description": "Two cars collided at intersection. Front bumper damage.",
        "photo_data": TINY_JPEG_B64,
        "captured_at": captured_timestamp,
        "capture_lat": 12.92482,
        "capture_lng": 77.68051
    }, headers=auth_headers)
    assert status == 201, f"Report submit failed: {res}"
    report_id = res["report_id"]
    photo_path = res["photo_path"]
    assert photo_path is not None, "photo_path was not returned in response"
    assert photo_path.startswith("uploads/crash_"), f"Unexpected photo path: {photo_path}"
    print(f"   -> Report CR-{report_id:04d} created with photo: {photo_path}")

    print("[3] Verifying photo file exists on disk in backend/uploads/...")
    filename = os.path.basename(photo_path)
    backend_uploads_dir = os.path.join(r"C:\Users\abhin\.gemini\antigravity\scratch\smart-traffic-system\backend", "uploads")
    local_file = os.path.join(backend_uploads_dir, filename)
    assert os.path.isfile(local_file), f"File {local_file} not found on disk"
    file_size = os.path.getsize(local_file)
    assert file_size > 50, f"Saved file is too small: {file_size} bytes"
    print(f"   -> File exists on disk ({file_size} bytes)")

    print("[4] Testing GET /api/uploads/<filename> serving endpoint...")
    status, img_content = make_request(f"/api/uploads/{filename}", "GET")
    assert status == 200, f"Serving endpoint failed with status {status}"
    assert len(img_content) == file_size, "Served content size mismatch"
    print("   -> Served correctly via API with HTTP 200.")

    print("[5] Verifying user reports table query contains photo columns...")
    status, res = make_request("/api/user/my-reports", "GET", headers=auth_headers)
    assert status == 200, f"My reports query failed: {res}"
    reports = res["reports"]
    matching = [r for r in reports if r["report_id"] == report_id]
    assert len(matching) == 1, "Created report not found in user reports"
    r = matching[0]
    assert r["photo_path"] == photo_path
    assert r["captured_at"] == captured_timestamp
    assert abs(r["capture_lat"] - 12.92482) < 0.001
    assert abs(r["capture_lng"] - 77.68051) < 0.001
    print("   -> User reports endpoint returns complete photo and GPS telemetry.")

    print("[6] Testing security: Path traversal prevention...")
    status, _ = make_request("/api/uploads/../app.py", "GET")
    assert status in (400, 404), f"Traversal attempt succeeded with status {status}!"
    print("   -> Path traversal safely blocked with HTTP 400/404.")

    print("[7] Testing validation: Unsupported photo format...")
    status, res = make_request("/api/crash-reports", "POST", {
        "location": "Hosur Road",
        "description": "Test",
        "photo_data": "data:text/plain;base64,SGVsbG8="
    }, headers=auth_headers)
    assert status == 400, f"Expected 400 for bad format, got {status}"
    print("   -> Bad MIME type rejected safely.")

    print("[8] Testing mandatory enforcement: Report WITHOUT photo MUST be rejected with 400...")
    status, res = make_request("/api/crash-reports", "POST", {
        "location": "Electronic City Road",
        "report_date": "2026-10-21",
        "report_time": "11:00",
        "description": "Attempting to submit without accident photo."
    }, headers=auth_headers)
    assert status == 400, f"Expected 400 for missing photo, got {status}: {res}"
    assert "photo captured directly via in-app camera is required" in res.get("error", "").lower(), f"Unexpected error msg: {res}"
    print("   -> Missing photo correctly rejected with HTTP 400 Bad Request.")

    print("[9] Testing mandatory enforcement: Report with empty/whitespace photo MUST be rejected...")
    status, res = make_request("/api/crash-reports", "POST", {
        "location": "Electronic City Road",
        "report_date": "2026-10-21",
        "report_time": "11:00",
        "description": "Empty photo test.",
        "photo_data": "   "
    }, headers=auth_headers)
    assert status == 400, f"Expected 400 for empty photo, got {status}: {res}"
    print("   -> Empty photo string correctly rejected with HTTP 400.")

    print("\nALL MANDATORY CAMERA PHOTO UPLOAD TESTS PASSED SUCCESSFULLY! (PASS)")

if __name__ == "__main__":
    test_full_camera_flow()
