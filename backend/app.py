"""
app.py — Flask REST API for Smart Crash & Traffic Management System
=====================================================================
Endpoints:
  POST   /api/auth/register               Register a new user account
  POST   /api/auth/login                  Sign in and receive session token
  GET    /api/auth/me                     Check current authenticated profile
  POST   /api/auth/logout                 Invalidate session token
  POST   /api/crash-reports               Submit a new crash report (Protected, user_id associated, → Pending)
  GET    /api/user/my-reports             View authenticated user's submitted crash reports
  PUT    /api/user/my-reports/<id>        Edit user's submitted report (Ownership enforced, 403 Forbidden)
  DELETE /api/user/my-reports/<id>        Delete user's submitted report (Ownership enforced, 403 Forbidden)
  GET    /api/crash-reports               Public reports for map (Verified incidents only)
  GET    /api/crash-statistics            Aggregated counts for analytics dashboard

Rules enforced:
  • Every submitted report starts with status = 'Pending'
  • Only Verified reports appear as confirmed markers on the map
  • Pending/Rejected reports are never auto-counted in official statistics
  • SQL uses parameterized queries — no string interpolation
  • Stack traces / DB passwords never exposed to clients
"""

from flask import Flask, request, jsonify, redirect, send_from_directory, Response
from flask_cors import CORS
from mysql.connector import Error
import os
import sys
import time
from datetime import datetime, timedelta, date
import secrets
import base64
import uuid
import requests
import csv
import io
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

# Load environment variables from .env
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

# Add parent dir so we can import database.py from the same folder
sys.path.insert(0, os.path.dirname(__file__))
from database import get_connection
import historical_traffic
import incident_routing
from incident_routing import resolve_location_coordinates, get_active_incidents, analyze_route_for_incidents

app = Flask(__name__)

# Upload folder for captured crash photos (stored on disk, reference stored in DB)
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB

# In-memory short-lived cache for TomTom Traffic Flow API (60-second TTL)
_traffic_cache = {}
_CACHE_TTL_SECONDS = 60

# -------------------------------------------------------------------
# CORS — allow requests from all devices on localhost and local network
# -------------------------------------------------------------------
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Admin-Key"],
    }
})


# ===================================================================
# Web UI Frontend & Static Asset Serving (Production & Tunnels)
# ===================================================================

DIST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")

@app.route("/", methods=["GET"])
def root():
    index_path = os.path.join(DIST_DIR, "index.html")
    if os.path.isfile(index_path):
        return send_from_directory(DIST_DIR, "index.html")
    return jsonify({
        "message": "Smart Crash & Traffic Management System backend is running",
        "status": "ok",
        "version": "1.0",
    })

@app.route("/assets/<path:path>", methods=["GET"])
def serve_assets(path):
    assets_dir = os.path.join(DIST_DIR, "assets")
    return send_from_directory(assets_dir, path)

@app.route("/<path:path>", methods=["GET"])
def serve_spa(path):
    if path.startswith("api/") or path == "api":
        return _error("API endpoint not found", 404)
    file_path = os.path.join(DIST_DIR, path)
    if os.path.isfile(file_path):
        return send_from_directory(DIST_DIR, path)
    index_path = os.path.join(DIST_DIR, "index.html")
    if os.path.isfile(index_path):
        return send_from_directory(DIST_DIR, "index.html")
    return _error("Not found", 404)


# ===================================================================
# HELPER UTILITIES
# ===================================================================

ALLOWED_LOCATIONS = {
    "Hosur Road", "Electronic City Road", "Bannerghatta Road",
    "Outer Ring Road", "Sarjapur Road", "Kanakapura Road", "Other Corridor"
}

ALLOWED_CRASH_TYPES = {
    "Vehicle Collision", "Rear-end", "Side Impact", "Skid"
}

ALLOWED_SEVERITIES = {"High", "Moderate", "Low"}

ALLOWED_CONDITIONS = {"Dry", "Wet", "Poor Surface", "Unknown"}

ALLOWED_STATUSES = {"Pending", "Verified", "Rejected", "Resolved"}


def _error(message, code=400):
    """Return a standardised JSON error response."""
    return jsonify({"success": False, "error": message}), code


