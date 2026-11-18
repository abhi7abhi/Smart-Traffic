import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchDatabaseOverview,
  fetchDatabaseRecords,
  getDatabaseExportUrl,
  getStoredAdminKey,
  setStoredAdminKey,
  verifyAdminKey,
  getPhotoUrl
} from '../services/api';

export default function DatabaseExplorerView() {
  // Authentication & Passcode State
  const [adminKey, setAdminKey] = useState(getStoredAdminKey());
  const [isAuthorized, setIsAuthorized] = useState(null);
  const [passcodeInput, setPasscodeInput] = useState(getStoredAdminKey());
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Database Overview & Schema State
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(null);
  const [activeSchemaTab, setActiveSchemaTab] = useState('crash_reports');
  const [isSchemaExpanded, setIsSchemaExpanded] = useState(false);

  // Records Table & Filter State
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalDbRecords, setTotalDbRecords] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  // Live Auto-Refresh State
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [refreshCountdown, setRefreshCountdown] = useState(5);
  const [tableError, setTableError] = useState(null);

  // Inspection Modal State
  const [inspectRecord, setInspectRecord] = useState(null);
  const [newRecordAlert, setNewRecordAlert] = useState(false);
  const prevTopRecordIdRef = useRef(null);
  const isFetchingRef = useRef(false);

  // Debounce search query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Initial authentication verification
  const checkAdminAuth = useCallback(async (keyToTest) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await verifyAdminKey(keyToTest);
      setAdminKey(keyToTest);
      setStoredAdminKey(keyToTest);
      setIsAuthorized(true);
    } catch (err) {
      setIsAuthorized(false);
      setAuthError(err.message || 'Invalid administrator key. Access denied.');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminKey) {
      checkAdminAuth(adminKey);
    } else {
      setIsAuthorized(false);
    }
  }, [adminKey, checkAdminAuth]);

  // Fetch Database Overview & Metrics
  const loadOverview = useCallback(async () => {
    if (!isAuthorized) return;
    setOverviewLoading(true);
    try {
      const data = await fetchDatabaseOverview(adminKey);
      if (data.success) {
        setOverview(data);
        setOverviewError(null);
      }
    } catch (err) {
      setOverviewError(err.message || 'Unable to fetch database schema information');
    } finally {
      setOverviewLoading(false);
    }
  }, [isAuthorized, adminKey]);

  // Fetch Paginated & Filtered Database Records
  const loadRecords = useCallback(async (isBackground = false) => {
    if (!isAuthorized || isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!isBackground) setIsFetching(true);
    setTableError(null);

    try {
      const data = await fetchDatabaseRecords({
        adminKey,
        page,
        limit,
        q: debouncedSearch,
        severity: severityFilter,
        status: statusFilter,
        dateRange: dateRangeFilter,
        sortBy,
        sortDir,
      });

      if (data.success) {
        // Detect newly arrived records at top if looking at page 1 with default sort
        if (page === 1 && sortBy === 'created_at' && sortDir === 'desc' && data.records.length > 0) {
          const topId = data.records[0].report_id;
          if (prevTopRecordIdRef.current && topId !== prevTopRecordIdRef.current) {
            setNewRecordAlert(true);
            setTimeout(() => setNewRecordAlert(false), 4000);
          }
          prevTopRecordIdRef.current = topId;
        }

        setRecords(data.records);
        setTotalRecords(data.total_records);
        setTotalDbRecords(data.total_db_records);
        setLastRefreshedAt(new Date());
        setRefreshCountdown(5);
      }
    } catch (err) {
      setTableError(err.message || 'Error loading live MySQL records');
    } finally {
      isFetchingRef.current = false;
      setIsFetching(false);
    }
  }, [
    isAuthorized,
    adminKey,
    page,
    limit,
    debouncedSearch,
    severityFilter,
    statusFilter,
    dateRangeFilter,
    sortBy,
    sortDir,
  ]);

  // Initial load when authorized
  useEffect(() => {
    if (isAuthorized) {
      loadOverview();
      loadRecords(false);
    }
  }, [isAuthorized, loadOverview, loadRecords]);

  // Auto-refresh interval (5 seconds) with overlap prevention
  useEffect(() => {
    if (!isAuthorized || !autoRefresh) return;

    const timer = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          loadRecords(true);
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAuthorized, autoRefresh, loadRecords]);

  // Handle Passcode Unlock Submission
  const handleAuthSubmit = (e) => {
    e.preventDefault();
    if (!passcodeInput.trim()) {
      setAuthError('Please enter administrator passcode');
      return;
    }
    checkAdminAuth(passcodeInput.trim());
  };

  // Handle Admin Logout / Lock
  const handleLockAdmin = () => {
    setStoredAdminKey('');
    setAdminKey('');
    setPasscodeInput('');
    setIsAuthorized(false);
  };

  // Toggle Table Header Sorting
  const handleSortToggle = (columnKey) => {
    if (sortBy === columnKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortDir('desc');
    }
    setPage(1);
  };

  // Total pages
  const totalPages = Math.max(1, Math.ceil(totalRecords / limit));

  // Severity Badge Component
  const renderSeverityBadge = (severity) => {
    const val = (severity || 'Minor').toLowerCase();
    let badgeClass = 'bg-slate-700/60 text-slate-300 border-slate-600';
    if (val === 'critical') badgeClass = 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold';
    else if (val === 'severe') badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold';
    else if (val === 'moderate') badgeClass = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
    else if (val === 'minor') badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';

    return (
      <span className={`px-2 py-0.5 rounded-md text-[11px] border tracking-wide uppercase inline-flex items-center gap-1 ${badgeClass}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {severity || 'Minor'}
      </span>
    );
  };

  // Status Badge Component
  const renderStatusBadge = (status) => {
    const val = (status || 'Pending').toLowerCase();
    let badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    if (val === 'verified') badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    else if (val === 'resolved') badgeClass = 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    else if (val === 'rejected') badgeClass = 'bg-slate-700 text-slate-400 border-slate-600';

    return (
      <span className={`px-2 py-0.5 rounded-md text-[11px] border font-medium inline-flex items-center gap-1.5 ${badgeClass}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {status || 'Pending'}
      </span>
    );
  };

  // -------------------------------------------------------------------
  // View 1: Passcode Unlock Screen (if unauthorized)
  // -------------------------------------------------------------------
  if (isAuthorized === false) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-[#0b142a] border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          {/* Subtle Accent Glow */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600" />
          
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 mx-auto mb-6">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-center text-white mb-2">Smart Traffic — Database Explorer</h2>
          <p className="text-xs text-slate-400 text-center mb-6">
            Live administrative inspection of MySQL database <code className="text-cyan-300 bg-navy-900 px-1 py-0.5 rounded">smart_traffic</code>. Enter your administrator key to continue.
          </p>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Administrator Key / Passcode
              </label>
              <input
                type="password"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                placeholder="Enter administrator key..."
                className="w-full px-4 py-2.5 rounded-xl bg-navy-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
                autoFocus
              />
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-xs tracking-wide uppercase transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {authLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  <span>Authenticate & Open Explorer</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <span className="text-[11px] text-slate-500">
              System Admin Key configured in <code className="text-slate-400">backend/.env</code>
            </span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // View 2: Live Database Explorer Dashboard
  // -------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#070d1e] text-slate-100 pb-16">
      
      {/* Top Banner: Breadcrumbs & Header */}
      <section className="bg-navy-900/80 border-b border-slate-800/80 px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              <span className="text-cyan-400">Admin</span>
              <span>/</span>
              <span className="text-slate-300">Database Viewer</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                LIVE
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <span>Smart Traffic — Database Explorer</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
              Inspect real tables, query records, monitor schemas, and stream data directly from the active MySQL 8.0 <code className="text-cyan-300 bg-navy-950 px-1 py-0.5 rounded border border-slate-800">smart_traffic</code> database.
            </p>
          </div>

          {/* Quick Actions & Live Connection Status */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Live Connection Pill */}
            <div className="px-3 py-1.5 rounded-xl bg-navy-950 border border-slate-800 flex items-center gap-2 text-xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-slate-300 font-medium">
                {overview?.connection?.engine || 'MySQL 8.0'}
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-cyan-400 font-mono text-[11px]">
                {overview?.connection?.database || 'smart_traffic'}
              </span>
            </div>

            {/* Lock / Exit Admin Button */}
            <button
              onClick={handleLockAdmin}
              className="px-3 py-1.5 rounded-xl bg-navy-950 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-slate-300 hover:text-white transition-all flex items-center gap-1.5"
              title="Lock database session"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Lock</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">

        {/* New Record Arrival Notification Banner */}
        {newRecordAlert && (
          <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs sm:text-sm font-medium flex items-center justify-between shadow-lg shadow-emerald-500/10 animate-pulse">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>New crash report submitted in MySQL database. Table updated automatically.</span>
            </div>
            <span className="text-xs bg-emerald-600/40 px-2 py-0.5 rounded text-emerald-100 font-mono font-bold">
              NEW RECORD
            </span>
          </div>
        )}

        {/* Database Connection & Refresh Control Bar */}
        <div className="bg-[#0b142a] border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {/* Host info */}
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-500">Host:</span>
              <span className="font-mono text-white bg-navy-900 px-2 py-0.5 rounded border border-slate-800">
                {overview?.connection?.host || 'localhost'}
              </span>
            </div>

            {/* Charset */}
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-500">Charset:</span>
              <span className="font-mono text-white bg-navy-900 px-2 py-0.5 rounded border border-slate-800">
                {overview?.connection?.charset || 'utf8mb4'}
              </span>
            </div>

            {/* Last Refreshed */}
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="text-slate-500">Refreshed:</span>
              <span className="font-medium text-slate-300">
                {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString() : 'Loading...'}
              </span>
            </div>
          </div>

          {/* Controls: Auto-refresh switch, Refresh button, Export CSV */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 5-second Auto-refresh toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300 bg-navy-900 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-3.5 h-3.5 text-blue-600 rounded bg-navy-950 border-slate-700 focus:ring-0 focus:ring-offset-0"
              />
              <span className="font-medium">Auto-update (5s)</span>
              {autoRefresh && (
                <span className="w-5 text-center font-mono text-[10px] text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 rounded px-1">
                  {refreshCountdown}s
                </span>
              )}
            </label>

            {/* Manual Refresh Button */}
            <button
              onClick={() => {
                loadOverview();
                loadRecords(false);
              }}
              disabled={isFetching}
              className="px-3 py-1.5 rounded-xl bg-blue-600/90 hover:bg-blue-600 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
              title="Refresh database records"
            >
              <svg className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{isFetching ? 'Fetching...' : 'Refresh'}</span>
            </button>

            {/* CSV Export Button */}
            <a
              href={getDatabaseExportUrl({
                adminKey,
                q: debouncedSearch,
                severity: severityFilter,
                status: statusFilter,
                dateRange: dateRangeFilter,
                sortBy,
                sortDir,
              })}
              download
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-sm"
              title="Export filtered records to CSV"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Export CSV</span>
            </a>
          </div>
        </div>

        {/* Summary Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {/* Total DB Records */}
          <div className="bg-[#0b142a] border border-slate-800 rounded-xl p-3.5 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total in DB</span>
            <div className="text-xl sm:text-2xl font-bold text-white mt-1">
              {overview?.metrics?.total_reports ?? totalDbRecords}
            </div>
            <span className="text-[10px] text-cyan-400 mt-0.5 block">crash_reports table</span>
          </div>

          {/* Filtered Count */}
          <div className="bg-[#0b142a] border border-slate-800 rounded-xl p-3.5 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Filtered Rows</span>
            <div className="text-xl sm:text-2xl font-bold text-blue-400 mt-1">
              {totalRecords}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">matching query</span>
          </div>

          {/* Pending Reports */}
          <div className="bg-[#0b142a] border border-slate-800 rounded-xl p-3.5 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Pending</span>
            <div className="text-xl sm:text-2xl font-bold text-amber-400 mt-1">
              {overview?.metrics?.pending_reports ?? '—'}
            </div>
            <span className="text-[10px] text-amber-300/80 mt-0.5 block">awaiting review</span>
          </div>

          {/* Verified Reports */}
          <div className="bg-[#0b142a] border border-slate-800 rounded-xl p-3.5 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Verified</span>
            <div className="text-xl sm:text-2xl font-bold text-emerald-400 mt-1">
              {overview?.metrics?.verified_reports ?? '—'}
            </div>
            <span className="text-[10px] text-emerald-300/80 mt-0.5 block">live on traffic map</span>
          </div>

          {/* Resolved Reports */}
          <div className="bg-[#0b142a] border border-slate-800 rounded-xl p-3.5 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Resolved</span>
            <div className="text-xl sm:text-2xl font-bold text-blue-300 mt-1">
              {overview?.metrics?.resolved_reports ?? '—'}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">cleared incidents</span>
          </div>

          {/* Photo Reports */}
          <div className="bg-[#0b142a] border border-slate-800 rounded-xl p-3.5 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">With Photos</span>
            <div className="text-xl sm:text-2xl font-bold text-purple-400 mt-1">
              {overview?.metrics?.photo_reports ?? '—'}
            </div>
            <span className="text-[10px] text-purple-300/80 mt-0.5 block">evidence captured</span>
          </div>
        </div>

        {/* Schema Discovery & Table Inspector (Collapsible) */}
        <div className="bg-[#0b142a] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setIsSchemaExpanded(!isSchemaExpanded)}
            className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7M4 7c0-2 1.5-3 3.5-3h9c2 0 3.5 1 3.5 3M4 7h16m-8 4v6m-4-3h8" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Database Schema Inspector</h2>
                <span className="text-xs text-slate-400">
                  {overview?.tables ? `${overview.tables.length} application tables inspected in ${overview?.connection?.database || 'smart_traffic'}` : 'Loading schema metadata...'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="hidden sm:inline">{isSchemaExpanded ? 'Hide Columns' : 'Inspect Columns'}</span>
              <svg className={`w-4 h-4 transform transition-transform ${isSchemaExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {isSchemaExpanded && (
            <div className="p-5 border-t border-slate-800 space-y-4">
              {/* Table Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                {(overview?.tables || []).map((t) => (
                  <button
                    key={t.name}
                    onClick={() => setActiveSchemaTab(t.name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all flex items-center gap-2 ${
                      activeSchemaTab === t.name
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white bg-navy-900 border border-slate-800'
                    }`}
                  >
                    <span>{t.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-navy-950/60 font-mono">
                      {t.row_count} rows
                    </span>
                  </button>
                ))}
              </div>

              {/* Table Column Schema List */}
              {overview?.tables && (
                <div>
                  {(() => {
                    const currentTable = overview.tables.find((t) => t.name === activeSchemaTab) || overview.tables[0];
                    if (!currentTable) return null;

                    return (
                      <div className="space-y-2">
                        <div className="text-xs text-slate-400 flex items-center justify-between mb-2">
                          <span>{currentTable.description}</span>
                          <span className="text-slate-500 font-mono text-[11px]">{currentTable.columns.length} columns</span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
                            <thead className="bg-navy-950 text-slate-400 font-semibold border-b border-slate-800">
                              <tr>
                                <th className="px-3 py-2">Column Name</th>
                                <th className="px-3 py-2">Data Type</th>
                                <th className="px-3 py-2">Nullable</th>
                                <th className="px-3 py-2">Key</th>
                                <th className="px-3 py-2">Default</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 bg-[#070d1e]/50 font-mono text-[11px]">
                              {currentTable.columns.map((col) => (
                                <tr key={col.name} className="hover:bg-slate-800/30">
                                  <td className="px-3 py-2 font-semibold text-cyan-300 flex items-center gap-1.5">
                                    {col.name}
                                    {col.key === 'PRI' && (
                                      <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 rounded font-sans font-bold">
                                        PK
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-300">{col.type}</td>
                                  <td className="px-3 py-2 text-slate-400">{col.nullable ? 'YES' : 'NO'}</td>
                                  <td className="px-3 py-2 text-slate-400">{col.key || '—'}</td>
                                  <td className="px-3 py-2 text-slate-500">{col.default !== null ? String(col.default) : 'NULL'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search, Filter & Sizing Controls */}
        <div className="bg-[#0b142a] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search Input */}
            <div className="lg:col-span-2 relative">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Search Records
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by ID, location, description, type..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-navy-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <svg className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Severity Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Severity
              </label>
              <select
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-navy-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Severities</option>
                <option value="Minor">Minor</option>
                <option value="Moderate">Moderate</option>
                <option value="Severe">Severe</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-navy-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Verified">Verified</option>
                <option value="Resolved">Resolved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            {/* Date Range Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Date Range
              </label>
              <select
                value={dateRangeFilter}
                onChange={(e) => {
                  setDateRangeFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-navy-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
              </select>
            </div>
          </div>

          {/* Quick Active Filter Badges & Reset Button */}
          {(debouncedSearch || severityFilter !== 'all' || statusFilter !== 'all' || dateRangeFilter !== 'all') && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800 text-xs">
              <span className="text-slate-500 text-[11px]">Active Filters:</span>
              {debouncedSearch && (
                <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] flex items-center gap-1">
                  Query: "{debouncedSearch}"
                  <button onClick={() => setSearchQuery('')} className="hover:text-white">✕</button>
                </span>
              )}
              {severityFilter !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] flex items-center gap-1">
                  Severity: {severityFilter}
                  <button onClick={() => setSeverityFilter('all')} className="hover:text-white">✕</button>
                </span>
              )}
              {statusFilter !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] flex items-center gap-1">
                  Status: {statusFilter}
                  <button onClick={() => setStatusFilter('all')} className="hover:text-white">✕</button>
                </span>
              )}
              {dateRangeFilter !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] flex items-center gap-1">
                  Date: {dateRangeFilter}
                  <button onClick={() => setDateRangeFilter('all')} className="hover:text-white">✕</button>
                </span>
              )}
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSeverityFilter('all');
                  setStatusFilter('all');
                  setDateRangeFilter('all');
                  setPage(1);
                }}
                className="text-[11px] text-slate-400 hover:text-white underline ml-auto"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Live MySQL Data Table */}
        <div className="bg-[#0b142a] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {tableError && (
            <div className="p-4 bg-rose-500/15 border-b border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
              <span>{tableError}</span>
              <button
                onClick={() => loadRecords(false)}
                className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-semibold"
              >
                Retry
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-navy-950 text-slate-400 border-b border-slate-800 font-semibold select-none">
                <tr>
                  {/* ID */}
                  <th
                    onClick={() => handleSortToggle('report_id')}
                    className="px-4 py-3 cursor-pointer hover:text-white whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>ID</span>
                      {sortBy === 'report_id' && (
                        <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>

                  {/* Date & Time */}
                  <th
                    onClick={() => handleSortToggle('report_date')}
                    className="px-4 py-3 cursor-pointer hover:text-white whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Date & Time</span>
                      {sortBy === 'report_date' && (
                        <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>

                  {/* Location */}
                  <th
                    onClick={() => handleSortToggle('location')}
                    className="px-4 py-3 cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>Location</span>
                      {sortBy === 'location' && (
                        <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>

                  {/* Crash Type */}
                  <th
                    onClick={() => handleSortToggle('crash_type')}
                    className="px-4 py-3 cursor-pointer hover:text-white whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Type</span>
                      {sortBy === 'crash_type' && (
                        <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>

                  {/* Severity */}
                  <th
                    onClick={() => handleSortToggle('severity')}
                    className="px-4 py-3 cursor-pointer hover:text-white whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Severity</span>
                      {sortBy === 'severity' && (
                        <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>

                  {/* Road Condition */}
                  <th className="px-4 py-3 whitespace-nowrap">Road Condition</th>

                  {/* Status */}
                  <th
                    onClick={() => handleSortToggle('status')}
                    className="px-4 py-3 cursor-pointer hover:text-white whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      {sortBy === 'status' && (
                        <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>

                  {/* Photo Evidence */}
                  <th className="px-4 py-3 whitespace-nowrap text-center">Photo</th>

                  {/* Actions */}
                  <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/80">
                {isFetching && records.length === 0 ? (
                  // Skeleton Loading Rows
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="px-4 py-3.5"><div className="h-4 bg-slate-800 rounded w-10" /></td>
                      <td className="px-4 py-3.5"><div className="h-4 bg-slate-800 rounded w-24" /></td>
                      <td className="px-4 py-3.5"><div className="h-4 bg-slate-800 rounded w-44" /></td>
                      <td className="px-4 py-3.5"><div className="h-4 bg-slate-800 rounded w-20" /></td>
                      <td className="px-4 py-3.5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                      <td className="px-4 py-3.5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                      <td className="px-4 py-3.5"><div className="h-4 bg-slate-800 rounded w-20" /></td>
                      <td className="px-4 py-3.5"><div className="h-4 bg-slate-800 rounded w-8 mx-auto" /></td>
                      <td className="px-4 py-3.5"><div className="h-4 bg-slate-800 rounded w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : records.length === 0 ? (
                  // Empty State
                  <tr>
                    <td colSpan="9" className="px-6 py-12 text-center text-slate-400">
                      <div className="max-w-sm mx-auto space-y-2">
                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-slate-300">No crash reports found</p>
                        <p className="text-xs text-slate-500">
                          No database records matched your search query or filter selection in MySQL.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  // Real MySQL Records
                  records.map((r) => (
                    <tr
                      key={r.report_id}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => setInspectRecord(r)}
                    >
                      {/* ID */}
                      <td className="px-4 py-3 font-mono font-bold text-cyan-400 whitespace-nowrap">
                        #{r.report_id}
                      </td>

                      {/* Date & Time */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-slate-200 font-medium">{r.report_date || '—'}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{r.report_time || '—'}</div>
                      </td>

                      {/* Location & Lat/Lng */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white max-w-xs truncate" title={r.location}>
                          {r.location}
                        </div>
                        {r.latitude && r.longitude ? (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {parseFloat(r.latitude).toFixed(4)}, {parseFloat(r.longitude).toFixed(4)}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-600">No GPS coordinates</div>
                        )}
                      </td>

                      {/* Crash Type */}
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap font-medium">
                        {r.crash_type || 'Accident'}
                      </td>

                      {/* Severity */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderSeverityBadge(r.severity)}
                      </td>

                      {/* Road Condition */}
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {r.road_condition || 'Normal'}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderStatusBadge(r.status)}
                      </td>

                      {/* Photo Thumbnail */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {r.photo_path ? (
                          <div className="inline-block relative w-8 h-8 rounded-lg overflow-hidden border border-slate-700 bg-navy-900 group-hover:border-cyan-400 transition-colors">
                            <img
                              src={getPhotoUrl(r.photo_path)}
                              alt="Crash evidence"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.classList.add('hidden');
                              }}
                            />
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-600">—</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setInspectRecord(r)}
                          className="px-2.5 py-1 rounded-lg bg-navy-900 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition-all"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Footer */}
          <div className="px-4 sm:px-6 py-3.5 bg-navy-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-slate-400">
              Showing{' '}
              <span className="font-semibold text-white">
                {totalRecords > 0 ? (page - 1) * limit + 1 : 0}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-white">
                {Math.min(page * limit, totalRecords)}
              </span>{' '}
              of <span className="font-semibold text-white">{totalRecords}</span> matching records{' '}
              <span className="text-slate-500">({totalDbRecords} total in database)</span>
            </div>

            <div className="flex items-center gap-3">
              {/* Rows Per Page Selector */}
              <div className="flex items-center gap-1.5 text-slate-400">
                <span className="text-[11px]">Rows:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-navy-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>

              {/* Prev / Next Pagination Controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 rounded-lg bg-navy-900 border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
                >
                  Prev
                </button>
                <span className="px-2 py-1 text-slate-400 font-mono text-[11px]">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 rounded-lg bg-navy-900 border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Record Deep Inspection Modal */}
      {inspectRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0b142a] border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            {/* Header */}
            <div className="sticky top-0 bg-[#0b142a]/95 backdrop-blur-md px-6 py-4 border-b border-slate-800 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center justify-center font-bold text-xs font-mono">
                  #{inspectRecord.report_id}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Record Inspection</h3>
                  <span className="text-xs text-slate-400">MySQL Table: <code className="text-cyan-300">crash_reports</code></span>
                </div>
              </div>

              <button
                onClick={() => setInspectRecord(null)}
                className="w-8 h-8 rounded-lg bg-navy-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs">
              {/* Photo Preview if available */}
              {inspectRecord.photo_path && (
                <div className="rounded-xl overflow-hidden border border-slate-700 bg-black/50">
                  <img
                    src={getPhotoUrl(inspectRecord.photo_path)}
                    alt="Crash evidence"
                    className="w-full max-h-72 object-contain bg-black"
                  />
                  <div className="p-2.5 bg-navy-950 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap justify-between gap-2">
                    <span>Evidence File: <code className="text-slate-300">{inspectRecord.photo_path}</code></span>
                    {inspectRecord.captured_at && (
                      <span>Captured: <span className="text-cyan-300">{inspectRecord.captured_at}</span></span>
                    )}
                  </div>
                </div>
              )}

              {/* Grid of Attributes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-navy-950 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Incident Location</span>
                  <div className="text-sm font-bold text-white mt-0.5">{inspectRecord.location}</div>
                  {inspectRecord.latitude && inspectRecord.longitude && (
                    <div className="text-[11px] text-cyan-400 font-mono mt-1">
                      Lat: {inspectRecord.latitude}, Lon: {inspectRecord.longitude}
                    </div>
                  )}
                </div>

                <div className="p-3 bg-navy-950 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Incident Type & Status</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-bold text-white">{inspectRecord.crash_type || 'Accident'}</span>
                    {renderStatusBadge(inspectRecord.status)}
                  </div>
                  <div className="mt-1">{renderSeverityBadge(inspectRecord.severity)}</div>
                </div>

                <div className="p-3 bg-navy-950 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Date & Time Reported</span>
                  <div className="text-xs font-semibold text-slate-200 mt-1">
                    Date: {inspectRecord.report_date || '—'}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    Time: {inspectRecord.report_time || '—'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Created At: {inspectRecord.created_at || '—'}
                  </div>
                </div>

                <div className="p-3 bg-navy-950 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Reporter & Conditions</span>
                  <div className="text-xs font-semibold text-slate-200 mt-1">
                    Reporter: {inspectRecord.reporter_name || 'Anonymous User'} (User ID: {inspectRecord.user_id || 'N/A'})
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Road Condition: <span className="text-slate-300 font-medium">{inspectRecord.road_condition || 'Standard'}</span>
                  </div>
                </div>
              </div>

              {/* Full Description */}
              <div className="p-3.5 bg-navy-950 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                  Full Report Description
                </span>
                <p className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap">
                  {inspectRecord.description || 'No detailed description provided with this submission.'}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-navy-950 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setInspectRecord(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
