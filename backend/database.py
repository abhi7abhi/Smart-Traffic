"""
database.py — Database Connection & Migration Helper
=====================================================
Reads credentials from backend/.env (never hard-coded).
Primary: MySQL connection to 'smart_traffic'.
Resilience Fallback: Automatic SQLite adapter if MySQL service is stopped.
All queries MUST use parameterized statements.
"""

import os
import sqlite3
import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

SQLITE_DB_PATH = os.path.join(os.path.dirname(__file__), "smart_traffic.db")


class SQLiteCursorAdapter:
    """Adapts an sqlite3 cursor to match mysql.connector's cursor interface."""
    def __init__(self, cursor, dictionary=False):
        self._cur = cursor
        self.dictionary = dictionary
        self.lastrowid = None
        self.rowcount = -1

    def execute(self, query, params=None):
        # Convert %s placeholders to ? placeholders for sqlite
        sqlite_query = query.replace("%s", "?")
        if params is None:
            self._cur.execute(sqlite_query)
        else:
            self._cur.execute(sqlite_query, tuple(params))
        self.lastrowid = self._cur.lastrowid
        self.rowcount = self._cur.rowcount
        return self

    def fetchall(self):
        rows = self._cur.fetchall()
        if not self.dictionary or not self._cur.description:
            return rows
        cols = [d[0] for d in self._cur.description]
        return [dict(zip(cols, row)) for row in rows]

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None or not self.dictionary or not self._cur.description:
            return row
        cols = [d[0] for d in self._cur.description]
        return dict(zip(cols, row))

    def close(self):
        self._cur.close()


class SQLiteConnectionAdapter:
    """Adapts an sqlite3 connection to match mysql.connector connection interface."""
    def __init__(self, sqlite_conn):
        self._conn = sqlite_conn

    def cursor(self, dictionary=False):
        return SQLiteCursorAdapter(self._conn.cursor(), dictionary=dictionary)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


