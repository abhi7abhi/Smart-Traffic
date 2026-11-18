import React, { useState } from 'react';
import HomeHeroMap from './HomeHeroMap';
import LocationAutocompleteInput from './LocationAutocompleteInput';
import { KNOWN_LOCATIONS, reverseGeocode, forwardGeocode } from '../services/osrm';

export default function HomeView({ onSearchRoute, onNavigate }) {
  const [from, setFrom] = useState('Hebbal, Bengaluru');
  const [to, setTo] = useState('Electronic City, Bengaluru');
  const [fromCoords, setFromCoords] = useState(KNOWN_LOCATIONS['Hebbal, Bengaluru'] || null);
  const [toCoords, setToCoords] = useState(KNOWN_LOCATIONS['Electronic City, Bengaluru'] || null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [geoNotice, setGeoNotice] = useState(null);
  const [activeAudienceCard, setActiveAudienceCard] = useState(null);

  // Form submission with input validation and real forward geocoding resolution
  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedFrom = from.trim();
    const trimmedTo = to.trim();

    if (!trimmedFrom || !trimmedTo) {
      setGeoNotice({
        type: 'error',
        message: 'Please enter both a starting location and destination.',
      });
      return;
    }

    if (trimmedFrom.toLowerCase() === trimmedTo.toLowerCase()) {
      setGeoNotice({
        type: 'error',
        message: 'Starting location and destination cannot be identical.',
      });
      return;
    }

    setResolving(true);
    setGeoNotice(null);

    try {
      // 1. Resolve starting coordinates if not explicitly selected from autocomplete
      let activeFromCoords = fromCoords;
      if (!activeFromCoords || typeof activeFromCoords.lat !== 'number') {
        activeFromCoords = await forwardGeocode(trimmedFrom);
      }

      if (!activeFromCoords) {
        setGeoNotice({
          type: 'error',
          message: `Could not find coordinates for starting location "${trimmedFrom}". Please choose a place from suggestions.`,
        });
        setResolving(false);
        return;
      }

      // 2. Resolve destination coordinates if not explicitly selected from autocomplete
      let activeToCoords = toCoords;
      if (!activeToCoords || typeof activeToCoords.lat !== 'number') {
        activeToCoords = await forwardGeocode(trimmedTo);
      }

      if (!activeToCoords) {
        setGeoNotice({
          type: 'error',
          message: `Could not find coordinates for destination "${trimmedTo}". Please choose a place from suggestions.`,
        });
        setResolving(false);
        return;
      }

      setFromCoords(activeFromCoords);
      setToCoords(activeToCoords);
      onSearchRoute(trimmedFrom, trimmedTo, activeFromCoords, activeToCoords);
    } catch (err) {
      console.warn("Location resolution error:", err);
      setGeoNotice({
        type: 'error',
        message: 'Location resolution failed. Please select from suggested places.',
      });
    } finally {
      setResolving(false);
    }
  };

  // Swap starting origin & destination
  const handleSwap = () => {
    const prevFrom = from;
    const prevFromCoords = fromCoords;
    setFrom(to);
    setFromCoords(toCoords);
    setTo(prevFrom);
    setToCoords(prevFromCoords);
  };

  // Accurate Device GPS Geolocation & Reverse Geocoding
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoNotice({
        type: 'error',
        message: 'Geolocation is not supported by your browser.',
      });
      return;
    }

    setGeoLoading(true);
    setGeoNotice({
      type: 'info',
      message: 'Requesting device GPS coordinates...',
    });

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;

        setGeoNotice({
          type: 'info',
          message: `GPS acquired (${latitude.toFixed(4)}, ${longitude.toFixed(4)}). Resolving street address...`,
        });

        try {
          const geoResult = await reverseGeocode(latitude, longitude);
          const resolvedAddress = (geoResult && geoResult.address)
            ? geoResult.address
            : `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

          setFrom(resolvedAddress);
          setFromCoords({
            lat: latitude,
            lon: longitude,
            name: resolvedAddress,
            accuracy: accuracy || null,
          });

          setGeoNotice({
            type: 'success',
            message: `Accurate location detected: ${resolvedAddress}`,
          });
        } catch (err) {
          const coordStr = `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
          setFrom(coordStr);
          setFromCoords({
            lat: latitude,
            lon: longitude,
            name: coordStr,
            accuracy: accuracy || null,
          });

          setGeoNotice({
            type: 'success',
            message: `Coordinates detected: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          });
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        let errMsg = 'Could not retrieve your location. Please enter starting location manually.';
        if (err.code === 1) {
          errMsg = 'Location permission was denied. Please allow access in your browser or enter starting point manually.';
        } else if (err.code === 2) {
          errMsg = 'GPS position is currently unavailable. Please check device location settings or enter manually.';
        } else if (err.code === 3) {
          errMsg = 'Location request timed out. Please try again or enter your location manually.';
        }

        // CRITICAL: Under no circumstances substitute Electronic City, Majestic, or any fake hub!
        setGeoNotice({ type: 'error', message: errMsg });
        setGeoLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const scrollToAudience = () => {
    const el = document.getElementById('who-is-this-app-for');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const audienceCards = [
    {
      id: 'commuters',
      icon: (
        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      bgBadge: 'bg-blue-100 border-blue-200',
      title: 'Daily Commuters',
      desc: 'Useful for students, office-goers, and regular travellers.',
      detail:
        'Quickly detect road slowdowns along Outer Ring Road, Silk Board, and Hebbal Flyover before your morning and evening transit begins.',
      actionLabel: 'Plan Commute',
      actionPage: 'page-route',
    },
    {
      id: 'two-wheelers',
      icon: (
        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      bgBadge: 'bg-amber-100 border-amber-200',
      title: 'Two-Wheeler Riders',
      desc: 'Helps riders review available road information and plan their journeys.',
      detail:
        'Stay informed about sudden accident roadblocks, narrow bypass corridors, and high-risk traffic choke points before starting your ride.',
      actionLabel: 'View Crash Radar',
      actionPage: 'page-crash-data',
    },
    {
      id: 'public-transport',
      icon: (
        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 14v5m8-5v5m-9-9h10a2 2 0 002-2V6a2 2 0 00-2-2H7a2 2 0 00-2 2v2a2 2 0 002 2zm1 4h8a1 1 0 001-1v-2H6v2a1 1 0 001 1z" />
        </svg>
      ),
      bgBadge: 'bg-emerald-100 border-emerald-200',
      title: 'Public Transport Users',
      desc: 'Supports journey planning by making relevant road information easier to explore.',
      detail:
        'Anticipate major arterial bus bottlenecks on BMTC corridors and identify smoother transfer intersections throughout Bengaluru.',
      actionLabel: 'Explore Routes',
      actionPage: 'page-route',
    },
    {
      id: 'delivery',
      icon: (
        <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      bgBadge: 'bg-indigo-100 border-indigo-200',
      title: 'Delivery & Logistics',
      desc: 'Helps delivery drivers and logistics teams plan routes using available routing information.',
      detail:
        'Plan multi-drop dispatch routes, bypass sudden incident queues, and compare alternate detours to protect critical delivery windows.',
      actionLabel: 'Check Corridors',
      actionPage: 'page-route',
    },
    {
      id: 'authorities',
      icon: (
        <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      bgBadge: 'bg-purple-100 border-purple-200',
      title: 'Authorities & Planners',
      desc: 'Provides available traffic and incident data that can support road-safety analysis.',
      detail:
        'Analyze real photographic incident evidence, localized severity patterns, and corridor congestion hotspots to support civic road safety.',
      actionLabel: 'View Crash Data',
      actionPage: 'page-crash-data',
    },
  ];

  return (
    <div className="w-full">
      {/* ──────────────────────────────────────────────────────────────────────────
          SECTION 1 & 2: RESTORED FULL-WIDTH DARK NAVY HERO WITH MAP ON RIGHT
          (Matching Screenshot 1 exactly)
          ────────────────────────────────────────────────────────────────────────── */}
      <section className="relative bg-[#060b18] overflow-hidden">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 items-stretch min-h-[500px] lg:min-h-[540px]">
          
          {/* Left Hero Column: Typography & Compact Horizontal Floating Route Search Bar */}
          <div className="lg:col-span-6 xl:col-span-6 flex flex-col justify-center px-4 sm:px-8 lg:pl-12 lg:pr-6 py-10 lg:py-14 z-10">
            
            {/* Primary Main Heading matching Reference Screenshot 1 */}
            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-extrabold text-white tracking-tight leading-[1.1]">
              <span className="text-[#00e599] [text-shadow:0_0_24px_rgba(0,229,153,0.4)]">Safer</span> Roads,<br />
              <span className="text-[#2d7aff] [text-shadow:0_0_24px_rgba(45,122,255,0.4)]">Smarter</span> Journeys
            </h1>

            {/* Supporting Description Text */}
            <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed max-w-[480px]">
              Get traffic and crash information to plan safer and more informed journeys in Bengaluru.
            </p>

            {/* Vertical Route-Search Panel (From -> Swap -> To -> Full-Width Search CTA) */}
            <form
              onSubmit={handleSubmit}
              className="mt-7 flex flex-col gap-2.5 p-3 sm:p-3.5 rounded-2xl bg-[#0a1327]/95 border border-[#38bdf8]/30 shadow-[0_16px_36px_rgba(0,0,0,0.5)] backdrop-blur-md w-full max-w-[520px]"
            >
              {/* 1. FROM Field with Dynamic Autocomplete */}
              <LocationAutocompleteInput
                id="hero-from-input"
                label="FROM"
                value={from}
                onChange={(val) => {
                  setFrom(val);
                  setFromCoords(null);
                }}
                onSelectLocation={(loc) => {
                  setFrom(loc.displayName || loc.name);
                  setFromCoords({
                    lat: loc.lat,
                    lon: loc.lon,
                    name: loc.name,
                    displayName: loc.displayName,
                    placeId: loc.placeId,
                  });
                }}
                onClear={() => {
                  setFrom('');
                  setFromCoords(null);
                }}
                placeholder="Enter starting location..."
                iconType="origin"
                rightSlot={
                  <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={geoLoading}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold text-blue-400 bg-blue-500/15 border border-blue-500/35 hover:bg-blue-500/25 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer active:scale-95"
                    title="Detect device GPS location"
                  >
                    <svg className={`w-3 h-3 ${geoLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                      <circle cx="12" cy="12" r="7" />
                    </svg>
                    <span>{geoLoading ? 'Detecting...' : 'My Location'}</span>
                  </button>
                }
                required
              />

              {/* 2. Swap Origin / Destination Button (Centered between From & To) */}
              <div className="flex justify-center -my-1">
                <button
                  type="button"
                  onClick={handleSwap}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 hover:text-white flex items-center justify-center transition-all shadow-md active:scale-95 shrink-0 cursor-pointer"
                  title="Swap origin and destination"
                  aria-label="Swap starting point and destination"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              {/* 3. TO Field with Dynamic Autocomplete */}
              <LocationAutocompleteInput
                id="hero-to-input"
                label="TO"
                value={to}
                onChange={(val) => {
                  setTo(val);
                  setToCoords(null);
                }}
                onSelectLocation={(loc) => {
                  setTo(loc.displayName || loc.name);
                  setToCoords({
                    lat: loc.lat,
                    lon: loc.lon,
                    name: loc.name,
                    displayName: loc.displayName,
                    placeId: loc.placeId,
                  });
                }}
                onClear={() => {
                  setTo('');
                  setToCoords(null);
                }}
                placeholder="Enter destination (e.g. Chandapura, Bengaluru)..."
                iconType="destination"
                required
              />

              {/* 4. Search Route CTA Button (Directly below destination, full-width) */}
              <button
                type="submit"
                disabled={resolving}
                className="w-full py-3.5 px-6 rounded-xl bg-[#1e60ff] hover:bg-blue-600 text-white font-bold text-sm shadow-[0_6px_20px_rgba(30,96,255,0.4)] transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap mt-1 disabled:opacity-60 cursor-pointer"
              >
                <svg className={`w-4 h-4 ${resolving ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <span>{resolving ? 'Resolving Locations...' : 'Search Route'}</span>
              </button>

              <datalist id="bengaluru-locations">
                {Object.keys(KNOWN_LOCATIONS).map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </form>

            {/* Inline Notification Toast (if geolocation error/success) */}
            {geoNotice && (
              <div
                className={`mt-3 text-xs px-3.5 py-2 rounded-xl flex items-center justify-between gap-2 max-w-[520px] ${
                  geoNotice.type === 'error'
                    ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                    : geoNotice.type === 'success'
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                    : 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
                }`}
              >
                <span>{geoNotice.message}</span>
                <button
                  type="button"
                  onClick={() => setGeoNotice(null)}
                  className="text-xs hover:text-white px-1"
                  aria-label="Dismiss notice"
                >
                  ✕
                </button>
              </div>
            )}

          </div>

          {/* Right Hero Column: Real Interactive Watermark-Free Bengaluru Leaflet Map */}
          <div className="lg:col-span-6 xl:col-span-6 relative min-h-[440px] lg:min-h-full">
            <HomeHeroMap />
          </div>

        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          SECTION 3: ABOUT OUR APP (WHITE SECTION WITH ROUNDED UPPER CORNERS)
          ────────────────────────────────────────────────────────────────────────── */}
      <section className="relative z-20 -mt-6 sm:-mt-8 bg-white text-slate-900 rounded-t-[32px] shadow-2xl pt-14 sm:pt-18 pb-16 px-4 sm:px-6 lg:px-8 border-t border-slate-100">
        <div className="max-w-7xl mx-auto">
          
          {/* Two-Part Layout matching Reference Screenshot */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            
            {/* Left Column: Heading, Description & Learn More Button */}
            <div className="lg:col-span-5 space-y-5">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                About Our App
              </h2>
              
              <p className="text-base text-slate-600 leading-relaxed">
                Smart Traffic &amp; Crash Management is a web-based platform that provides real-time traffic updates and crash information for Bengaluru. It helps users plan safer and faster journeys by showing road conditions, reported incidents, and alternate routes.
              </p>

              <div>
                <button
                  type="button"
                  onClick={scrollToAudience}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-md transition-all hover:translate-x-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <span>Learn More</span>
                  <span aria-hidden="true">&rarr;</span>
                </button>
              </div>
            </div>

            {/* Right Column: 3 Pastel Feature Cards */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* Feature Card 1: Traffic & Crash Insights (Pastel Blue) */}
              <div className="bg-[#eff6ff] border border-blue-100 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 border border-blue-200/60 flex items-center justify-center shrink-0 shadow-sm">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" fill="rgba(37, 99, 235, 0.1)" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Traffic &amp; Crash Insights
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    View road traffic conditions and verified crash information on an interactive map.
                  </p>
                </div>
              </div>

              {/* Feature Card 2: Safer Travel Planning (Pastel Green) */}
              <div className="bg-[#ecfdf5] border border-emerald-100 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 border border-emerald-200/60 flex items-center justify-center shrink-0 shadow-sm">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Safer Travel Planning
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    Helps you choose safer and better routes based on accident history and road congestion.
                  </p>
                </div>
              </div>

              {/* Feature Card 3: Community Contribution (Pastel Purple) */}
              <div className="bg-[#faf5ff] border border-purple-100 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 border border-purple-200/60 flex items-center justify-center shrink-0 shadow-sm">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Community Contribution
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    Users can report crashes to help keep other travellers aware of disruptions.
                  </p>
                </div>
              </div>

            </div>

          </div>

          {/* ────────────────────────────────────────────────────────────────────────
              SECTION 4: WHO IS THIS APP FOR? (5 RESPONSIVE AUDIENCE CARDS)
              ──────────────────────────────────────────────────────────────────────── */}
          <div id="who-is-this-app-for" className="mt-18 pt-14 border-t border-slate-100">
            
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Who Is This App For?
              </h3>
              <p className="text-sm text-slate-500 mt-2">
                Designed to provide relevant roadway telemetry and route guidance across Bengaluru's urban transit landscape.
              </p>
            </div>

            {/* 5 Audience Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5">
              {audienceCards.map((card) => {
                const isExpanded = activeAudienceCard === card.id;
                return (
                  <div
                    key={card.id}
                    onClick={() => setActiveAudienceCard(isExpanded ? null : card.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveAudienceCard(isExpanded ? null : card.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    className={`bg-white border rounded-2xl p-5 transition-all cursor-pointer flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      isExpanded
                        ? 'border-blue-500 shadow-lg ring-1 ring-blue-500 -translate-y-1'
                        : 'border-slate-200/90 hover:border-blue-400 hover:shadow-md hover:-translate-y-1'
                    }`}
                  >
                    <div>
                      {/* Circle Icon Badge */}
                      <div className={`w-10 h-10 rounded-xl ${card.bgBadge} flex items-center justify-center border shadow-xs`}>
                        {card.icon}
                      </div>

                      {/* Heading */}
                      <h4 className="text-base font-bold text-slate-900 mt-3.5 leading-snug">
                        {card.title}
                      </h4>

                      {/* Concise Description */}
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        {card.desc}
                      </p>
                    </div>

                    {/* Expandable Detail or Click affordance */}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      {isExpanded ? (
                        <div className="space-y-3">
                          <p className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 leading-relaxed">
                            {card.detail}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate(card.actionPage);
                            }}
                            className="w-full py-1.5 px-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-colors"
                          >
                            {card.actionLabel} &rarr;
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center justify-between">
                          <span>View Details</span>
                          <span>+</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Disclaimer & Transparency Note */}
            <div className="mt-12 max-w-3xl mx-auto bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-center">
              <p className="text-xs text-slate-500 leading-relaxed">
                <strong className="text-slate-700">Platform Disclaimer:</strong> Smart Traffic is a public community and route exploration platform. Road telemetry and incident reports reflect monitored corridors and user submissions, and are provided for informational assistance without official government or law enforcement warranty.
              </p>
            </div>

          </div>

        </div>
      </section>

    </div>
  );
}
