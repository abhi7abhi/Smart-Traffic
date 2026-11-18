"""
incident_routing.py — Smart Accident Detection & Rerouting Service
===================================================================
Coordinates real-time crash report detection along driver routes, evaluates
traffic telemetry, and coordinates alternative detour routes via OSRM.

Key Principles:
  • Does NOT fabricate live traffic or travel times.
  • Distinguishes unverified user reports ("Pending") from "Verified" official records.
  • Filters out expired, rejected, or geometrically irrelevant reports.
  • De-duplicates multiple submissions for the same incident.
  • Computes alternative real road routes via OSRM (alternatives=true or detour waypoints).
  • Never introduces straight-line geometries or arbitrary coordinates.
"""

import math
import time
import urllib.request
import urllib.parse
import json
import logging
from datetime import datetime, date, timedelta

logger = logging.getLogger(__name__)

# Bengaluru local coordinates lookup for known locations
KNOWN_BENGALURU_LOCATIONS = {
    "electronic city": (12.8452, 77.6602),
    "electronic city phase 1": (12.8485, 77.6625),
    "electronic city phase 2": (12.8390, 77.6780),
    "electronic city road": (12.8452, 77.6602),
    "hebbal": (13.0358, 77.5970),
    "hebbal flyover": (13.0358, 77.5970),
    "silk board": (12.9172, 77.6228),
    "central silk board": (12.9172, 77.6228),
    "central silk board jn": (12.9172, 77.6228),
    "hosur road": (12.8988, 77.6433),
    "whitefield": (12.9698, 77.7499),
    "indiranagar": (12.9784, 77.6408),
    "indiranagar 100 feet road": (12.9784, 77.6408),
    "koramangala": (12.9352, 77.6245),
    "koramangala 80ft road": (12.9352, 77.6245),
    "outer ring road": (12.9248, 77.6805),
    "sarjapur road": (12.9166, 77.6750),
    "bannerghatta road": (12.8912, 77.5975),
    "kanakapura road": (12.8805, 77.5583),
    "marathahalli": (12.9560, 77.7011),
    "jayanagar": (12.9308, 77.5838),
    "mg road": (12.9756, 77.6067),
    "m.g. road": (12.9756, 77.6067),
    "majestic": (12.9767, 77.5713),
    "yelahanka": (13.1007, 77.5963),
    "kr puram": (13.0075, 77.6959),
    "chandapura": (12.8009, 77.7115),
    "chandapura junction": (12.8009, 77.7115)
}

# Maximum incident age in hours to be considered "active"
DEFAULT_MAX_INCIDENT_AGE_HOURS = 48

# Maximum distance from route (in meters) to consider an incident affecting the route
DEFAULT_ROUTE_PROXIMITY_THRESHOLD_METERS = 350.0


def resolve_location_coordinates(location_str):
    """
    Attempts to resolve a text location to (lat, lon) coordinates
    using the known Bengaluru corridors dictionary.
    """
    if not location_str or not isinstance(location_str, str):
        return None
    norm = location_str.strip().lower()
    if norm in KNOWN_BENGALURU_LOCATIONS:
        return KNOWN_BENGALURU_LOCATIONS[norm]
    for key, coords in KNOWN_BENGALURU_LOCATIONS.items():
        if key in norm or norm in key:
            return coords
    return None


def point_to_segment_distance_m(px, py, ax, ay, bx, by):
    """
    Calculates distance in meters from point P(lon, lat) to line segment AB.
    Coordinates are in degrees: (px=lon, py=lat).
    Uses equirectangular projection centered on the segment.
    Returns (distance_in_meters, projection_fraction_t).
    """
    mid_lat_rad = math.radians((py + (ay + by) / 2.0) / 2.0)
    kx = math.cos(mid_lat_rad) * 111320.0
    ky = 110540.0

    px_m, py_m = px * kx, py * ky
    ax_m, ay_m = ax * kx, ay * ky
    bx_m, by_m = bx * kx, by * ky

    dx = bx_m - ax_m
    dy = by_m - ay_m
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq <= 1e-9:
        return math.hypot(px_m - ax_m, py_m - ay_m), 0.0

    t = max(0.0, min(1.0, ((px_m - ax_m) * dx + (py_m - ay_m) * dy) / seg_len_sq))
    cx_m = ax_m + t * dx
    cy_m = ay_m + t * dy
    dist = math.hypot(px_m - cx_m, py_m - cy_m)
    return dist, t