def _init_sqlite_db():
    """Initializes SQLite tables if MySQL is not available."""
    conn = sqlite3.connect(SQLITE_DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS crash_reports (
            report_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT NULL,
            reporter_name TEXT,
            location TEXT NOT NULL,
            latitude REAL DEFAULT NULL,
            longitude REAL DEFAULT NULL,
            report_date TEXT DEFAULT NULL,
            report_time TEXT DEFAULT NULL,
            crash_type TEXT DEFAULT NULL,
            severity TEXT DEFAULT NULL,
            road_condition TEXT DEFAULT NULL,
            description TEXT DEFAULT NULL,
            status TEXT NOT NULL DEFAULT 'Pending',
            photo_path TEXT DEFAULT NULL,
            captured_at TEXT DEFAULT NULL,
            capture_lat REAL DEFAULT NULL,
            capture_lng REAL DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
        )
    """)
    conn.commit()

    # Migration: Ensure photo and capture metadata columns exist if table was already created
    cur.execute("PRAGMA table_info(crash_reports)")
    existing_cols = {row[1] for row in cur.fetchall()}
    if "photo_path" not in existing_cols:
        cur.execute("ALTER TABLE crash_reports ADD COLUMN photo_path TEXT DEFAULT NULL")
    if "captured_at" not in existing_cols:
        cur.execute("ALTER TABLE crash_reports ADD COLUMN captured_at TEXT DEFAULT NULL")
    if "capture_lat" not in existing_cols:
        cur.execute("ALTER TABLE crash_reports ADD COLUMN capture_lat REAL DEFAULT NULL")
    if "capture_lng" not in existing_cols:
        cur.execute("ALTER TABLE crash_reports ADD COLUMN capture_lng REAL DEFAULT NULL")
    conn.commit()

    # Seed initial verified sample records if empty
    cur.execute("SELECT COUNT(*) FROM crash_reports")
    count = cur.fetchone()[0]
    if count == 0:
        sample_reports = [
            ("Hosur Road", 12.8988, 77.6433, "2026-08-12", "09:30", "Vehicle Collision", "High", "Wet", "Rear collision near elevated tollway ramp.", "Verified"),
            ("Electronic City Road", 12.8452, 77.6602, "2026-08-18", "14:15", "Rear-end", "Moderate", "Dry", "Minor two-vehicle contact at signal crossing.", "Verified"),
            ("Bannerghatta Road", 12.8912, 77.5975, "2026-08-21", "18:45", "Skid", "Low", "Dry", "Two-wheeler slip on gravel edge, no injuries.", "Verified"),
            ("Outer Ring Road", 12.9248, 77.6805, "2026-09-02", "08:10", "Vehicle Collision", "High", "Wet", "Multi-vehicle pileup during heavy morning shower.", "Verified"),
            ("Sarjapur Road", 12.9166, 77.6750, "2026-09-05", "11:20", "Side Impact", "Moderate", "Dry", "T-bone incident at U-turn opening.", "Verified"),
            ("Hosur Road", 12.9038, 77.6335, "2026-09-10", "16:40", "Rear-end", "Low", "Dry", "Slow-moving fender bender in congestion queue.", "Verified"),
            ("Outer Ring Road", 12.9348, 77.6820, "2026-09-13", "19:15", "Vehicle Collision", "High", "Wet", "Bus and car collision near flyover divergence.", "Verified"),
            ("Kanakapura Road", 12.8805, 77.5583, "2026-09-16", "21:05", "Skid", "Moderate", "Dry", "Skid near metro pillar during lane change.", "Verified")
        ]
        cur.executemany("""
            INSERT INTO crash_reports
                (location, latitude, longitude, report_date, report_time, crash_type, severity, road_condition, description, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, sample_reports)
        conn.commit()

    conn.close()


def _init_mysql_db(conn):
    """Ensures users table, user_id, and photo metadata columns exist in MySQL."""
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_email (email)
            )
        """)
        # Check existing columns in crash_reports
        cur.execute("""
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'crash_reports'
        """)
        mysql_cols = {row[0] for row in cur.fetchall()}
        if "user_id" not in mysql_cols:
            cur.execute("""
                ALTER TABLE crash_reports
                ADD COLUMN user_id INT DEFAULT NULL AFTER report_id,
                ADD CONSTRAINT fk_crash_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
                ADD INDEX idx_user_id (user_id)
            """)
        if "photo_path" not in mysql_cols:
            cur.execute("ALTER TABLE crash_reports ADD COLUMN photo_path VARCHAR(500) DEFAULT NULL")
        if "captured_at" not in mysql_cols:
            cur.execute("ALTER TABLE crash_reports ADD COLUMN captured_at VARCHAR(100) DEFAULT NULL")
        if "capture_lat" not in mysql_cols:
            cur.execute("ALTER TABLE crash_reports ADD COLUMN capture_lat DOUBLE DEFAULT NULL")
        if "capture_lng" not in mysql_cols:
            cur.execute("ALTER TABLE crash_reports ADD COLUMN capture_lng DOUBLE DEFAULT NULL")
        conn.commit()
        cur.close()
    except Exception as e:
        # Ignore if table/column already altered
        pass


import time

_last_mysql_check_time = 0
_mysql_is_available = None

def get_connection():
    """
    Open and return a database connection.
    Attempts MySQL first using .env credentials.
    If MySQL server is offline/unavailable, seamlessly returns an SQLite adapter.
    """
    global _last_mysql_check_time, _mysql_is_available
    now = time.time()
    if _mysql_is_available is False and (now - _last_mysql_check_time) < 30:
        _init_sqlite_db()
        sqlite_conn = sqlite3.connect(SQLITE_DB_PATH)
        return SQLiteConnectionAdapter(sqlite_conn)

    try:
        conn = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", ""),
            database=os.getenv("DB_NAME", "smart_traffic"),
            charset="utf8mb4",
            collation="utf8mb4_unicode_ci",
            autocommit=False,
            connection_timeout=1,
        )
        _init_mysql_db(conn)
        _mysql_is_available = True
        return conn
    except Exception:
        _mysql_is_available = False
        _last_mysql_check_time = now
        _init_sqlite_db()
        sqlite_conn = sqlite3.connect(SQLITE_DB_PATH)
        return SQLiteConnectionAdapter(sqlite_conn)
