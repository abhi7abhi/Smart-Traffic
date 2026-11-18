import React, { useState } from 'react';

export default function CollapsibleDirections({ directions }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const steps = directions || [];

  return (
    <div id="collapsibleDirectionsCard" className="bg-navy-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden mb-4">
      {/* Accordion Toggle Header */}
      <button
        id="btnAccordionDirections"
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">🧭</span>
          <span className="text-sm font-bold text-white">Turn-by-Turn Directions</span>
          <span id="stepsCountBadge" className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
            {steps.length} steps
          </span>
        </div>
        <span id="directionsChevronIcon" className="text-xs text-slate-400 font-bold transition-transform">
          {isExpanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Accordion Body */}
      {isExpanded && (
        <div id="directionsAccordionBody" className="px-5 pb-5 pt-1 border-t border-slate-800/80 max-h-96 overflow-y-auto">
          <ul id="turnDirectionsList" className="space-y-3">
            {steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-3 text-xs text-slate-300">
                <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 shrink-0 text-xs">
                  {step.icon}
                </span>
                <div className="flex-1 pt-0.5">
                  <div className="font-semibold text-white">{step.text}</div>
                  <div className="text-[10px] text-slate-400">{step.dist}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