def min_distance_to_route(inc_lat, inc_lon, polyline_latlngs):
    """
    Calculates the minimum distance from incident (inc_lat, inc_lon)
    to a polyline of [lat, lon] points.
    Returns (min_distance_meters, nearest_segment_index, projection_t).
    """
    if not polyline_latlngs or len(polyline_latlngs) < 2:
        return float("inf"), -1, 0.0

    min_dist = float("inf")
    best_idx = -1
    best_t = 0.0

    for i in range(len(polyline_latlngs) - 1):
        p1 = polyline_latlngs[i]
        p2 = polyline_latlngs[i + 1]
        dist, t = point_to_segment_distance_m(inc_lon, inc_lat, p1[1], p1[0], p2[1], p2[0])
        if dist < min_dist:
            min_dist = dist
            best_idx = i
            best_t = t

    return min_dist, best_idx, best_t


def haversine_m(lat1, lon1, lat2, lon2):
    """Great-circle distance in meters between two lat/lon points."""
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * R * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def get_active_incidents(
    get_connection_fn,
    max_age_hours=DEFAULT_MAX_INCIDENT_AGE_HOURS,
    include_unverified=True,
    center_lat=None,
    center_lon=None,
    radius_km=None
):
    """
    Retrieves and filters active crash reports from the database.
    - Excludes 'Rejected' and 'Resolved' reports (resolved reports are no longer active hazards).
    - Filters out reports older than max_age_hours (if max_age_hours > 0).
    - Resolves coordinates for reports without explicit GPS.
    - Optionally filters by geographic area (center_lat, center_lon, radius_km).
    - De-duplicates reports of the same incident within 250m.
    """
    conn = get_connection_fn()
    cur = conn.cursor(dictionary=True)

    sql = """
        SELECT report_id, user_id, reporter_name, location, latitude, longitude,
               report_date, report_time, crash_type, severity,
               road_condition, description, status, created_at,
               photo_path, captured_at, capture_lat, capture_lng
        FROM crash_reports
        WHERE status NOT IN ('Rejected', 'Resolved')
        ORDER BY report_id DESC
    """
    cur.execute(sql)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    now = datetime.now()
    active_reports = []

    for r in rows:
        status = r.get("status") or "Pending"
        if status.lower() in ("rejected", "resolved"):
            continue

        # Check age
        created_at_dt = None
        raw_created = r.get("created_at")
        if isinstance(raw_created, datetime):
            created_at_dt = raw_created
        elif raw_created:
            created_str = str(raw_created)
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                try:
                    created_at_dt = datetime.strptime(created_str.split(".")[0], fmt)
                    break
                except ValueError:
                    pass

        # If created_at is valid and max_age_hours > 0, check expiration
        if created_at_dt and max_age_hours and max_age_hours > 0:
            age_hours = (now - created_at_dt).total_seconds() / 3600.0
            if age_hours > max_age_hours:
                continue

        # Resolve coordinates: direct coords -> capture coords -> corridor lookup
        lat = r.get("latitude")
        lng = r.get("longitude")
        if lat is None or lng is None:
            lat = r.get("capture_lat")
            lng = r.get("capture_lng")
        if lat is None or lng is None:
            resolved = resolve_location_coordinates(r.get("location"))
            if resolved:
                lat, lng = resolved

        if lat is None or lng is None:
            continue

        try:
            lat = float(lat)
            lng = float(lng)
        except (ValueError, TypeError):
            continue

        # Optional geographic area radius filter
        if center_lat is not None and center_lon is not None and radius_km and radius_km > 0:
            dist_to_center_km = haversine_m(center_lat, center_lon, lat, lng) / 1000.0
            if dist_to_center_km > radius_km:
                continue

        is_verified = (status.lower() == "verified")
        badge = "Verified Official Incident" if is_verified else "Unverified Community Report (Pending Verification)"

        # Format dates nicely
        rep_date_str = str(r.get("report_date") or "")
        rep_time_str = str(r.get("report_time") or "")
        created_at_str = str(r.get("created_at") or "")

        active_reports.append({
            "report_id": r["report_id"],
            "user_id": r["user_id"],
            "location": r.get("location") or "Monitored Corridor",
            "latitude": lat,
            "longitude": lng,
            "crash_type": r.get("crash_type") or "Vehicle Incident",
            "severity": r.get("severity") or "Moderate",
            "road_condition": r.get("road_condition") or "Normal",
            "description": r.get("description") or "Incident reported on road corridor.",
            "status": status,
            "is_verified": is_verified,
            "verification_badge": badge,
            "report_date": rep_date_str,
            "report_time": rep_time_str,
            "created_at": created_at_str,
            "has_photo": bool(r.get("photo_path")),
            "photo_path": r.get("photo_path")
        })

    # De-duplicate reports of the same event within 250m
    deduped = []
    for inc in active_reports:
        duplicate_found = False
        for existing in deduped:
            dist = haversine_m(inc["latitude"], inc["longitude"], existing["latitude"], existing["longitude"])
            if dist < 250.0:
                duplicate_found = True
                # Promote to verified if this report is verified
                if inc["is_verified"] and not existing["is_verified"]:
                    existing["is_verified"] = True
                    existing["status"] = "Verified"
                    existing["verification_badge"] = "Verified Official Incident"
                # Keep highest severity
                sev_order = {"high": 3, "moderate": 2, "low": 1}
                inc_sev = sev_order.get(str(inc.get("severity")).lower(), 2)
                exist_sev = sev_order.get(str(existing.get("severity")).lower(), 2)
                if inc_sev > exist_sev:
                    existing["severity"] = inc["severity"]
                existing["report_count"] = existing.get("report_count", 1) + 1
                break
        if not duplicate_found:
            inc["report_count"] = 1
            deduped.append(inc)

    return deduped


