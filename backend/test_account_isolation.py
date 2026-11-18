"""
test_account_isolation.py — Automated Tests for Account Data Isolation
=====================================================================
Verifies:
1. Newly registered users start with zero personal records (empty dashboard).
2. Reports submitted by User A appear on User A's personal dashboard.
3. User B cannot see User A's reports on User B's personal dashboard.
4. User B cannot modify or delete User A's reports (403 Forbidden).
5. User B cannot change workflow status of User A's reports (403 Forbidden).
6. Shared city-wide records and historical traffic overlays remain accessible.
"""
import sys
import os
import unittest
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import app

TINY_JPEG_B64 = (
    "data:image/jpeg;base64,"
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////"
    "wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
)

class TestAccountIsolation(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()
        ts = int(time.time() * 1000)
        self.user_a_email = f"isolation_user_a_{ts}@example.com"
        self.user_b_email = f"isolation_user_b_{ts}@example.com"
        self.password = "Secr3tP@ss123"

        # Register User A
        reg_a = self.client.post("/api/auth/register", json={
            "name": "User Alpha",
            "email": self.user_a_email,
            "password": self.password
        })
        self.assertEqual(reg_a.status_code, 201)
        self.token_a = reg_a.get_json()["token"]
        self.user_a_id = reg_a.get_json()["user"]["user_id"]

        # Register User B
        reg_b = self.client.post("/api/auth/register", json={
            "name": "User Beta",
            "email": self.user_b_email,
            "password": self.password
        })
        self.assertEqual(reg_b.status_code, 201)
        self.token_b = reg_b.get_json()["token"]
        self.user_b_id = reg_b.get_json()["user"]["user_id"]

    def test_01_new_user_starts_with_zero_personal_records(self):
        """Newly created account must display 0 personal crash reports and empty charts."""
        res = self.client.get("/api/crash-statistics?scope=user", headers={
            "Authorization": f"Bearer {self.token_a}"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("scope"), "user")

        stats = data.get("statistics", {})
        self.assertEqual(stats.get("total_submissions"), 0, "Total submissions must be 0 for new user")
        self.assertEqual(stats.get("verified"), 0)
        self.assertEqual(stats.get("pending"), 0)
        self.assertEqual(stats.get("rejected"), 0)
        self.assertEqual(stats.get("high"), 0)
        self.assertEqual(stats.get("moderate"), 0)
        self.assertEqual(stats.get("low"), 0)
        self.assertEqual(stats.get("with_photos"), 0)

        # Charts arrays must be empty
        self.assertEqual(data.get("by_severity"), [])
        self.assertEqual(data.get("by_type"), [])
        self.assertEqual(data.get("by_location"), [])
        self.assertEqual(data.get("by_timeline"), [])
        self.assertEqual(data.get("recent_reports"), [])

        # User reports endpoint must also be empty
        res_reports = self.client.get("/api/user/my-reports", headers={
            "Authorization": f"Bearer {self.token_a}"
        })
        self.assertEqual(res_reports.status_code, 200)
        self.assertEqual(res_reports.get_json().get("count"), 0)
        self.assertEqual(res_reports.get_json().get("reports"), [])

    def test_02_user_a_submits_report_and_sees_it_on_personal_dashboard(self):
        """User A submits a report; it appears on User A's dashboard only."""
        submit_res = self.client.post("/api/crash-reports", headers={
            "Authorization": f"Bearer {self.token_a}"
        }, json={
            "location": "MG Road Isolation Test",
            "latitude": 12.9756,
            "longitude": 77.6067,
            "report_date": "2026-10-21",
            "report_time": "11:30",
            "crash_type": "Vehicle Collision",
            "severity": "High",
            "road_condition": "Dry",
            "description": "User A personal incident test",
            "photo_data": TINY_JPEG_B64,
            "captured_at": "2026-10-21T11:30:00Z"
        })
        self.assertEqual(submit_res.status_code, 201)
        sub_data = submit_res.get_json()
        self.assertTrue(sub_data.get("success"))
        report_id = sub_data.get("report_id")
        self.assertIsNotNone(report_id)

        # User A's personal dashboard should now show 1 report
        res_a = self.client.get("/api/crash-statistics?scope=user", headers={
            "Authorization": f"Bearer {self.token_a}"
        })
        self.assertEqual(res_a.status_code, 200)
        stats_a = res_a.get_json().get("statistics", {})
        self.assertEqual(stats_a.get("total_submissions"), 1)
        self.assertEqual(stats_a.get("high"), 1)
        self.assertEqual(stats_a.get("with_photos"), 1)

        recent = res_a.get_json().get("recent_reports", [])
        self.assertEqual(len(recent), 1)
        self.assertEqual(recent[0]["report_id"], report_id)

    def test_03_user_b_dashboard_remains_isolated_at_zero(self):
        """User A submits report; User B's dashboard must still show 0 reports."""
        # User A submits report
        submit_res = self.client.post("/api/crash-reports", headers={
            "Authorization": f"Bearer {self.token_a}"
        }, json={
            "location": "Indiranagar 100ft Road Isolation Test",
            "latitude": 12.9784,
            "longitude": 77.6408,
            "report_date": "2026-10-21",
            "report_time": "12:00",
            "crash_type": "Rear-end",
            "severity": "Moderate",
            "road_condition": "Wet",
            "description": "User A private incident",
            "photo_data": TINY_JPEG_B64,
            "captured_at": "2026-10-21T12:00:00Z"
        })
        self.assertEqual(submit_res.status_code, 201)
        report_a_id = submit_res.get_json().get("report_id")

        # User B queries personal dashboard
        res_b = self.client.get("/api/crash-statistics?scope=user", headers={
            "Authorization": f"Bearer {self.token_b}"
        })
        self.assertEqual(res_b.status_code, 200)
        stats_b = res_b.get_json().get("statistics", {})
        self.assertEqual(stats_b.get("total_submissions"), 0, "User B must see 0 submissions")
        self.assertEqual(res_b.get_json().get("recent_reports"), [], "User B must not see User A's reports")

        # User B queries my-reports
        my_reports_b = self.client.get("/api/user/my-reports", headers={
            "Authorization": f"Bearer {self.token_b}"
        })
        self.assertEqual(my_reports_b.status_code, 200)
        self.assertEqual(my_reports_b.get_json().get("count"), 0)

    def test_04_user_b_cross_user_operations_forbidden(self):
        """User B cannot PUT, DELETE, or PATCH User A's crash reports (returns 403 Forbidden)."""
        # User A creates report
        submit_res = self.client.post("/api/crash-reports", headers={
            "Authorization": f"Bearer {self.token_a}"
        }, json={
            "location": "Koramangala 80ft Road",
            "latitude": 12.9352,
            "longitude": 77.6245,
            "report_date": "2026-10-21",
            "report_time": "12:15",
            "crash_type": "Side Impact",
            "severity": "High",
            "road_condition": "Dry",
            "description": "User A confidential incident",
            "photo_data": TINY_JPEG_B64,
            "captured_at": "2026-10-21T12:15:00Z"
        })
        self.assertEqual(submit_res.status_code, 201)
        report_a_id = submit_res.get_json()["report_id"]

        # Attempt 1: User B tries to PUT (modify) User A's report -> 403
        put_res = self.client.put(f"/api/user/my-reports/{report_a_id}", headers={
            "Authorization": f"Bearer {self.token_b}"
        }, json={
            "location": "Hacked Location",
            "latitude": 12.0,
            "longitude": 77.0,
            "crash_type": "Vehicle Collision",
            "severity": "Low"
        })
        self.assertEqual(put_res.status_code, 403, "User B modifying User A report must return 403")
        self.assertFalse(put_res.get_json().get("success"))

        # Attempt 2: User B tries to DELETE User A's report -> 403
        del_res = self.client.delete(f"/api/user/my-reports/{report_a_id}", headers={
            "Authorization": f"Bearer {self.token_b}"
        })
        self.assertEqual(del_res.status_code, 403, "User B deleting User A report must return 403")
        self.assertFalse(del_res.get_json().get("success"))

        # Attempt 3: User B tries to PATCH status of User A's report -> 403
        patch_res = self.client.patch(f"/api/crash-reports/{report_a_id}/status", headers={
            "Authorization": f"Bearer {self.token_b}"
        }, json={
            "status": "Verified"
        })
        self.assertEqual(patch_res.status_code, 403, "User B changing status of User A report must return 403")
        self.assertFalse(patch_res.get_json().get("success"))

        # Verify User A can successfully update their own report status -> 200
        patch_a = self.client.patch(f"/api/crash-reports/{report_a_id}/status", headers={
            "Authorization": f"Bearer {self.token_a}"
        }, json={
            "status": "Verified"
        })
        self.assertEqual(patch_a.status_code, 200)
        self.assertEqual(patch_a.get_json().get("status"), "Verified")

    def test_05_shared_historical_corridors_and_public_scope(self):
        """Shared historical traffic and city-wide data remain accessible."""
        # Shared historical corridors (CSV-driven)
        corr_res = self.client.get("/api/historical-traffic/corridors")
        self.assertEqual(corr_res.status_code, 200)
        self.assertTrue(corr_res.get_json().get("success"))
        self.assertGreater(corr_res.get_json().get("corridor_count"), 0)

        # Unauthenticated request for personal dashboard -> 401
        anon_personal = self.client.get("/api/crash-statistics?scope=user")
        self.assertEqual(anon_personal.status_code, 401)

        # Explicit scope=all returns public database aggregation
        public_res = self.client.get("/api/crash-statistics?scope=all")
        self.assertEqual(public_res.status_code, 200)
        self.assertEqual(public_res.get_json().get("scope"), "all")

if __name__ == "__main__":
    unittest.main()
