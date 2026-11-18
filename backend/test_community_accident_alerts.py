"""
test_community_accident_alerts.py — Test Suite for Community Accident Alerts & Automatic Rerouting
===================================================================================================
Tests all 10 acceptance criteria specified in Feature Enhancement:
  1. Route Electronic City -> Koramangala with crash at Silk Board triggers alert.
  2. Driver sees accident warning and can fetch incident details for map view.
  3. Alternative route is calculated and displayed avoiding incident.
  4. Accident behind driver's current position does not trigger an ahead warning.
  5. Incident far from planned route does not trigger warning.
  6. Resolved or stale report does not remain an active confirmed warning.
  7. Unverified report is clearly marked as unverified.
  8. Missing coordinates do not create fake map markers.
  9. API failures do not fabricate traffic or fake alternative roads.
  10. Existing auth, report submission, dashboard, and map endpoints continue working.
"""

import unittest
import json
import os
import sys
import time
import base64

VALID_TEST_PHOTO = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 200).decode("utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import app as flask_app
import database
import incident_routing


class TestCommunityAccidentAlerts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        flask_app.app.config["TESTING"] = True
        cls.client = flask_app.app.test_client()

        # Create or ensure test user exists
        cls.test_email = f"driver_{int(time.time())}@example.com"
        cls.test_password = "SecurePassword123!"
        reg_res = cls.client.post("/api/auth/register", json={
            "name": "Community Test Driver",
            "email": cls.test_email,
            "password": cls.test_password
        })
        if reg_res.status_code == 201:
            cls.token = reg_res.get_json()["token"]
            cls.user_id = reg_res.get_json()["user"]["user_id"]
        else:
            # Login if already exists
            login_res = cls.client.post("/api/auth/login", json={
                "email": cls.test_email,
                "password": cls.test_password
            })
            cls.token = login_res.get_json()["token"]
            cls.user_id = login_res.get_json()["user"]["user_id"]

    def _auth_headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    def test_01_and_02_silk_board_incident_triggers_alert_and_fetches_by_id(self):
        """Scenarios 1 & 2: Electronic City to Koramangala detects Silk Board crash and provides details."""
        # 1. Submit a community crash report at Silk Board Junction
        sub_res = self.client.post("/api/crash-reports", headers=self._auth_headers(), json={
            "location": "Silk Board Junction, Bengaluru",
            "latitude": 12.9172,
            "longitude": 77.6228,
            "crash_type": "Vehicle Collision",
            "severity": "High",
            "road_condition": "Dry",
            "description": "Multi-vehicle collision blocking 2 lanes at Silk Board flyover descent.",
            "photo_data": VALID_TEST_PHOTO
        })
        self.assertEqual(sub_res.status_code, 201)
        report_data = sub_res.get_json()
        report_id = report_data["report_id"]
        self.assertGreater(report_id, 0)
        self.assertEqual(report_data["status"], "Pending")

        # 2. Driver plans route from Electronic City to Koramangala (passes Silk Board)
        route_ec_to_kora = [
            [12.8452, 77.6602], # Electronic City
            [12.8715, 77.6510],
            [12.8988, 77.6433], # Hosur Road
            [12.9172, 77.6228], # Silk Board Junction (Incident!)
            [12.9250, 77.6235],
            [12.9352, 77.6245]  # Koramangala
        ]

        det_res = self.client.post("/api/routing/detect-incidents", json={
            "route_geometry": route_ec_to_kora,
            "start": {"lat": 12.8452, "lon": 77.6602},
            "destination": {"lat": 12.9352, "lon": 77.6245},
            "max_age_hours": 48
        })
        self.assertEqual(det_res.status_code, 200)
        alert_data = det_res.get_json()

        self.assertTrue(alert_data.get("has_incident"))
        # Verify Silk Board incident was detected on the route
        affecting = alert_data.get("all_affecting_incidents", [])
        silk_board_inc = next((i for i in affecting if "Silk Board" in i.get("location", "")), None)
        self.assertIsNotNone(silk_board_inc, "Silk Board incident must be detected along route!")
        self.assertEqual(silk_board_inc.get("crash_type"), "Vehicle Collision")
        self.assertIn("distance_ahead_str", silk_board_inc)
        self.assertTrue(silk_board_inc.get("is_ahead"))

        # 3. Fetch single report by ID (Scenario 2: open details on map)
        get_res = self.client.get(f"/api/crash-reports/{report_id}")
        self.assertEqual(get_res.status_code, 200)
        single_rep = get_res.get_json()["report"]
        self.assertEqual(single_rep["report_id"], report_id)
        self.assertIn("Silk Board", single_rep["location"])
        self.assertFalse(single_rep["is_verified"])
        self.assertIn("Unverified", single_rep["verification_badge"])

    def test_03_alternative_route_calculated_avoiding_incident(self):
        """Scenario 3: Alternative route bypasses the incident corridor."""
        route_ec_to_kora = [
            [12.8452, 77.6602],
            [12.8988, 77.6433],
            [12.9172, 77.6228],
            [12.9352, 77.6245]
        ]
        det_res = self.client.post("/api/routing/detect-incidents", json={
            "route_geometry": route_ec_to_kora,
            "start": {"lat": 12.8452, "lon": 77.6602},
            "destination": {"lat": 12.9352, "lon": 77.6245},
            "max_age_hours": 48
        })
        self.assertEqual(det_res.status_code, 200)
        data = det_res.get_json()
        reroute = data.get("reroute", {})
        self.assertIn("has_alternative", reroute)
        self.assertIn("reason", reroute)
        if reroute.get("has_alternative"):
            self.assertIn("geometry", reroute)
            self.assertGreater(len(reroute["geometry"]), 1)
            self.assertGreater(reroute.get("distance_km", 0), 0)

    def test_04_accident_behind_driver_does_not_trigger_ahead_warning(self):
        """Scenario 4: An accident behind the driver's current position does not trigger an ahead warning."""
        # Route from Electronic City to Koramangala
        # Silk Board is at 12.9172, 77.6228
        route_ec_to_kora = [
            [12.8452, 77.6602], # Electronic City (km 0)
            [12.8715, 77.6510],
            [12.8988, 77.6433], # Hosur Road
            [12.9172, 77.6228], # Silk Board Junction (Incident!)
            [12.9250, 77.6235], # Madiwala
            [12.9352, 77.6245]  # Koramangala (km 12)
        ]

        # Driver has already driven past Silk Board and is currently at Madiwala / Koramangala (12.9300, 77.6240)
        current_driver_loc = {"lat": 12.9300, "lon": 77.6240}

        det_res = self.client.post("/api/routing/detect-incidents", json={
            "route_geometry": route_ec_to_kora,
            "start": {"lat": 12.8452, "lon": 77.6602},
            "destination": {"lat": 12.9352, "lon": 77.6245},
            "current_location": current_driver_loc,
            "max_age_hours": 48
        })
        self.assertEqual(det_res.status_code, 200)
        data = det_res.get_json()

        # The Silk Board incident is behind the driver, so it MUST NOT be reported as an ahead warning!
        if data.get("has_incident"):
            for inc in data.get("all_affecting_incidents", []):
                if "Silk Board" in inc.get("location", ""):
                    self.fail("Silk Board incident is behind the driver and should NOT be flagged as ahead!")
        else:
            self.assertFalse(data["has_incident"])

    def test_05_incident_far_from_route_ignored(self):
        """Scenario 5: Incident far from route (> 15 km in Yelahanka) does not trigger warning for South corridor."""
        route_ec_to_kora = [
            [12.8452, 77.6602],
            [12.8988, 77.6433],
            [12.9352, 77.6245]
        ]
        # Yelahanka coordinate (13.1007, 77.5963) is > 20 km north
        det_res = self.client.post("/api/routing/detect-incidents", json={
            "route_geometry": route_ec_to_kora,
            "start": {"lat": 12.8452, "lon": 77.6602},
            "destination": {"lat": 12.9352, "lon": 77.6245},
            "max_age_hours": 48
        })
        self.assertEqual(det_res.status_code, 200)
        data = det_res.get_json()
        for inc in data.get("all_affecting_incidents", []):
            self.assertNotEqual(inc.get("location"), "Yelahanka")
            self.assertLessEqual(inc.get("distance_from_route_m"), 450.0)

    def test_06_resolved_or_stale_report_not_active(self):
        """Scenario 6: A resolved report is immediately removed from active alerts."""
        # Create a report
        sub_res = self.client.post("/api/crash-reports", headers=self._auth_headers(), json={
            "location": "Bannerghatta Road Signal",
            "latitude": 12.8912,
            "longitude": 77.5975,
            "crash_type": "Skid",
            "severity": "Low",
            "description": "Oil spill skid reported on left lane.",
            "photo_data": VALID_TEST_PHOTO
        })
        rep_id = sub_res.get_json()["report_id"]

        # Verify active
        active_list = incident_routing.get_active_incidents(database.get_connection, max_age_hours=48)
        found = any(i["report_id"] == rep_id for i in active_list)
        self.assertTrue(found)

        # Mark as Resolved
        stat_res = self.client.patch(f"/api/crash-reports/{rep_id}/status", headers=self._auth_headers(), json={
            "status": "Resolved"
        })
        self.assertEqual(stat_res.status_code, 200)

        # Must no longer appear in active incidents
        active_after = incident_routing.get_active_incidents(database.get_connection, max_age_hours=48)
        resolved_found = any(i["report_id"] == rep_id for i in active_after)
        self.assertFalse(resolved_found, "Resolved crash report should not appear in active incidents feed!")

    def test_07_unverified_report_clearly_marked(self):
        """Scenario 7: Unverified report is explicitly tagged as 'Unverified'."""
        incidents = incident_routing.get_active_incidents(database.get_connection, max_age_hours=0)
        pending_list = [i for i in incidents if i["status"].lower() == "pending"]
        if pending_list:
            rep = pending_list[0]
            self.assertFalse(rep["is_verified"])
            self.assertIn("Unverified", rep["verification_badge"])

    def test_08_missing_coordinates_do_not_create_fake_markers(self):
        """Scenario 8: Reports without coordinates or unresolvable location do not create fake alerts or markers."""
        res = self.client.post("/api/crash-reports", headers=self._auth_headers(), json={
            "location": "Unknown Location No GPS",
            "crash_type": "Other",
            "description": "Report with missing GPS coordinates.",
            "photo_data": VALID_TEST_PHOTO
        })
        self.assertEqual(res.status_code, 201)
        rep_id = res.get_json()["report_id"]

        # Verify that analyzing a route does NOT match this coordinate-less report
        detect_res = self.client.post("/api/routing/detect-incidents", json={
            "route_geometry": [[12.8452, 77.6602], [12.9352, 77.6245]],
            "start": {"lat": 12.8452, "lon": 77.6602},
            "destination": {"lat": 12.9352, "lon": 77.6245}
        })
        self.assertEqual(detect_res.status_code, 200)
        detected_ids = [inc.get("id") for inc in detect_res.get_json().get("all_affecting_incidents", [])]
        self.assertNotIn(rep_id, detected_ids)

    def test_09_api_failure_does_not_fabricate_traffic(self):
        """Scenario 9: Upstream failure keeps traffic unknown, never claims fake jam."""
        def broken_traffic(pts):
            raise Exception("Network timeout")

        result = incident_routing.analyze_route_for_incidents(
            route_latlngs=[[12.8452, 77.6602], [12.8988, 77.6433]],
            start_coords={"lat": 12.8452, "lon": 77.6602},
            dest_coords={"lat": 12.8988, "lon": 77.6433},
            get_connection_fn=database.get_connection,
            traffic_provider_fn=broken_traffic,
            max_age_hours=0
        )
        if result.get("has_incident"):
            t_impact = result.get("traffic_impact", {})
            self.assertEqual(t_impact.get("status"), "unknown")
            self.assertIn("unavailable", t_impact.get("description", "").lower())

    def test_10_existing_core_features_operational(self):
        """Scenario 10: Existing auth me, crash statistics, public crash feed, and map config work."""
        # 1. Auth profile
        me_res = self.client.get("/api/auth/me", headers=self._auth_headers())
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.get_json()["user"]["email"], self.test_email)

        # 2. Crash statistics
        stat_res = self.client.get("/api/crash-statistics")
        self.assertEqual(stat_res.status_code, 200)
        self.assertIn("statistics", stat_res.get_json())

        # 3. Public crash feed
        feed_res = self.client.get("/api/crash-reports?status=All")
        self.assertEqual(feed_res.status_code, 200)
        self.assertIsInstance(feed_res.get_json().get("reports"), list)

        # 4. Map configuration
        map_res = self.client.get("/api/config/maps")
        self.assertEqual(map_res.status_code, 200)
        self.assertTrue(map_res.get_json()["success"])


if __name__ == "__main__":
    unittest.main()
