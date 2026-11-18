"""
test_dashboard_stats.py — Integration Tests for Database-Driven Dashboard
=========================================================================
"""
import sys
import os
import unittest
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import app

TINY_JPEG_B64 = (
    "data:image/jpeg;base64,"
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////"
    "wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
)

class TestDashboardStats(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()
        self.test_email = f"dash_tester_{os.getpid()}@example.com"
        self.password = "Secr3tP@ssword"
        reg_res = self.client.post("/api/auth/register", json={
            "name": "Dashboard Tester",
            "email": self.test_email,
            "password": self.password
        })
        if reg_res.status_code == 201:
            self.token = reg_res.get_json().get("token")
        else:
            login_res = self.client.post("/api/auth/login", json={
                "email": self.test_email,
                "password": self.password
            })
            self.token = login_res.get_json().get("token")

    def test_01_get_dashboard_statistics_schema(self):
        """Verify schema and exact mathematical consistency of aggregations."""
        res = self.client.get("/api/crash-statistics")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))

        stats = data.get("statistics", {})
        self.assertIn("total_submissions", stats)
        self.assertIn("verified", stats)
        self.assertIn("pending", stats)
        self.assertIn("rejected", stats)
        self.assertIn("high", stats)
        self.assertIn("moderate", stats)
        self.assertIn("low", stats)
        self.assertIn("with_photos", stats)

        self.assertEqual(
            stats["total_submissions"],
            stats["verified"] + stats["pending"] + stats["rejected"] + stats.get("resolved", 0),
            "total_submissions must equal verified + pending + rejected + resolved"
        )

        self.assertIsInstance(data.get("by_severity"), list)
        self.assertIsInstance(data.get("by_type"), list)
        self.assertIsInstance(data.get("by_location"), list)
        self.assertIsInstance(data.get("by_condition"), list)
        self.assertIsInstance(data.get("by_timeline"), list)
        self.assertIsInstance(data.get("recent_reports"), list)

    def test_02_status_workflow_transitions(self):
        """Verify Pending -> Verified -> Rejected status transitions."""
        # Create a report owned by this test user
        submit_res = self.client.post("/api/crash-reports", headers={"Authorization": f"Bearer {self.token}"}, json={
            "location": "Workflow Test Corridor",
            "report_date": "2026-10-21",
            "report_time": "10:00",
            "crash_type": "Vehicle Collision",
            "severity": "Moderate",
            "road_condition": "Dry",
            "description": "Workflow transition test",
            "photo_data": TINY_JPEG_B64,
            "captured_at": "2026-10-21T10:00:00Z"
        })
        self.assertEqual(submit_res.status_code, 201)
        target_id = submit_res.get_json()["report_id"]
        headers = {"Authorization": f"Bearer {self.token}"}

        # Transition to Verified
        patch_res = self.client.patch(f"/api/crash-reports/{target_id}/status", headers=headers, json={"status": "Verified"})
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.get_json()["status"], "Verified")

        stats_verified = self.client.get("/api/crash-statistics").get_json()["statistics"]
        self.assertGreater(stats_verified["total_submissions"], 0)

        # Transition to Rejected
        patch_res2 = self.client.patch(f"/api/crash-reports/{target_id}/status", headers=headers, json={"status": "Rejected"})
        self.assertEqual(patch_res2.status_code, 200)
        self.assertEqual(patch_res2.get_json()["status"], "Rejected")

        # Restore original status
        restore_res = self.client.patch(f"/api/crash-reports/{target_id}/status", headers=headers, json={"status": "Pending"})
        self.assertEqual(restore_res.status_code, 200)

    def test_03_submit_report_with_photo_increments_dashboard(self):
        """Verify submitting report increments total_submissions and pending by 1."""
        res_before = self.client.get("/api/crash-statistics")
        stats_before = res_before.get_json()["statistics"]

        payload = {
            "location": "Electronic City Road",
            "report_date": "2026-10-21",
            "report_time": "14:30",
            "crash_type": "Side Impact",
            "severity": "High",
            "road_condition": "Wet",
            "description": "Dashboard integration test crash report.",
            "photo_data": TINY_JPEG_B64,
            "captured_at": "2026-10-21T14:30:00.000Z"
        }

        submit_res = self.client.post(
            "/api/crash-reports",
            headers={"Authorization": f"Bearer {self.token}"},
            json=payload
        )
        self.assertEqual(submit_res.status_code, 201)
        data = submit_res.get_json()
        self.assertTrue(data.get("success"))
        new_report_id = data.get("report_id")

        res_after = self.client.get("/api/crash-statistics")
        stats_after = res_after.get_json()["statistics"]
        self.assertEqual(stats_after["total_submissions"], stats_before["total_submissions"] + 1)
        self.assertEqual(stats_after["pending"], stats_before["pending"] + 1)
        self.assertEqual(stats_after["with_photos"], stats_before["with_photos"] + 1)

        recent_after = res_after.get_json()["recent_reports"]
        self.assertEqual(recent_after[0]["report_id"], new_report_id)

    def test_04_invalid_status_rejected(self):
        """Verify invalid status returns 400."""
        res = self.client.patch("/api/crash-reports/1/status", json={"status": "BogusStatus"})
        self.assertEqual(res.status_code, 400)

    def test_05_nonexistent_report_status_404(self):
        """Verify non-existent report ID returns 404."""
        res = self.client.patch("/api/crash-reports/999999/status", json={"status": "Verified"})
        self.assertEqual(res.status_code, 404)

    def test_06_user_scoping(self):
        """Verify scope=user filters to authenticated user."""
        res = self.client.get("/api/crash-statistics?scope=user", headers={"Authorization": f"Bearer {self.token}"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("scope"), "user")

    def test_07_unauthenticated_user_scope_401(self):
        """Verify unauthenticated user scope returns 401."""
        res = self.client.get("/api/crash-statistics?scope=user")
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
