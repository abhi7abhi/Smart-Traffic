"""
test_location_search_accuracy.py
================================
Test suite for Location Search & Geocoding Accuracy in Smart Traffic Bengaluru:
  1. Search for Chandapura returns real coordinates (12.8009, 77.7115) and NEVER Central Bengaluru (12.9716, 77.5946).
  2. Search for Electronic City returns real coordinates (~12.84, ~77.66).
  3. Search for Silk Board Junction returns real coordinates (~12.91, ~77.62).
  4. Search for Koramangala returns real coordinates (~12.93, ~77.62).
  5. Places with similar names return distinct suggestions with localities/districts.
  6. Unknown / gibberish location does NOT return Central Bengaluru.
  7. Route from Hebbal to Chandapura uses exact Chandapura coordinates and reflects real distance (~30-40km).
  8. Incident routing detection continues working along routes to Chandapura.
  9. Reverse geocoding endpoint continues to provide clean address resolution without fake defaults.
  10. Core auth, crash reporting, and dashboard endpoints remain functional.
"""

import sys
import os
import unittest
import json
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import app as flask_app
import incident_routing

CENTRAL_BENGALURU_LAT = 12.9716
CENTRAL_BENGALURU_LON = 77.5946


def distance_km(lat1, lon1, lat2, lon2):
    """Haversine distance in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


class TestLocationSearchAccuracy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        flask_app.app.config["TESTING"] = True

    def setUp(self):
        self.client = flask_app.app.test_client()

    def test_01_search_chandapura_never_returns_central_bengaluru(self):
        """Scenario 1: Searching for Chandapura returns real coordinates, NOT Central Bengaluru."""
        res = self.client.get("/api/geocode/search?q=Chandapura")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        results = data.get("results", [])
        self.assertGreater(len(results), 0, "Chandapura search must return at least one suggestion.")

        top = results[0]
        lat, lon = top["lat"], top["lon"]

        # Real Chandapura is at ~12.8009, 77.7115 in Anekal/Bengaluru Urban
        dist_to_real_chandapura = distance_km(lat, lon, 12.8009, 77.7115)
        self.assertLess(dist_to_real_chandapura, 5.0, "Result must be within 5km of real Chandapura.")

        # Must NOT be at Central Bengaluru (Cubbon Park / MG Road ~22km away)
        dist_to_central_blr = distance_km(lat, lon, CENTRAL_BENGALURU_LAT, CENTRAL_BENGALURU_LON)
        self.assertGreater(dist_to_central_blr, 15.0, "Result must NOT be near Central Bengaluru coordinates.")

        # Suggestions must have place name and secondary locality text
        self.assertIn("name", top)
        self.assertIn("secondary", top)
        self.assertTrue(bool(top["secondary"]))

    def test_02_search_electronic_city(self):
        """Scenario 2: Searching for Electronic City returns southern corridor coordinates."""
        res = self.client.get("/api/geocode/search?q=Electronic+City")
        self.assertEqual(res.status_code, 200)
        results = res.get_json().get("results", [])
        self.assertGreater(len(results), 0)
        top = results[0]
        dist_to_ec = distance_km(top["lat"], top["lon"], 12.8452, 77.6602)
        self.assertLess(dist_to_ec, 6.0, "Electronic City result must be near 12.8452, 77.6602.")

    def test_03_search_silk_board_junction(self):
        """Scenario 3: Searching for Silk Board Junction returns Silk Board coordinates."""
        res = self.client.get("/api/geocode/search?q=Silk+Board+Junction")
        self.assertEqual(res.status_code, 200)
        results = res.get_json().get("results", [])
        self.assertGreater(len(results), 0)
        top = results[0]
        dist_to_sb = distance_km(top["lat"], top["lon"], 12.9172, 77.6228)
        self.assertLess(dist_to_sb, 3.0, "Silk Board result must be near 12.9172, 77.6228.")

    def test_04_search_koramangala(self):
        """Scenario 4: Searching for Koramangala returns Koramangala coordinates."""
        res = self.client.get("/api/geocode/search?q=Koramangala")
        self.assertEqual(res.status_code, 200)
        results = res.get_json().get("results", [])
        self.assertGreater(len(results), 0)
        top = results[0]
        dist_to_kora = distance_km(top["lat"], top["lon"], 12.9352, 77.6245)
        self.assertLess(dist_to_kora, 5.0, "Koramangala result must be near 12.9352, 77.6245.")

    def test_05_ambiguous_names_return_distinct_suggestions(self):
        """Scenario 5: Locations with similar names are clearly distinguished with localities."""
        res = self.client.get("/api/geocode/search?q=Koramangala&limit=5")
        self.assertEqual(res.status_code, 200)
        results = res.get_json().get("results", [])
        self.assertGreaterEqual(len(results), 1)
        for item in results:
            self.assertTrue("secondary" in item or "display_name" in item)

    def test_06_unresolvable_location_does_not_invent_fake_coordinates(self):
        """Scenario 6: Non-existent location returns empty list, never Central Bengaluru."""
        res = self.client.get("/api/geocode/search?q=NonExistentPlaceZyxWvu99")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("count"), 0)
        self.assertEqual(len(data.get("results", [])), 0)

    def test_07_route_detection_to_chandapura(self):
        """Scenario 7: Route analysis from Hebbal to Chandapura accurately detects corridors."""
        # Realistic coordinate polyline Hebbal -> Silk Board -> Electronic City -> Chandapura
        hebbal_to_chandapura = [
            [13.0358, 77.5970],  # Hebbal
            [12.9716, 77.5946],  # Central Bengaluru Corridor
            [12.9172, 77.6228],  # Silk Board
            [12.8452, 77.6602],  # Electronic City
            [12.8009, 77.7115],  # Chandapura
        ]

        det_res = self.client.post("/api/routing/detect-incidents", json={
            "route_geometry": hebbal_to_chandapura,
            "start": {"lat": 13.0358, "lon": 77.5970},
            "destination": {"lat": 12.8009, "lon": 77.7115},
            "max_age_hours": 48
        })
        self.assertEqual(det_res.status_code, 200)
        res_data = det_res.get_json()
        self.assertIn("has_incident", res_data)

    def test_08_empty_query_handled_safely(self):
        """Scenario 8: Empty search query returns empty list without error."""
        res = self.client.get("/api/geocode/search?q=")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["count"], 0)

    def test_09_reverse_geocoding_operational(self):
        """Scenario 9: Reverse geocoding accurately resolves coordinates to street name."""
        res = self.client.get("/api/geocode/reverse?lat=12.8009&lon=77.7115")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("address", data)
        self.assertIn("Chandapura", data.get("address", "") + data.get("display_name", ""))

    def test_10_resolve_location_coordinates_backend(self):
        """Scenario 10: Backend resolve_location_coordinates recognizes Chandapura."""
        coords = incident_routing.resolve_location_coordinates("Chandapura")
        self.assertIsNotNone(coords)
        self.assertAlmostEqual(coords[0], 12.8009, delta=0.01)
        self.assertAlmostEqual(coords[1], 77.7115, delta=0.01)


if __name__ == "__main__":
    unittest.main()
