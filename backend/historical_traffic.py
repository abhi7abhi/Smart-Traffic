"""
historical_traffic.py — Historical Traffic Analytics Service
============================================================
Loads, aggregates, and serves historical traffic congestion data from
data/Banglore_traffic_Dataset.csv across 16 monitored road corridors in Bengaluru.

Congestion Thresholds:
  • Low Congestion      (< 60.0%)       -> #10b981 (Green)
  • Moderate Congestion (60.0% - 79.9%) -> #f59e0b (Yellow)
  • High Congestion     (>= 80.0%)      -> #ef4444 (Red)
"""

import os
import math
import pandas as pd

# Path resolution: find data/Banglore_traffic_Dataset.csv
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CSV_PATH = os.path.join(BASE_DIR, "data", "Banglore_traffic_Dataset.csv")

# 16 Monitored Corridors & Real Road Geometries in Bengaluru
# Co-ordinates follow actual road alignments
CORRIDOR_GEOMETRIES = {
    ("Electronic City", "Hosur Road"): [
        [12.9172, 77.6228], [12.9038, 77.6335], [12.8902, 77.6415],
        [12.8715, 77.6510], [12.8530, 77.6585], [12.8452, 77.6602]
    ],
    ("Electronic City", "Silk Board Junction"): [
        [12.9150, 77.6185], [12.9168, 77.6215], [12.9176, 77.6238], [12.9185, 77.6280]
    ],
    ("Hebbal", "Ballari Road"): [
        [12.9986, 77.5878], [13.0115, 77.5912], [13.0235, 77.5945], [13.0358, 77.5970]
    ],
    ("Hebbal", "Hebbal Flyover"): [
        [13.0320, 77.5975], [13.0358, 77.5970], [13.0395, 77.5960], [13.0450, 77.5940]
    ],
    ("Indiranagar", "100 Feet Road"): [
        [12.9628, 77.6385], [12.9712, 77.6398], [12.9784, 77.6408],
        [12.9840, 77.6415], [12.9880, 77.6420]
    ],
    ("Indiranagar", "CMH Road"): [
        [12.9780, 77.6280], [12.9782, 77.6340], [12.9784, 77.6408], [12.9786, 77.6475]
    ],
    ("Jayanagar", "Jayanagar 4th Block"): [
        [12.9260, 77.5825], [12.9298, 77.5828], [12.9345, 77.5830], [12.9380, 77.5832]
    ],
    ("Jayanagar", "South End Circle"): [
        [12.9378, 77.5772], [12.9376, 77.5805], [12.9372, 77.5840], [12.9370, 77.5880]
    ],
    ("Koramangala", "Sarjapur Road"): [
        [12.9255, 77.6235], [12.9248, 77.6300], [12.9242, 77.6360],
        [12.9230, 77.6440], [12.9220, 77.6530]
    ],
    ("Koramangala", "Sony World Junction"): [
        [12.9330, 77.6230], [12.9345, 77.6270], [12.9348, 77.6310], [12.9352, 77.6350]
    ],
    ("M.G. Road", "Anil Kumble Circle"): [
        [12.9745, 77.6030], [12.9748, 77.6065], [12.9749, 77.6095], [12.9750, 77.6130]
    ],
    ("M.G. Road", "Trinity Circle"): [
        [12.9725, 77.6140], [12.9728, 77.6175], [12.9729, 77.6210], [12.9730, 77.6260]
    ],
    ("Whitefield", "ITPL Main Road"): [
        [12.9780, 77.7150], [12.9830, 77.7220], [12.9860, 77.7280],
        [12.9875, 77.7375], [12.9905, 77.7470]
    ],
    ("Whitefield", "Marathahalli Bridge"): [
        [12.9575, 77.6950], [12.9565, 77.6990], [12.9555, 77.7025], [12.9545, 77.7080]
    ],
    ("Yeshwanthpur", "Tumkur Road"): [
        [13.0210, 77.5560], [13.0235, 77.5505], [13.0280, 77.5400],
        [13.0330, 77.5300], [13.0380, 77.5200]
    ],
    ("Yeshwanthpur", "Yeshwanthpur Circle"): [
        [13.0160, 77.5600], [13.0185, 77.5555], [13.0225, 77.5510], [13.0255, 77.5470]
    ]
}

# Cached aggregations
_cached_df = None
_cached_corridors = None
_cached_summary = None


def get_csv_path():
    """Find the dataset file or return the expected path."""
    if os.path.exists(DEFAULT_CSV_PATH):
        return DEFAULT_CSV_PATH
    # Check alternate locations
    alt_paths = [
        os.path.join("data", "Banglore_traffic_Dataset.csv"),
        os.path.join("..", "data", "Banglore_traffic_Dataset.csv"),
        os.path.join(os.getcwd(), "data", "Banglore_traffic_Dataset.csv")
    ]
    for p in alt_paths:
        if os.path.exists(p):
            return os.path.abspath(p)
    return DEFAULT_CSV_PATH


