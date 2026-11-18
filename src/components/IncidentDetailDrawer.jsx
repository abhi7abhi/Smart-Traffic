import React from 'react';

export default function IncidentDetailDrawer({ incident, isOpen, onFocusOnMap }) {
  if (!isOpen || !incident) return null;

  const sevLower = (incident.severity || '').toLowerCase();
  const sevColor = sevLower.includes('high')
    ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
    : sevLower.includes('low')
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : 'text-amber-400 bg-amber-500/10 border-amber-500/30';

  const photoUrl = incident.photo_path ? `/api/photos/${incident.photo_path}` : null;

  return (
    <div
      id="incidentDetailDrawer"
      className="mb-4 bg-navy-900 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl text-slate-200 animate-fade-in"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3.5">
        <div className="bg-navy-950 p-2.5 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-0.5">
            Incident Type
          </span>
          <span id="drawerIncidentType" className="font-bold text-white">
            {incident.crash_type || 'Vehicle Incident'}
          </span>
        </div>

        <div className="bg-navy-950 p-2.5 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-0.5">
            Severity
          </span>
          <span id="drawerSeverity" className={`font-bold px-1.5 py-0.5 rounded border inline-block text-[11px] ${sevColor}`}>
            {(incident.severity || 'Moderate')} Severity
          </span>
        </div>

        <div className="bg-navy-950 p-2.5 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-0.5">
            Road Surface
          </span>
          <span id="drawerRoadCondition" className="font-bold text-white">
            {incident.weather_road_condition || incident.road_condition || 'Normal Surface'}
          </span>
        </div>

        <div className="bg-navy-950 p-2.5 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-0.5">
            Distance from Route
          </span>
          <span id="drawerDistance" className="font-bold text-cyan-400">
            {incident.distance_from_route_m != null ? `${incident.distance_from_route_m} meters` : 'Along Corridor'}
          </span>
        </div>
      </div>

      <div className="bg-navy-950 p-3 rounded-xl border border-slate-800 mb-3.5 text-xs">
        <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-1">
          Incident Description & Verification Status
        </span>
        <p id="drawerDescription" className="text-slate-300 leading-relaxed">
          {incident.description || 'Active incident reported along road corridor.'}
          {incident.user_id && <span className="text-slate-500 ml-2">• Reported by User #{incident.user_id}</span>}
        </p>

        {photoUrl && (
          <div className="mt-3">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-1">
              Captured Scene Evidence
            </span>
            <div className="w-32 h-24 rounded-lg overflow-hidden border border-slate-700 bg-black">
              <img src={photoUrl} alt="Crash evidence" className="w-full h-full object-cover" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end">
        <button
          id="btnFocusIncidentOnMap"
          type="button"
          onClick={onFocusOnMap}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white shadow-md shadow-orange-600/30 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span>📍</span>
          <span>Focus Incident on Map</span>
        </button>
      </div>
    </div>
  );
}
