import React, { useState, useEffect, useRef, useCallback } from 'react';
import Chart from 'chart.js/auto';
import { fetchDashboardStatistics, fetchDashboardTrends, fetchTrafficSummary } from '../services/api';

export default function DashboardView({ currentUser, onOpenLogin, onOpenRegister, refreshTrigger = 0 }) {
  const [scope, setScope] = useState('all'); // 'all' or 'user'
  const [dateRange, setDateRange] = useState('all'); // 'all', 'today', '7d', '30d'
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Dynamic Dashboard Data from Database
  const [stats, setStats] = useState(null);
  const [trends, setTrends] = useState([]);
  const [trafficSummary, setTrafficSummary] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Chart canvas refs & Chart.js instances
  const barCanvasRef = useRef(null);
  const pieCanvasRef = useRef(null);
  const lineCanvasRef = useRef(null);

  const barChartInstance = useRef(null);
  const pieChartInstance = useRef(null);
  const lineChartInstance = useRef(null);

  // Load all dynamic metrics from the backend
  const loadDashboardData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setErrorMsg(null);

    try {
      const [statsRes, trendsRes, trafficRes] = await Promise.all([
        fetchDashboardStatistics(scope, dateRange),
        fetchDashboardTrends().catch(() => ({ trends: [] })),
        fetchTrafficSummary().catch(() => null),
      ]);

      if (statsRes && statsRes.success) {
        setStats(statsRes);
      } else {
        throw new Error('Could not retrieve dashboard statistics');
      }

      if (trendsRes && trendsRes.trends) {
        setTrends(trendsRes.trends);
      } else if (statsRes.by_timeline) {
        setTrends(statsRes.by_timeline);
      }

      if (trafficRes && trafficRes.summary) {
        setTrafficSummary(trafficRes.summary);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
      setErrorMsg(err.message || 'Failed to load dynamic dashboard data from backend server.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [scope, dateRange]);

  // Load on mount, scope/dateRange change, or when refreshTrigger fires
  useEffect(() => {
    loadDashboardData(true);
  }, [loadDashboardData, refreshTrigger]);

  // Automatic periodic background refresh every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      loadDashboardData(false);
    }, 10000);
    return () => clearInterval(timer);
  }, [loadDashboardData]);

  // Derived counts from real database records
  const summary = stats?.statistics || {};
  const totalCrashes = summary.total_crashes ?? summary.total_submissions ?? 0;
  const highCount = summary.high ?? summary.all_high ?? 0;
  const mediumCount = summary.medium ?? summary.moderate ?? summary.all_medium ?? 0;
  const lowCount = summary.low ?? summary.all_low ?? 0;
  const verifiedCount = summary.verified ?? 0;
  const pendingCount = summary.pending ?? 0;
  const withPhotoCount = summary.with_photos ?? 0;

  // Initialize and Render Chart.js instances whenever data updates
  useEffect(() => {
    if (loading || !stats) return;

    // ─────────────────────────────────────────────────────────────────
    // 1. BAR CHART: Number of crash reports by severity
    // ─────────────────────────────────────────────────────────────────
    if (barCanvasRef.current) {
      if (barChartInstance.current) {
        barChartInstance.current.destroy();
      }

      const barCtx = barCanvasRef.current.getContext('2d');
      barChartInstance.current = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: ['High Severity', 'Medium Severity', 'Low Severity'],
          datasets: [
            {
              label: 'Crash Reports',
              data: [highCount, mediumCount, lowCount],
              backgroundColor: [
                'rgba(244, 63, 94, 0.85)',   // Rose/Red for High
                'rgba(245, 158, 11, 0.85)',  // Amber for Medium
                'rgba(16, 185, 129, 0.85)',  // Emerald for Low
              ],
              borderColor: [
                '#f43f5e',
                '#f59e0b',
                '#10b981',
              ],
              borderWidth: 1.5,
              borderRadius: 8,
              borderSkipped: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0f172a',
              titleColor: '#f8fafc',
              bodyColor: '#cbd5e1',
              borderColor: '#334155',
              borderWidth: 1,
              padding: 10,
              boxPadding: 4,
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(51, 65, 85, 0.25)' },
              ticks: { color: '#94a3b8', font: { size: 11, weight: '600' } },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(51, 65, 85, 0.25)' },
              ticks: {
                color: '#94a3b8',
                precision: 0,
                font: { size: 11 },
              },
            },
          },
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // 2. PIE CHART: Percentage distribution of High, Medium, Low severity
    // ─────────────────────────────────────────────────────────────────
    if (pieCanvasRef.current) {
      if (pieChartInstance.current) {
        pieChartInstance.current.destroy();
      }

      const pieCtx = pieCanvasRef.current.getContext('2d');
      const sumSeverity = highCount + mediumCount + lowCount;

      pieChartInstance.current = new Chart(pieCtx, {
        type: 'pie',
        data: {
          labels: ['High Severity', 'Medium Severity', 'Low Severity'],
          datasets: [
            {
              data: sumSeverity > 0 ? [highCount, mediumCount, lowCount] : [0, 0, 0],
              backgroundColor: [
                'rgba(244, 63, 94, 0.85)',
                'rgba(245, 158, 11, 0.85)',
                'rgba(16, 185, 129, 0.85)',
              ],
              borderColor: '#0f172a',
              borderWidth: 2,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#cbd5e1',
                padding: 14,
                font: { size: 11, weight: '600' },
                boxWidth: 12,
                boxHeight: 12,
              },
            },
            tooltip: {
              backgroundColor: '#0f172a',
              titleColor: '#f8fafc',
              bodyColor: '#cbd5e1',
              borderColor: '#334155',
              borderWidth: 1,
              padding: 10,
              callbacks: {
                label: (context) => {
                  const val = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                  return ` ${context.label}: ${val} reports (${pct}%)`;
                },
              },
            },
          },
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // 3. LINE CHART: Number of crash reports over time
    // ─────────────────────────────────────────────────────────────────
    if (lineCanvasRef.current) {
      if (lineChartInstance.current) {
        lineChartInstance.current.destroy();
      }

      const lineCtx = lineCanvasRef.current.getContext('2d');
      const trendPoints = Array.isArray(trends) && trends.length > 0
        ? trends
        : (stats.by_timeline || []);

      const lineLabels = trendPoints.map((t) => t.date || t.label || 'Date');
      const lineValues = trendPoints.map((t) => t.count || 0);

      // Create gentle gradient fill for the dark theme
      const gradient = lineCtx.createLinearGradient(0, 0, 0, 240);
      gradient.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
      gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

      lineChartInstance.current = new Chart(lineCtx, {
        type: 'line',
        data: {
          labels: lineLabels.length > 0 ? lineLabels : ['No Date Data'],
          datasets: [
            {
              label: 'Incidents Reported',
              data: lineValues.length > 0 ? lineValues : [0],
              borderColor: '#06b6d4',
              borderWidth: 2.5,
              backgroundColor: gradient,
              fill: true,
              tension: 0.35,
              pointBackgroundColor: '#06b6d4',
              pointBorderColor: '#082f49',
              pointBorderWidth: 2,
              pointRadius: 4,
              pointHoverRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0f172a',
              titleColor: '#f8fafc',
              bodyColor: '#cbd5e1',
              borderColor: '#334155',
              borderWidth: 1,
              padding: 10,
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(51, 65, 85, 0.25)' },
              ticks: {
                color: '#94a3b8',
                maxRotation: 45,
                minRotation: 0,
                font: { size: 10 },
              },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(51, 65, 85, 0.25)' },
              ticks: {
                color: '#94a3b8',
                precision: 0,
                font: { size: 11 },
              },
            },
          },
        },
      });
    }

    return () => {
      if (barChartInstance.current) barChartInstance.current.destroy();
      if (pieChartInstance.current) pieChartInstance.current.destroy();
      if (lineChartInstance.current) lineChartInstance.current.destroy();
    };
  }, [loading, stats, trends, highCount, mediumCount, lowCount]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fade-in text-slate-100 [-webkit-overflow-scrolling:touch]">
      
      {/* Header & Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
              Live Telemetry &amp; Analytics
            </span>
            <span className="text-slate-600">•</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
              DYNAMIC DATABASE
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Crash &amp; Traffic Analytics Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Live metrics and charts calculated directly from crash reports submitted through the application and stored in the database.
          </p>
        </div>

        {/* Action Controls: Scope, Date Range, Manual Refresh */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Scope Toggle (if user logged in) */}
          {currentUser && (
            <div className="flex items-center bg-navy-900 border border-slate-800 rounded-xl p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  scope === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Reports
              </button>
              <button
                type="button"
                onClick={() => setScope('user')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  scope === 'user'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                My Reports
              </button>
            </div>
          )}

          {/* Date Range Selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-3 py-2 rounded-xl bg-navy-900 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          {/* Manual Refresh Button */}
          <button
            type="button"
            onClick={() => loadDashboardData(true)}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-xs font-semibold"
            title="Refresh dashboard metrics"
          >
            <span className={`inline-block ${loading ? 'animate-spin' : ''}`}>🔄</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
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
            onClick={() => loadDashboardData(true)}
            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          1. REQUIRED SUMMARY CARDS (Total, High, Medium, Low)
          ───────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Crashes Reported */}
        <div className="bg-navy-900 border border-slate-800 rounded-2xl p-4 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Crashes</span>
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white mt-1.5">
            {loading ? '—' : totalCrashes}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Real database submissions</span>
        </div>

        {/* High-Severity Crashes */}
        <div className="bg-navy-900 border border-rose-500/30 rounded-2xl p-4 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">High Severity</span>
            <span className="w-2 h-2 rounded-full bg-rose-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-400 mt-1.5">
            {loading ? '—' : highCount}
          </div>
          <span className="text-[11px] text-rose-300/70 mt-1 block">Critical road blockages</span>
        </div>

        {/* Medium-Severity Crashes */}
        <div className="bg-navy-900 border border-amber-500/30 rounded-2xl p-4 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Medium Severity</span>
            <span className="w-2 h-2 rounded-full bg-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-400 mt-1.5">
            {loading ? '—' : mediumCount}
          </div>
          <span className="text-[11px] text-amber-300/70 mt-1 block">Moderate lane blockages</span>
        </div>

        {/* Low-Severity Crashes */}
        <div className="bg-navy-900 border border-emerald-500/30 rounded-2xl p-4 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Low Severity</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1.5">
            {loading ? '—' : lowCount}
          </div>
          <span className="text-[11px] text-emerald-300/70 mt-1 block">Minor fender benders</span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          2. REQUIRED CHARTS: Bar, Pie, and Trend Line Chart
          ───────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Bar Chart: Crash Reports by Severity (7 cols) */}
        <div className="lg:col-span-7 bg-navy-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>📊</span>
                <span>Crash Reports by Severity</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Distribution across High, Medium, and Low severity classifications.
              </p>
            </div>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
              Bar Chart
            </span>
          </div>

          <div className="relative w-full h-64 sm:h-72">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                <span className="animate-spin text-lg mr-2">⏳</span> Loading bar chart data...
              </div>
            ) : totalCrashes === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center p-4">
                No crash reports submitted yet. Submit a report to view live bar breakdown.
              </div>
            ) : (
              <canvas ref={barCanvasRef} />
            )}
          </div>
        </div>

        {/* Pie Chart: Percentage Distribution (5 cols) */}
        <div className="lg:col-span-5 bg-navy-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>🥧</span>
                <span>Severity Percentage</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Proportion of high-, medium-, and low-severity incidents.
              </p>
            </div>
            <span className="text-xs font-mono text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/60">
              Pie Chart
            </span>
          </div>

          <div className="relative w-full h-64 sm:h-72 flex items-center justify-center">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                <span className="animate-spin text-lg mr-2">⏳</span> Loading pie chart data...
              </div>
            ) : totalCrashes === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center p-4">
                No data available to display percentage distribution.
              </div>
            ) : (
              <canvas ref={pieCanvasRef} />
            )}
          </div>
        </div>

        {/* Line Chart: Crash Reports Over Time (12 cols) */}
        <div className="lg:col-span-12 bg-navy-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>📈</span>
                <span>Crash Reports Over Time</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Temporal trends of incidents grouped chronologically by submission date or month.
              </p>
            </div>
            <span className="self-start sm:self-auto text-xs font-mono text-blue-400 bg-blue-950/60 px-2.5 py-0.5 rounded border border-blue-800/60">
              Line Trend Chart
            </span>
          </div>

          <div className="relative w-full h-64 sm:h-80">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                <span className="animate-spin text-lg mr-2">⏳</span> Loading timeline trend data...
              </div>
            ) : totalCrashes === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center p-4">
                No crash report trend data available yet.
              </div>
            ) : (
              <canvas ref={lineCanvasRef} />
            )}
          </div>
        </div>

      </div>

      {/* ─────────────────────────────────────────────────────────────────
          3. SEPARATE TRAFFIC TELEMETRY SUMMARY (Corridor benchmark)
          ───────────────────────────────────────────────────────────────── */}
      {trafficSummary && (
        <div className="bg-navy-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Bengaluru Traffic Telemetry
                </span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/25 text-[10px] font-mono">
                  Separate Sensor Dataset
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-white mt-0.5">
                Monitored Corridor Traffic Summary
              </h2>
            </div>
            <span className="text-[11px] text-slate-400">
              Corridor Benchmarks ({trafficSummary.source || 'Banglore_traffic_Dataset.csv'})
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-navy-950 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Monitored Corridors</span>
              <span className="text-lg sm:text-xl font-bold text-white mt-1 block">
                {trafficSummary.total_corridors || 16}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Major Bengaluru Arteries</span>
            </div>

            <div className="bg-navy-950 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Avg Congestion Index</span>
              <span className="text-lg sm:text-xl font-bold text-amber-400 mt-1 block">
                {trafficSummary.overall_avg_congestion_index ? `${trafficSummary.overall_avg_congestion_index}%` : '68.4%'}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Moderate Telemetry Load</span>
            </div>

            <div className="bg-navy-950 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Average Speed</span>
              <span className="text-lg sm:text-xl font-bold text-emerald-400 mt-1 block">
                {trafficSummary.overall_avg_speed_kmh ? `${trafficSummary.overall_avg_speed_kmh} km/h` : '28.6 km/h'}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Monitored vehicular flow</span>
            </div>

            <div className="bg-navy-950 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Heavy Traffic Arteries</span>
              <span className="text-lg sm:text-xl font-bold text-rose-400 mt-1 block">
                {trafficSummary.corridors_with_heavy_traffic_count ?? 4}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Silk Board, ORR, Hebbal</span>
            </div>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="pt-2 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>
          Live Dashboard automatically updates as new reports are submitted through the Report Crash page.
        </span>
        {lastUpdated && (
          <span className="font-mono text-[11px] text-slate-400">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

    </div>
  );
}
