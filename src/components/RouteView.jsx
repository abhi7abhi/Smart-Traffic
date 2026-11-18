import React, { useState, useEffect } from 'react';
import RouteMap from './RouteMap';
import CompactAlertBar from './CompactAlertBar';
import IncidentDetailDrawer from './IncidentDetailDrawer';
import RouteOverviewPanel from './RouteOverviewPanel';
import CollapsibleDirections from './CollapsibleDirections';
import LocationAutocompleteInput from './LocationAutocompleteInput';
import { resolveCoordinates, fetchOsrmRoute, reverseGeocode, forwardGeocode, KNOWN_LOCATIONS } from '../services/osrm';
import { detectRouteIncidents, fetchLiveTrafficFlow, fetchHistoricalRouteTraffic } from '../services/api';

export default function RouteView({
  initialFrom = 'Hebbal, Bengaluru',
  initialTo = 'Electronic City, Bengaluru',
  initialFromCoords = null,
  initialToCoords = null,
}) {
  const [fromText, setFromText] = useState(initialFrom);
  const [toText, setToText] = useState(initialTo);
  const [fromCoords, setFromCoords] = useState(initialFromCoords);
  const [toCoords, setToCoords] = useState(initialToCoords);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoNotice, setGeoNotice] = useState(null);
  const [liveTracking, setLiveTracking] = useState(false);
  const [liveLocation, setLiveLocation] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [rerouteData, setRerouteData] = useState(null);
  const [incident, setIncident] = useState(null);
  const [trafficImpact, setTrafficImpact] = useState(null);
  const [activeRouteType, setActiveRouteType] = useState('original'); // 'original' or 'alternative'
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [dismissedIncidentIds, setDismissedIncidentIds] = useState({});
  const [focusCoords, setFocusCoords] = useState(null);

  // Traffic telemetry state: Live (TomTom) vs Historical (Bangalore Traffic CSV)
  const [trafficMode, setTrafficMode] = useState('live');
  const [showTrafficLayer, setShowTrafficLayer] = useState(true);
  const [trafficTelemetry, setTrafficTelemetry] = useState(null);
  const [trafficLoading, setTrafficLoading] = useState(false);

  // Check if current primary incident has been dismissed
  const isAlertDismissed = Boolean(
    incident &&
    dismissedIncidentIds[incident.report_id] === incident.status
  );

  const handleDismissAlert = () => {
    if (incident) {
      setDismissedIncidentIds((prev) => ({
        ...prev,
        [incident.report_id]: incident.status,
      }));
    }
    setIsDrawerOpen(false);
  };

  const handleFindAlternativeRoute = () => {
    if (rerouteData && rerouteData.has_alternative) {
      setActiveRouteType('alternative');
    }
    const overviewEl = document.getElementById('routeOverviewPanel');
    if (overviewEl) {
      overviewEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // Fetch verified traffic telemetry along the planned route coordinates
  const loadTrafficTelemetry = async (geometry, mode) => {
    if (!geometry || !Array.isArray(geometry) || geometry.length === 0) {
      setTrafficTelemetry(null);
      return;
    }

    setTrafficLoading(true);

    // Sample 6-10 evenly spaced coordinate points along the route
    const totalPts = geometry.length;
    const sampleCount = Math.min(10, Math.max(3, Math.floor(totalPts / 6)));
    const sampled = [];
    for (let i = 0; i < sampleCount; i++) {
      const idx = Math.min(totalPts - 1, Math.floor((i / (sampleCount - 1)) * (totalPts - 1)));
      sampled.push(geometry[idx]);
    }

    try {
      if (mode === 'live') {
        const pointsPayload = sampled.map((p) => ({ lat: p[0], lon: p[1] }));
        const res = await fetchLiveTrafficFlow(pointsPayload);
        if (res && res.success && Array.isArray(res.segments) && res.segments.length > 0) {
          setTrafficTelemetry(res);
        } else {
          setTrafficTelemetry({
            status: 'unavailable',
            message: res?.message || 'Live traffic flow unavailable from TomTom API.',
            source: res?.source || 'LIVE TRAFFIC UNAVAILABLE',
            segments: [],
          });
        }
      } else {
        // Historical dataset mode
        const pointsPayload = sampled.map((p) => [p[0], p[1]]);
        const res = await fetchHistoricalRouteTraffic(pointsPayload);
        if (res && res.success) {
          setTrafficTelemetry({
            ...res,
            status: 'historical',
          });
        } else {
          setTrafficTelemetry({
            status: 'unavailable',
            message: 'Historical corridor dataset unavailable.',
            source: 'Banglore_traffic_Dataset.csv',
            segments: [],
          });
        }
      }
    } catch (err) {
      console.warn('Traffic telemetry fetch error:', err);
      setTrafficTelemetry({
        status: 'unavailable',
        message: mode === 'live' ? 'Live traffic service unreachable.' : 'Historical dataset unreachable.',
        source: mode === 'live' ? 'LIVE TRAFFIC UNAVAILABLE' : 'Banglore_traffic_Dataset.csv',
        segments: [],
      });
    } finally {
      setTrafficLoading(false);
    }
  };

  const handleToggleTrafficMode = (newMode) => {
    setTrafficMode(newMode);
    if (routeData && routeData.latLngs) {
      loadTrafficTelemetry(routeData.latLngs, newMode);
    }
  };

  // Perform route calculation & incident detection using exact coordinates
  const executeSearch = async (fromVal, toVal, explicitStartCoords, explicitDestCoords) => {
    setLoading(true);
    setIsDrawerOpen(false);
    setActiveRouteType('original');
    setGeoNotice(null);

    // 1. Resolve starting coordinates accurately
    let startCoords = explicitStartCoords || fromCoords;
    if (!startCoords || typeof startCoords.lat !== 'number') {
      startCoords = resolveCoordinates(fromVal) || await forwardGeocode(fromVal);
    }

    if (!startCoords) {
      setGeoNotice({
        type: 'error',
        message: `Could not find coordinates for "${fromVal}". Please select a location from suggestions.`,
      });
      setLoading(false);
      return;
    }

    // 2. Resolve destination coordinates accurately
    let destCoords = explicitDestCoords || toCoords;
    if (!destCoords || typeof destCoords.lat !== 'number') {
      destCoords = resolveCoordinates(toVal) || await forwardGeocode(toVal);
    }

    if (!destCoords) {
      setGeoNotice({
        type: 'error',
        message: `Could not find coordinates for "${toVal}". Please select a location from suggestions.`,
      });
      setLoading(false);
      return;
    }

    setFromCoords(startCoords);
    setToCoords(destCoords);

    try {
      // 1. Fetch real OSRM road geometry
      const rData = await fetchOsrmRoute(startCoords, destCoords);
      setRouteData(rData);

      // 2. Fetch traffic telemetry along route coordinates
      loadTrafficTelemetry(rData.latLngs, trafficMode);

      // 3. Query backend incident detection with driver location (if GPS active)
      try {
        const incResult = await detectRouteIncidents(rData.latLngs, startCoords, destCoords, 48, liveLocation);
        if (incResult && incResult.has_incident && incResult.primary_incident) {
          setIncident(incResult.primary_incident);
          setTrafficImpact(incResult.traffic_impact || null);
          setRerouteData(incResult.reroute || null);
        } else {
          setIncident(null);
          setTrafficImpact(null);
          setRerouteData(incResult ? incResult.reroute : null);
        }
      } catch (incErr) {
        console.warn('Incident detection API skipped:', incErr);
        setIncident(null);
        setRerouteData(null);
      }
    } catch (err) {
      console.error('Route planning failed:', err);
      setGeoNotice({
        type: 'error',
        message: 'Could not calculate road route between selected coordinates.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFromText(initialFrom);
    setToText(initialTo);
    setFromCoords(initialFromCoords);
    setToCoords(initialToCoords);
    executeSearch(initialFrom, initialTo, initialFromCoords, initialToCoords);
  }, [initialFrom, initialTo, initialFromCoords, initialToCoords]);

  // Periodic background refresh for incident updates while route is planned (every 25s)
  useEffect(() => {
    if (!routeData || !routeData.latLngs || routeData.latLngs.length === 0) return;

    const intervalId = setInterval(() => {
      const sCoords = fromCoords || resolveCoordinates(fromText);
      const dCoords = toCoords || resolveCoordinates(toText);
      if (sCoords && dCoords) {
        detectRouteIncidents(routeData.latLngs, sCoords, dCoords, 48, liveLocation)
          .then((incResult) => {
            if (incResult && incResult.has_incident && incResult.primary_incident) {
              setIncident(incResult.primary_incident);
              setTrafficImpact(incResult.traffic_impact || null);
              setRerouteData(incResult.reroute || null);
            } else {
              setIncident(null);
              setTrafficImpact(null);
              setRerouteData(incResult ? incResult.reroute : null);
            }
          })
          .catch((err) => console.warn('Background incident polling error:', err));
      }
    }, 25000);

    return () => clearInterval(intervalId);
  }, [routeData, fromCoords, toCoords, fromText, toText, liveLocation]);

  // Live GPS Tracking Watcher via watchPosition (Active only during navigation)
  useEffect(() => {
    if (!liveTracking) {
      setLiveLocation(null);
      return;
    }
    if (!navigator.geolocation) {
      setGeoNotice({
        type: 'error',
        message: 'Geolocation is not supported by your browser.',
      });
      setLiveTracking(false);
      return;
    }

    setGeoNotice({
      type: 'info',
      message: 'Live GPS Journey Tracking started. Location will update continuously.',
    });

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, heading, speed, accuracy } = pos.coords;
        const newLoc = {
          lat: latitude,
          lon: longitude,
          heading: heading || 0,
          speed: speed || 0,
          accuracy: accuracy || 10,
          timestamp: pos.timestamp,
        };
        setLiveLocation(newLoc);

        // Re-evaluate incidents with updated driver location to verify if ahead vs behind
        if (routeData && routeData.latLngs) {
          const sCoords = fromCoords || resolveCoordinates(fromText);
          const dCoords = toCoords || resolveCoordinates(toText);
          if (sCoords && dCoords) {
            detectRouteIncidents(routeData.latLngs, sCoords, dCoords, 48, newLoc)
              .then((incResult) => {
                if (incResult && incResult.has_incident && incResult.primary_incident) {
                  setIncident(incResult.primary_incident);
                  setTrafficImpact(incResult.traffic_impact || null);
                  setRerouteData(incResult.reroute || null);
                } else {
                  setIncident(null);
                  setTrafficImpact(null);
                  setRerouteData(incResult ? incResult.reroute : null);
                }
              })
              .catch((err) => console.warn('Incident check with GPS update error:', err));
          }
        }
      },
      (err) => {
        console.warn('Live tracking error:', err.message);
        if (err.code === 1) {
          setGeoNotice({
            type: 'error',
            message: 'Live tracking stopped: Location permission denied.',
          });
          setLiveTracking(false);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 2000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [liveTracking, routeData]);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    executeSearch(fromText, toText, fromCoords, toCoords);
  };

  const handleSwap = () => {
    const tmpText = fromText;
    const tmpCoords = fromCoords;
    setFromText(toText);
    setFromCoords(toCoords);
    setToText(tmpText);
    setToCoords(tmpCoords);
    executeSearch(toText, tmpText, toCoords, tmpCoords);
  };

  // Browser Geolocation for "My Location" on Route Strip
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
          const res = await reverseGeocode(latitude, longitude);
          const resolvedAddress = (res && res.address)
            ? res.address
            : `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

          const detected = {
            lat: latitude,
            lon: longitude,
            name: resolvedAddress,
            accuracy: accuracy || null,
          };

          setFromText(resolvedAddress);
          setFromCoords(detected);
          setGeoNotice({
            type: 'success',
            message: `Accurate location detected: ${resolvedAddress}`,
          });

          // Re-calculate route starting at real GPS coordinates
          executeSearch(resolvedAddress, toText, detected, toCoords);
        } catch (err) {
          const coordStr = `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
          const detected = {
            lat: latitude,
            lon: longitude,
            name: coordStr,
            accuracy: accuracy || null,
          };

          setFromText(coordStr);
          setFromCoords(detected);
          setGeoNotice({
            type: 'success',
            message: `Coordinates detected: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          });
          executeSearch(coordStr, toText, detected, toCoords);
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        let errMsg = 'Could not retrieve your location. Please enter starting point manually.';
        if (err.code === 1) {
          errMsg = 'Location permission was denied. Please allow access in your browser or enter starting point manually.';
        } else if (err.code === 2) {
          errMsg = 'GPS position is currently unavailable. Please verify device location settings.';
        } else if (err.code === 3) {
          errMsg = 'Location request timed out. Please try again.';
        }
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

  const handleFocusIncident = () => {
    if (incident) {
      setFocusCoords({
        lat: incident.latitude,
        lon: incident.longitude,
        location: incident.location,
        type: incident.crash_type,
        severity: incident.severity,
      });
    }
  };

  // Metrics to display based on whether alternative route is active
  const currentDist = (activeRouteType === 'alternative' && rerouteData && rerouteData.distance_km)
    ? `${rerouteData.distance_km} km`
    : (routeData ? `${routeData.distanceKm} km` : '32 km');

  const currentEta = (activeRouteType === 'alternative' && rerouteData && rerouteData.duration_mins)
    ? `${rerouteData.duration_mins} mins`
    : (routeData ? `${routeData.durationMins} mins` : '58 mins');

  let currentTrafficLevel = 'Standard';
  if (activeRouteType === 'alternative') {
    currentTrafficLevel = 'Detour (Active)';
  } else if (trafficMode === 'live') {
    if (trafficTelemetry && trafficTelemetry.status === 'live') {
      currentTrafficLevel = trafficTelemetry.overall_condition || 'Light';
    } else {
      currentTrafficLevel = 'Live Unavailable';
    }
  } else {
    if (trafficTelemetry && Array.isArray(trafficTelemetry.segments)) {
      const matched = trafficTelemetry.segments.filter((s) => !s.unmatched);
      currentTrafficLevel = matched.length > 0 ? 'Historical' : 'Unmatched';
    } else {
      currentTrafficLevel = 'Historical';
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Persistent Search Strip */}
      <div className="bg-navy-900 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl">
        <form onSubmit={handleFormSubmit} className="flex flex-col sm:flex-row items-center gap-3">
          
          {/* From Field with Dynamic Autocomplete */}
          <div className="w-full flex-1 min-w-[240px]">
            <LocationAutocompleteInput
              id="routeStripFrom"
              value={fromText}
              onChange={(val) => {
                setFromText(val);
                setFromCoords(null);
              }}
              onSelectLocation={(loc) => {
                setFromText(loc.displayName || loc.name);
                const coords = {
                  lat: loc.lat,
                  lon: loc.lon,
                  name: loc.name,
                  displayName: loc.displayName,
                  placeId: loc.placeId,
                };
                setFromCoords(coords);
                executeSearch(loc.displayName || loc.name, toText, coords, toCoords);
              }}
              onClear={() => {
                setFromText('');
                setFromCoords(null);
              }}
              placeholder="Starting Location..."
              iconType="origin"
              rightSlot={
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={geoLoading}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-blue-400 bg-blue-500/15 border border-blue-500/35 hover:bg-blue-500/25 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer active:scale-95"
                  title="Detect device GPS location"
                >
                  <svg className={`w-3 h-3 ${geoLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                    <circle cx="12" cy="12" r="7" />
                  </svg>
                  <span>{geoLoading ? '...' : 'GPS'}</span>
                </button>
              }
              required
            />
          </div>

          {/* Swap Button */}
          <button
            id="btnSwapStripLocations"
            type="button"
            onClick={handleSwap}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors shrink-0 active:scale-95 cursor-pointer"
            title="Swap Locations"
          >
            ⇄
          </button>

          {/* To Field with Dynamic Autocomplete */}
          <div className="w-full flex-1 min-w-[240px]">
            <LocationAutocompleteInput
              id="routeStripTo"
              value={toText}
              onChange={(val) => {
                setToText(val);
                setToCoords(null);
              }}
              onSelectLocation={(loc) => {
                setToText(loc.displayName || loc.name);
                const coords = {
                  lat: loc.lat,
                  lon: loc.lon,
                  name: loc.name,
                  displayName: loc.displayName,
                  placeId: loc.placeId,
                };
                setToCoords(coords);
                executeSearch(fromText, loc.displayName || loc.name, fromCoords, coords);
              }}
              onClear={() => {
                setToText('');
                setToCoords(null);
              }}
              placeholder="Destination (e.g. Chandapura, Bengaluru)..."
              iconType="destination"
              required
            />
          </div>

          {/* Live GPS Journey Tracking Toggle */}
          <button
            type="button"
            onClick={() => setLiveTracking(!liveTracking)}
            className={`w-full sm:w-auto px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all hover:scale-[1.02] active:scale-95 shrink-0 flex items-center justify-center gap-2 cursor-pointer ${
              liveTracking
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-600/30 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
            }`}
            title="Toggle Live GPS Journey Tracking"
          >
            <span className={`w-2 h-2 rounded-full ${liveTracking ? 'bg-white' : 'bg-emerald-400'}`} />
            <span>{liveTracking ? 'Tracking ON' : 'Live GPS'}</span>
          </button>

          {/* Submit Search */}
          <button
            id="btnSubmitStripSearch"
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-95 shrink-0 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{loading ? '⏳' : '🔍'}</span>
            <span>Search Route</span>
          </button>
        </form>

        {/* Inline Geolocation Status / Error Notice */}
        {geoNotice && (
          <div
            className={`mt-2.5 text-xs px-3.5 py-2 rounded-xl flex items-center justify-between gap-2 ${
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

      {/* Main Two Column Layout (Map Console ~65%, Details Sidebar ~35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Map Console (8 cols) */}
        <div className="lg:col-span-8 flex flex-col min-w-0">
          
          {/* Accident Alert Card Above Map */}
          {!isAlertDismissed && incident && (
            <>
              <CompactAlertBar
                incident={incident}
                trafficImpact={trafficImpact}
                rerouteData={rerouteData}
                isDrawerOpen={isDrawerOpen}
                onToggleDrawer={() => setIsDrawerOpen(!isDrawerOpen)}
                onFocusOnMap={handleFocusIncident}
                onFindAlternativeRoute={handleFindAlternativeRoute}
                onDismiss={handleDismissAlert}
              />

              {/* Expandable Incident Details Drawer */}
              <IncidentDetailDrawer
                incident={incident}
                isOpen={isDrawerOpen}
                onFocusOnMap={handleFocusIncident}
              />
            </>
          )}

          {/* Map Component */}
          <RouteMap
            routeData={routeData}
            rerouteData={rerouteData}
            activeRouteType={activeRouteType}
            incident={incident}
            focusCoords={focusCoords}
            liveLocation={liveLocation}
            trafficMode={trafficMode}
            onToggleTrafficMode={handleToggleTrafficMode}
            showTrafficLayer={showTrafficLayer}
            onToggleTrafficLayer={setShowTrafficLayer}
            trafficTelemetry={trafficTelemetry}
            trafficLoading={trafficLoading}
          />

        </div>

        {/* Right Column: Route Details Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-4 min-w-0">
          
          {/* Route Overview Comparison Panel */}
          <RouteOverviewPanel
            routeData={routeData}
            rerouteData={rerouteData}
            activeRouteType={activeRouteType}
            onSelectOriginal={() => setActiveRouteType('original')}
            onSelectAlternative={() => setActiveRouteType('alternative')}
            trafficMode={trafficMode}
            trafficTelemetry={trafficTelemetry}
          />

          {/* Metric Summary Trio */}
          <div className="grid grid-cols-3 gap-2.5 bg-navy-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            
            <div className="bg-navy-950 p-2.5 rounded-xl border border-slate-800/80 text-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-1">
                Distance
              </span>
              <span id="dispDistance" className="text-base font-black text-cyan-400">
                {currentDist}
              </span>
            </div>

            <div className="bg-navy-950 p-2.5 rounded-xl border border-slate-800/80 text-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-1">
                Est. Time
              </span>
              <span id="dispETA" className="text-base font-black text-purple-400">
                {currentEta}
              </span>
            </div>

            <div className="bg-navy-950 p-2.5 rounded-xl border border-slate-800/80 text-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-1">
                Traffic
              </span>
              <span 
                id="dispTrafficLevel" 
                className={`text-xs font-black truncate block mt-0.5 ${
                  currentTrafficLevel.includes('Detour') 
                    ? 'text-cyan-400' 
                    : currentTrafficLevel === 'Heavy' 
                    ? 'text-rose-400' 
                    : currentTrafficLevel === 'Light' 
                    ? 'text-emerald-400' 
                    : currentTrafficLevel === 'Moderate'
                    ? 'text-amber-400'
                    : 'text-slate-300'
                }`}
              >
                {currentTrafficLevel}
              </span>
            </div>

          </div>

          {/* Traffic Along Route Dynamic Telemetry Card */}
          <div className="bg-navy-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Traffic Along Route
              </h4>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${
                trafficMode === 'live'
                  ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                  : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
              }`}>
                {trafficMode === 'live' ? 'Live Telemetry' : 'Historical Dataset'}
              </span>
            </div>

            {trafficLoading ? (
              <div className="py-4 text-center">
                <div className="w-full h-2 rounded-full overflow-hidden bg-slate-800 mb-2">
                  <div className="w-1/2 h-full bg-blue-500 animate-pulse rounded-full" />
                </div>
                <span className="text-[11px] text-slate-400">Querying traffic corridor speeds...</span>
              </div>
            ) : trafficMode === 'live' ? (
              trafficTelemetry && trafficTelemetry.status === 'live' && Array.isArray(trafficTelemetry.segments) && trafficTelemetry.segments.length > 0 ? (
                <div>
                  {/* Segmented bar across sampled route checkpoints */}
                  <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-800 mb-3 gap-0.5">
                    {trafficTelemetry.segments.map((seg, idx) => (
                      <div
                        key={idx}
                        className={`flex-1 h-full transition-colors ${
                          seg.color === '#ef4444' || seg.congestion_level === 'Heavy'
                            ? 'bg-rose-500'
                            : seg.color === '#f59e0b' || seg.congestion_level === 'Moderate'
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        }`}
                        title={`Point ${idx + 1}: ${seg.congestion_level} Traffic (${Math.round(seg.current_speed || 0)} km/h)`}
                      />
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-navy-950 p-2 rounded-xl border border-slate-800/80">
                      <span className="font-bold text-white block">
                        {Math.round(trafficTelemetry.average_current_speed || 0)} km/h
                      </span>
                      <span className="text-[10px] text-slate-400">Current Speed</span>
                    </div>
                    <div className="bg-navy-950 p-2 rounded-xl border border-slate-800/80">
                      <span className="font-bold text-slate-300 block">
                        {Math.round(trafficTelemetry.average_free_flow_speed || 0)} km/h
                      </span>
                      <span className="text-[10px] text-slate-400">Free Flow</span>
                    </div>
                    <div className="bg-navy-950 p-2 rounded-xl border border-slate-800/80">
                      <span className={`font-bold block ${
                        trafficTelemetry.overall_condition === 'Heavy'
                          ? 'text-rose-400'
                          : trafficTelemetry.overall_condition === 'Moderate'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}>
                        {trafficTelemetry.overall_condition || 'Light'}
                      </span>
                      <span className="text-[10px] text-slate-400">Flow Status</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="w-full h-2.5 rounded-full overflow-hidden bg-slate-800 mb-2.5">
                    <div className="w-full h-full bg-blue-600/60" />
                  </div>
                  <div className="text-[11px] text-slate-400 bg-navy-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="font-semibold text-slate-300 block mb-0.5">Live Traffic Unavailable</span>
                    <span>Route is rendered in neutral blue. Synthetic congestion is never displayed.</span>
                  </div>
                </div>
              )
            ) : (
              // Historical Mode
              trafficTelemetry && Array.isArray(trafficTelemetry.segments) && trafficTelemetry.segments.length > 0 ? (
                <div>
                  <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-800 mb-3 gap-0.5">
                    {trafficTelemetry.segments.map((seg, idx) => (
                      <div
                        key={idx}
                        className={`flex-1 h-full transition-colors ${
                          seg.unmatched
                            ? 'bg-slate-600'
                            : seg.color === '#ef4444' || seg.congestion_category === 'Heavy'
                            ? 'bg-rose-500'
                            : seg.color === '#f59e0b' || seg.congestion_category === 'Moderate'
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        }`}
                        title={seg.unmatched ? 'Unmatched Corridor (Neutral)' : `${seg.corridor_name}: ${seg.congestion_category}`}
                      />
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="bg-navy-950 p-2 rounded-xl border border-slate-800/80">
                      <span className="font-bold text-white block">
                        {trafficTelemetry.segments.filter((s) => !s.unmatched).length} / {trafficTelemetry.segments.length}
                      </span>
                      <span className="text-[10px] text-slate-400">Corridors Matched</span>
                    </div>
                    <div className="bg-navy-950 p-2 rounded-xl border border-slate-800/80">
                      <span className="font-bold text-purple-300 block">
                        Bangalore CSV
                      </span>
                      <span className="text-[10px] text-slate-400">16 Corridors DB</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 bg-navy-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="font-semibold text-slate-300 block mb-0.5">Historical Dataset Unavailable</span>
                  <span>Route is rendered in neutral blue.</span>
                </div>
              )
            )}
          </div>

          {/* Collapsible Turn-by-Turn Directions */}
          <CollapsibleDirections directions={routeData ? routeData.directions : []} />

        </div>

      </div>

    </div>
  );
}
