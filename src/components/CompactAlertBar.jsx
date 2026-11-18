import React from 'react';

export default function CompactAlertBar({
  incident,
  trafficImpact,
  rerouteData,
  isDrawerOpen,
  onToggleDrawer,
  onFocusOnMap,
  onFindAlternativeRoute,
  onDismiss,
}) {
  if (!incident) return null;

  const isVerified = incident.is_verified;
  const timeStr = incident.report_time || incident.created_at || 'Recently';
  const distAheadStr = incident.distance_ahead_str || (
    incident.distance_ahead_m != null
      ? `${(incident.distance_ahead_m / 1000).toFixed(1)} km ahead`
      : incident.distance_from_route_m != null
      ? `${incident.distance_from_route_m}m from corridor`
      : 'Ahead on route'
  );

  const sevLower = (incident.severity || 'Moderate').toLowerCase();
  const sevBadgeColor = sevLower.includes('high')
    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    : sevLower.includes('low')
    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
    : 'bg-amber-500/20 text-amber-300 border-amber-500/40';

  let trafficText = 'Traffic telemetry monitoring active';
  if (trafficImpact && trafficImpact.description) {
    trafficText = trafficImpact.description;
  }

  const hasAlt = rerouteData && rerouteData.has_alternative;

  return (
    <div
      id="compactAccidentAlert"
      role="alert"
      className="mb-4 bg-navy-900/95 backdrop-blur-md border-2 border-orange-500/70 rounded-2xl p-4 sm:p-5 shadow-2xl shadow-orange-500/15 text-slate-100 animate-fade-in"
    >
      {/* Top Header Row */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-orange-500 shadow-lg shadow-orange-500 animate-ping" />
          <h3 className="text-sm sm:text-base font-black tracking-wide text-orange-400 uppercase">
            ACCIDENT REPORTED AHEAD
          </h3>
        </div>

        <button
          id="btnDismissCompactAlert"
          type="button"
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Dismiss warning card"
          aria-label="Dismiss warning card"
        >
          ✕
        </button>
      </div>

      {/* Main Details */}
      <div className="space-y-1.5 mb-3.5">
        <div className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
          <span className="text-orange-400">📍</span>
          <span id="compactAlertLoc">{incident.location || 'Monitored Bengaluru Corridor'}</span>
        </div>

        <p id="compactAlertDesc" className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          {incident.description || 'Vehicle collision reported along the corridor; travel may be affected.'}
        </p>
      </div>

      {/* Metadata Badges Grid */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-[11px]">
        {/* Type & Severity Badge */}
        <span className={`px-2.5 py-1 rounded-lg font-bold border ${sevBadgeColor}`}>
          {incident.crash_type || 'Vehicle Collision'} • {incident.severity || 'Moderate'}
        </span>

        {/* Verification Status Badge */}
        <span
          id="compactAlertStatus"
          className={`px-2.5 py-1 rounded-lg font-bold border ${
            isVerified
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
              : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
          }`}
        >
          {isVerified ? '✓ Verified Official Incident' : '⚠ Unverified Community Report'}
        </span>

        {/* Distance Ahead Badge */}
        <span className="px-2.5 py-1 rounded-lg font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/35 flex items-center gap-1">
          <span>📏</span>
          <span>{distAheadStr}</span>
        </span>

        {/* Reported Time Badge */}
        <span className="px-2.5 py-1 rounded-lg font-semibold bg-slate-800 text-slate-300 border border-slate-700">
          🕒 Reported {timeStr}
        </span>
      </div>

      {/* Traffic Impact Note */}
      <div className="bg-navy-950/80 px-3 py-2 rounded-xl border border-slate-800 text-xs text-slate-300 mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 truncate">
          <span className="text-xs">🚦</span>
          <span className="truncate">{trafficText}</span>
        </div>
        {hasAlt && rerouteData.time_saved_mins > 0 && (
          <span className="text-emerald-400 font-bold shrink-0 text-[11px]">
            ⚡ Save ~{Math.round(rerouteData.time_saved_mins)} mins via bypass
          </span>
        )}
      </div>

      {/* Action Buttons Row */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
        <button
          id="btnFocusIncidentOnMap"
          type="button"
          onClick={onFocusOnMap}
          className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white shadow-md shadow-orange-600/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-95 cursor-pointer"
        >
          <span>📍</span>
          <span>View on Map</span>
        </button>

        <button
          id="btnFindAlternativeRoute"
          type="button"
          onClick={onFindAlternativeRoute}
          className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-md shadow-cyan-600/25 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-95 cursor-pointer"
        >
          <span>🔀</span>
          <span>Find Alternative Route</span>
        </button>

        <button
          id="btnToggleIncidentDetails"
          type="button"
          onClick={onToggleDrawer}
          className="py-2.5 px-3 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <span>Details</span>
          <span className="text-[10px]">{isDrawerOpen ? '▲' : '▼'}</span>
        </button>
      </div>
    </div>
  );
}
