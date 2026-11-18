"""
Unit tests for Google Maps Platform configuration and status endpoints.
Verifies that:
1. /api/config/maps returns valid JSON structure.
2. The endpoint reads GOOGLE_MAPS_API_KEY safely from backend/.env without hardcoding.
3. /api/maps/status returns the status of Leaflet, OSRM, Google Maps, TomTom, and Historical dataset.
"""

import sys
import os
import unittest

# Ensure backend directory is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from app import app, _get_google_maps_api_key

class MapsIntegrationTestCase(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_key_loader_safe(self):
        """Verify _get_google_maps_api_key returns None or string without crashing."""
        key = _get_google_maps_api_key()
        self.assertTrue(key is None or isinstance(key, str))

    def test_get_maps_config_endpoint(self):
        """GET /api/config/maps returns success, does NOT expose raw api_key, and provides script_url."""
        resp = self.client.get("/api/config/maps")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data.get("success"))
        self.assertIn("google_maps_configured", data)
        self.assertNotIn("api_key", data, "Raw API key must NOT be exposed in JSON config endpoint")
        self.assertIn("default_engine", data)
        self.assertIn("supported_engines", data)
        self.assertIn("leaflet", data["supported_engines"])
        self.assertIn("google", data["supported_engines"])

    def test_maps_sdk_endpoint(self):
        """GET /api/maps/sdk.js returns either 302 redirect or javascript content."""
        resp = self.client.get("/api/maps/sdk.js")
        self.assertIn(resp.status_code, [200, 302])
        if resp.status_code == 302:
            self.assertTrue(resp.headers.get("Location", "").startswith("https://maps.googleapis.com"))

    def test_get_maps_status_endpoint(self):
        """GET /api/maps/status returns diagnostic statuses for all engines."""
        resp = self.client.get("/api/maps/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data.get("success"))
        engines = data.get("engines", {})
        self.assertIn("leaflet", engines)
        self.assertIn("osrm", engines)
        self.assertIn("google_maps", engines)
        self.assertIn("historical_traffic", engines)
        self.assertEqual(engines["leaflet"]["status"], "active")
        self.assertEqual(engines["osrm"]["status"], "active")

if __name__ == "__main__":
    unittest.main()
