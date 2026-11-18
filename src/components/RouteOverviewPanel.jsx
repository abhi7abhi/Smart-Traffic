import React from 'react';

export default function RouteOverviewPanel({
  routeData,
  rerouteData,
  activeRouteType, // 'original' or 'alternative'
  onSelectOriginal,
  onSelectAlternative,
  trafficMode = 'live',
  trafficTelemetry = null,
}) {
  const hasAlternative = rerouteData && rerouteData.has_alternative;

  const origDist = routeData ? `${routeData.distanceKm} km` : '-- km';
  const origEta = routeData ? `${routeData.durationMins} mins` : '-- mins';

  let origTraffic = 'Standard Route';
  let trafficDotColor = 'bg-blue-400';

  if (trafficMode === 'live') {
    if (trafficTelemetry && trafficTelemetry.status === 'live') {
      const cond = trafficTelemetry.overall_condition || 'Light';
      const speed = Math.round(trafficTelemetry.average_current_speed || 0);
      origTraffic = `${cond} Traffic (${speed} km/h)`;
      trafficDotColor = cond === 'Heavy' ? 'bg-rose-500' : cond === 'Moderate' ? 'bg-amber-400' : 'bg-emerald-400';
    } else {
      origTraffic = 'Live Traffic Unavailable';
      trafficDotColor = 'bg-slate-500';
    }
  } else {
    // Historical mode
    if (trafficTelemetry && trafficTelemetry.segments) {
      const matched = trafficTelemetry.segments.filter((s) => !s.unmatched).length;
      origTraffic = `Historical (${matched} Corridors Matched)`;
      trafficDotColor = 'bg-blue-400';
    } else {
      origTraffic = 'Historical Unavailable';
      trafficDotColor = 'bg-slate-500';
    }
  }

  const altDist = hasAlternative ? `${rerouteData.distance_km} km` : '-- km';
  const altEta = hasAlternative ? `${rerouteData.duration_mins} mins` : '-- mins';

  let altSavingText = 'Analyzing incidents & detours...';
  let altSavingColor = 'text-slate-400';
  if (hasAlternative) {
    if (rerouteData.time_saved_mins > 0) {
      altSavingText = `⚡ Save ~${Math.round(rerouteData.time_saved_mins)} mins`;
      altSavingColor = 'text-emerald-400 font-bold';
    } else {
      const extra = Math.round(rerouteData.duration_mins - (routeData ? routeData.durationMins : 0));
      altSavingText = extra > 0 ? `Detour adds +${extra} mins` : 'Similar ETA (0 min diff)';
      altSavingColor = 'text-slate-400';
    }
  } else if (rerouteData && !hasAlternative) {
    altSavingText = 'No detour needed / available';
  }

  const advisoryText = (rerouteData && rerouteData.reason)
    ? rerouteData.reason
    : (hasAlternative
      ? 'Alternative bypass route calculated avoiding affected corridor section.'
      : 'Planned corridor is clear of active accident reports. Original route is optimal.');

  const isOrigActive = activeRouteType === 'original';
  const isAltActive = activeRouteType === 'alternative';

  return (
    <div 
      id="routeOverviewPanel" 
      className="bg-navy-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl mb-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 block">
            ROUTING INTELLIGENCE
          </span>
          <h3 className="text-base font-bold text-white leading-tight">Route Overview</h3>
        </div>
        <span 
          id="overviewActiveTag"
          className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border ${
            isAltActive
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/20'
              : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
          }`}
        >
          {isAltActive ? 'Alternative Active' : 'Original Active'}
        </span>
      </div>

      {/* Comparison Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        
        {/* Option 1: Original Route Card */}
        <div
          id="routeCardOriginal"
          onClick={onSelectOriginal}
          className={`cursor-pointer rounded-xl p-3.5 border transition-all ${
            isOrigActive
              ? 'active-card bg-blue-600/15 border-blue-500 shadow-glow-blue'
              : 'bg-navy-950/70 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-blue-600 text-white text-xs font-black flex items-center justify-center">
                1
              </span>
              <strong className="text-xs font-bold text-white">Original Route</strong>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
              Current
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-left mb-2">
            <div>
              <span id="rcOrigDist" className="text-sm font-bold text-white block">
                {origDist}
              </span>
              <span className="text-[10px] text-slate-400 uppercase">Distance</span>
            </div>
            <div>
              <span id="rcOrigEta" className="text-sm font-bold text-purple-400 block">
                {origEta}
              </span>
              <span className="text-[10px] text-slate-400 uppercase">Travel Time</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
            <span className={`w-2 h-2 rounded-full ${trafficDotColor}`} />
            <span id="rcOrigTrafficText" className="truncate">{origTraffic}</span>
          </div>
        </div>

        {/* Option 2: Alternative Route Card */}
        <div
          id="routeCardAlternative"
          onClick={hasAlternative ? onSelectAlternative : undefined}
          className={`rounded-xl p-3.5 border transition-all ${
            !hasAlternative
              ? 'opacity-60 bg-navy-950/40 border-slate-800/60 cursor-not-allowed'
              : isAltActive
              ? 'active-card bg-cyan-600/15 border-cyan-500 shadow-glow-cyan cursor-pointer'
              : 'bg-navy-950/70 border-slate-800 hover:border-cyan-500/50 cursor-pointer'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-cyan-600 text-white text-xs font-black flex items-center justify-center">
                2
              </span>
              <strong className="text-xs font-bold text-white">Alternative Route</strong>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold">
              Bypass Detour
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-left mb-2">
            <div>
              <span id="rcAltDist" className="text-sm font-bold text-cyan-400 block">
                {altDist}
              </span>
              <span className="text-[10px] text-slate-400 uppercase">Distance</span>
            </div>
            <div>
              <span id="rcAltEta" className="text-sm font-bold text-cyan-400 block">
                {altEta}
              </span>
              <span className="text-[10px] text-slate-400 uppercase">Travel Time</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs pt-2 border-t border-slate-800/80">
            <span className={`text-xs ${altSavingColor}`} id="rcAltSavingText">
              {altSavingText}
            </span>
          </div>
        </div>

      </div>

      {/* Prominent Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
        <button
          id="btnUseAlternateRoute"
          type="button"
          disabled={!hasAlternative}
          onClick={onSelectAlternative}
          className={`btn-prominent-alternate flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider text-white shadow-lg flex items-center justify-center gap-2 transition-all ${
            hasAlternative
              ? 'bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:brightness-110 shadow-blue-600/30 hover:scale-[1.01] active:scale-95'
              : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
          }`}
          title="Switch to the alternative bypass route"
        >
          <span>🔀</span>
          <span>Use alternate route</span>
        </button>

        <button
          id="btnKeepCurrentRoute"
          type="button"
          onClick={onSelectOriginal}
          className="btn-keep-current py-3 px-4 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-colors"
          title="Continue using current planned route"
        >
          Keep current route
        </button>
      </div>

      {/* Advisory Note */}
      <div className="bg-navy-950 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 flex items-start gap-2">
        <span className="text-blue-400 shrink-0">ℹ️</span>
        <span id="rerouteAdvisoryText">{advisoryText}</span>
      </div>

    </div>
  );
}
