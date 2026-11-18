-- ============================================================================
-- SMART CRASH & TRAFFIC MANAGEMENT SYSTEM
-- Database Schema (User Authentication & Crash Reports)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS smart_traffic
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_traffic;

-- ----------------------------------------------------------------------------
-- users: stores registered authenticated users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    user_id       INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(255)    NOT NULL,
    email         VARCHAR(255)    NOT NULL UNIQUE,
    password_hash VARCHAR(255)    NOT NULL,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email)
);

-- ----------------------------------------------------------------------------
-- crash_reports: stores user-submitted incident reports
-- Associated with submitting user via user_id
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crash_reports (
    report_id      INT AUTO_INCREMENT PRIMARY KEY,

    -- Associated user account
    user_id        INT             DEFAULT NULL,

    -- Reporter info (captured for audit trail)
    reporter_name  VARCHAR(255),

    -- Location (text name + optional coordinates)
    location       VARCHAR(255)    NOT NULL,
    latitude       DECIMAL(10,7)   DEFAULT NULL,
    longitude      DECIMAL(10,7)   DEFAULT NULL,

    -- Incident datetime
    report_date    DATE            DEFAULT NULL,
    report_time    TIME            DEFAULT NULL,

    -- Incident classification
    crash_type     VARCHAR(100)    DEFAULT NULL,
    severity       VARCHAR(50)     DEFAULT NULL,

    -- Road context
    road_condition VARCHAR(100)    DEFAULT NULL,

    -- Free-text description from reporter
    description    TEXT            DEFAULT NULL,

    -- Workflow status: Pending → Verified | Rejected
    status         VARCHAR(30)     NOT NULL DEFAULT 'Pending',

    -- Audit timestamp (auto-set by DB)
    created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key to users
    CONSTRAINT fk_crash_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,

    -- Indexes for performance
    INDEX idx_user_id  (user_id),
    INDEX idx_status   (status),
    INDEX idx_location (location),
    INDEX idx_severity (severity)
);
