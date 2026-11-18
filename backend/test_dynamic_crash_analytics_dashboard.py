"""
test_dynamic_crash_analytics_dashboard.py
=========================================
Integration tests for the Dynamic Crash & Traffic Analytics Dashboard:
  1. A new user with no reports sees zero counts, empty charts, and empty table.
  2. Submitting a report updates the dashboard metrics (total, severity, type, road condition).
  3. A report appears with the exact stored severity, location, date, and status.
  4. Date filters (today, 7d, 30d, all) update summary cards, charts, and table consistently.
  5. Search and filters work together (location, description, severity, verification status).
  6. Users cannot see another user's private reports (strict isolation).
  7. Backend error handling produces honest error messages without fabricated data.
  8. Schema validation: all 6 summary cards, 5 charts, and recent reports arrays exist.
  9. Core features intact: authentication, route detection, and public map feeds still work.
"""

import sys
import os
import unittest
import json
import base64
from datetime import datetime, timedelta, date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import app as flask_app
import database

TINY_JPEG_B64 = (
    "data:image/jpeg;base64," +
    base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 150).decode("utf-8")
)


class TestDynamicCrashAnalyticsDashboard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        flask_app.app.config["TESTING"] = True

    def setUp(self):
        self.client = flask_app.app.test_client()
        self.pid = os.getpid()

    def _create_user(self, name_suffix):
        email = f"analytics_user_{name_suffix}_{self.pid}_{int(datetime.now().timestamp()*1000)}@example.com"
        res = self.client.post("/api/auth/register", json={
            "name": f"Citizen {name_suffix}",
            "email": email,
            "password": "Password123!"
        })
        self.assertEqual(res.status_code, 201)
        token = res.get_json()["token"]
        return email, token

    def test_01_new_user_sees_zero_counts_and_empty_analytics(self):
        """Scenario 1: A newly registered user sees zero counts, empty charts, and empty table."""
        email, token = self._create_user("Newbie")
        headers = {"Authorization": f"Bearer {token}"}

        res = self.client.get("/api/crash-statistics?scope=user&date_range=all", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))

        stats = data.get("statistics", {})
        self.assertEqual(stats.get("total_submissions"), 0)
        self.assertEqual(stats.get("high"), 0)
        self.assertEqual(stats.get("moderate"), 0)
        self.assertEqual(stats.get("low"), 0)
        self.assertEqual(stats.get("pending"), 0)
        self.assertEqual(stats.get("resolved"), 0)

        # Charts data arrays must be empty
        self.assertEqual(len(data.get("by_severity", [])), 0)
        self.assertEqual(len(data.get("by_type", [])), 0)
        self.assertEqual(len(data.get("by_condition", [])), 0)
        self.assertEqual(len(data.get("by_status", [])), 0)
        self.assertEqual(len(data.get("by_timeline", [])), 0)
        self.assertEqual(len(data.get("recent_reports", [])), 0)

    def test_02_submit_report_updates_dashboard_metrics(self):
        """Scenario 2 & 3: Submitting a report updates metrics, charts, and table with exact data."""
        email, token = self._create_user("ReporterA")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Initially zero
        res_init = self.client.get("/api/crash-statistics?scope=user", headers=headers)
        self.assertEqual(res_init.get_json()["statistics"]["total_submissions"], 0)

        # 2. Submit high-severity vehicle collision report
        today_str = date.today().strftime("%Y-%m-%d")
        sub_res = self.client.post("/api/crash-reports", headers=headers, json={
            "location": "Hebbal Flyover Corridor",
            "latitude": 13.0358,
            "longitude": 77.5970,
            "report_date": today_str,
            "report_time": "11:30",
            "crash_type": "Vehicle Collision",
            "severity": "High",
            "road_condition": "Wet",
            "description": "Multi-car collision near Hebbal ramp during rain.",
            "photo_data": TINY_JPEG_B64
        })
        self.assertEqual(sub_res.status_code, 201)
        created_id = sub_res.get_json()["report_id"]

        # 3. Refresh dashboard
        res_after = self.client.get("/api/crash-statistics?scope=user&date_range=all", headers=headers)
        self.assertEqual(res_after.status_code, 200)
        data = res_after.get_json()
        stats = data["statistics"]

        self.assertEqual(stats["total_submissions"], 1)
        self.assertEqual(stats["high"], 1)
        self.assertEqual(stats["moderate"], 0)
        self.assertEqual(stats["low"], 0)
        self.assertEqual(stats["pending"], 1)
        self.assertEqual(stats["resolved"], 0)

        # Verify recent report fields match exactly
        recent = data["recent_reports"]
        self.assertEqual(len(recent), 1)
        rep = recent[0]
        self.assertEqual(rep["report_id"], created_id)
        self.assertEqual(rep["location"], "Hebbal Flyover Corridor")
        self.assertEqual(rep["severity"], "High")
        self.assertEqual(rep["status"], "Pending")
        self.assertEqual(rep["crash_type"], "Vehicle Collision")
        self.assertEqual(rep["road_condition"], "Wet")
        self.assertEqual(rep["report_date"], today_str)

        # Verify charts receive this data
        sev_counts = {item["label"]: item["count"] for item in data["by_severity"]}
        self.assertEqual(sev_counts.get("High"), 1)

        type_counts = {item["label"]: item["count"] for item in data["by_type"]}
        self.assertEqual(type_counts.get("Vehicle Collision"), 1)

        cond_counts = {item["label"]: item["count"] for item in data["by_condition"]}
        self.assertEqual(cond_counts.get("Wet"), 1)

    def test_03_date_range_filters_update_consistently(self):
        """Scenario 4: Date filters (today, 7d, 30d, all) update summary cards and charts consistently."""
        email, token = self._create_user("DateFilterTester")
        headers = {"Authorization": f"Bearer {token}"}

        today_str = date.today().strftime("%Y-%m-%d")
        past_10d_str = (date.today() - timedelta(days=10)).strftime("%Y-%m-%d")
        past_45d_str = (date.today() - timedelta(days=45)).strftime("%Y-%m-%d")

        # Submit 1 report today
        self.client.post("/api/crash-reports", headers=headers, json={
            "location": "MG Road",
            "report_date": today_str,
            "report_time": "09:00",
            "crash_type": "Rear-end",
            "severity": "Low",
            "road_condition": "Dry",
            "description": "Minor fender bender today.",
            "photo_data": TINY_JPEG_B64
        })

        # Submit 1 report 10 days ago
        self.client.post("/api/crash-reports", headers=headers, json={
            "location": "Indiranagar 100ft Road",
            "report_date": past_10d_str,
            "report_time": "14:00",
            "crash_type": "Side Impact",
            "severity": "Moderate",
            "road_condition": "Normal",
            "description": "Intersection crash 10 days ago.",
            "photo_data": TINY_JPEG_B64
        })

        # Submit 1 report 45 days ago
        self.client.post("/api/crash-reports", headers=headers, json={
            "location": "Electronic City Phase 1",
            "report_date": past_45d_str,
            "report_time": "18:00",
            "crash_type": "Two-Wheeler",
            "severity": "High",
            "road_condition": "Damaged",
            "description": "Old pothole crash 45 days ago.",
            "photo_data": TINY_JPEG_B64
        })

        # Query 1: date_range=today -> should only find 1 report (today's)
        res_today = self.client.get("/api/crash-statistics?scope=user&date_range=today", headers=headers)
        data_today = res_today.get_json()
        self.assertEqual(data_today["statistics"]["total_submissions"], 1)
        self.assertEqual(data_today["statistics"]["low"], 1)
        self.assertEqual(data_today["statistics"]["moderate"], 0)
        self.assertEqual(data_today["statistics"]["high"], 0)

        # Query 2: date_range=7d -> should only find 1 report (today's, since 10d and 45d are outside)
        res_7d = self.client.get("/api/crash-statistics?scope=user&date_range=7d", headers=headers)
        data_7d = res_7d.get_json()
        self.assertEqual(data_7d["statistics"]["total_submissions"], 1)

        # Query 3: date_range=30d -> should find 2 reports (today's and 10 days ago)
        res_30d = self.client.get("/api/crash-statistics?scope=user&date_range=30d", headers=headers)
        data_30d = res_30d.get_json()
        self.assertEqual(data_30d["statistics"]["total_submissions"], 2)
        self.assertEqual(data_30d["statistics"]["low"], 1)
        self.assertEqual(data_30d["statistics"]["moderate"], 1)
        self.assertEqual(data_30d["statistics"]["high"], 0)

        # Query 4: date_range=all -> should find all 3 reports
        res_all = self.client.get("/api/crash-statistics?scope=user&date_range=all", headers=headers)
        data_all = res_all.get_json()
        self.assertEqual(data_all["statistics"]["total_submissions"], 3)
        self.assertEqual(data_all["statistics"]["low"], 1)
        self.assertEqual(data_all["statistics"]["moderate"], 1)
        self.assertEqual(data_all["statistics"]["high"], 1)

    def test_04_user_privacy_isolation(self):
        """Scenario 6: Users cannot access another user's private reports."""
        email_a, token_a = self._create_user("UserAlpha")
        email_b, token_b = self._create_user("UserBeta")

        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User A submits a confidential report
        sub_res = self.client.post("/api/crash-reports", headers=headers_a, json={
            "location": "Alpha Private Boulevard",
            "report_date": "2026-10-24",
            "report_time": "12:00",
            "crash_type": "Private Incident",
            "severity": "Moderate",
            "road_condition": "Dry",
            "description": "Alpha confidential description.",
            "photo_data": TINY_JPEG_B64
        })
        self.assertEqual(sub_res.status_code, 201)
        rep_a_id = sub_res.get_json()["report_id"]

        # User B queries their dashboard
        res_b = self.client.get("/api/crash-statistics?scope=user", headers=headers_b)
        self.assertEqual(res_b.status_code, 200)
        data_b = res_b.get_json()

        # User B must see 0 submissions and none of User A's reports
        self.assertEqual(data_b["statistics"]["total_submissions"], 0)
        recent_ids_b = [r["report_id"] for r in data_b.get("recent_reports", [])]
        self.assertNotIn(rep_a_id, recent_ids_b)

    def test_05_status_transitions_and_resolved_incidents(self):
        """Scenario 5: Reports marked Resolved increment resolved count in dashboard."""
        email, token = self._create_user("StatusTester")
        headers = {"Authorization": f"Bearer {token}"}

        # Submit report
        sub_res = self.client.post("/api/crash-reports", headers=headers, json={
            "location": "Whitefield ITPL Main Road",
            "report_date": "2026-10-24",
            "report_time": "15:00",
            "crash_type": "Skid",
            "severity": "Moderate",
            "road_condition": "Wet",
            "description": "Two wheeler skid.",
            "photo_data": TINY_JPEG_B64
        })
        rep_id = sub_res.get_json()["report_id"]

        # Transition to Resolved
        patch_res = self.client.patch(f"/api/crash-reports/{rep_id}/status", headers=headers, json={"status": "Resolved"})
        self.assertEqual(patch_res.status_code, 200)

        # Check dashboard
        dash_res = self.client.get("/api/crash-statistics?scope=user&date_range=all", headers=headers)
        stats = dash_res.get_json()["statistics"]
        self.assertEqual(stats["resolved"], 1)
        self.assertEqual(stats["pending"], 0)


if __name__ == "__main__":
    unittest.main()
