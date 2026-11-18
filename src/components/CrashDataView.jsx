import React, { useState, useEffect, useCallback } from 'react';
import { fetchUserCrashReports, getPhotoUrl } from '../services/api';

export default function CrashDataView({ currentUser, onOpenLogin, onOpenRegister, onNavigate, refreshTrigger = 0 }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // Load authenticated user's submitted crash reports
  const loadReports = useCallback(async () => {
    if (!currentUser) {
      setReports([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const data = await fetchUserCrashReports();
      // Ensure newest reports first
      const list = data.reports || [];
      setReports(list);
    } catch (err) {
      console.warn('Failed to fetch user crash reports:', err);
      setErrorMsg(err.message || 'Could not load your crash reports from the server.');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadReports();
  }, [loadReports, refreshTrigger]);

  // Client-side filtering across location, crash type, road condition, status, and severity
  const filtered = reports.filter((r) => {
    const loc = (r.location || '').toLowerCase();
    const type = (r.crash_type || '').toLowerCase();
    const roadCond = (r.road_condition || '').toLowerCase();
    const q = search.trim().toLowerCase();

    const matchesSearch = !q || loc.includes(q) || type.includes(q) || roadCond.includes(q);
    const matchesStatus =
      statusFilter === 'all' || (r.status || '').toLowerCase() === statusFilter.toLowerCase();

    const sev = (r.severity || '').toLowerCase();
    let matchesSeverity = true;
    if (severityFilter === 'high') {
      matchesSeverity = sev.includes('high') || sev.includes('critical') || sev.includes('severe');
    } else if (severityFilter === 'medium') {
      matchesSeverity = sev.includes('medium') || sev.includes('moderate');
    } else if (severityFilter === 'low') {
      matchesSeverity = sev.includes('low') || sev.includes('minor');
    }

    return matchesSearch && matchesStatus && matchesSeverity;
  });

  // Aggregate metrics: Number of crashes reported by user & severity breakdown (High, Medium, Low)
  const totalCount = reports.length;
  const highCount = reports.filter((r) => {
    const s = (r.severity || '').toLowerCase();
    return s.includes('high') || s.includes('critical') || s.includes('severe');
  }).length;
  const mediumCount = reports.filter((r) => {
    const s = (r.severity || '').toLowerCase();
    return s.includes('medium') || s.includes('moderate');
  }).length;
  const lowCount = reports.filter((r) => {
    const s = (r.severity || '').toLowerCase();
    return s.includes('low') || s.includes('minor');
  }).length;

  const pendingCount = reports.filter((r) => (r.status || '').toLowerCase() === 'pending').length;
  const verifiedCount = reports.filter((r) => (r.status || '').toLowerCase() === 'verified').length;
  const rejectedCount = reports.filter((r) => (r.status || '').toLowerCase() === 'rejected').length;
  const withPhotoCount = reports.filter((r) => Boolean(r.photo_path)).length;

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. GUEST VIEW: Clean sign-in prompt (when user is not authenticated)
  // ─────────────────────────────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-3xl mx-auto flex items-center justify-center shadow-lg shadow-blue-500/10">
          🔒
        </div>

        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
            Authentication Required
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Sign In to Access Your Crash Data
          </h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Please log in or create an account to view and manage incident reports submitted from your account with verified camera evidence.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onOpenLogin}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] cursor-pointer"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={onOpenRegister}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-all hover:scale-[1.02] cursor-pointer"
          >
            Create Account
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. AUTHENTICATED USER CRASH DATA VIEW
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fade-in">
      
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
              Personal Incident Registry
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-xs text-slate-400">
              Account: <span className="text-slate-200 font-semibold">{currentUser.name || currentUser.email}</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Your Submitted Crash Reports
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Live log of incident reports submitted through your account. Each entry reflects the verified database state, road condition, and camera photo evidence.
          </p>
        </div>

        {/* Action Button: Submit New Report */}
        <div className="flex items-center gap-2">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('page-report-crash')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] cursor-pointer shrink-0"
            >
              <span>+</span>
              <span>Report Crash</span>
            </button>
          )}

          <button
            type="button"
            onClick={loadReports}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
            title="Refresh reports"
            aria-label="Refresh reports"
          >
            <span className={`inline-block ${loading ? 'animate-spin' : ''}`}>🔄</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip — Crashes Reported by You & Severity Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-navy-900 border border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-md">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Reported by You</span>
          <span className="text-xl sm:text-2xl font-black text-white mt-1 block">{totalCount}</span>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Total crash reports</span>
        </div>

        <div className="bg-navy-900 border border-rose-500/20 rounded-xl p-3.5 sm:p-4 shadow-md">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block">High Severity</span>
          <span className="text-xl sm:text-2xl font-black text-rose-400 mt-1 block">{highCount}</span>
          <span className="text-[10px] text-rose-300/70 mt-0.5 block">Critical road blockages</span>
        </div>

        <div className="bg-navy-900 border border-amber-500/20 rounded-xl p-3.5 sm:p-4 shadow-md">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">Medium Severity</span>
          <span className="text-xl sm:text-2xl font-black text-amber-400 mt-1 block">{mediumCount}</span>
          <span className="text-[10px] text-amber-300/70 mt-0.5 block">Moderate lane blockages</span>
        </div>

        <div className="bg-navy-900 border border-emerald-500/20 rounded-xl p-3.5 sm:p-4 shadow-md">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">Low Severity</span>
          <span className="text-xl sm:text-2xl font-black text-emerald-400 mt-1 block">{lowCount}</span>
          <span className="text-[10px] text-emerald-300/70 mt-0.5 block">Minor fender benders</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-navy-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="w-full md:w-80 relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by location, type, or road condition..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-navy-950 border border-slate-700 text-white placeholder-slate-500 text-xs focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Severity & Status Dropdown Filters */}
        <div className="w-full md:w-auto flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <label htmlFor="crash-severity-filter" className="font-semibold whitespace-nowrap">Severity:</label>
            <select
              id="crash-severity-filter"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="all">All Severities ({totalCount})</option>
              <option value="high">High ({highCount})</option>
              <option value="medium">Medium ({mediumCount})</option>
              <option value="low">Low ({lowCount})</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <label htmlFor="crash-status-filter" className="font-semibold whitespace-nowrap">Status:</label>
            <select
              id="crash-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses ({totalCount})</option>
              <option value="pending">Pending ({pendingCount})</option>
              <option value="verified">Verified ({verifiedCount})</option>
              {rejectedCount > 0 && <option value="rejected">Rejected ({rejectedCount})</option>}
            </select>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={loadReports}
            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Responsive Table of User Reports */}
      <div className="table-responsive bg-navy-900 border border-slate-800 rounded-2xl shadow-xl overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-navy-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="px-5 py-3.5 font-bold">Report ID</th>
              <th className="px-5 py-3.5 font-bold">Location</th>
              <th className="px-5 py-3.5 font-bold">Date &amp; Time</th>
              <th className="px-5 py-3.5 font-bold">Crash Type</th>
              <th className="px-5 py-3.5 font-bold">Severity</th>
              <th className="px-5 py-3.5 font-bold">Road Condition</th>
              <th className="px-5 py-3.5 font-bold">Photo Evidence</th>
              <th className="px-5 py-3.5 font-bold">Verification Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {loading ? (
              <tr>
                <td colSpan="8" className="px-5 py-12 text-center text-slate-400">
                  <span className="inline-block animate-spin text-xl mb-2">⏳</span>
                  <div className="font-semibold text-xs text-slate-300">Fetching your incident reports from the database...</div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-5 py-14 text-center">
                  <div className="max-w-md mx-auto space-y-3">
                    <span className="text-4xl block">📋</span>
                    <h3 className="text-base font-bold text-white">
                      {totalCount === 0 ? 'No Incident Reports Yet' : 'No Matching Reports Found'}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {totalCount === 0
                        ? "You haven't submitted any crash reports yet. When you report road incidents or collisions with the in-app camera, your saved reports and official verification status will appear here."
                        : `No reports match your current filter criteria ("${search || statusFilter}"). Try adjusting your filters.`}
                    </p>
                    {totalCount === 0 && onNavigate && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => onNavigate('page-report-crash')}
                          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] cursor-pointer"
                        >
                          Submit First Report
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const statusLower = (item.status || '').toLowerCase();
                const isVerified = statusLower === 'verified';
                const isRejected = statusLower === 'rejected';

                const sev = (item.severity || '').toLowerCase();
                const sevColor = sev.includes('high')
                  ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                  : sev.includes('low')
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/20';

                // Format timestamp
                let dateTimeDisplay = 'Recent';
                if (item.report_date) {
                  dateTimeDisplay = item.report_date;
                  if (item.report_time) {
                    dateTimeDisplay += ` • ${item.report_time}`;
                  }
                } else if (item.created_at) {
                  try {
                    const d = new Date(item.created_at);
                    dateTimeDisplay = d.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }) + ' • ' + d.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                  } catch (e) {
                    dateTimeDisplay = String(item.created_at);
                  }
                }

                const photoUrl = getPhotoUrl(item.photo_path);

                return (
                  <tr key={item.report_id || item.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Report ID */}
                    <td className="px-5 py-4 font-mono font-bold text-blue-400">
                      #{item.report_id || item.id}
                    </td>

                    {/* Crash Location */}
                    <td className="px-5 py-4">
                      <div className="font-bold text-white max-w-[220px] truncate" title={item.location}>
                        {item.location}
                      </div>
                      {(item.latitude && item.longitude) && (
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)}
                        </div>
                      )}
                    </td>

                    {/* Date and Time */}
                    <td className="px-5 py-4 text-slate-300 font-medium whitespace-nowrap">
                      {dateTimeDisplay}
                    </td>

                    {/* Crash Type */}
                    <td className="px-5 py-4 text-slate-200 font-semibold whitespace-nowrap">
                      {item.crash_type || 'Vehicle Collision'}
                    </td>

                    {/* Severity */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border inline-block ${sevColor}`}>
                        {item.severity || 'Moderate'}
                      </span>
                    </td>

                    {/* Road Condition */}
                    <td className="px-5 py-4 text-slate-300 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-slate-800 border border-slate-700 text-slate-300">
                        <span>{item.road_condition === 'Wet' ? '🌧️' : item.road_condition === 'Poor Surface' ? '⚠️' : '☀️'}</span>
                        <span>{item.road_condition || 'Dry'}</span>
                      </span>
                    </td>

                    {/* Photo Evidence */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {photoUrl ? (
                        <button
                          type="button"
                          onClick={() => setSelectedPhoto(item)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-500/15 border border-blue-500/35 text-blue-400 hover:bg-blue-500/25 transition-all cursor-pointer group active:scale-95"
                          title="Click to preview captured incident photo"
                        >
                          <span>📷</span>
                          <span className="group-hover:underline">View Photo</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500">No Photo</span>
                      )}
                    </td>

                    {/* Verification Status */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1.5 ${
                          isVerified
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : isRejected
                            ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        <span className="text-[9px]">
                          {isVerified ? '✓' : isRejected ? '✕' : '⏳'}
                        </span>
                        <span>
                          {isVerified ? 'Verified Official' : isRejected ? 'Rejected' : 'Pending Verification'}
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Photo Evidence Modal */}
      {selectedPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="bg-navy-900 border border-slate-700 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 block">
                  Incident Photo Evidence
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  Report #{selectedPhoto.report_id || selectedPhoto.id} • {selectedPhoto.location}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close photo preview"
              >
                ✕
              </button>
            </div>

            {/* Photo Display */}
            <div className="relative rounded-xl overflow-hidden bg-black/60 border border-slate-800 flex items-center justify-center min-h-[260px]">
              <img
                src={getPhotoUrl(selectedPhoto.photo_path)}
                alt={`Photo for report #${selectedPhoto.report_id}`}
                className="w-full max-h-[420px] object-contain rounded-xl"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.style.display = 'none';
                  const fallback = document.getElementById('photo-error-box');
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <div
                id="photo-error-box"
                className="hidden flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2"
              >
                <span className="text-3xl">📷</span>
                <span className="text-xs">Photo is stored on the server at:</span>
                <code className="text-[11px] text-blue-400 font-mono bg-navy-950 px-2 py-1 rounded">
                  {selectedPhoto.photo_path}
                </code>
              </div>
            </div>

            {/* Metadata Footer */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs">
              <div className="bg-navy-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Crash Type</span>
                <span className="font-bold text-white mt-0.5 block">{selectedPhoto.crash_type}</span>
              </div>
              <div className="bg-navy-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Severity</span>
                <span className="font-bold text-amber-400 mt-0.5 block">{selectedPhoto.severity}</span>
              </div>
              <div className="bg-navy-950 p-2.5 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Road Surface</span>
                <span className="font-bold text-slate-300 mt-0.5 block">{selectedPhoto.road_condition || 'Dry'}</span>
              </div>
            </div>

            {/* Close Button */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
