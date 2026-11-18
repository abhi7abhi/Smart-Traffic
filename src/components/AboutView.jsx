import React, { useState } from 'react';
import { KNOWN_LOCATIONS } from '../services/osrm';

export default function AboutView({
  currentUser,
  onPlanRoute,
  onNavigate,
  onOpenLogin,
  onOpenRegister,
}) {
  // ── State for Interactive Sections ──────────────────────────────────────────
  const [selectedAudience, setSelectedAudience] = useState(0); // 0: Commuters, 1: Drivers, 2: Reporters, 3: Researchers
  const [journeyStep, setJourneyStep] = useState(0); // 0, 1, 2
  const [previewFrom, setPreviewFrom] = useState('Hebbal, Bengaluru');
  const [previewTo, setPreviewTo] = useState('Electronic City, Bengaluru');
  const [previewError, setPreviewError] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState(0); // 0th FAQ open by default

  // ── Smooth Scroll Helper ───────────────────────────────────────────────────
  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // ── Route Preview Submit Handler ───────────────────────────────────────────
  const handlePreviewSubmit = (e) => {
    e.preventDefault();
    setPreviewError('');

    if (!previewFrom.trim() || !previewTo.trim()) {
      setPreviewError('Please specify both a starting point and a destination.');
      return;
    }

    if (onPlanRoute) {
      onPlanRoute(previewFrom.trim(), previewTo.trim());
    } else if (onNavigate) {
      onNavigate('page-route');
    }
  };

  const handleSwapPreview = () => {
    const tmp = previewFrom;
    setPreviewFrom(previewTo);
    setPreviewTo(tmp);
  };

  // ── Audience Data ──────────────────────────────────────────────────────────
  const audiences = [
    {
      id: 'commuters',
      title: 'Daily Commuters',
      badge: 'Peak Hour Routing',
      icon: (
        <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      shortDesc: 'Anticipate arterial bottlenecks and save minutes during morning and evening rush hours.',
      detail:
        'Daily travel across Bengaluru corridors like Outer Ring Road, Hebbal Flyover, and Central Silk Board is prone to rapid congestion shifts. Smart Traffic helps commuters inspect road-level delays, view incident alerts along their path, and preview estimated travel times before heading out.',
      actionLabel: 'Open Route & Map',
      actionHandler: () => {
        if (onPlanRoute) onPlanRoute('Hebbal, Bengaluru', 'Electronic City, Bengaluru');
        else if (onNavigate) onNavigate('page-route');
      },
    },
    {
      id: 'drivers',
      title: 'Drivers & Road Users',
      badge: 'Detour Intelligence',
      icon: (
        <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
      shortDesc: 'Stay informed of active road incidents and sudden bottlenecks along your driving corridor.',
      detail:
        'When an incident occurs within 800 meters of your planned route, the platform automatically flags the affected road segment and calculates viable alternative bypass corridors. Drivers can compare distance, estimated travel time, and time saved to choose the safest path.',
      actionLabel: 'Explore Detour Planning',
      actionHandler: () => {
        if (onPlanRoute) onPlanRoute('Hebbal, Bengaluru', 'Electronic City, Bengaluru');
        else if (onNavigate) onNavigate('page-route');
      },
    },
    {
      id: 'reporters',
      title: 'Incident Reporters',
      badge: 'Camera Verification',
      icon: (
        <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      shortDesc: 'Contribute verified on-scene incident reports to alert fellow drivers across Bengaluru.',
      detail:
        'To prevent false alarms and ensure community accountability, incident reporting requires an authenticated account and mandatory in-app camera capture with device coordinates. New reports are labeled "Pending Verification" until confirmed, ensuring reliable public hazard awareness.',
      actionLabel: currentUser ? 'Report an Incident' : 'Sign In to Report',
      actionHandler: () => {
        if (currentUser) {
          if (onNavigate) onNavigate('page-report-crash');
        } else {
          if (onOpenLogin) onOpenLogin();
        }
      },
    },
    {
      id: 'researchers',
      title: 'Traffic & Safety Researchers',
      badge: 'Corridor Analytics',
      icon: (
        <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      shortDesc: 'Analyze corridor congestion patterns, historical speed data, and incident distributions.',
      detail:
        'The application integrates benchmark data across 45+ monitored Bengaluru travel corridors, including congestion indices (Heavy ≥80%, Moderate 60-79%, Light <60%), historical speed metrics, and authenticated user submission trends in the dynamic analytics dashboard.',
      actionLabel: 'Open Incident Dashboard',
      actionHandler: () => {
        if (onNavigate) onNavigate('page-dashboard');
      },
    },
  ];

  // ── Journey Steps Data ─────────────────────────────────────────────────────
  const steps = [
    {
      step: 1,
      title: 'Plan Your Journey',
      summary: 'Enter origin and destination coordinates across Bengaluru.',
      body:
        'Specify any two points across the Bengaluru metropolitan network. The system requests accurate road geometry from the Open Source Routing Machine (OSRM), avoiding straight-line approximations and following actual arterial streets, flyovers, and junctions.',
      bullets: [
        'Real road network geometry derived from OpenStreetMap data.',
        'Immediate calculation of total corridor distance and base travel time.',
        'Accessible presets for major transit hubs (Hebbal, Silk Board, Whitefield, Majestic).',
      ],
      tag: 'OSRM Route Geometry',
    },
    {
      step: 2,
      title: 'Review Traffic & Incident Telemetry',
      summary: 'Inspect road speed indices and reports within an 800-meter buffer.',
      body:
        'The engine cross-references your planned path with the active incident database and corridor speed metrics. Incidents within 800 meters are evaluated by report age and verification status (Verified Official vs. Reported • Pending Verification), alerting you before you enter gridlock.',
      bullets: [
        'Spatial buffer analysis identifies incidents actually affecting your travel lanes.',
        'Clear distinction between official police-verified collisions and citizen reports.',
        'Color-coded corridor congestion indicators (Red Heavy, Yellow Moderate, Green Light).',
      ],
      tag: 'Spatial Incident Radar',
    },
    {
      step: 3,
      title: 'Compare Available Alternative Routes',
      summary: 'Evaluate bypass detours, ETA differences, and time savings.',
      body:
        'If a severe blockage or high-impact incident is detected, the rerouting engine searches for an alternative road bypass. Drivers can review side-by-side comparison cards showing distances, ETAs, and estimated minutes saved, switching to the alternative route with a single click.',
      bullets: [
        'Objective time-saving comparisons based on available road data.',
        'High-contrast dashed detour polylines rendered directly on the Leaflet map.',
        'Prominent "Use Alternate Route" and "Keep Current Route" controls.',
      ],
      tag: 'Intelligent Rerouting',
    },
  ];

  // ── FAQ Data ───────────────────────────────────────────────────────────────
  const faqs = [
    {
      question: 'What is Smart Traffic?',
      answer:
        'Smart Traffic is an urban traffic intelligence and incident-aware routing platform engineered specifically for Bengaluru road users. It combines real road geometry via OSRM, citizen-reported incident radar, and automated detour calculations to help commuters avoid gridlock.',
    },
    {
      question: 'Who can use it?',
      answer:
        'Anyone traveling in Bengaluru can freely use Smart Traffic. Guests can search routes, preview traffic conditions, view reported corridor incidents, and compare detour alternatives without creating an account. An account is only required when submitting new incident reports or accessing your personal submission history.',
    },
    {
      question: 'Do I need an account to report an incident?',
      answer:
        'Yes. To prevent spam and maintain an accountable incident radar, reporting is restricted to authenticated users. In addition, an in-app camera snapshot is required to provide timestamped visual reference and discourage false alarms.',
    },
    {
      question: 'How does alternative-route planning work?',
      answer:
        'When an incident is reported within an 800-meter buffer of your planned route, the routing engine queries alternative road bypasses around the affected segment. It compares the original distance and travel time with the detour, showing you the estimated time saved so you can make an informed choice.',
    },
    {
      question: 'Is the traffic information always live?',
      answer:
        'Live provider telemetry is displayed when a configured external service is responding. When live streams are unavailable, the platform seamlessly relies on our curated historical dataset of 45+ key Bengaluru arterial corridors (including Outer Ring Road, Hosur Road, and Airport Express), providing realistic speed benchmarks based on time-tested city patterns.',
    },
    {
      question: 'How is submitted incident information handled?',
      answer:
        'User-submitted reports are stored securely in the database with authenticated user attribution, timestamp, coordinates, and camera evidence. Newly submitted reports are explicitly labeled as "Reported • Pending Verification" until confirmed, ensuring drivers stay informed without mistaking unverified submissions for official police reports.',
    },
  ];

  return (
    <div className="space-y-20 pb-20 selection:bg-blue-600 selection:text-white">
      
      {/* ───────────────────────────────────────────────────────────────────────
          1. IMMERSIVE HERO SECTION
          ─────────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-12 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-navy-900 via-navy-950 to-navy-950 border-b border-slate-800/60">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10">
          
          {/* Bengaluru City Focus Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold tracking-wide uppercase mb-6 animate-pulse-glow">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>Bengaluru Urban Corridor Network</span>
          </div>

          {/* Main Heading */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight">
            Smarter Roads. <br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Safer Journeys.
            </span>
          </h1>

          {/* Supporting Text */}
          <p className="mt-5 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Smart Traffic helps Bengaluru road users plan routes, understand reported incidents, and explore alternative journeys using available traffic and road information.
          </p>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => scrollToSection('how-it-works')}
              className="w-full sm:w-auto px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-navy-950"
            >
              Explore How It Works
            </button>
            <button
              type="button"
              onClick={() => {
                if (onPlanRoute) onPlanRoute('Hebbal, Bengaluru', 'Electronic City, Bengaluru');
                else if (onNavigate) onNavigate('page-route');
              }}
              className="w-full sm:w-auto px-7 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-navy-950"
            >
              Plan a Route
            </button>
          </div>

          {/* Subtle Animated Route-Line Illustration (React Inline SVG) */}
          <div className="mt-12 max-w-3xl mx-auto bg-navy-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3 px-2">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Hebbal (Origin)</span>
              </span>
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                Bengaluru North-South Expressway Corridor • ~32 km
              </span>
              <span className="font-semibold text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>Electronic City (Destination)</span>
              </span>
            </div>

            <svg viewBox="0 0 700 80" className="w-full h-16 overflow-visible select-none" aria-hidden="true">
              <defs>
                <linearGradient id="routeLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="45%" stopColor="#f59e0b" />
                  <stop offset="65%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>

              {/* Background Road Casing */}
              <path
                d="M 40 40 Q 180 15, 320 45 T 660 40"
                fill="none"
                stroke="#1e293b"
                strokeWidth="8"
                strokeLinecap="round"
              />

              {/* Active Route Gradient Path */}
              <path
                d="M 40 40 Q 180 15, 320 45 T 660 40"
                fill="none"
                stroke="url(#routeLineGrad)"
                strokeWidth="4"
                strokeLinecap="round"
                className="motion-safe:animate-pulse"
              />

              {/* Animated Detour Bypass Line */}
              <path
                d="M 310 44 Q 440 75, 540 42"
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2.5"
                strokeDasharray="6 6"
                className="opacity-80"
              />

              {/* Waypoint Nodes */}
              <circle cx="40" cy="40" r="7" fill="#10b981" stroke="#ffffff" strokeWidth="2.5" />
              <circle cx="320" cy="45" r="6" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
              <circle cx="450" cy="42" r="5" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
              <circle cx="660" cy="40" r="7" fill="#06b6d4" stroke="#ffffff" strokeWidth="2.5" />

              {/* Detour Badge text */}
              <text x="440" y="76" fill="#38bdf8" fontSize="10" fontWeight="bold" textAnchor="middle">
                Bypass Corridor
              </text>
            </svg>
          </div>

        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          2. INTERACTIVE "WHO IS IT FOR?" AUDIENCE CARDS
          ─────────────────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Tailored Solutions</span>
          <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">Who Is Smart Traffic For?</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Click on any group to explore how the platform supports diverse Bengaluru road stakeholders.
          </p>
        </div>

        {/* 4 Clickable Audience Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {audiences.map((aud, idx) => {
            const isSelected = selectedAudience === idx;
            return (
              <div
                key={aud.id}
                role="button"
                tabIndex={0}
                aria-expanded={isSelected}
                onClick={() => setSelectedAudience(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedAudience(idx);
                  }
                }}
                className={`text-left rounded-2xl p-5 border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-navy-900 border-blue-500/80 shadow-xl shadow-blue-600/10 scale-[1.02] ring-1 ring-blue-500'
                    : 'bg-navy-900/70 border-slate-800 hover:border-slate-700 hover:bg-navy-900'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
                      {aud.icon}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {aud.badge}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white mb-1.5">{aud.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{aud.shortDesc}</p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-semibold">
                  <span className={isSelected ? 'text-cyan-400' : 'text-slate-400'}>
                    {isSelected ? 'Selected' : 'Learn more'}
                  </span>
                  <span className="text-xs">{isSelected ? '▲' : '▼'}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Expandable Audience Detail Panel */}
        {selectedAudience !== null && (
          <div className="bg-navy-900 border border-blue-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3 max-w-3xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                    {audiences[selectedAudience].badge}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-xs text-slate-400 font-medium">Use Case Detail</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  {audiences[selectedAudience].title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {audiences[selectedAudience].detail}
                </p>
              </div>

              <div className="shrink-0 flex flex-col sm:flex-row md:flex-col gap-2">
                <button
                  type="button"
                  onClick={audiences[selectedAudience].actionHandler}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-blue-600/30 transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {audiences[selectedAudience].actionLabel}
                </button>

                {!currentUser && audiences[selectedAudience].id === 'reporters' && (
                  <button
                    type="button"
                    onClick={onOpenRegister}
                    className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-all hover:scale-[1.02]"
                  >
                    Create Account
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          3. INTERACTIVE "HOW SMART TRAFFIC WORKS" JOURNEY
          ─────────────────────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Step-by-Step Architecture</span>
          <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">How Smart Traffic Works</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Follow the 3-step routing workflow from coordinate entry to accident-aware detour calculations.
          </p>
        </div>

        {/* Step Indicators with Connected Line */}
        <div className="relative max-w-3xl mx-auto">
          <div className="absolute top-5 left-10 right-10 h-0.5 bg-slate-800 -z-0" />
          
          <div className="grid grid-cols-3 gap-4 relative z-10">
            {steps.map((st, idx) => {
              const isActive = journeyStep === idx;
              const isPast = journeyStep > idx;
              return (
                <button
                  key={st.step}
                  type="button"
                  onClick={() => setJourneyStep(idx)}
                  className="flex flex-col items-center text-center group focus:outline-none"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-glow-blue scale-110 ring-4 ring-blue-500/30'
                        : isPast
                        ? 'bg-emerald-600 text-white'
                        : 'bg-navy-900 text-slate-400 border border-slate-700 group-hover:border-slate-500'
                    }`}
                  >
                    {isPast ? '✓' : st.step}
                  </div>
                  <span
                    className={`text-xs mt-2 font-bold tracking-tight transition-colors ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'
                    }`}
                  >
                    {st.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Journey Content Panel */}
        <div className="max-w-4xl mx-auto bg-navy-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between gap-4 mb-4">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
              Step {steps[journeyStep].step} of 3 • {steps[journeyStep].tag}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Active Phase
            </span>
          </div>

          <h3 className="text-xl sm:text-2xl font-black text-white mb-2">
            {steps[journeyStep].title}
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
            {steps[journeyStep].body}
          </p>

          <div className="bg-navy-950/80 border border-slate-800/80 rounded-xl p-4 mb-6">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Technical Highlights:</h4>
            <ul className="space-y-1.5 text-xs text-slate-400">
              {steps[journeyStep].bullets.map((b, bIdx) => (
                <li key={bIdx} className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold shrink-0">➔</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Navigation Controls for Journey */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              type="button"
              disabled={journeyStep === 0}
              onClick={() => setJourneyStep((prev) => Math.max(0, prev - 1))}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                journeyStep === 0
                  ? 'text-slate-600 bg-slate-900/50 cursor-not-allowed border border-slate-800/40'
                  : 'text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700'
              }`}
            >
              ← Back
            </button>

            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className={`w-2 h-2 rounded-full transition-all ${
                    dot === journeyStep ? 'w-5 bg-blue-500' : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>

            {journeyStep < 2 ? (
              <button
                type="button"
                onClick={() => setJourneyStep((prev) => Math.min(2, prev + 1))}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 transition-all"
              >
                Next Step →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (onPlanRoute) onPlanRoute('Hebbal, Bengaluru', 'Electronic City, Bengaluru');
                  else if (onNavigate) onNavigate('page-route');
                }}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-md shadow-blue-600/30 transition-all hover:scale-[1.02]"
              >
                Try It on the Map 🗺️
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          4. INTERACTIVE ROUTE-PLANNING PREVIEW CONSOLE
          ─────────────────────────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="bg-navy-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Live Preview</span>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-0.5">Test Route Calculation</h2>
            </div>
            <span className="text-xs text-slate-400">
              Submits directly to real OSRM road geometry
            </span>
          </div>

          {previewError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>{previewError}</span>
            </div>
          )}

          <form onSubmit={handlePreviewSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-11 gap-3 items-center">
              
              {/* From Input */}
              <div className="sm:col-span-5 relative">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Starting Point</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-emerald-500 shadow-sm" />
                  <input
                    type="text"
                    list="aboutLocations"
                    value={previewFrom}
                    onChange={(e) => setPreviewFrom(e.target.value)}
                    placeholder="e.g. Hebbal, Bengaluru"
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white placeholder-slate-500 text-xs focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Swap Button */}
              <div className="sm:col-span-1 flex items-center justify-center pt-5">
                <button
                  type="button"
                  onClick={handleSwapPreview}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                  title="Swap Origin and Destination"
                >
                  ⇄
                </button>
              </div>

              {/* To Input */}
              <div className="sm:col-span-5 relative">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Destination</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-rose-500 shadow-sm" />
                  <input
                    type="text"
                    list="aboutLocations"
                    value={previewTo}
                    onChange={(e) => setPreviewTo(e.target.value)}
                    placeholder="e.g. Electronic City, Bengaluru"
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white placeholder-slate-500 text-xs focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <datalist id="aboutLocations">
                {Object.keys(KNOWN_LOCATIONS).map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>

            {/* Popular Corridor Quick Presets */}
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400 font-medium">Corridor shortcuts:</span>
              {[
                { from: 'Hebbal, Bengaluru', to: 'Electronic City, Bengaluru', label: 'Hebbal ➔ Electronic City' },
                { from: 'Silk Board, Bengaluru', to: 'Whitefield, Bengaluru', label: 'Silk Board ➔ Whitefield' },
                { from: 'Majestic, Bengaluru', to: 'Indiranagar, Bengaluru', label: 'Majestic ➔ Indiranagar' },
                { from: 'Koramangala, Bengaluru', to: 'ITPL, Bengaluru', label: 'Koramangala ➔ ITPL' },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setPreviewFrom(p.from);
                    setPreviewTo(p.to);
                    setPreviewError('');
                  }}
                  className="px-2 py-0.5 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                🔍 Plan Route on Full Interactive Map
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          5. HONEST "WHAT MAKES IT USEFUL?" ARCHITECTURAL PANELS
          ─────────────────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Data Transparency</span>
          <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">What Makes It Useful?</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            An honest breakdown of the data sources, verification workflows, and road-routing integrations powering the platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Panel 1 */}
          <div className="bg-navy-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xl font-bold">
              🗺️
            </div>
            <h3 className="text-base font-bold text-white">Real Road Geometry</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Routes are calculated using live calls to the Open Source Routing Machine (OSRM) based on actual Bengaluru road geometry. The engine constructs turn-by-turn maneuvers, accurate driving distances, and continuous multi-segment polylines across city flyovers.
            </p>
            <div className="pt-2 text-[11px] text-slate-500 border-t border-slate-800">
              Source: OpenStreetMap & OSRM Routing Engine
            </div>
          </div>

          {/* Panel 2 */}
          <div className="bg-navy-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xl font-bold">
              📷
            </div>
            <h3 className="text-base font-bold text-white">Camera-Verified Incidents</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Incident reporting is gated behind authenticated citizen logins and requires a live in-app camera snapshot. Newly submitted reports are explicitly labeled as <strong className="text-amber-400 font-semibold">Reported • Pending Verification</strong>, ensuring drivers are warned of potential hazards without treating unconfirmed claims as official facts.
            </p>
            <div className="pt-2 text-[11px] text-slate-500 border-t border-slate-800">
              Workflow: Authenticated User ID + In-App Camera Evidence
            </div>
          </div>

          {/* Panel 3 */}
          <div className="bg-navy-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-xl font-bold">
              📊
            </div>
            <h3 className="text-base font-bold text-white">Corridor Telemetry & CSV Data</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              The platform incorporates live provider speeds when active, complemented by our historical Bengaluru dataset covering 45+ arterial corridors. This allows the system to evaluate realistic travel time indices (Heavy, Moderate, Light) even when third-party live APIs are in cooldown or offline.
            </p>
            <div className="pt-2 text-[11px] text-slate-500 border-t border-slate-800">
              Source: Live Provider API + Curated Bengaluru Historical Dataset
            </div>
          </div>

        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          6. INTERACTIVE EXPANDABLE FAQ ACCORDION
          ─────────────────────────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="text-center max-w-2xl mx-auto mb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Questions & Answers</span>
          <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">Frequently Asked Questions</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Clear, honest answers regarding capabilities, account requirements, and routing behavior.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div
                key={index}
                className="bg-navy-900 border border-slate-800 rounded-2xl overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                  className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <span className="text-xs sm:text-sm font-bold text-white">
                    {faq.question}
                  </span>
                  <span
                    className={`text-slate-400 text-xs transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-cyan-400' : ''
                    }`}
                  >
                    ▼
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs text-slate-300 leading-relaxed border-t border-slate-800/80 animate-fade-in">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          7. CLOSING CALL TO ACTION
          ─────────────────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-blue-900/40 via-navy-900 to-cyan-900/40 border border-blue-500/30 rounded-3xl p-8 sm:p-12 text-center shadow-2xl relative overflow-hidden">
          <div className="max-w-2xl mx-auto space-y-4 relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Get Started Today</span>
            <h2 className="text-2xl sm:text-4xl font-black text-white">
              Your next journey starts with better information.
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Search real Bengaluru road routes, evaluate active corridor conditions, or contribute verified camera reports to help keep traffic moving safely.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => {
                  if (onPlanRoute) onPlanRoute('Hebbal, Bengaluru', 'Electronic City, Bengaluru');
                  else if (onNavigate) onNavigate('page-route');
                }}
                className="w-full sm:w-auto px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Plan a Route
              </button>

              {currentUser ? (
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigate) onNavigate('page-report-crash');
                  }}
                  className="w-full sm:w-auto px-8 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  Report an Incident
                </button>
              ) : (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={onOpenLogin}
                    className="flex-1 sm:flex-initial px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-all hover:scale-[1.02]"
                  >
                    Log In
                  </button>
                  <button
                    type="button"
                    onClick={onOpenRegister}
                    className="flex-1 sm:flex-initial px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-all hover:scale-[1.02]"
                  >
                    Create Account
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
