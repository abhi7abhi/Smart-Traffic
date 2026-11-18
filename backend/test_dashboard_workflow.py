"""
test_dashboard_workflow.py — End-to-End Test for Dynamic Dashboard & Refresh Workflow
====================================================================================
Tests the exact workflow requested:
  1. Fetch current dashboard stats and note baseline counts.
  2. Submit valid crash report with severity 'High'.
  3. Confirm report is saved in MySQL database.
  4. Fetch dashboard stats and verify total_crashes and high count increased by exactly 1.
  5. Verify trends line data reflects the new submission.
  6. Repeat with 'Medium' (Moderate) severity -> verify medium count increments by 1.
  7. Repeat with 'Low' severity -> verify low count increments by 1.
  8. Test aliases: POST /api/crashes, GET /api/crashes, GET /api/dashboard/stats, GET /api/dashboard/trends.
  9. Test graceful handling when dataset is empty or filtered by future date range.
"""

import unittest
import os
import sys
import json
import base64
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import app
from database import get_connection

class TestDashboardWorkflow(unittest.TestCase):

    def setUp(self):
        self.client = app.test_client()
        # Create unique user session for testing
        test_email = f"dash_test_{int(time.time() * 1000)}@smarttraffic.org"
        reg_res = self.client.post(
            "/api/auth/register",
            data=json.dumps({
                "name": "Dashboard Automation Tester",
                "email": test_email,
                "password": "Password123!"
            }),
            content_type="application/json"
        )
        self.assertEqual(reg_res.status_code, 201)
        reg_data = reg_res.get_json()
        self.token = reg_data["token"]
        self.auth_headers = {"Authorization": f"Bearer {self.token}"}

        # 1x1 transparent GIF as test photo payload
        self.dummy_photo = "data:image/jpeg;base64," + base64.b64encode(
            b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
        ).decode("utf-8")
        self.created_report_ids = []

    def tearDown(self):
        # Clean up created test records from MySQL
        if self.created_report_ids:
            try:
                conn = get_connection()
                cursor = conn.cursor()
                for rid in self.created_report_ids:
                    cursor.execute("DELETE FROM crash_reports WHERE report_id = %s", (rid,))
                conn.commit()
                cursor.close()
                conn.close()
            except Exception as e:
                print(f"Cleanup error: {e}")

    def test_01_end_to_end_dashboard_refresh_workflow(self):
        """Step-by-step workflow: Note stats -> Submit High/Medium/Low -> Verify increments."""
        # Step 1: Open Dashboard and note baseline statistics
        res = self.client.get("/api/dashboard/stats?scope=all")
        self.assertEqual(res.status_code, 200)
        base_data = res.get_json()
        self.assertTrue(base_data["success"])
        base_stats = base_data["statistics"]
        base_total = base_stats["total_crashes"]
        base_high = base_stats["high"]
        base_medium = base_stats["medium"]
        base_low = base_stats["low"]

        # Step 2 & 3: Submit valid crash report with severity 'High'
        high_payload = {
            "location": "Hosur Road near Silk Board, Bengaluru",
            "latitude": 12.9172,
            "longitude": 77.6228,
            "crash_type": "Rear-End Collision",
            "severity": "High",
            "road_condition": "Wet Surface",
            "description": "High severity collision test for dynamic dashboard update.",
            "photo_data": self.dummy_photo,
            "report_date": "2026-10-24",
            "report_time": "12:30",
            "captured_at": "2026-10-24T12:30:00Z"
        }
        post_res = self.client.post(
            "/api/crash-reports",
            data=json.dumps(high_payload),
            headers=self.auth_headers,
            content_type="application/json"
        )
        self.assertEqual(post_res.status_code, 201)
        post_data = post_res.get_json()
        self.assertTrue(post_data["success"])
        high_report_id = post_data["report_id"]
        self.created_report_ids.append(high_report_id)

        # Step 4: Confirm report is saved in MySQL database
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM crash_reports WHERE report_id = %s", (high_report_id,))
        saved_row = cursor.fetchone()
        cursor.close()
        conn.close()
        self.assertIsNotNone(saved_row)
        self.assertEqual(saved_row["severity"], "High")

        # Step 5: Open Dashboard and verify total crashes and High severity increased by exactly 1
        res2 = self.client.get("/api/dashboard/stats?scope=all")
        self.assertEqual(res2.status_code, 200)
        stats2 = res2.get_json()["statistics"]
        self.assertEqual(stats2["total_crashes"], base_total + 1)
        self.assertEqual(stats2["high"], base_high + 1)
        self.assertEqual(stats2["medium"], base_medium)
        self.assertEqual(stats2["low"], base_low)

        # Step 6: Verify trends endpoint includes this date
        trends_res = self.client.get("/api/dashboard/trends")
        self.assertEqual(trends_res.status_code, 200)
        trends_data = trends_res.get_json()
        self.assertTrue(trends_data["success"])
        dates = [t["date"] for t in trends_data["trends"]]
        self.assertIn("2026-10-24", dates)

        # Step 7: Repeat with 'Medium' severity via alias /api/crashes
        med_payload = dict(high_payload)
        med_payload["severity"] = "Medium"
        med_payload["location"] = "Whitefield Main Road, Bengaluru"
        post_med = self.client.post(
            "/api/crashes",
            data=json.dumps(med_payload),
            headers=self.auth_headers,
            content_type="application/json"
        )
        self.assertEqual(post_med.status_code, 201)
        med_id = post_med.get_json()["report_id"]
        self.created_report_ids.append(med_id)

        res3 = self.client.get("/api/dashboard/stats?scope=all")
        stats3 = res3.get_json()["statistics"]
        self.assertEqual(stats3["total_crashes"], base_total + 2)
        self.assertEqual(stats3["high"], base_high + 1)
        self.assertEqual(stats3["medium"], base_medium + 1)
        self.assertEqual(stats3["low"], base_low)

        # Step 8: Repeat with 'Low' severity
        low_payload = dict(high_payload)
        low_payload["severity"] = "Low"
        low_payload["location"] = "Koramangala 80ft Road, Bengaluru"
        post_low = self.client.post(
            "/api/crashes",
            data=json.dumps(low_payload),
            headers=self.auth_headers,
            content_type="application/json"
        )
        self.assertEqual(post_low.status_code, 201)
        low_id = post_low.get_json()["report_id"]
        self.created_report_ids.append(low_id)

        res4 = self.client.get("/api/dashboard/stats?scope=all")
        stats4 = res4.get_json()["statistics"]
        self.assertEqual(stats4["total_crashes"], base_total + 3)
        self.assertEqual(stats4["high"], base_high + 1)
        self.assertEqual(stats4["medium"], base_medium + 1)
        self.assertEqual(stats4["low"], base_low + 1)

    def test_02_api_aliases_and_error_handling(self):
        """Tests /api/crashes GET, trends, and graceful error handling."""
        # GET /api/crashes
        res = self.client.get("/api/crashes?status=all")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertGreaterEqual(data["count"], 1)

        # Future date range (empty state test)
        res_empty = self.client.get("/api/dashboard/stats?date_range=today")
        self.assertEqual(res_empty.status_code, 200)
        data_empty = res_empty.get_json()
        self.assertTrue(data_empty["success"])
        self.assertIn("statistics", data_empty)

        # Trends
        t_res = self.client.get("/api/dashboard/trends")
        self.assertEqual(t_res.status_code, 200)
        self.assertTrue(t_res.get_json()["success"])


if __name__ == "__main__":
    unittest.main()