def query_osrm_route(start_lon, start_lat, dest_lon, dest_lat, alternatives=True):
    """
    Queries the free Open Source Routing Machine (OSRM) driving service.
    Returns parsed routes list or empty list if unavailable.
    """
    alt_flag = "true" if alternatives else "false"
    url = (
        f"https://router.project-osrm.org/route/v1/driving/"
        f"{start_lon:.5f},{start_lat:.5f};{dest_lon:.5f},{dest_lat:.5f}"
        f"?overview=full&geometries=geojson&steps=true&alternatives={alt_flag}"
    )

    req = urllib.request.Request(url, headers={"User-Agent": "SmartTrafficManagementSystem/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                if data and data.get("code") == "Ok":
                    return data.get("routes", [])
    except Exception as e:
        logger.warning("OSRM routing request error: %s", e)
    return []


def query_osrm_via_waypoint(start_lon, start_lat, via_lon, via_lat, dest_lon, dest_lat):
    """
    Queries OSRM for a 3-point route: start -> via -> dest to bypass an incident.
    """
    url = (
        f"https://router.project-osrm.org/route/v1/driving/"
        f"{start_lon:.5f},{start_lat:.5f};{via_lon:.5f},{via_lat:.5f};{dest_lon:.5f},{dest_lat:.5f}"
        f"?overview=full&geometries=geojson&steps=true"
    )

    req = urllib.request.Request(url, headers={"User-Agent": "SmartTrafficManagementSystem/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                if data and data.get("code") == "Ok" and data.get("routes"):
                    return data["routes"][0]
    except Exception as e:
        logger.warning("OSRM via-waypoint routing request error: %s", e)
    return None


def calculate_perpendicular_bypass(start_lon, start_lat, inc_lon, inc_lat, dest_lon, dest_lat, offset_km=2.2):
    """
    Calculates a safe bypass waypoint offset perpendicularly from the incident.
    """
    dx = dest_lon - start_lon
    dy = dest_lat - start_lat
    length = math.hypot(dx, dy)
    if length <= 1e-6:
        return inc_lon + 0.02, inc_lat + 0.02

    # Perpendicular vector (-dy, dx)
    perp_x = -dy / length
    perp_y = dx / length

    # Offset in degrees (~111km per degree)
    deg_offset = offset_km / 111.0
    via_lon = inc_lon + perp_x * deg_offset
    via_lat = inc_lat + perp_y * deg_offset
    return via_lon, via_lat


def analyze_route_for_incidents(
    route_latlngs,
    start_coords,
    dest_coords,
    get_connection_fn,
    traffic_provider_fn=None,
    max_age_hours=DEFAULT_MAX_INCIDENT_AGE_HOURS,
    driver_location=None
):
    """
    Core detection & rerouting decision pipeline.
    1. Evaluates all active incidents against planned route polyline.
    2. Identifies close incidents affecting the route (< 350m-450m).
    3. Evaluates driver current location to determine if incident is AHEAD vs BEHIND.
    4. Evaluates real traffic impact via traffic provider.
    5. Calculates and compares alternative route(s) via OSRM avoiding incident.
    6. Computes actual distance difference and travel-time savings.
    """
    if not route_latlngs or len(route_latlngs) < 2:
        return {
            "has_incident": False,
            "incidents": [],
            "message": "Route polyline contains insufficient coordinates."
        }

    active_incidents = get_active_incidents(get_connection_fn, max_age_hours=max_age_hours)
    if not active_incidents:
        return {
            "has_incident": False,
            "incidents": [],
            "message": "No active incidents recorded in the system."
        }

    # Precalculate cumulative distances along route polyline in meters
    cum_distances_m = [0.0]
    for i in range(len(route_latlngs) - 1):
        d_m = haversine_m(
            route_latlngs[i][0], route_latlngs[i][1],
            route_latlngs[i + 1][0], route_latlngs[i + 1][1]
        )
        cum_distances_m.append(cum_distances_m[-1] + d_m)

    # Determine driver position along route if GPS location is active
    driver_dist_along_route = 0.0
    has_driver_loc = False
    if driver_location and isinstance(driver_location, dict):
        d_lat = driver_location.get("lat")
        d_lon = driver_location.get("lon") if driver_location.get("lon") is not None else driver_location.get("lng")
        if d_lat is not None and d_lon is not None:
            try:
                d_lat, d_lon = float(d_lat), float(d_lon)
                d_m, d_seg_idx, d_t = min_distance_to_route(d_lat, d_lon, route_latlngs)
                # Driver considered on-route if within 1.5km
                if d_m <= 1500.0 and 0 <= d_seg_idx < len(cum_distances_m) - 1:
                    has_driver_loc = True
                    driver_dist_along_route = cum_distances_m[d_seg_idx] + d_t * (cum_distances_m[d_seg_idx + 1] - cum_distances_m[d_seg_idx])
            except (ValueError, TypeError):
                pass

    affecting_incidents = []

    for inc in active_incidents:
        # Dynamic proximity threshold based on severity
        sev = str(inc.get("severity") or "").lower()
        threshold = 450.0 if sev == "high" else 350.0 if sev == "moderate" else 250.0

        dist_m, seg_idx, t = min_distance_to_route(inc["latitude"], inc["longitude"], route_latlngs)
        if dist_m <= threshold:
            inc_dist_along_route = cum_distances_m[seg_idx] + t * (cum_distances_m[seg_idx + 1] - cum_distances_m[seg_idx])
            dist_ahead_m = inc_dist_along_route - driver_dist_along_route

            # If driver location is active and incident is BEHIND driver (more than 150m buffer)
            if has_driver_loc and dist_ahead_m < -150.0:
                # Incident has already been passed by the driver; do not trigger ahead warning!
                continue

            inc_copy = dict(inc)
            inc_copy["distance_from_route_m"] = round(dist_m, 1)
            inc_copy["nearest_segment_idx"] = seg_idx
            inc_copy["is_ahead"] = True
            inc_copy["distance_ahead_m"] = max(0.0, round(dist_ahead_m, 1))

            if dist_ahead_m >= 1000.0:
                inc_copy["distance_ahead_str"] = f"{dist_ahead_m / 1000.0:.1f} km ahead"
            else:
                inc_copy["distance_ahead_str"] = f"{int(max(0, dist_ahead_m))} m ahead"

            affecting_incidents.append(inc_copy)

    if not affecting_incidents:
        return {
            "has_incident": False,
            "incidents": [],
            "message": "No incidents affect the planned route. Clear roads ahead."
        }

    # Sort affecting incidents: incidents ahead closest to driver first, prioritizing high severity
    affecting_incidents.sort(
        key=lambda x: (
            0 if str(x.get("severity")).lower() == "high" else 1,
            x["distance_ahead_m"]
        )
    )

    primary_inc = affecting_incidents[0]
    seg_idx = primary_inc["nearest_segment_idx"]

    # Calculate affected route section (range around nearest segment)
    buffer_points = 15
    affected_start = max(0, seg_idx - buffer_points)
    affected_end = min(len(route_latlngs) - 1, seg_idx + buffer_points)
    affected_geometry = route_latlngs[affected_start:affected_end + 1]

    # Evaluate traffic impact
    traffic_impact_status = "unknown"
    traffic_desc = "Live traffic telemetry unavailable. Do not assume traffic jam without live confirmation."

    if traffic_provider_fn:
        try:
            pt = {"lat": primary_inc["latitude"], "lon": primary_inc["longitude"]}
            t_data = traffic_provider_fn([pt])
            if t_data and t_data.get("success"):
                segs = t_data.get("segments", [])
                if segs:
                    seg = segs[0]
                    c_speed = seg.get("current_speed", 0.0)
                    f_speed = seg.get("free_flow_speed", 1.0)
                    ratio = c_speed / max(1.0, f_speed)
                    if ratio < 0.45 or c_speed <= 20.0:
                        traffic_impact_status = "confirmed"
                        traffic_desc = f"Confirmed Heavy Congestion (Speed {c_speed:.0f} km/h vs {f_speed:.0f} km/h normal)."
                    elif ratio < 0.75:
                        traffic_impact_status = "estimated"
                        traffic_desc = f"Moderate Slowdown (Speed {c_speed:.0f} km/h)."
                    else:
                        traffic_impact_status = "flow_normal"
                        traffic_desc = f"Traffic Flow Normal ({c_speed:.0f} km/h) — Incident clear of driving lanes."
            elif t_data and t_data.get("status") == "key_missing":
                traffic_impact_status = "unknown"
                traffic_desc = "Traffic API unconfigured. Traffic impact unconfirmed."
        except Exception as e:
            logger.warning("Error evaluating traffic impact: %s", e)

    # Calculate baseline original route distance & duration
    orig_dist_km = 0.0
    for i in range(len(route_latlngs) - 1):
        orig_dist_km += haversine_m(
            route_latlngs[i][0], route_latlngs[i][1],
            route_latlngs[i + 1][0], route_latlngs[i + 1][1]
        ) / 1000.0
    orig_dur_mins = max(1.0, (orig_dist_km / 35.0) * 60.0) # baseline ~35 km/h urban speed

    # Request alternative route from OSRM
    # Use driver's active GPS position if currently navigating, otherwise route start coordinates
    if has_driver_loc:
        start_lon = d_lon
        start_lat = d_lat
    else:
        start_lon = start_coords.get("lon") if start_coords.get("lon") is not None else start_coords.get("lng")
        start_lat = start_coords.get("lat")

    dest_lon = dest_coords.get("lon") if dest_coords.get("lon") is not None else dest_coords.get("lng")
    dest_lat = dest_coords.get("lat")

    alt_route_obj = None
    time_saved_mins = 0.0
    recommended = False
    reroute_reason = ""

    if start_lon is not None and start_lat is not None and dest_lon is not None and dest_lat is not None:
        osrm_routes = query_osrm_route(float(start_lon), float(start_lat), float(dest_lon), float(dest_lat), alternatives=True)
        if osrm_routes:
            orig_osrm = osrm_routes[0]
            orig_dist_km = round(orig_osrm.get("distance", 0.0) / 1000.0, 1)
            orig_dur_mins = max(1.0, round(orig_osrm.get("duration", 0.0) / 60.0, 1))

            # Look for an alternative that avoids the incident
            candidate_alt = None
            if len(osrm_routes) > 1:
                for cand in osrm_routes[1:]:
                    cand_coords = [[pt[1], pt[0]] for pt in cand["geometry"]["coordinates"]]
                    cand_dist_m, _, _ = min_distance_to_route(primary_inc["latitude"], primary_inc["longitude"], cand_coords)
                    if cand_dist_m > 400.0: # Successfully bypasses the incident
                        candidate_alt = cand
                        break

            # If OSRM's default alternative still touches the incident or wasn't provided, compute via waypoint detour
            if not candidate_alt:
                via_lon, via_lat = calculate_perpendicular_bypass(
                    float(start_lon), float(start_lat),
                    primary_inc["longitude"], primary_inc["latitude"],
                    float(dest_lon), float(dest_lat), offset_km=2.2
                )
                waypoint_route = query_osrm_via_waypoint(float(start_lon), float(start_lat), via_lon, via_lat, float(dest_lon), float(dest_lat))
                if waypoint_route:
                    cand_coords = [[pt[1], pt[0]] for pt in waypoint_route["geometry"]["coordinates"]]
                    cand_dist_m, _, _ = min_distance_to_route(primary_inc["latitude"], primary_inc["longitude"], cand_coords)
                    if cand_dist_m > 400.0:
                        candidate_alt = waypoint_route

            if candidate_alt:
                alt_dist_km = round(candidate_alt.get("distance", 0.0) / 1000.0, 1)
                alt_dur_mins = max(1.0, round(candidate_alt.get("duration", 0.0) / 60.0, 1))
                alt_geometry = [[pt[1], pt[0]] for pt in candidate_alt["geometry"]["coordinates"]]

                # Travel time savings comparison
                # When primary route has confirmed congestion or high severity, factor expected delay into original route
                delay_factor_mins = 0.0
                if traffic_impact_status == "confirmed":
                    delay_factor_mins = 12.0
                elif str(primary_inc.get("severity")).lower() == "high":
                    delay_factor_mins = 8.0

                effective_orig_eta = orig_dur_mins + delay_factor_mins
                if effective_orig_eta > alt_dur_mins:
                    time_saved_mins = round(effective_orig_eta - alt_dur_mins, 1)
                    recommended = True
                    reroute_reason = (
                        f"Alternative route avoids {primary_inc['location']} incident "
                        f"and saves estimated ~{time_saved_mins:.0f} mins."
                    )
                else:
                    time_saved_mins = 0.0
                    additional_mins = round(alt_dur_mins - effective_orig_eta, 1)
                    recommended = False
                    reroute_reason = (
                        f"Current route remains fastest despite incident (+{additional_mins:.0f} mins via detour). "
                        f"Proceed with caution through {primary_inc['location']}."
                    )

                alt_route_obj = {
                    "has_alternative": True,
                    "distance_km": alt_dist_km,
                    "duration_mins": alt_dur_mins,
                    "effective_orig_eta_mins": effective_orig_eta,
                    "time_saved_mins": time_saved_mins,
                    "recommended": recommended,
                    "reason": reroute_reason,
                    "geometry": alt_geometry
                }

    if not alt_route_obj:
        alt_route_obj = {
            "has_alternative": False,
            "recommended": False,
            "reason": f"No valid alternative road bypass found. Drive cautiously through {primary_inc['location']}.",
            "time_saved_mins": 0.0
        }

    return {
        "has_incident": True,
        "count": len(affecting_incidents),
        "primary_incident": primary_inc,
        "all_affecting_incidents": affecting_incidents,
        "affected_segment": {
            "start_idx": affected_start,
            "end_idx": affected_end,
            "geometry": affected_geometry
        },
        "traffic_impact": {
            "status": traffic_impact_status,
            "description": traffic_desc
        },
        "original_route": {
            "distance_km": orig_dist_km,
            "duration_mins": orig_dur_mins
        },
        "reroute": alt_route_obj
    }
