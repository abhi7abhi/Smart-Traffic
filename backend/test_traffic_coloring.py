import unittest
import json
import os
import sys

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app import app, _traffic_cache

class TestTrafficColoring(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        _traffic_cache.clear()

    def test_live_traffic_unavailable_when_key_invalid(self):
        """Test Case 4: When live traffic key fails/missing, return honest unavailable status and empty segments without red line."""
        # Temporarily mock _get_tomtom_api_key returning None
        from unittest.mock import patch
        with patch('app._get_tomtom_api_key', return_value=None):
            res = self.app.post('/api/traffic-flow', json={
                "points": [{"lat": 12.9716, "lon": 77.5946}]
            })
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertFalse(data["success"])
            self.assertEqual(data["source"], "LIVE TRAFFIC UNAVAILABLE")
            self.assertEqual(data["status"], "key_missing")
            self.assertEqual(len(data["segments"]), 0)

    def test_live_traffic_thresholds_green_yellow_red(self):
        """Test Cases 1, 2, 3: Verify speed ratio thresholds (>= 0.75 -> Light/Green, 0.45-0.74 -> Moderate/Yellow, < 0.45 -> Heavy/Red)."""
        from unittest.mock import patch, MagicMock

        # 1. Light traffic mock (current = 50, freeFlow = 50 -> ratio = 1.0 -> Green #10b981)
        mock_resp_green = MagicMock()
        mock_resp_green.status_code = 200
        mock_resp_green.json.return_value = {
            "flowSegmentData": {
                "currentSpeed": 50,
                "freeFlowSpeed": 50,
                "roadClosure": False
            }
        }

        with patch('requests.get', return_value=mock_resp_green):
            res = self.app.post('/api/traffic-flow', json={
                "points": [{"lat": 12.9716, "lon": 77.5946}]
            })
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data["success"])
            self.assertEqual(data["overall_condition"], "Light")
            self.assertEqual(data["overall_color"], "#10b981")
            self.assertEqual(data["segments"][0]["color"], "#10b981")
            self.assertEqual(data["segments"][0]["congestion_level"], "Light")

        _traffic_cache.clear()

        # 2. Moderate traffic mock (current = 30, freeFlow = 50 -> ratio = 0.60 -> Yellow #f59e0b)
        mock_resp_yellow = MagicMock()
        mock_resp_yellow.status_code = 200
        mock_resp_yellow.json.return_value = {
            "flowSegmentData": {
                "currentSpeed": 30,
                "freeFlowSpeed": 50,
                "roadClosure": False
            }
        }

        with patch('requests.get', return_value=mock_resp_yellow):
            res = self.app.post('/api/traffic-flow', json={
                "points": [{"lat": 12.9716, "lon": 77.5946}]
            })
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data["success"])
            self.assertEqual(data["overall_condition"], "Moderate")
            self.assertEqual(data["overall_color"], "#f59e0b")
            self.assertEqual(data["segments"][0]["color"], "#f59e0b")
            self.assertEqual(data["segments"][0]["congestion_level"], "Moderate")

        _traffic_cache.clear()

        # 3. Heavy traffic mock (current = 15, freeFlow = 50 -> ratio = 0.30 -> Red #ef4444)
        mock_resp_red = MagicMock()
        mock_resp_red.status_code = 200
        mock_resp_red.json.return_value = {
            "flowSegmentData": {
                "currentSpeed": 15,
                "freeFlowSpeed": 50,
                "roadClosure": False
            }
        }

        with patch('requests.get', return_value=mock_resp_red):
            res = self.app.post('/api/traffic-flow', json={
                "points": [{"lat": 12.9716, "lon": 77.5946}]
            })
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data["success"])
            self.assertEqual(data["overall_condition"], "Heavy")
            self.assertEqual(data["overall_color"], "#ef4444")
            self.assertEqual(data["segments"][0]["color"], "#ef4444")
            self.assertEqual(data["segments"][0]["congestion_level"], "Heavy")

    def test_historical_mode_matches_corridors_and_unmatched_is_neutral(self):
        """Test Case 5: Historical dataset matching corridors and flagging unmatched as neutral slate (#64748b), NEVER red."""
        # Test point 1: Silk Board junction (known high traffic corridor)
        # Test point 2: Far remote point outside monitored corridors (unmatched)
        res = self.app.post('/api/historical-traffic/match-route', json={
            "points": [
                [12.9176, 77.6238], # Silk Board
                [13.2500, 77.9500]  # Far remote point
            ]
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["source"], "Banglore_traffic_Dataset.csv (Historical Route Matching)")
        self.assertEqual(len(data["segments"]), 2)

        # Unmatched segment check
        unmatched_seg = data["segments"][1]
        self.assertTrue(unmatched_seg["unmatched"])
        self.assertEqual(unmatched_seg["color"], "#64748b") # Must be neutral slate grey, NEVER red!
        self.assertNotEqual(unmatched_seg["color"], "#ef4444")

    def test_live_mode_never_silently_falls_back_to_historical_data(self):
        """Test Case 6: Live traffic endpoint must never return historical dataset while claiming to be live."""
        from unittest.mock import patch
        with patch('requests.get', side_effect=Exception("Upstream connection refused")):
            res = self.app.post('/api/traffic-flow', json={
                "points": [{"lat": 12.9716, "lon": 77.5946}]
            })
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertFalse(data["success"])
            self.assertEqual(data["source"], "LIVE TRAFFIC UNAVAILABLE")
            # Must NOT claim to be historical CSV or silently substitute fake speeds
            self.assertNotIn("Banglore_traffic_Dataset.csv", data["source"])
            self.assertEqual(len(data["segments"]), 0)

    def test_incident_detection_does_not_mutate_traffic_flow(self):
        """Test Case 7: An incident on the corridor generates an incident report / detour, but does NOT make traffic-flow endpoint red."""
        # Incident detection endpoint returns reroute and primary_incident
        res_inc = self.app.post('/api/routing/detect-incidents', json={
            "route_geometry": [[12.9176, 77.6238], [12.9200, 77.6250]],
            "start": {"lat": 12.9176, "lon": 77.6238},
            "destination": {"lat": 12.9200, "lon": 77.6250},
            "max_age_hours": 48
        })
        self.assertEqual(res_inc.status_code, 200)

        # When live traffic is queried for that same point, it still uses TomTom speeds, NOT synthetic incident red
        from unittest.mock import patch, MagicMock
        mock_resp_normal = MagicMock()
        mock_resp_normal.status_code = 200
        mock_resp_normal.json.return_value = {
            "flowSegmentData": {
                "currentSpeed": 45,
                "freeFlowSpeed": 50,
                "roadClosure": False
            }
        }
        with patch('requests.get', return_value=mock_resp_normal):
            res_traffic = self.app.post('/api/traffic-flow', json={
                "points": [{"lat": 12.9176, "lon": 77.6238}]
            })
            self.assertEqual(res_traffic.status_code, 200)
            data_traffic = res_traffic.get_json()
            # 45/50 = 0.9 -> Light / Green, despite incident on route!
            self.assertEqual(data_traffic["overall_condition"], "Light")
            self.assertEqual(data_traffic["overall_color"], "#10b981")

if __name__ == '__main__':
    unittest.main()
