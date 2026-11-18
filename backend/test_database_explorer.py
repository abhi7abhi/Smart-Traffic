"""
test_database_explorer.py — Integration Tests for Live MySQL Database Viewer
=============================================================================
Tests:
  1. Unauthorized access enforcement (401 Unauthorized for overview, records, export)
  2. Administrator key verification (POST /api/admin/auth/verify)
  3. Database overview metadata and table schema inspection
  4. Sensitive data isolation (password_hash strictly excluded from schema)
  5. Records querying with search, filtering, whitelist sorting, and pagination
  6. CSV export streaming with valid headers and formatted columns
  7. Live record arrival (newly submitted report appears immediately in DB viewer)
"""

import unittest
import os
import sys
import json
import csv
import io
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import app, ADMIN_KEY
from database import get_connection

class TestDatabaseExplorer(unittest.TestCase):

    def setUp(self):
        self.client = app.test_client()
        self.admin_header = {"X-Admin-Key": ADMIN_KEY}

    def test_01_unauthorized_access_rejected(self):
        """Unauthenticated requests must be rejected with 401."""
        # Overview
        res = self.client.get("/api/admin/database/overview")
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertFalse(data["success"])

        # Records
        res = self.client.get("/api/admin/database/records")
        self.assertEqual(res.status_code, 401)

        # Export
        res = self.client.get("/api/admin/database/export")
        self.assertEqual(res.status_code, 401)

        # Invalid key
        res = self.client.get(
            "/api/admin/database/overview",
            headers={"X-Admin-Key": "wrong_invalid_key_12345"}
        )
        self.assertEqual(res.status_code, 401)

    def test_02_admin_key_verification(self):
        """POST /api/admin/auth/verify validates correct and incorrect keys."""
        # Valid key
        res = self.client.post(
            "/api/admin/auth/verify",
            data=json.dumps({"admin_key": ADMIN_KEY}),
            content_type="application/json"
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertTrue(data["authorized"])

        # Invalid key
        res = self.client.post(
            "/api/admin/auth/verify",
            data=json.dumps({"admin_key": "bad_key"}),
            content_type="application/json"
        )
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertFalse(data["authorized"])

    def test_03_database_overview_and_schema(self):
        """GET /api/admin/database/overview returns connection info, metrics, and sanitized schemas."""
        res = self.client.get("/api/admin/database/overview", headers=self.admin_header)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        self.assertTrue(data["success"])
        conn = data["connection"]
        self.assertEqual(conn["status"], "connected")
        self.assertIn("MySQL", conn["engine"])
        self.assertEqual(conn["database"], "smart_traffic")

        # Metrics check
        metrics = data["metrics"]
        self.assertGreaterEqual(metrics["total_reports"], 200)
        self.assertIn("verified_reports", metrics)
        self.assertIn("pending_reports", metrics)
        self.assertIn("resolved_reports", metrics)
        self.assertIn("photo_reports", metrics)
        self.assertIn("total_users", metrics)

        # Approved tables check
        tables = {t["name"]: t for t in data["tables"]}
        self.assertIn("crash_reports", tables)
        self.assertIn("users", tables)

        # SECURITY: Ensure password_hash is strictly excluded
        user_col_names = [c["name"] for c in tables["users"]["columns"]]
        self.assertNotIn("password_hash", user_col_names)
        self.assertIn("user_id", user_col_names)
        self.assertIn("email", user_col_names)

    def test_04_database_records_pagination_and_sorting(self):
        """GET /api/admin/database/records supports pagination and column sorting."""
        # Page 1, limit 10
        res = self.client.get(
            "/api/admin/database/records?page=1&limit=10&sort_by=report_id&sort_dir=desc",
            headers=self.admin_header
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["page"], 1)
        self.assertEqual(data["limit"], 10)
        self.assertEqual(len(data["records"]), 10)
        self.assertGreaterEqual(data["total_records"], 200)

        # Check descending order
        records = data["records"]
        self.assertGreater(records[0]["report_id"], records[1]["report_id"])

        # Page 2
        res2 = self.client.get(
            "/api/admin/database/records?page=2&limit=10&sort_by=report_id&sort_dir=desc",
            headers=self.admin_header
        )
        data2 = res2.get_json()
        self.assertEqual(data2["page"], 2)
        self.assertEqual(len(data2["records"]), 10)
        self.assertNotEqual(data["records"][0]["report_id"], data2["records"][0]["report_id"])

    def test_05_search_and_filters(self):
        """Search query and filter parameters narrow down MySQL records."""
        # Search by specific keyword
        res = self.client.get(
            "/api/admin/database/records?q=Whitefield&limit=50",
            headers=self.admin_header
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertGreaterEqual(data["total_records"], 1)
        for r in data["records"]:
            matches = (
                "whitefield" in (r.get("location") or "").lower() or
                "whitefield" in (r.get("description") or "").lower() or
                "whitefield" in (r.get("crash_type") or "").lower()
            )
            self.assertTrue(matches, f"Record #{r['report_id']} did not match search query")

        # Filter by severity
        res = self.client.get(
            "/api/admin/database/records?severity=Moderate&limit=10",
            headers=self.admin_header
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        for r in data["records"]:
            self.assertEqual(r["severity"], "Moderate")

        # Filter by status
        res = self.client.get(
            "/api/admin/database/records?status=Resolved&limit=10",
            headers=self.admin_header
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        for r in data["records"]:
            self.assertEqual(r["status"], "Resolved")

    def test_06_csv_export(self):
        """GET /api/admin/database/export streams valid CSV with filtered rows."""
        res = self.client.get(
            f"/api/admin/database/export?admin_key={ADMIN_KEY}&severity=Moderate"
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res.headers.get("Content-Type", ""))
        self.assertIn("attachment", res.headers.get("Content-Disposition", ""))

        csv_text = res.data.decode("utf-8")
        reader = csv.reader(io.StringIO(csv_text))
        rows = list(reader)
        self.assertGreaterEqual(len(rows), 2)  # Header + at least 1 record

        headers = rows[0]
        self.assertIn("Report ID", headers)
        self.assertIn("Location", headers)
        self.assertIn("Severity", headers)
        self.assertIn("Status", headers)

        # Check severity column in rows
        sev_idx = headers.index("Severity")
        for row in rows[1:]:
            self.assertEqual(row[sev_idx], "Moderate")

    def test_07_live_record_arrival_and_update(self):
        """Newly created crash report in MySQL is immediately returned at the top of Explorer."""
        unique_loc = f"Test DB Explorer Corridor {int(time.time())}"
        
        # Insert test crash report directly into MySQL
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO crash_reports
                (reporter_name, location, latitude, longitude, report_date, report_time,
                 crash_type, severity, road_condition, description, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            "Admin Integration Tester",
            unique_loc,
            12.9352,
            77.6245,
            "2026-10-24",
            "11:50:00",
            "Multi-Vehicle",
            "Critical",
            "Dry",
            "Testing live DB explorer auto-arrival.",
            "Pending"
        ))
        conn.commit()
        new_id = cursor.lastrowid
        cursor.close()
        conn.close()

        try:
            # Query explorer records
            res = self.client.get(
                "/api/admin/database/records?page=1&limit=5&sort_by=report_id&sort_dir=desc",
                headers=self.admin_header
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            records = data["records"]
            self.assertEqual(records[0]["report_id"], new_id)
            self.assertEqual(records[0]["location"], unique_loc)
            self.assertEqual(records[0]["severity"], "Critical")
            self.assertEqual(records[0]["status"], "Pending")

        finally:
            # Clean up
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM crash_reports WHERE report_id = %s", (new_id,))
            conn.commit()
            cursor.close()
            conn.close()


if __name__ == "__main__":
    unittest.main()
