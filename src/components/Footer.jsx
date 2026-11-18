import React from 'react';

export default function Footer({ onNavigate }) {
  return (
    <footer className="bg-[#070d1e] border-t border-slate-800/80 text-slate-400 py-12 px-4 sm:px-6 lg:px-8 select-none">
      <div className="max-w-7xl mx-auto">
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-slate-800/60">
          
          {/* Brand Info */}
          <div className="md:col-span-2 space-y-3">
            <div 
              onClick={() => onNavigate && onNavigate('page-home')}
              className="inline-flex items-center gap-3 cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-xl bg-[#0b142a] border border-blue-500/30 flex items-center justify-center relative overflow-hidden group-hover:border-blue-400 transition-colors">
                <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" fill="rgba(6, 182, 212, 0.15)" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                <div className="absolute w-2 h-2 rounded-full bg-rose-500 border border-white" />
              </div>
              <div>
                <span className="text-white font-bold text-base block leading-tight">Smart Traffic</span>
                <span className="text-[11px] text-slate-400 block -mt-0.5">Bengaluru City Network</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Real-time traffic telemetry, community incident reporting with mandatory camera validation, and intelligent OSRM detour bypass routing.
            </p>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Bengaluru Telemetry Active</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Navigation</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('page-home')}
                  className="hover:text-blue-400 transition-colors"
                >
                  Home
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('page-crash-data')}
                  className="hover:text-blue-400 transition-colors"
                >
                  Crash Data
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('page-route')}
                  className="hover:text-blue-400 transition-colors"
                >
                  Route &amp; Map
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('page-report-crash')}
                  className="hover:text-blue-400 transition-colors"
                >
                  Report Crash
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('page-dashboard')}
                  className="hover:text-blue-400 transition-colors"
                >
                  Dashboard
                </button>
              </li>
            </ul>
          </div>

          {/* Corridor Monitoring */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Major Corridors</h4>
            <ul className="space-y-1.5 text-[11px] text-slate-400">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Outer Ring Road (ORR)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span>Central Silk Board</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Hebbal Flyover to Airport</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>Hosur Road &amp; Electronic City</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span>Old Airport Road / Whitefield</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            &copy; 2026 Smart Crash &amp; Traffic Management System. Built with React &amp; Tailwind CSS.
          </div>
          <div className="text-[11px] text-slate-500">
            OpenStreetMap &amp; OSRM routing &bull; Leaflet GIS engine
          </div>
        </div>

      </div>
    </footer>
  );
}