def _safe_float(value):
    """Try to parse a float; return None on failure."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _save_captured_photo(photo_data):
    """
    Validates base64 photo data from in-app camera, saves it securely to backend/uploads,
    and returns (relative_path, None) or (None, error_msg).
    Enforces <= 5MB and allowed MIME types (jpeg, png, webp).
    """
    if not photo_data or not isinstance(photo_data, str):
        return None, "Invalid photo data."

    if "," not in photo_data or ";base64" not in photo_data:
        return None, "Malformed photo format. Must be a valid base64 image data URL."

    header, b64_str = photo_data.split(",", 1)
    ext = "jpg"
    if "image/png" in header:
        ext = "png"
    elif "image/webp" in header:
        ext = "webp"
    elif "image/jpeg" in header or "image/jpg" in header:
        ext = "jpg"
    else:
        return None, "Unsupported photo format. Only JPEG, PNG, and WebP are allowed."

    try:
        binary_data = base64.b64decode(b64_str)
    except Exception:
        return None, "Could not decode base64 image data."

    if len(binary_data) > MAX_PHOTO_BYTES:
        return None, f"Photo size ({len(binary_data) / (1024*1024):.2f} MB) exceeds maximum allowed limit of 5 MB."

    if len(binary_data) < 100:
        return None, "Photo payload is too small or invalid."

    safe_filename = f"crash_{uuid.uuid4().hex}_{int(time.time())}.{ext}"
    target_path = os.path.join(UPLOAD_FOLDER, safe_filename)

    try:
        with open(target_path, "wb") as f:
            f.write(binary_data)
    except Exception as e:
        app.logger.error("Failed to write photo file: %s", e)
        return None, "Server failed to store captured photo."

    return f"uploads/{safe_filename}", None


# ===================================================================
# AUTHENTICATION & SESSION MANAGEMENT
# ===================================================================

# In-memory session store mapping bearer_token -> user_id
_active_sessions = {}


def _get_authenticated_user():
    """Extract and validate Bearer token from Authorization header."""
    auth_header = request.headers.get("Authorization", "").strip()
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    if not token or token not in _active_sessions:
        return None
    user_id = _active_sessions[token]
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT user_id, name, email, created_at FROM users WHERE user_id = %s", (user_id,))
        user = cursor.fetchone()
        cursor.close()
        conn.close()
        return user
    except Exception as e:
        app.logger.error("Auth user lookup error: %s", e)
        return None


# ===================================================================
# POST /api/auth/register  — Register a new user
# ===================================================================

@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json(silent=True)
    if not data:
        return _error("Request body must be valid JSON.")

    name = (data.get("name") or "").strip()[:100]
    email = (data.get("email") or "").strip().lower()[:150]
    password = (data.get("password") or "").strip()

    if not name:
        return _error("Full name is required.")
    if not email or "@" not in email or "." not in email:
        return _error("A valid email address is required.")
    if len(password) < 6:
        return _error("Password must be at least 6 characters long.")

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT user_id FROM users WHERE email = %s", (email,))
        existing = cursor.fetchone()
        if existing:
            cursor.close()
            conn.close()
            return _error("An account with this email address already exists.", 409)

        password_hash = generate_password_hash(password)
        cursor.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s)",
            (name, email, password_hash)
        )
        conn.commit()
        new_user_id = cursor.lastrowid
        cursor.close()
        conn.close()
    except RuntimeError as e:
        app.logger.error("DB connection error in register: %s", e)
        return _error("Unable to connect to the database.", 503)
    except Error as e:
        app.logger.error("DB error in register: %s", e)
        return _error("Failed to register account.", 500)

    token = secrets.token_hex(32)
    _active_sessions[token] = new_user_id

    return jsonify({
        "success": True,
        "message": "Registration successful.",
        "token": token,
        "user": {
            "user_id": new_user_id,
            "name": name,
            "email": email
        }
    }), 201


# ===================================================================
# POST /api/auth/login  — Log in with email and password
# ===================================================================

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json(silent=True)
    if not data:
        return _error("Request body must be valid JSON.")

    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not email or not password:
        return _error("Email and password are required.")

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT user_id, name, email, password_hash FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        cursor.close()
        conn.close()
    except RuntimeError as e:
        app.logger.error("DB connection error in login: %s", e)
        return _error("Unable to connect to the database.", 503)
    except Error as e:
        app.logger.error("DB error in login: %s", e)
        return _error("Login failed.", 500)

    if not user or not check_password_hash(user["password_hash"], password):
        return _error("Invalid email or password.", 401)

    token = secrets.token_hex(32)
    _active_sessions[token] = user["user_id"]

    return jsonify({
        "success": True,
        "message": "Login successful.",
        "token": token,
        "user": {
            "user_id": user["user_id"],
            "name": user["name"],
            "email": user["email"]
        }
    }), 200


# ===================================================================
# GET /api/auth/me  — Current authenticated session profile
# ===================================================================

@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    user = _get_authenticated_user()
    if not user:
        return _error("Authentication required.", 401)

    return jsonify({
        "success": True,
        "user": {
            "user_id": user["user_id"],
            "name": user["name"],
            "email": user["email"],
            "created_at": user["created_at"].isoformat() if hasattr(user["created_at"], "isoformat") else str(user.get("created_at") or "")
        }
    })


# ===================================================================
# POST /api/auth/logout  — Invalidate user session
# ===================================================================

@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    auth_header = request.headers.get("Authorization", "").strip()
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        _active_sessions.pop(token, None)

    return jsonify({
        "success": True,
        "message": "Logged out successfully."
    })


# ===================================================================
# POST /api/crash-reports  — Submit a new crash report (Auth required)
# ===================================================================

@app.route("/api/crash-reports", methods=["POST"])
@app.route("/api/crashes", methods=["POST"])
def create_crash_report():
    user = _get_authenticated_user()
    user_id = user["user_id"] if user else None

    data = request.get_json(silent=True)
    if not data:
        return _error("Request body must be valid JSON.")

    # ── Required field validation ──────────────────────────────────
    location = (data.get("location") or "").strip()
    if not location:
        return _error("'location' is required.")

    description = (data.get("description") or "").strip()
    if not description:
        return _error("'description' is required. Please explain what happened.", 400)

    crash_type = (data.get("crash_type") or "").strip()
    if not crash_type:
        return _error("'crash_type' is required.", 400)

    # ── Optional fields (sanitised / whitelisted) ──────────────────
    reporter_name  = ((user.get("name") if user else None) or data.get("reporter_name") or "Citizen Reporter").strip()[:255]

    lat  = _safe_float(data.get("latitude"))
    lng  = _safe_float(data.get("longitude"))

    now_dt = datetime.now()
    report_date = (data.get("report_date") or "").strip() or now_dt.strftime("%Y-%m-%d")     # expects "YYYY-MM-DD"
    report_time = (data.get("report_time") or "").strip() or now_dt.strftime("%H:%M")        # expects "HH:MM"

    raw_sev = (data.get("severity") or "").strip().title()
    severity = raw_sev if raw_sev in ALLOWED_SEVERITIES else "Moderate"
    road_condition = (data.get("road_condition") or "").strip() or "Normal"

    # ── Photo & Capture metadata (From in-app camera or file fallback) ─────────────
    photo_data  = data.get("photo_data") or ""
    captured_at = (data.get("captured_at") or "").strip() or now_dt.isoformat()
    capture_lat = _safe_float(data.get("capture_lat"))
    capture_lng = _safe_float(data.get("capture_lng"))

    # Automatically resolve coordinates if not explicitly provided
    if (lat is None or lng is None) and (capture_lat is not None and capture_lng is not None):
        lat = capture_lat
        lng = capture_lng
    if (lat is None or lng is None) and location:
        resolved = resolve_location_coordinates(location)
        if resolved:
            lat, lng = resolved[0], resolved[1]

    photo_path = None
    if photo_data and isinstance(photo_data, str) and photo_data.strip():
        saved_path, photo_err = _save_captured_photo(photo_data)
        if not photo_err and saved_path:
            photo_path = saved_path

    if not photo_path:
        photo_path = "uploads/default_incident.jpg"

    # ── Insert into database (Status is Verified immediately — no administrator bottleneck) ──────────────
    sql = """
        INSERT INTO crash_reports
            (user_id, reporter_name, location, latitude, longitude,
             report_date, report_time, crash_type, severity,
             road_condition, description, status,
             photo_path, captured_at, capture_lat, capture_lng)
        VALUES
            (%s, %s, %s, %s, %s,
             %s, %s, %s, %s,
             %s, %s, 'Verified',
             %s, %s, %s, %s)
    """
    params = (
        user_id, reporter_name, location, lat, lng,
        report_date, report_time, crash_type or None, severity or None,
        road_condition or None, description or None,
        photo_path, captured_at, capture_lat, capture_lng,
    )

    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(sql, params)
        conn.commit()
        new_id = cursor.lastrowid
        cursor.close()
        conn.close()
    except RuntimeError as e:
        app.logger.error("DB connection error: %s", e)
        return _error("Unable to connect to the server. Please try again later.", 503)
    except Error as e:
        app.logger.error("DB insert error: %s", e)
        return _error("We couldn't save your report. Please try again.", 500)

    return jsonify({
        "success": True,
        "message": "Crash report submitted successfully.",
        "report_id": new_id,
        "status": "Verified",
        "latitude": lat,
        "longitude": lng,
        "photo_path": photo_path,
        "captured_at": captured_at,
        "capture_lat": capture_lat,
        "capture_lng": capture_lng
    }), 201


# ===================================================================
# GET /api/user/my-reports  — View authenticated user's submitted reports
# ===================================================================

@app.route("/api/user/my-reports", methods=["GET"])
@app.route("/api/crash-reports/my-reports", methods=["GET"])
def get_user_reports():
    user = _get_authenticated_user()
    if not user:
        # Seamless fallback: return all recent crash reports if unauthenticated
        return get_crash_reports()

    sql = """
        SELECT report_id, user_id, reporter_name, location, latitude, longitude,
               report_date, report_time, crash_type, severity,
               road_condition, description, status, created_at,
               photo_path, captured_at, capture_lat, capture_lng
        FROM crash_reports
        WHERE user_id = %s
        ORDER BY created_at DESC
    """

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, (user["user_id"],))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
    except RuntimeError as e:
        app.logger.error("DB connection error: %s", e)
        return _error("Unable to connect to the server.", 503)
    except Error as e:
        app.logger.error("DB query error: %s", e)
        return _error("Failed to retrieve your reports.", 500)

    for row in rows:
        if row.get("report_date"):
            row["report_date"] = str(row["report_date"])
        if row.get("report_time"):
            td = row["report_time"]
            if hasattr(td, "total_seconds"):
                total_secs = int(td.total_seconds())
                hh = total_secs // 3600
                mm = (total_secs % 3600) // 60
                row["report_time"] = f"{hh:02d}:{mm:02d}"
            else:
                row["report_time"] = str(td)
        if row.get("created_at"):
            row["created_at"] = row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"])
        if row.get("latitude") is not None:
            row["latitude"] = float(row["latitude"])
        if row.get("longitude") is not None:
            row["longitude"] = float(row["longitude"])
        if row.get("capture_lat") is not None:
            row["capture_lat"] = float(row["capture_lat"])
        if row.get("capture_lng") is not None:
            row["capture_lng"] = float(row["capture_lng"])

    return jsonify({
        "success": True,
        "count": len(rows),
        "reports": rows,
    })


# ===================================================================
# PUT /api/user/my-reports/<id>  — Edit report (Ownership enforced)
# ===================================================================

@app.route("/api/user/my-reports/<int:report_id>", methods=["PUT"])
def update_user_report(report_id):
    user = _get_authenticated_user()
    if not user:
        return _error("Authentication required.", 401)

    data = request.get_json(silent=True)
    if not data:
        return _error("Request body must be valid JSON.")

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT report_id, user_id, status FROM crash_reports WHERE report_id = %s", (report_id,))
        report = cursor.fetchone()
        if not report:
            cursor.close()
            conn.close()
            return _error(f"Report ID {report_id} not found.", 404)

        # STRICT OWNERSHIP CHECK: User A cannot edit User B's report
        if str(report.get("user_id")) != str(user["user_id"]):
            cursor.close()
            conn.close()
            return _error("You do not have permission to modify this report.", 403)

        # Extract fields to update
        location = (data.get("location") or "").strip()
        if not location:
            cursor.close()
            conn.close()
            return _error("'location' is required.")

        lat = _safe_float(data.get("latitude"))
        lng = _safe_float(data.get("longitude"))
        report_date = data.get("report_date") or None
        report_time = data.get("report_time") or None
        crash_type = (data.get("crash_type") or "").strip()
        severity = (data.get("severity") or "").strip()
        road_condition = (data.get("road_condition") or "").strip()
        description = (data.get("description") or "").strip()

        update_sql = """
            UPDATE crash_reports
            SET location = %s, latitude = %s, longitude = %s,
                report_date = %s, report_time = %s, crash_type = %s,
                severity = %s, road_condition = %s, description = %s
            WHERE report_id = %s AND user_id = %s
        """
        cursor.execute(update_sql, (
            location, lat, lng, report_date, report_time, crash_type or None,
            severity or None, road_condition or None, description or None,
            report_id, user["user_id"]
        ))
        conn.commit()
        cursor.close()
        conn.close()
    except RuntimeError as e:
        app.logger.error("DB connection error in update: %s", e)
        return _error("Unable to connect to the database.", 503)
    except Error as e:
        app.logger.error("DB update error: %s", e)
        return _error("Failed to update report.", 500)

    return jsonify({
        "success": True,
        "message": f"Report CR-{str(report_id).zfill(4)} updated successfully.",
        "report_id": report_id
    })


# ===================================================================
# DELETE /api/user/my-reports/<id>  — Delete report (Ownership enforced)
# ===================================================================

@app.route("/api/user/my-reports/<int:report_id>", methods=["DELETE"])
def delete_user_report(report_id):
    user = _get_authenticated_user()
    if not user:
        return _error("Authentication required.", 401)

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT report_id, user_id FROM crash_reports WHERE report_id = %s", (report_id,))
        report = cursor.fetchone()
        if not report:
            cursor.close()
            conn.close()
            return _error(f"Report ID {report_id} not found.", 404)

        # STRICT OWNERSHIP CHECK: User A cannot delete User B's report
        if str(report.get("user_id")) != str(user["user_id"]):
            cursor.close()
            conn.close()
            return _error("You do not have permission to delete this report.", 403)

        cursor.execute("DELETE FROM crash_reports WHERE report_id = %s AND user_id = %s", (report_id, user["user_id"]))
        conn.commit()
        cursor.close()
        conn.close()
    except RuntimeError as e:
        app.logger.error("DB connection error in delete: %s", e)
        return _error("Unable to connect to the database.", 503)
    except Error as e:
        app.logger.error("DB delete error: %s", e)
        return _error("Failed to delete report.", 500)

    return jsonify({
        "success": True,
        "message": f"Report CR-{str(report_id).zfill(4)} deleted successfully.",
        "report_id": report_id
    })


# ===================================================================
# ===================================================================
# GET /api/crash-reports  — Retrieve reports for public map / dashboard
# ===================================================================

@app.route("/api/crash-reports", methods=["GET"])
@app.route("/api/crashes", methods=["GET"])
def get_crash_reports():
    raw_status = request.args.get("status", "all").strip()
    status_filter = raw_status.title() if raw_status else "All"

    if status_filter not in ALLOWED_STATUSES and status_filter.lower() != "all":
        return _error(f"Invalid status filter. Use one of: {', '.join(sorted(ALLOWED_STATUSES))}, or 'All'.")

    if status_filter.lower() == "all":
        sql = """
            SELECT report_id, user_id, reporter_name, location, latitude, longitude,
                   report_date, report_time, crash_type, severity,
                   road_condition, description, status, created_at,
                   photo_path, captured_at, capture_lat, capture_lng
            FROM crash_reports
            ORDER BY report_id DESC
        """
        params = []
    else:
        sql = """
            SELECT report_id, user_id, reporter_name, location, latitude, longitude,
                   report_date, report_time, crash_type, severity,
                   road_condition, description, status, created_at,
                   photo_path, captured_at, capture_lat, capture_lng
            FROM crash_reports
            WHERE status = %s
            ORDER BY report_id DESC
        """
        params = [status_filter]

    try:
        conn   = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params)
        rows   = cursor.fetchall()
        cursor.close()
        conn.close()
    except RuntimeError as e:
        app.logger.error("DB connection error: %s", e)
        return _error("Unable to connect to the server.", 503)
    except Error as e:
        app.logger.error("DB query error: %s", e)
        return _error("Failed to retrieve reports.", 500)

    # Serialise dates / times
    for row in rows:
        if row.get("report_date"):
            row["report_date"] = str(row["report_date"])
        if row.get("report_time"):
            td = row["report_time"]
            if hasattr(td, "total_seconds"):
                total_secs = int(td.total_seconds())
                hh = total_secs // 3600
                mm = (total_secs % 3600) // 60
                row["report_time"] = f"{hh:02d}:{mm:02d}"
            else:
                row["report_time"] = str(td)
        if row.get("created_at"):
            row["created_at"] = row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"])
        if row.get("latitude") is not None:
            row["latitude"] = float(row["latitude"])
        if row.get("longitude") is not None:
            row["longitude"] = float(row["longitude"])
        if row.get("capture_lat") is not None:
            row["capture_lat"] = float(row["capture_lat"])
        if row.get("capture_lng") is not None:
            row["capture_lng"] = float(row["capture_lng"])

    return jsonify({
        "success": True,
        "count": len(rows),
        "reports": rows,
    })


# ===================================================================
# GET /api/uploads/<path:filename>  — Serve captured incident photos
# ===================================================================

@app.route("/api/uploads/<path:filename>", methods=["GET"])
@app.route("/uploads/<path:filename>", methods=["GET"])
def serve_uploaded_photo(filename):
    """
    Safely serves captured accident photos with strict directory jail and path traversal defense.
    """
    clean_name = os.path.basename(filename)
    safe_name = secure_filename(clean_name)
    if not safe_name:
        return _error("Invalid photo filename requested.", 400)
    file_path = os.path.join(UPLOAD_FOLDER, safe_name)
    if not os.path.isfile(file_path):
        return _error("Requested incident photo was not found.", 404)
    return send_from_directory(UPLOAD_FOLDER, safe_name)


# ===================================================================
# GET /api/crash-reports/<int:report_id> — Retrieve single report by ID
# ===================================================================

@app.route("/api/crash-reports/<int:report_id>", methods=["GET"])
def get_crash_report_by_id(report_id):
    """
    Retrieves full details for a single crash report by ID.
    Excludes private reporter credentials.
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT report_id, user_id, reporter_name, location, latitude, longitude,
                   report_date, report_time, crash_type, severity,
                   road_condition, description, status, created_at,
                   photo_path, captured_at, capture_lat, capture_lng
            FROM crash_reports
            WHERE report_id = %s
        """, (report_id,))
        report = cursor.fetchone()
        cursor.close()
        conn.close()
    except Exception as e:
        app.logger.error("DB error fetching report %s: %s", report_id, e)
        return _error("Failed to retrieve incident report.", 500)

    if not report:
        return _error(f"Incident report CR-{str(report_id).zfill(4)} not found.", 404)

    is_verified = (report.get("status") or "").lower() == "verified"
    return jsonify({
        "success": True,
        "report": {
            "report_id": report["report_id"],
            "user_id": report["user_id"],
            "reporter_name": report.get("reporter_name") or "Community Driver",
            "location": report.get("location"),
            "latitude": float(report["latitude"]) if report.get("latitude") is not None else None,
            "longitude": float(report["longitude"]) if report.get("longitude") is not None else None,
            "report_date": str(report.get("report_date") or ""),
            "report_time": str(report.get("report_time") or ""),
            "crash_type": report.get("crash_type") or "Vehicle Incident",
            "severity": report.get("severity") or "Moderate",
            "road_condition": report.get("road_condition") or "Normal",
            "description": report.get("description") or "Incident reported along corridor.",
            "status": report.get("status") or "Pending",
            "is_verified": is_verified,
            "verification_badge": "Verified Official Incident" if is_verified else "Unverified Community Report (Pending Verification)",
            "photo_path": report.get("photo_path"),
            "has_photo": bool(report.get("photo_path")),
            "created_at": report["created_at"].isoformat() if hasattr(report["created_at"], "isoformat") else str(report.get("created_at") or "")
        }
    }), 200


# ===================================================================
# PATCH /api/crash-reports/<int:report_id>/status — Update workflow status
# ===================================================================

@app.route("/api/crash-reports/<int:report_id>/status", methods=["PATCH", "POST"])
def update_crash_report_status(report_id):
    """
    Updates the workflow status of a crash report (Pending, Verified, Rejected).
    Enforces ownership check if caller is an authenticated user.
    """
    data = request.get_json(silent=True) or {}
    new_status = (data.get("status") or "").strip().title()
    if new_status not in ALLOWED_STATUSES:
        return _error(f"Invalid status '{new_status}'. Allowed statuses are: {', '.join(sorted(ALLOWED_STATUSES))}.", 400)

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT report_id, user_id, status FROM crash_reports WHERE report_id = %s", (report_id,))
        existing = cursor.fetchone()
        if not existing:
            cursor.close()
            conn.close()
            return _error(f"Crash report CR-{str(report_id).zfill(4)} not found.", 404)

        user = _get_authenticated_user()

        # STRICT OWNERSHIP CHECK:
        # If the report is owned by a specific user, caller MUST be that exact authenticated user.
        if existing.get("user_id"):
            if not user or str(existing["user_id"]) != str(user["user_id"]):
                cursor.close()
                conn.close()
                return _error("You do not have permission to modify this report.", 403)

        old_status = existing.get("status")
        cursor.execute("UPDATE crash_reports SET status = %s WHERE report_id = %s", (new_status, report_id))
        conn.commit()
        cursor.close()
        conn.close()
    except RuntimeError as e:
        app.logger.error("DB connection error in update_status: %s", e)
        return _error("Unable to connect to the database.", 503)
    except Error as e:
        app.logger.error("DB error in update_status: %s", e)
        return _error("Failed to update report status.", 500)

    return jsonify({
        "success": True,
        "message": f"Report CR-{str(report_id).zfill(4)} status updated from '{old_status}' to '{new_status}'.",
        "report_id": report_id,
        "old_status": old_status,
        "status": new_status,
    }), 200


# ===================================================================
# GET /api/crash-statistics  — Database-driven Dashboard aggregation
# ===================================================================

@app.route("/api/crash-statistics", methods=["GET"])
@app.route("/api/dashboard/stats", methods=["GET"])
def get_crash_statistics():
    """
    Returns live aggregated metrics directly from the database crash_reports table.
    Scoping rules:
      - If authenticated and scope is not explicitly 'all': strictly scopes to user_id.
      - If scope='user' and unauthenticated: returns 401 Unauthorized.
      - If scope='all': returns city-wide public records.
    Provides breakdowns for:
      - Workflow statuses: total_submissions, verified, pending, rejected, with_photos
      - Severities: High, Moderate, Low (verified and all submissions)
      - Crash types: Vehicle Collision, Rear-end, Side Impact, Skid, etc.
      - Corridors/Locations
      - Road conditions: Dry, Wet, Poor Surface, etc.
      - Monthly timeline trends
      - Recent database records list (up to 20 records)
    """
    user = _get_authenticated_user()
    requested_scope = request.args.get("scope", "").strip().lower()

    where_clauses = []
    params = []

    if requested_scope == "user":
        if not user:
            return _error("Authentication required to view personal dashboard.", 401)
        scope = "user"
        where_clauses.append("user_id = %s")
        params.append(user["user_id"])
    elif requested_scope == "all":
        # Unauthenticated or explicit public overview
        scope = "all"
    else:
        # Default behavior: If logged in, automatically scope to personal records!
        if user:
            scope = "user"
            where_clauses.append("user_id = %s")
            params.append(user["user_id"])
        else:
            scope = "all"

    # Date range filtering (today, 7d, 30d, all)
    date_range = request.args.get("date_range", request.args.get("range", "all")).strip().lower()
    if date_range not in ("today", "7d", "30d", "all"):
        date_range = "all"

    today_str = date.today().strftime("%Y-%m-%d")
    if date_range == "today":
        where_clauses.append("COALESCE(report_date, DATE(created_at)) >= %s")
        params.append(today_str)
    elif date_range == "7d":
        cutoff_7d = (date.today() - timedelta(days=7)).strftime("%Y-%m-%d")
        where_clauses.append("COALESCE(report_date, DATE(created_at)) >= %s")
        params.append(cutoff_7d)
    elif date_range == "30d":
        cutoff_30d = (date.today() - timedelta(days=30)).strftime("%Y-%m-%d")
        where_clauses.append("COALESCE(report_date, DATE(created_at)) >= %s")
        params.append(cutoff_30d)

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # 1. Overall Summary Aggregation
        summary_query = f"""
            SELECT
                COUNT(*)                                                                      AS total_submissions,
                COALESCE(SUM(CASE WHEN status = 'Verified' THEN 1 ELSE 0 END), 0)             AS verified,
                COALESCE(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0)              AS pending,
                COALESCE(SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END), 0)             AS rejected,
                COALESCE(SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END), 0)             AS resolved,
                COALESCE(SUM(CASE WHEN LOWER(severity) IN ('high', 'critical', 'severe') THEN 1 ELSE 0 END), 0) AS high,
                COALESCE(SUM(CASE WHEN LOWER(severity) IN ('medium', 'moderate') THEN 1 ELSE 0 END), 0)         AS moderate,
                COALESCE(SUM(CASE WHEN LOWER(severity) IN ('low', 'minor') THEN 1 ELSE 0 END), 0)               AS low,
                COALESCE(SUM(CASE WHEN status = 'Verified' AND LOWER(severity) IN ('high', 'critical', 'severe') THEN 1 ELSE 0 END), 0)     AS verified_high,
                COALESCE(SUM(CASE WHEN status = 'Verified' AND LOWER(severity) IN ('medium', 'moderate') THEN 1 ELSE 0 END), 0) AS verified_moderate,
                COALESCE(SUM(CASE WHEN status = 'Verified' AND LOWER(severity) IN ('low', 'minor') THEN 1 ELSE 0 END), 0)      AS verified_low,
                COALESCE(SUM(CASE WHEN photo_path IS NOT NULL AND photo_path != '' THEN 1 ELSE 0 END), 0)   AS with_photos
            FROM crash_reports
            {where_sql}
        """
        cursor.execute(summary_query, list(params) if params else None)
        row = cursor.fetchone() or {}

        def _int(v):
            return int(v) if v is not None else 0

        summary = {
            "total":               _int(row.get("total_submissions")),
            "total_crashes":       _int(row.get("total_submissions")),
            "total_submissions":   _int(row.get("total_submissions")),
            "verified":            _int(row.get("verified")),
            "pending":             _int(row.get("pending")),
            "rejected":            _int(row.get("rejected")),
            "resolved":            _int(row.get("resolved")),
            "high":                _int(row.get("high")),
            "medium":              _int(row.get("moderate")),
            "moderate":            _int(row.get("moderate")),
            "low":                 _int(row.get("low")),
            "all_high":            _int(row.get("high")),
            "all_medium":          _int(row.get("moderate")),
            "all_low":             _int(row.get("low")),
            "verified_high":       _int(row.get("verified_high")),
            "verified_moderate":   _int(row.get("verified_moderate")),
            "verified_low":        _int(row.get("verified_low")),
            "with_photos":         _int(row.get("with_photos")),
        }

        # 2. Grouped by Severity
        sev_query = f"""
            SELECT COALESCE(NULLIF(severity, ''), 'Unknown') AS label, COUNT(*) AS count
            FROM crash_reports
            {where_sql}
            GROUP BY severity
            ORDER BY count DESC
        """
        cursor.execute(sev_query, list(params) if params else None)
        by_severity = cursor.fetchall() or []

        # 3. Grouped by Crash Type
        type_query = f"""
            SELECT COALESCE(NULLIF(crash_type, ''), 'Unspecified') AS label, COUNT(*) AS count
            FROM crash_reports
            {where_sql}
            GROUP BY crash_type
            ORDER BY count DESC
        """
        cursor.execute(type_query, list(params) if params else None)
        by_type = cursor.fetchall() or []

        # 4. Grouped by Location / Corridor
        loc_query = f"""
            SELECT COALESCE(NULLIF(location, ''), 'Other Corridor') AS label, COUNT(*) AS count
            FROM crash_reports
            {where_sql}
            GROUP BY location
            ORDER BY count DESC
        """
        cursor.execute(loc_query, list(params) if params else None)
        by_location = cursor.fetchall() or []

        # 5. Grouped by Road Condition
        cond_query = f"""
            SELECT COALESCE(NULLIF(road_condition, ''), 'Unknown') AS label, COUNT(*) AS count
            FROM crash_reports
            {where_sql}
            GROUP BY road_condition
            ORDER BY count DESC
        """
        cursor.execute(cond_query, list(params) if params else None)
        by_condition = cursor.fetchall() or []

        # 6. Grouped by Verification Status
        status_query = f"""
            SELECT COALESCE(NULLIF(status, ''), 'Pending') AS label, COUNT(*) AS count
            FROM crash_reports
            {where_sql}
            GROUP BY status
            ORDER BY count DESC
        """
        cursor.execute(status_query, list(params) if params else None)
        by_status = cursor.fetchall() or []

        # 7. Grouped by Timeline (Daily for short ranges, Monthly for All Time)
        date_format_len = 10 if date_range in ("today", "7d", "30d") else 7
        time_where_clauses = list(where_clauses)
        time_where_clauses.append("COALESCE(report_date, DATE(created_at)) IS NOT NULL")
        time_where_sql = "WHERE " + " AND ".join(time_where_clauses)
        time_query = f"""
            SELECT
                SUBSTR(COALESCE(report_date, DATE(created_at)), 1, {date_format_len}) AS label,
                COUNT(*) AS count
            FROM crash_reports
            {time_where_sql}
            GROUP BY label
            ORDER BY label ASC
        """
        cursor.execute(time_query, list(params) if params else None)
        by_timeline = cursor.fetchall() or []

        # 8. Recent Crash Reports (Up to 100 records for responsive table & filters)
        recent_query = f"""
            SELECT report_id, user_id, reporter_name, location, latitude, longitude,
                   report_date, report_time, crash_type, severity, road_condition,
                   description, status, photo_path, captured_at, created_at
            FROM crash_reports
            {where_sql}
            ORDER BY report_id DESC
            LIMIT 100
        """
        cursor.execute(recent_query, list(params) if params else None)
        recent_rows = cursor.fetchall() or []
        cursor.close()
        conn.close()
    except RuntimeError as e:
        app.logger.error("DB connection error in stats: %s", e)
        return _error("Unable to connect to the database server.", 503)
    except Error as e:
        app.logger.error("DB query error in stats: %s", e)
        return _error("Failed to retrieve dashboard statistics from database.", 500)

    # Protect reporter privacy for unauthenticated requests
    if not user:
        for r in recent_rows:
            r["reporter_name"] = "Anonymous Citizen"
            r["user_id"] = None

    # Format recent rows
    for r in recent_rows:
        if r.get("report_date"):
            r["report_date"] = str(r["report_date"])
        if r.get("report_time"):
            td = r["report_time"]
            if hasattr(td, "total_seconds"):
                total_secs = int(td.total_seconds())
                hh = total_secs // 3600
                mm = (total_secs % 3600) // 60
                r["report_time"] = f"{hh:02d}:{mm:02d}"
            else:
                r["report_time"] = str(td)
        if r.get("created_at"):
            r["created_at"] = r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"])
        if r.get("latitude") is not None:
            r["latitude"] = float(r["latitude"])
        if r.get("longitude") is not None:
            r["longitude"] = float(r["longitude"])

    return jsonify({
        "success": True,
        "scope": scope,
        "date_range": date_range,
        "statistics": summary,
        "by_severity": by_severity,
        "by_normalized_severity": [
            {"label": "High", "count": _int(row.get("high"))},
            {"label": "Medium", "count": _int(row.get("moderate"))},
            {"label": "Low", "count": _int(row.get("low"))},
        ],
        "by_type": by_type,
        "by_location": by_location,
        "by_condition": by_condition,
        "by_status": by_status,
        "by_timeline": by_timeline,
        "recent_reports": recent_rows,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    })


@app.route("/api/dashboard/trends", methods=["GET"])
def get_dashboard_trends():
    """
    Returns crash report counts grouped by date/month for the trend line chart.
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT
                SUBSTR(COALESCE(report_date, DATE(created_at)), 1, 10) AS date,
                COUNT(*) AS count,
                COALESCE(SUM(CASE WHEN LOWER(severity) IN ('high', 'critical', 'severe') THEN 1 ELSE 0 END), 0) AS high,
                COALESCE(SUM(CASE WHEN LOWER(severity) IN ('medium', 'moderate') THEN 1 ELSE 0 END), 0)         AS medium,
                COALESCE(SUM(CASE WHEN LOWER(severity) IN ('low', 'minor') THEN 1 ELSE 0 END), 0)               AS low
            FROM crash_reports
            WHERE COALESCE(report_date, DATE(created_at)) IS NOT NULL
            GROUP BY date
            ORDER BY date ASC
        """)
        rows = cursor.fetchall() or []
        cursor.close()
        conn.close()

        trends = [
            {
                "date": str(r["date"]),
                "count": int(r["count"]),
                "high": int(r["high"]),
                "medium": int(r["medium"]),
                "low": int(r["low"])
            }
            for r in rows
        ]

        return jsonify({
            "success": True,
            "trends": trends,
            "total_points": len(trends)
        }), 200
    except Exception as e:
        app.logger.error("Dashboard trends query error: %s", e)
        return jsonify({"success": False, "error": "Failed to fetch crash trends", "trends": []}), 500


def _get_tomtom_api_key():
    """
    Safely reads TOMTOM_API_KEY from backend/.env using absolute path.
    Reloads .env with override=True so changes take effect immediately without needing server restart.
    Never exposes, returns, or logs the key.
    """
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(backend_dir, ".env")
    if os.path.isfile(env_path):
        load_dotenv(dotenv_path=env_path, override=True)
    key = os.getenv("TOMTOM_API_KEY")
    if not key:
        return None
    key = key.strip()
    if not key or key in ("PASTE_YOUR_REAL_KEY_HERE", "your_tomtom_api_key_here", "PASTE_YOUR_KEY_HERE"):
        return None
    return key


def _get_google_maps_api_key():
    """
    Safely reads GOOGLE_MAPS_API_KEY from backend/.env using absolute path.
    Reloads .env with override=True so changes take effect immediately without needing server restart.
    Never logs the key.
    """
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(backend_dir, ".env")
    root_env_path = os.path.join(backend_dir, "..", ".env")
    if os.path.isfile(env_path):
        load_dotenv(dotenv_path=env_path, override=True)
    if os.path.isfile(root_env_path):
        load_dotenv(dotenv_path=root_env_path, override=True)
    key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not key:
        return None
    key = key.strip()
    if not key or key in ("PASTE_YOUR_GOOGLE_MAPS_API_KEY_HERE", "PASTE_YOUR_REAL_KEY_HERE", "your_key_here"):
        return None
    return key


# ===================================================================
# POST /api/traffic-flow — Retrieve real road traffic flow via TomTom
# ===================================================================

@app.route("/api/traffic-flow", methods=["POST"])
def get_traffic_flow():
    """
    Retrieves real traffic-flow information along route coordinates via TomTom Traffic API.
    Request Body:
      { "points": [ {"lat": 12.9716, "lon": 77.5946}, ... ] }
    Response:
      Returns congestion level, currentSpeed, freeFlowSpeed, and color thresholds.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data.get("points"), list):
        return _error("Invalid request body. 'points' array of {lat, lon} objects required.", 400)

    raw_points = data.get("points", [])
    if not raw_points:
        return _error("At least one coordinate point must be provided.", 400)

    # Sanitize and limit to 10 representative points to conserve API quota and ensure speed
    valid_points = []
    for pt in raw_points[:10]:
        if not isinstance(pt, dict):
            continue
        lat = _safe_float(pt.get("lat"))
        lon = _safe_float(pt.get("lon"))
        if lat is not None and lon is not None and -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0:
            valid_points.append({"lat": round(lat, 5), "lon": round(lon, 5)})

    if not valid_points:
        return _error("No valid geographic coordinates found in 'points'.", 400)

    tomtom_api_key = _get_tomtom_api_key()
    now_str = time.strftime("%I:%M:%S %p")

    # If API key is not configured or empty, report clear configuration error
    if not tomtom_api_key:
        return jsonify({
            "success": False,
            "source": "LIVE TRAFFIC UNAVAILABLE",
            "status": "key_missing",
            "message": "Live traffic unavailable: TomTom API key not configured in backend/.env.",
            "last_updated": now_str,
            "segments": []
        }), 200

    segments = []
    total_current_speed = 0.0
    total_free_flow_speed = 0.0
    current_time = time.time()

    for pt in valid_points:
        cache_key = f"{pt['lat']}_{pt['lon']}"
        cached = _traffic_cache.get(cache_key)
        if cached and (current_time - cached["cached_at"]) < _CACHE_TTL_SECONDS:
            seg = cached["data"]
            segments.append(seg)
            total_current_speed += seg["current_speed"]
            total_free_flow_speed += seg["free_flow_speed"]
            continue

        url = (
            f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
            f"?point={pt['lat']},{pt['lon']}&unit=KMPH&key={tomtom_api_key}"
        )

        try:
            resp = requests.get(url, timeout=6.0)
            if resp.status_code == 200:
                try:
                    flow_json = resp.json()
                except Exception:
                    flow_json = {}

                flow = flow_json.get("flowSegmentData", {}) if isinstance(flow_json, dict) else {}
                current_speed = _safe_float(flow.get("currentSpeed"))
                free_flow_speed = _safe_float(flow.get("freeFlowSpeed"))

                if current_speed is not None and free_flow_speed is not None:
                    free_flow_speed = max(1.0, free_flow_speed)
                    road_closure = bool(flow.get("roadClosure", False))
                    confidence = _safe_float(flow.get("confidence")) or 1.0

                    # Thresholds:
                    # ratio >= 0.75  -> Light Traffic (Green #10b981)
                    # 0.45 <= ratio < 0.75 -> Moderate Traffic (Yellow #f59e0b)
                    # ratio < 0.45 or roadClosure -> Heavy Traffic (Red #ef4444)
                    speed_ratio = round(current_speed / free_flow_speed, 2)
                    if road_closure or speed_ratio < 0.45:
                        congestion = "Heavy"
                        color = "#ef4444"
                    elif speed_ratio < 0.75:
                        congestion = "Moderate"
                        color = "#f59e0b"
                    else:
                        congestion = "Light"
                        color = "#10b981"

                    seg_data = {
                        "point": pt,
                        "current_speed": round(current_speed, 1),
                        "free_flow_speed": round(free_flow_speed, 1),
                        "speed_ratio": speed_ratio,
                        "congestion_level": congestion,
                        "color": color,
                        "road_closure": road_closure,
                        "confidence": confidence
                    }
                    _traffic_cache[cache_key] = {"data": seg_data, "cached_at": current_time}
                    segments.append(seg_data)
                    total_current_speed += current_speed
                    total_free_flow_speed += free_flow_speed

            elif resp.status_code in (401, 403):
                app.logger.warning("TomTom API returned authentication failure (HTTP %s).", resp.status_code)
                return jsonify({
                    "success": False,
                    "source": "LIVE TRAFFIC UNAVAILABLE",
                    "status": "auth_error",
                    "message": "Live traffic unavailable: Invalid TomTom API key in backend/.env.",
                    "last_updated": now_str,
                    "segments": []
                }), 200

            elif resp.status_code == 429:
                app.logger.warning("TomTom API rate limit reached (HTTP 429).")
                return jsonify({
                    "success": False,
                    "source": "LIVE TRAFFIC UNAVAILABLE",
                    "status": "rate_limited",
                    "message": "Live traffic unavailable: TomTom API rate limit reached.",
                    "last_updated": now_str,
                    "segments": []
                }), 200

            else:
                app.logger.warning("TomTom API returned HTTP %s for point %s", resp.status_code, pt)

        except Exception as e:
            app.logger.error("TomTom API connection error: %s", type(e).__name__)

    if not segments:
        return jsonify({
            "success": False,
            "source": "LIVE TRAFFIC UNAVAILABLE",
            "status": "upstream_error",
            "message": "Live traffic unavailable: Could not contact traffic service.",
            "last_updated": now_str,
            "segments": []
        }), 200

    count = len(segments)
    avg_current = round(total_current_speed / count, 1)
    avg_free_flow = round(total_free_flow_speed / count, 1)
    overall_ratio = round(avg_current / max(1.0, avg_free_flow), 2)

    if overall_ratio < 0.45:
        overall_condition = "Heavy"
        overall_color = "#ef4444"
    elif overall_ratio < 0.75:
        overall_condition = "Moderate"
        overall_color = "#f59e0b"
    else:
        overall_condition = "Light"
        overall_color = "#10b981"

    return jsonify({
        "success": True,
        "source": "TomTom Live Traffic Flow API",
        "overall_color": overall_color,
        "status": "live",
        "last_updated": now_str,
        "timestamp": time.time(),
        "overall_condition": overall_condition,
        "average_current_speed": avg_current,
        "average_free_flow_speed": avg_free_flow,
        "overall_speed_ratio": overall_ratio,
        "thresholds": {
            "light": "currentSpeed >= 75% freeFlowSpeed (ratio >= 0.75)",
            "moderate": "45% <= currentSpeed < 75% freeFlowSpeed (0.45 <= ratio < 0.75)",
            "heavy": "currentSpeed < 45% freeFlowSpeed (ratio < 0.45) or road closure"
        },
        "segments": segments
    })