def load_dataset():
    """Loads and validates Banglore_traffic_Dataset.csv."""
    global _cached_df, _cached_corridors, _cached_summary

    if _cached_corridors is not None:
        return True, _cached_corridors, _cached_summary

    csv_path = get_csv_path()
    if not os.path.exists(csv_path):
        return False, None, {
            "error": "Dataset file not found",
            "expected_path": csv_path,
            "fix": f"Place 'Banglore_traffic_Dataset.csv' into '{os.path.dirname(csv_path)}/'"
        }

    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        return False, None, {
            "error": "Failed to read CSV dataset",
            "message": str(e),
            "path": csv_path
        }

    required_cols = ['Area Name', 'Road/Intersection Name', 'Congestion Level', 'Average Speed', 'Traffic Volume']
    missing_cols = [c for c in required_cols if c not in df.columns]
    if missing_cols:
        return False, None, {
            "error": "Missing required columns in CSV",
            "missing": missing_cols,
            "available": list(df.columns)
        }

    _cached_df = df

    # Aggregating by Area and Road/Intersection
    agg = df.groupby(['Area Name', 'Road/Intersection Name']).agg(
        avg_congestion=('Congestion Level', 'mean'),
        min_congestion=('Congestion Level', 'min'),
        max_congestion=('Congestion Level', 'max'),
        avg_speed=('Average Speed', 'mean'),
        avg_volume=('Traffic Volume', 'mean'),
        avg_tti=('Travel Time Index', 'mean'),
        total_incidents=('Incident Reports', 'sum'),
        sample_count=('Date', 'count')
    ).round(1).reset_index()

    corridors = []
    for _, row in agg.iterrows():
        area = row['Area Name']
        road = row['Road/Intersection Name']
        congestion = float(row['avg_congestion'])
        speed = float(row['avg_speed'])
        volume = int(round(float(row['avg_volume'])))
        tti = float(row['avg_tti'])
        incidents = int(row['total_incidents'])
        samples = int(row['sample_count'])

        # Classify congestion according to documented thresholds
        if congestion < 60.0:
            level = "Low"
            color = "#10b981"
            status_desc = "Normal Flow"
        elif congestion < 80.0:
            level = "Moderate"
            color = "#f59e0b"
            status_desc = "Medium Delay"
        else:
            level = "High"
            color = "#ef4444"
            status_desc = "High Congestion"

        # Coordinates from verified road geometry
        coords = CORRIDOR_GEOMETRIES.get((area, road), [])

        corridors.append({
            "id": f"{area.lower().replace(' ', '-')}_{road.lower().replace(' ', '-')}",
            "area_name": area,
            "road_name": road,
            "display_name": f"{road} ({area})",
            "congestion_level_pct": congestion,
            "congestion_category": level,
            "color": color,
            "status_label": status_desc,
            "average_speed_kmh": speed,
            "traffic_volume": volume,
            "travel_time_index": tti,
            "total_incidents": incidents,
            "sample_count": samples,
            "coordinates": coords,
            "data_source": "Banglore_traffic_Dataset.csv (Historical Dataset)"
        })

    # Sort corridors by area, then road
    corridors.sort(key=lambda c: (c['area_name'], c['road_name']))
    _cached_corridors = corridors

    _cached_summary = {
        "dataset_name": "Banglore_traffic_Dataset.csv",
        "file_path": csv_path,
        "total_records": len(df),
        "total_corridors": len(corridors),
        "unique_areas": sorted(df['Area Name'].unique().tolist()),
        "overall_mean_congestion": round(float(df['Congestion Level'].mean()), 1),
        "overall_mean_speed": round(float(df['Average Speed'].mean()), 1),
        "date_range": {
            "start": str(df['Date'].min()),
            "end": str(df['Date'].max())
        },
        "thresholds": {
            "low": "< 60.0% Congestion (Green #10b981)",
            "moderate": "60.0% <= Congestion < 80.0% (Yellow #f59e0b)",
            "high": ">= 80.0% Congestion (Red #ef4444)"
        }
    }

    return True, _cached_corridors, _cached_summary


def match_point_to_corridors(lat, lng, max_distance_km=1.2):
    """
    Finds the closest monitored corridor within max_distance_km using Haversine formula.
    """
    success, corridors, _ = load_dataset()
    if not success or not corridors:
        return None, float('inf')

    closest_corridor = None
    min_dist = float('inf')

    for corridor in corridors:
        coords = corridor.get("coordinates", [])
        for pt in coords:
            c_lat, c_lng = pt[0], pt[1]
            # Haversine distance
            dlat = math.radians(c_lat - lat)
            dlng = math.radians(c_lng - lng)
            a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat)) * math.cos(math.radians(c_lat)) * math.sin(dlng / 2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            dist_km = 6371.0 * c

            if dist_km < min_dist:
                min_dist = dist_km
                closest_corridor = corridor

    if min_dist <= max_distance_km:
        return closest_corridor, min_dist
    return None, min_dist
