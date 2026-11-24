// Centralized API Service for Smart Crash & Traffic Management System

export const API_BASE =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? "https://smart-traffic-nq45.onrender.com"
    : "http://127.0.0.1:5000");

export function getAuthHeader() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem("currentUser");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function setCurrentUser(user, token) {
  if (user) localStorage.setItem("currentUser", JSON.stringify(user));
  else localStorage.removeItem("currentUser");
  if (token) localStorage.setItem("auth_token", token);
  else localStorage.removeItem("auth_token");
}

export async function loginUser(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed");
  setCurrentUser(data.user, data.token);
  return data;
}

export async function registerUser(name, email, password) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Registration failed");
  setCurrentUser(data.user, data.token);
  return data;
}

export function logoutUser() {
  setCurrentUser(null, null);
}

export async function fetchDashboardStatistics(scope = "all", dateRange = "all") {
  const headers = { ...getAuthHeader() };
  const res = await fetch(`${API_BASE}/api/dashboard/stats?scope=${encodeURIComponent(scope)}&date_range=${encodeURIComponent(dateRange)}`, { headers });
  if (!res.ok) throw new Error("Failed to load statistics");
  return await res.json();
}

export async function fetchDashboardTrends() {
  const headers = { ...getAuthHeader() };
  const res = await fetch(`${API_BASE}/api/dashboard/trends`, { headers });
  if (!res.ok) throw new Error("Failed to load dashboard trends");
  return await res.json();
}

export async function fetchTrafficSummary() {
  try {
    const res = await fetch(`${API_BASE}/api/historical-traffic/summary`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn("Traffic summary API unavailable:", e);
  }
  return null;
}

export async function fetchCrashReports(scope = "all") {
  const headers = { ...getAuthHeader() };
  const endpoint = scope === "user" ? `${API_BASE}/api/user/my-reports` : `${API_BASE}/api/crash-reports?status=all`;
  const res = await fetch(endpoint, { headers });
  if (!res.ok) throw new Error("Failed to load crash reports");
  return await res.json();
}

export async function fetchUserCrashReports() {
  const headers = { ...getAuthHeader() };
  const res = await fetch(`${API_BASE}/api/crash-reports/my-reports`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load your submitted crash reports");
  }
  return await res.json();
}

export function getPhotoUrl(photoPath) {
  if (!photoPath) return null;
  if (photoPath.startsWith("http://") || photoPath.startsWith("https://") || photoPath.startsWith("data:")) {
    return photoPath;
  }
  const cleanPath = photoPath.replace(/^uploads\//, "");
  return `${API_BASE}/api/uploads/${cleanPath}`;
}

export async function submitCrashReport(reportData) {
  const headers = { ...getAuthHeader() };
  let body;
  if (reportData instanceof FormData) {
    body = reportData;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(reportData);
  }
  const res = await fetch(`${API_BASE}/api/crash-reports`, {
    method: "POST",
    headers,
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to submit crash report");
  return data;
}

export async function fetchActiveIncidents(maxAgeHours = 48, lat = null, lon = null, radiusKm = 5.0) {
  let url = `${API_BASE}/api/incidents/active?max_age_hours=${maxAgeHours}`;
  if (lat != null && lon != null) {
    url += `&lat=${lat}&lon=${lon}&radius_km=${radiusKm}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch active incidents");
  return await res.json();
}

export async function fetchCrashReportById(reportId) {
  const res = await fetch(`${API_BASE}/api/crash-reports/${reportId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch crash report");
  return data;
}

export async function updateCrashReportStatus(reportId, newStatus) {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/crash-reports/${reportId}/status`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: newStatus }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update report status");
  return data;
}

export async function detectRouteIncidents(routeGeometry, startCoords, destCoords, maxAgeHours = 48, driverLocation = null) {
  const payload = {
    route_geometry: routeGeometry,
    start: { lat: startCoords.lat, lon: startCoords.lon },
    destination: { lat: destCoords.lat, lon: destCoords.lon },
    max_age_hours: maxAgeHours,
  };
  if (driverLocation && typeof driverLocation.lat === "number" && typeof driverLocation.lon === "number") {
    payload.current_location = { lat: driverLocation.lat, lon: driverLocation.lon };
  }
  const res = await fetch(`${API_BASE}/api/routing/detect-incidents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to evaluate incident detection");
  return await res.json();
}

export async function fetchTrafficCorridors() {
  try {
    const res = await fetch(`${API_BASE}/api/historical-traffic/corridors`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Fallback below
  }
  const fallbackRes = await fetch(`${API_BASE}/api/traffic-corridors`);
  if (!fallbackRes.ok) throw new Error("Failed to load traffic corridors");
  return await fallbackRes.json();
}

export async function fetchLiveTrafficFlow(points) {
  const res = await fetch(`${API_BASE}/api/traffic-flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) throw new Error("Traffic flow API failed");
  return await res.json();
}

export async function fetchHistoricalRouteTraffic(points) {
  const res = await fetch(`${API_BASE}/api/historical-traffic/match-route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) throw new Error("Historical traffic route matching failed");
  return await res.json();
}

// -------------------------------------------------------------------
// Database Explorer Admin Services (Live MySQL Viewer)
// -------------------------------------------------------------------

export function getStoredAdminKey() {
  return localStorage.getItem("admin_key") || sessionStorage.getItem("admin_key") || "smart_traffic_admin_2026";
}

export function setStoredAdminKey(key) {
  if (key) {
    localStorage.setItem("admin_key", key);
    sessionStorage.setItem("admin_key", key);
  } else {
    localStorage.removeItem("admin_key");
    sessionStorage.removeItem("admin_key");
  }
}

export async function verifyAdminKey(adminKey) {
  const key = adminKey || getStoredAdminKey();
  const headers = {
    "Content-Type": "application/json",
    "X-Admin-Key": key,
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/api/admin/auth/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify({ admin_key: key }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Administrator authorization failed");
  setStoredAdminKey(key);
  return data;
}

export async function fetchDatabaseOverview(adminKey) {
  const key = adminKey || getStoredAdminKey();
  const headers = {
    "X-Admin-Key": key,
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/api/admin/database/overview`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load database overview");
  return data;
}

export async function fetchDatabaseRecords({
  adminKey,
  page = 1,
  limit = 25,
  q = "",
  severity = "",
  status = "",
  dateRange = "all",
  sortBy = "created_at",
  sortDir = "desc"
} = {}) {
  const key = adminKey || getStoredAdminKey();
  const headers = {
    "X-Admin-Key": key,
    ...getAuthHeader(),
  };
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    q: q || "",
    severity: severity || "",
    status: status || "",
    date_range: dateRange || "all",
    sort_by: sortBy || "created_at",
    sort_dir: sortDir || "desc",
  });

  const res = await fetch(`${API_BASE}/api/admin/database/records?${params.toString()}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch database records");
  return data;
}

export function getDatabaseExportUrl({
  adminKey,
  q = "",
  severity = "",
  status = "",
  dateRange = "all",
  sortBy = "created_at",
  sortDir = "desc"
} = {}) {
  const key = adminKey || getStoredAdminKey();
  const params = new URLSearchParams({
    admin_key: key,
    q: q || "",
    severity: severity || "",
    status: status || "",
    date_range: dateRange || "all",
    sort_by: sortBy || "created_at",
    sort_dir: sortDir || "desc",
  });
  return `${API_BASE}/api/admin/database/export?${params.toString()}`;
}