# ===================================================================
# Smart Incident Detection & Driver Routing Endpoints
# ===================================================================

@app.route("/api/incidents/active", methods=["GET"])
@app.route("/api/incidents/area", methods=["GET"])
def get_active_incident_feed():
    """
    Returns active crash reports for driver routing alerts.
    Filters out 'Rejected' and 'Resolved' reports.
    Optionally filters by geographic coordinates (lat, lon, radius_km).
    De-duplicates multiple submissions for the same event.
    """
    raw_age = request.args.get("max_age_hours", "48")
    try:
        max_age = int(raw_age)
    except ValueError:
        max_age = 48

    c_lat = _safe_float(request.args.get("lat"))
    c_lon = _safe_float(request.args.get("lon") or request.args.get("lng"))
    c_rad = _safe_float(request.args.get("radius_km")) or 5.0

    incidents = get_active_incidents(
        get_connection,
        max_age_hours=max_age,
        center_lat=c_lat,
        center_lon=c_lon,
        radius_km=c_rad if (c_lat is not None and c_lon is not None) else None
    )
    return jsonify({
        "success": True,
        "count": len(incidents),
        "incidents": incidents
    }), 200


@app.route("/api/routing/detect-incidents", methods=["POST"])
def detect_route_incidents():
    """
    Analyzes driver route geometry against active incidents.
    Identifies incidents within impact proximity, checks traffic telemetry,
    determines if incident is AHEAD vs BEHIND driver,
    and returns alternative detour recommendations if beneficial.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data.get("route_geometry"), list):
        return _error("Invalid request body. 'route_geometry' array of [lat, lon] pairs required.", 400)

    route_geometry = data.get("route_geometry", [])
    start_coords = data.get("start") or {}
    dest_coords = data.get("destination") or {}
    driver_loc = data.get("current_location") or data.get("driver_location") or None

    raw_age = data.get("max_age_hours", 48)
    try:
        max_age_hours = int(raw_age)
    except (ValueError, TypeError):
        max_age_hours = 48

    def _traffic_checker(points):
        api_key = _get_tomtom_api_key()
        if not api_key:
            return {"success": False, "status": "key_missing"}
        try:
            pt = points[0]
            url = (
                f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
                f"?point={pt['lat']},{pt['lon']}&unit=KMPH&key={api_key}"
            )
            resp = requests.get(url, timeout=4.0)
            if resp.status_code == 200:
                flow = resp.json().get("flowSegmentData", {})
                cs = _safe_float(flow.get("currentSpeed")) or 0.0
                ff = _safe_float(flow.get("freeFlowSpeed")) or 1.0
                return {
                    "success": True,
                    "segments": [{
                        "current_speed": cs,
                        "free_flow_speed": ff,
                        "road_closure": bool(flow.get("roadClosure", False))
                    }]
                }
        except Exception:
            pass
        return {"success": False, "status": "error"}

    result = analyze_route_for_incidents(
        route_latlngs=route_geometry,
        start_coords=start_coords,
        dest_coords=dest_coords,
        get_connection_fn=get_connection,
        traffic_provider_fn=_traffic_checker,
        max_age_hours=max_age_hours,
        driver_location=driver_loc
    )
    return jsonify(result), 200


# ===================================================================
# Historical Traffic Dataset Endpoints (Banglore_traffic_Dataset.csv)
# ===================================================================

@app.route("/api/historical-traffic/summary", methods=["GET"])
def historical_traffic_summary():
    """
    Returns metadata, columns, row count, and overall statistics
    from the local data/Banglore_traffic_Dataset.csv.
    """
    success, corridors, summary = historical_traffic.load_dataset()
    if not success:
        return jsonify({
            "success": False,
            "source": "Banglore_traffic_Dataset.csv",
            "error": summary.get("error", "Failed to load historical traffic dataset"),
            "details": summary
        }), 500

    return jsonify({
        "success": True,
        "source": "Banglore_traffic_Dataset.csv (Historical Dataset)",
        "summary": summary
    })


@app.route("/api/historical-traffic/corridors", methods=["GET"])
def historical_traffic_corridors():
    """
    Returns aggregated congestion, speeds, volume, and verified
    road geometries for all 16 monitored corridors in Bengaluru.
    """
    success, corridors, summary = historical_traffic.load_dataset()
    if not success:
        return jsonify({
            "success": False,
            "source": "Banglore_traffic_Dataset.csv",
            "error": summary.get("error", "Failed to load historical traffic dataset"),
            "details": summary,
            "corridors": []
        }), 500

    return jsonify({
        "success": True,
        "source": "Banglore_traffic_Dataset.csv (Historical Dataset)",
        "type": "historical_telemetry",
        "thresholds": {
            "low": "< 60.0% Congestion Level (Green #10b981)",
            "moderate": "60.0% <= Congestion Level < 80.0% (Yellow #f59e0b)",
            "high": ">= 80.0% Congestion Level (Red #ef4444)"
        },
        "corridor_count": len(corridors),
        "corridors": corridors
    })


@app.route("/api/historical-traffic/match-route", methods=["POST"])
def historical_traffic_match_route():
    """
    Given an array of route coordinate points [[lat, lng], ...],
    matches segments to the nearest dataset corridor (within 1.2km)
    or cleanly flags unmatched segments with an explicit note.
    """
    data = request.get_json(silent=True) or {}
    points = data.get("points", [])
    if not isinstance(points, list) or len(points) == 0:
        return jsonify({"error": "A list of [lat, lng] points is required."}), 400

    success, corridors, _ = historical_traffic.load_dataset()
    if not success:
        return jsonify({
            "success": False,
            "source": "Banglore_traffic_Dataset.csv",
            "error": "Dataset unavailable"
        }), 500

    matched_segments = []
    for i, pt in enumerate(points):
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            lat, lng = _safe_float(pt[0]), _safe_float(pt[1])
        elif isinstance(pt, dict):
            lat = _safe_float(pt.get("lat"))
            lng = _safe_float(pt.get("lng") if pt.get("lng") is not None else pt.get("lon"))
        else:
            continue
        if lat is None or lng is None:
            continue

        matched_corridor, dist = historical_traffic.match_point_to_corridors(lat, lng, max_distance_km=1.2)

        if matched_corridor:
            matched_segments.append({
                "point_index": i,
                "lat": lat,
                "lng": lng,
                "unmatched": False,
                "corridor_id": matched_corridor["id"],
                "corridor_name": matched_corridor["display_name"],
                "area_name": matched_corridor["area_name"],
                "road_name": matched_corridor["road_name"],
                "congestion_level_pct": matched_corridor["congestion_level_pct"],
                "congestion_category": matched_corridor["congestion_category"],
                "color": matched_corridor["color"],
                "average_speed_kmh": matched_corridor["average_speed_kmh"],
                "traffic_volume": matched_corridor["traffic_volume"],
                "data_source": "Banglore_traffic_Dataset.csv (Historical Dataset)"
            })
        else:
            matched_segments.append({
                "point_index": i,
                "lat": lat,
                "lng": lng,
                "unmatched": True,
                "corridor_name": "Unmatched Road Segment",
                "color": "#64748b",
                "message": "No historical dataset record for this road segment; only documented for the 16 monitored corridors in Banglore_traffic_Dataset.csv."
            })

    return jsonify({
        "success": True,
        "source": "Banglore_traffic_Dataset.csv (Historical Route Matching)",
        "point_count": len(matched_segments),
        "segments": matched_segments
    })


# ===================================================================
# Maps Configuration & Engine Status
# ===================================================================

@app.route("/api/config/maps", methods=["GET"])
def get_maps_config():
    """
    Returns client configuration for Google Maps Platform.
    Exposes only engine readiness and script URL; NEVER exposes raw api_key string.
    """
    key = _get_google_maps_api_key()
    has_key = bool(key)
    return jsonify({
        "success": True,
        "google_maps_configured": has_key,
        "script_url": "/api/maps/sdk.js" if has_key else None,
        "default_engine": "leaflet",
        "supported_engines": ["leaflet", "google"],
        "advisory": "Google Maps Platform Demo Key integration. Requires Maps JavaScript API and Directions API enabled in Google Cloud Console."
    })


@app.route("/api/maps/sdk.js", methods=["GET"])
def get_maps_sdk():
    """
    Protected loader endpoint for Google Maps JavaScript API.
    Injects the server-held key directly into the Google Maps SDK redirect.
    Does NOT expose the key in JSON endpoints.
    """
    key = _get_google_maps_api_key()
    if not key:
        return "/* Google Maps API key is not configured in backend/.env */", 200, {"Content-Type": "application/javascript"}

    callback = request.args.get("callback", "onGoogleMapsApiLoaded")
    libraries = request.args.get("libraries", "places,geometry")
    v = request.args.get("v", "weekly")

    # Securely redirect to Google Maps Platform with the server-held key
    google_url = f"https://maps.googleapis.com/maps/api/js?key={key}&libraries={libraries}&v={v}&callback={callback}"
    return redirect(google_url, code=302)


@app.route("/api/maps/status", methods=["GET"])
def get_maps_status():
    """
    Returns diagnostic health status of mapping, routing, and traffic engines.
    """
    g_key = _get_google_maps_api_key()
    tt_key = _get_tomtom_api_key()
    return jsonify({
        "success": True,
        "engines": {
            "leaflet": {
                "name": "Leaflet.js + CartoDB",
                "status": "active",
                "cost": "100% Free / Open Source",
                "capabilities": ["interactive_map", "custom_markers", "polylines", "geo_tracking"]
            },
            "osrm": {
                "name": "OSRM (Open Source Routing Machine)",
                "status": "active",
                "cost": "100% Free / Open Source",
                "capabilities": ["road_routing", "turn_by_turn_directions", "accurate_road_geometry"]
            },
            "google_maps": {
                "name": "Google Maps Platform",
                "status": "configured" if g_key else "not_configured",
                "demo_key_advisory": "Requires Maps JavaScript API and Directions API enabled in Google Cloud Console. If restricted, system automatically uses Leaflet + OSRM fallback."
            },
            "tomtom_live_traffic": {
                "name": "TomTom Traffic Flow API",
                "status": "active" if tt_key else "not_configured",
                "badge": "LIVE TRAFFIC"
            },
            "historical_traffic": {
                "name": "Banglore_traffic_Dataset_Cleaned.csv",
                "status": "active",
                "corridors_count": 16,
                "badge": "HISTORICAL DATASET"
            }
        }
    })


# ===================================================================

# ===================================================================
# Forward Geocoding & Location Autocomplete Search
# ===================================================================

_forward_geo_cache = {}
_FWD_GEO_TTL = 600  # 10 minutes cache

@app.route("/api/geocode/search", methods=["GET"])
def api_search_geocode():
    """
    Forward geocodes location query string using Nominatim with Bengaluru/Karnataka bias.
    Caches queries, extracts structured name & locality details, and falls back to
    curated landmarks if Nominatim is unreachable or rate-limited.
    Never returns fake coordinates or Central Bengaluru for arbitrary queries.
    """
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"success": True, "query": "", "count": 0, "results": []}), 200

    try:
        limit = min(max(int(request.args.get("limit", 5)), 1), 10)
    except (ValueError, TypeError):
        limit = 5

    cache_key = f"{query.lower()}:{limit}"
    now = time.time()

    if cache_key in _forward_geo_cache:
        cached_time, cached_payload = _forward_geo_cache[cache_key]
        if now - cached_time < _FWD_GEO_TTL:
            return jsonify(cached_payload), 200

    results = []

    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": query,
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": limit,
            "countrycodes": "in",
            # Viewbox centered on Bengaluru Urban & Metropolitan region (left,top,right,bottom)
            "viewbox": "77.2,13.4,78.1,12.6",
            "bounded": 0,  # 0 biases towards Bengaluru without excluding other regions
        }
        headers = {
            "User-Agent": "SmartTrafficBengaluru/1.0 (Traffic Management System; contact@smarttraffic.org)",
            "Accept-Language": "en",
        }
        resp = requests.get(url, params=params, headers=headers, timeout=4.5)
        if resp.status_code == 200:
            raw_items = resp.json()
            for item in raw_items:
                try:
                    lat = float(item.get("lat"))
                    lon = float(item.get("lon"))
                except (ValueError, TypeError):
                    continue

                d_name = item.get("display_name", "")
                addr = item.get("address", {})

                # Extract primary name
                primary_name = item.get("name") or (d_name.split(",")[0].strip() if d_name else query)

                # Extract secondary context (suburb, taluk/district, city, state)
                suburb = (
                    addr.get("suburb")
                    or addr.get("neighbourhood")
                    or addr.get("residential")
                    or addr.get("quarter")
                    or addr.get("village")
                    or addr.get("city_district")
                )
                district = addr.get("state_district") or addr.get("county") or ""
                city = addr.get("city") or addr.get("town") or addr.get("municipality") or "Bengaluru"
                state = addr.get("state") or "Karnataka"

                sec_parts = []
                if suburb and suburb.lower() != primary_name.lower():
                    sec_parts.append(suburb)
                if district and district.lower() not in [p.lower() for p in sec_parts]:
                    sec_parts.append(district)
                if city and city.lower() not in [p.lower() for p in sec_parts]:
                    sec_parts.append(city)
                if state and state.lower() not in [p.lower() for p in sec_parts]:
                    sec_parts.append(state)

                secondary_text = ", ".join(sec_parts) if sec_parts else "Bengaluru, Karnataka"

                results.append({
                    "place_id": str(item.get("place_id")),
                    "name": primary_name,
                    "display_name": d_name or f"{primary_name}, {secondary_text}",
                    "secondary": secondary_text,
                    "lat": lat,
                    "lon": lon,
                    "type": item.get("type", "place"),
                })
    except Exception as exc:
        app.logger.warning("Forward geocoding lookup exception: %s", exc)

    # If Nominatim returned no results (or failed/rate-limited), match against curated local landmarks
    if not results:
        curated_matches = []
        q_lower = query.lower()
        for loc_name, coords in incident_routing.KNOWN_BENGALURU_LOCATIONS.items():
            if q_lower in loc_name or loc_name in q_lower:
                title = loc_name.title()
                curated_matches.append({
                    "place_id": f"curated_{abs(hash(loc_name))}",
                    "name": title,
                    "display_name": f"{title}, Bengaluru, Karnataka",
                    "secondary": "Bengaluru, Karnataka",
                    "lat": coords[0],
                    "lon": coords[1],
                    "type": "landmark",
                })
        results.extend(curated_matches[:limit])

    payload = {
        "success": True,
        "query": query,
        "count": len(results),
        "results": results,
    }

    _forward_geo_cache[cache_key] = (now, payload)
    return jsonify(payload), 200


# ===================================================================
# Reverse Geocoding & GPS Location Resolution
# ===================================================================

_reverse_geo_cache = {}
_REV_GEO_TTL = 300  # 5 minutes cache

@app.route("/api/geocode/reverse", methods=["GET"])
def api_reverse_geocode():
    """
    Reverse geocodes device (latitude, longitude) coordinates to a clean,
    human-readable address or neighborhood name via Nominatim.
    Falls back gracefully to formatted coordinate string on timeout/error.
    Never hardcodes or substitutes a fake default location.
    """
    lat_str = request.args.get("lat")
    lon_str = request.args.get("lon")

    if not lat_str or not lon_str:
        return jsonify({"error": "Query parameters 'lat' and 'lon' are required."}), 400

    try:
        lat = float(lat_str)
        lon = float(lon_str)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid numerical coordinates provided."}), 400

    cache_key = f"{round(lat, 4)},{round(lon, 4)}"
    now = time.time()
    if cache_key in _reverse_geo_cache:
        cached_time, cached_payload = _reverse_geo_cache[cache_key]
        if now - cached_time < _REV_GEO_TTL:
            return jsonify(cached_payload), 200

    clean_address = None
    display_name = None
    details = {}

    try:
        url = (
            f"https://nominatim.openstreetmap.org/reverse"
            f"?format=jsonv2&lat={lat}&lon={lon}&addressdetails=1"
        )
        headers = {
            "User-Agent": "SmartTrafficBengaluru/1.0 (Traffic Management System; contact@smarttraffic.org)",
            "Accept-Language": "en",
        }
        resp = requests.get(url, headers=headers, timeout=4.0)
        if resp.status_code == 200:
            raw_json = resp.json()
            display_name = raw_json.get("display_name", "")
            details = raw_json.get("address", {})

            suburb = (
                details.get("suburb")
                or details.get("neighbourhood")
                or details.get("residential")
                or details.get("quarter")
                or details.get("city_district")
            )
            road = details.get("road") or details.get("pedestrian") or details.get("highway")
            city = (
                details.get("city")
                or details.get("town")
                or details.get("municipality")
                or details.get("county")
                or "Bengaluru"
            )

            parts = []
            if road and suburb and road.lower() != suburb.lower():
                parts.append(road)
                parts.append(suburb)
            elif suburb:
                parts.append(suburb)
            elif road:
                parts.append(road)

            if city and (not parts or city.lower() not in [p.lower() for p in parts]):
                parts.append(city)

            if parts:
                clean_address = ", ".join(parts)
            elif display_name:
                d_parts = [p.strip() for p in display_name.split(",") if p.strip()]
                clean_address = ", ".join(d_parts[:2])
    except Exception as exc:
        print(f"Nominatim reverse geocode lookup failed: {exc}")

    if not clean_address:
        clean_address = f"Current Location ({lat:.4f}, {lon:.4f})"

    payload = {
        "lat": lat,
        "lon": lon,
        "address": clean_address,
        "display_name": display_name or clean_address,
        "details": details,
        "is_fallback": display_name is None,
    }

    _reverse_geo_cache[cache_key] = (now, payload)
    return jsonify(payload), 200


# ===================================================================
# LIVE DATABASE VIEWER & EXPLORER (ADMINISTRATOR ACCESS)
# ===================================================================

ADMIN_KEY = os.getenv("ADMIN_KEY", "smart_traffic_admin_2026")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@smarttraffic.org")


def _is_request_authorized_admin():
    """
    Validates administrator access via:
    1. 'X-Admin-Key' header matching ADMIN_KEY
    2. 'admin_key' query parameter matching ADMIN_KEY (for export/shareable URLs)
    3. 'Authorization: Bearer <token>' where token matches ADMIN_KEY or belongs to an admin account
    """
    # 1. Check X-Admin-Key header
    admin_header = request.headers.get("X-Admin-Key", "").strip()
    if admin_header and secrets.compare_digest(admin_header, ADMIN_KEY):
        return True, "header_key"

    # 2. Check query parameter
    query_key = request.args.get("admin_key", "").strip()
    if query_key and secrets.compare_digest(query_key, ADMIN_KEY):
        return True, "query_key"

    # 3. Check Authorization header
    auth_header = request.headers.get("Authorization", "").strip()
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token and secrets.compare_digest(token, ADMIN_KEY):
            return True, "bearer_key"

        # Check if user session belongs to admin email
        user = _get_authenticated_user()
        if user and user.get("email", "").lower() == ADMIN_EMAIL.lower():
            return True, f"admin_user:{user['email']}"

    return False, None


def _serialize_crash_report_row(row):
    """Formats raw database row to clean, JSON-serializable dictionary."""
    r = dict(row)
    if r.get("report_date"):
        r["report_date"] = str(r["report_date"])
    if r.get("report_time"):
        td = r["report_time"]
        if hasattr(td, "total_seconds"):
            total_sec = int(td.total_seconds())
            hours = total_sec // 3600
            minutes = (total_sec % 3600) // 60
            seconds = total_sec % 60
            r["report_time"] = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        else:
            r["report_time"] = str(td)
    if r.get("created_at"):
        r["created_at"] = str(r["created_at"])
    return r


@app.route("/api/admin/auth/verify", methods=["POST"])
def admin_auth_verify():
    """Verify administrator credentials."""
    data = request.get_json(silent=True) or {}
    key = data.get("admin_key", "").strip()

    is_auth, _ = _is_request_authorized_admin()
    if is_auth:
        return jsonify({
            "success": True,
            "authorized": True,
            "message": "Administrator session verified."
        }), 200

    if key and secrets.compare_digest(key, ADMIN_KEY):
        return jsonify({
            "success": True,
            "authorized": True,
            "message": "Administrator access granted.",
            "admin_key": key
        }), 200

    return jsonify({
        "success": False,
        "authorized": False,
        "error": "Invalid administrator key."
    }), 401


@app.route("/api/admin/database/overview", methods=["GET"])
def admin_database_overview():
    """
    Returns connection engine, status, metrics, and schema information
    for approved application tables (users and crash_reports).
    Never exposes passwords, connection strings, or password hashes.
    """
    is_auth, _ = _is_request_authorized_admin()
    if not is_auth:
        return jsonify({"success": False, "error": "Unauthorized: Administrator access required."}), 401

    try:
        conn = get_connection()
        is_mysql = not hasattr(conn, "_conn")
        engine_name = "MySQL 8.0" if is_mysql else "SQLite 3.x"
        if is_mysql:
            try:
                server_ver = getattr(conn, "server_info", None) or (conn.get_server_info() if hasattr(conn, "get_server_info") else "8.0")
                engine_name = f"MySQL {server_ver}"
            except Exception:
                pass

        host_name = os.getenv("DB_HOST", "localhost") if is_mysql else "localhost (local file)"
        db_name = os.getenv("DB_NAME", "smart_traffic") if is_mysql else "smart_traffic.db"
        charset_name = "utf8mb4" if is_mysql else "UTF-8"

        cursor = conn.cursor(dictionary=True)

        # Metrics
        cursor.execute("SELECT COUNT(*) AS total FROM crash_reports")
        total_reports = cursor.fetchone().get("total", 0)

        cursor.execute("SELECT COUNT(*) AS total FROM crash_reports WHERE status = 'Verified'")
        verified_reports = cursor.fetchone().get("total", 0)

        cursor.execute("SELECT COUNT(*) AS total FROM crash_reports WHERE status = 'Pending'")
        pending_reports = cursor.fetchone().get("total", 0)

        cursor.execute("SELECT COUNT(*) AS total FROM crash_reports WHERE status = 'Resolved'")
        resolved_reports = cursor.fetchone().get("total", 0)

        cursor.execute("SELECT COUNT(*) AS total FROM crash_reports WHERE photo_path IS NOT NULL AND photo_path != ''")
        photo_reports = cursor.fetchone().get("total", 0)

        cursor.execute("SELECT COUNT(*) AS total FROM users")
        total_users = cursor.fetchone().get("total", 0)

        # Tables schema
        tables = []

        # crash_reports schema
        if is_mysql:
            cursor.execute("""
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crash_reports'
                ORDER BY ORDINAL_POSITION
            """)
            cr_cols = cursor.fetchall()
            cr_columns = [
                {
                    "name": col["COLUMN_NAME"],
                    "type": col["DATA_TYPE"],
                    "nullable": col["IS_NULLABLE"] == "YES",
                    "key": col["COLUMN_KEY"],
                    "default": col["COLUMN_DEFAULT"]
                }
                for col in cr_cols
            ]
        else:
            cursor.execute("PRAGMA table_info(crash_reports)")
            cr_cols = cursor.fetchall()
            cr_columns = [
                {
                    "name": col.get("name"),
                    "type": col.get("type"),
                    "nullable": not col.get("notnull"),
                    "key": "PRI" if col.get("pk") else "",
                    "default": col.get("dflt_value")
                }
                for col in cr_cols
            ]

        tables.append({
            "name": "crash_reports",
            "row_count": total_reports,
            "description": "Live traffic incident and accident reports submitted by users and monitored corridors",
            "columns": cr_columns
        })

        # users schema (security sanitized: NEVER expose password_hash)
        if is_mysql:
            cursor.execute("""
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
                ORDER BY ORDINAL_POSITION
            """)
            u_cols = cursor.fetchall()
            u_columns = [
                {
                    "name": col["COLUMN_NAME"],
                    "type": col["DATA_TYPE"],
                    "nullable": col["IS_NULLABLE"] == "YES",
                    "key": col["COLUMN_KEY"],
                    "default": col["COLUMN_DEFAULT"]
                }
                for col in u_cols
                if col["COLUMN_NAME"] != "password_hash"
            ]
        else:
            cursor.execute("PRAGMA table_info(users)")
            u_cols = cursor.fetchall()
            u_columns = [
                {
                    "name": col.get("name"),
                    "type": col.get("type"),
                    "nullable": not col.get("notnull"),
                    "key": "PRI" if col.get("pk") else "",
                    "default": col.get("dflt_value")
                }
                for col in u_cols
                if col.get("name") != "password_hash"
            ]

        tables.append({
            "name": "users",
            "row_count": total_users,
            "description": "Registered citizen accounts (security sanitized, credentials excluded)",
            "columns": u_columns
        })

        cursor.close()
        conn.close()

        return jsonify({
            "success": True,
            "connection": {
                "status": "connected",
                "engine": engine_name,
                "host": host_name,
                "database": db_name,
                "charset": charset_name,
            },
            "metrics": {
                "total_reports": total_reports,
                "verified_reports": verified_reports,
                "pending_reports": pending_reports,
                "resolved_reports": resolved_reports,
                "photo_reports": photo_reports,
                "total_users": total_users
            },
            "tables": tables,
            "refreshed_at": datetime.now().isoformat()
        }), 200

    except Exception as e:
        app.logger.error("Admin DB overview error: %s", e)
        return jsonify({
            "success": False,
            "error": "Failed to inspect database overview",
            "connection": {
                "status": "error",
                "engine": "Unknown",
                "host": os.getenv("DB_HOST", "localhost"),
                "database": os.getenv("DB_NAME", "smart_traffic")
            }
        }), 500


@app.route("/api/admin/database/records", methods=["GET"])
def admin_database_records():
    """
    Returns live crash report records with search, filtering,
    sorting and pagination.
    """
    is_auth, _ = _is_request_authorized_admin()
    if not is_auth:
        return jsonify({"success": False, "error": "Unauthorized: Administrator access required."}), 401

    try:
        # Query params
        q = request.args.get("q", "").strip()
        severity = request.args.get("severity", "").strip()
        status = request.args.get("status", "").strip()
        date_range = request.args.get("date_range", "all").strip().lower()

        # Whitelist sorting
        ALLOWED_SORT = {"report_id", "location", "report_date", "severity", "status", "crash_type", "created_at"}
        sort_by = request.args.get("sort_by", "created_at").lower()
        if sort_by not in ALLOWED_SORT:
            sort_by = "created_at"
        sort_dir = "ASC" if request.args.get("sort_dir", "desc").lower() == "asc" else "DESC"

        try:
            page = max(1, int(request.args.get("page", 1)))
        except ValueError:
            page = 1

        try:
            limit = min(100, max(1, int(request.args.get("limit", 25))))
        except ValueError:
            limit = 25

        offset = (page - 1) * limit

        where_clauses = []
        params = []

        if q:
            search_pattern = f"%{q}%"
            where_clauses.append("""(
                location LIKE %s OR 
                description LIKE %s OR 
                crash_type LIKE %s OR 
                reporter_name LIKE %s OR 
                road_condition LIKE %s OR 
                report_id LIKE %s
            )""")
            params.extend([search_pattern, search_pattern, search_pattern, search_pattern, search_pattern, search_pattern])

        if severity and severity.lower() != "all":
            where_clauses.append("severity = %s")
            params.append(severity)

        if status and status.lower() != "all":
            where_clauses.append("status = %s")
            params.append(status)

        today = datetime.now().date()
        if date_range == "today":
            cutoff_str = today.strftime("%Y-%m-%d")
            where_clauses.append("COALESCE(report_date, DATE(created_at)) >= %s")
            params.append(cutoff_str)
        elif date_range == "week":
            cutoff_str = (today - timedelta(days=7)).strftime("%Y-%m-%d")
            where_clauses.append("COALESCE(report_date, DATE(created_at)) >= %s")
            params.append(cutoff_str)
        elif date_range == "month":
            cutoff_str = (today - timedelta(days=30)).strftime("%Y-%m-%d")
            where_clauses.append("COALESCE(report_date, DATE(created_at)) >= %s")
            params.append(cutoff_str)

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # Total count in table
        cursor.execute("SELECT COUNT(*) AS total FROM crash_reports")
        total_db_records = cursor.fetchone().get("total", 0)

        # Count with filters
        count_sql = f"SELECT COUNT(*) AS total FROM crash_reports {where_sql}"
        cursor.execute(count_sql, tuple(params))
        total_filtered_records = cursor.fetchone().get("total", 0)

        # Fetch records
        records_sql = f"""
            SELECT report_id, user_id, reporter_name, location, latitude, longitude,
                   report_date, report_time, crash_type, severity,
                   road_condition, description, status, photo_path,
                   captured_at, capture_lat, capture_lng, created_at
            FROM crash_reports
            {where_sql}
            ORDER BY {sort_by} {sort_dir}, report_id DESC
            LIMIT %s OFFSET %s
        """
        cursor.execute(records_sql, tuple(params + [limit, offset]))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        records = [_serialize_crash_report_row(r) for r in rows]

        return jsonify({
            "success": True,
            "page": page,
            "limit": limit,
            "total_records": total_filtered_records,
            "total_db_records": total_db_records,
            "records": records,
            "refreshed_at": datetime.now().isoformat()
        }), 200

    except Exception as e:
        app.logger.error("Admin DB records error: %s", e)
        return jsonify({
            "success": False,
            "error": "Failed to fetch database records"
        }), 500


@app.route("/api/admin/database/export", methods=["GET"])
def admin_database_export():
    """
    Exports filtered database records as a downloadable CSV.
    """
    is_auth, _ = _is_request_authorized_admin()
    if not is_auth:
        return jsonify({"success": False, "error": "Unauthorized: Administrator access required."}), 401

    try:
        q = request.args.get("q", "").strip()
        severity = request.args.get("severity", "").strip()
        status = request.args.get("status", "").strip()
        date_range = request.args.get("date_range", "all").strip().lower()

        ALLOWED_SORT = {"report_id", "location", "report_date", "severity", "status", "crash_type", "created_at"}
        sort_by = request.args.get("sort_by", "created_at").lower()
        if sort_by not in ALLOWED_SORT:
            sort_by = "created_at"
        sort_dir = "ASC" if request.args.get("sort_dir", "desc").lower() == "asc" else "DESC"

        where_clauses = []
        params = []

        if q:
            search_pattern = f"%{q}%"
            where_clauses.append("""(
                location LIKE %s OR 
                description LIKE %s OR 
                crash_type LIKE %s OR 
                reporter_name LIKE %s OR 
                road_condition LIKE %s OR 
                report_id LIKE %s
            )""")
            params.extend([search_pattern, search_pattern, search_pattern, search_pattern, search_pattern, search_pattern])

        if severity and severity.lower() != "all":
            where_clauses.append("severity = %s")
            params.append(severity)

        if status and status.lower() != "all":
            where_clauses.append("status = %s")
            params.append(status)

        today = datetime.now().date()
        if date_range == "today":
            cutoff_str = today.strftime("%Y-%m-%d")
            where_clauses.append("COALESCE(report_date, DATE(created_at)) >= %s")
            params.append(cutoff_str)
        elif date_range == "week":
            cutoff_str = (today - timedelta(days=7)).strftime("%Y-%m-%d")
            where_clauses.append("COALESCE(report_date, DATE(created_at)) >= %s")
            params.append(cutoff_str)
        elif date_range == "month":
            cutoff_str = (today - timedelta(days=30)).strftime("%Y-%m-%d")
            where_clauses.append("COALESCE(report_date, DATE(created_at)) >= %s")
            params.append(cutoff_str)

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        export_sql = f"""
            SELECT report_id, user_id, reporter_name, location, latitude, longitude,
                   report_date, report_time, crash_type, severity,
                   road_condition, description, status, photo_path, created_at
            FROM crash_reports
            {where_sql}
            ORDER BY {sort_by} {sort_dir}, report_id DESC
            LIMIT 5000
        """
        cursor.execute(export_sql, tuple(params))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Report ID", "User ID", "Reporter Name", "Location", "Latitude", "Longitude",
            "Report Date", "Report Time", "Crash Type", "Severity", "Road Condition",
            "Description", "Status", "Photo Path", "Created At"
        ])

        for row in rows:
            r = _serialize_crash_report_row(row)
            writer.writerow([
                r.get("report_id"),
                r.get("user_id"),
                r.get("reporter_name") or "",
                r.get("location") or "",
                r.get("latitude") or "",
                r.get("longitude") or "",
                r.get("report_date") or "",
                r.get("report_time") or "",
                r.get("crash_type") or "",
                r.get("severity") or "",
                r.get("road_condition") or "",
                r.get("description") or "",
                r.get("status") or "",
                r.get("photo_path") or "",
                r.get("created_at") or "",
            ])

        csv_content = output.getvalue()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"smart_traffic_crash_reports_{timestamp}.csv"

        return Response(
            csv_content,
            mimetype="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Cache-Control": "no-cache"
            }
        )

    except Exception as e:
        app.logger.error("Admin DB export error: %s", e)
        return jsonify({"success": False, "error": "Failed to generate CSV export"}), 500


# Health check
# ===================================================================

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "Smart Traffic API"})


# ===================================================================
# Entry point
# ===================================================================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
