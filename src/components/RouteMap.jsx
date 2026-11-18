import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

export default function RouteMap({
  routeData,
  rerouteData,
  activeRouteType,
  incident,
  focusCoords,
  liveLocation = null,
  trafficMode = 'live',
  onToggleTrafficMode = null,
  showTrafficLayer = true,
  onToggleTrafficLayer = null,
  trafficTelemetry = null,
  trafficLoading = false,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const layersGroupRef = useRef(null);
  const incidentGroupRef = useRef(null);
  const liveTrackingGroupRef = useRef(null);

  // Map layer mode: 'street' (OpenStreetMap with full labels), 'dark' (CartoDB Dark Matter), 'satellite' (Esri Imagery)
  const [mapLayerType, setMapLayerType] = useState('street');
  const [localTrafficMode, setLocalTrafficMode] = useState('live');
  const [localShowTrafficLayer, setLocalShowTrafficLayer] = useState(true);

  const effectiveTrafficMode = trafficMode !== undefined ? trafficMode : localTrafficMode;
  const effectiveShowTrafficLayer = showTrafficLayer !== undefined ? showTrafficLayer : localShowTrafficLayer;

  const handleTrafficModeChange = (mode) => {
    if (onToggleTrafficMode) {
      onToggleTrafficMode(mode);
    } else {
      setLocalTrafficMode(mode);
    }
  };

  const handleShowTrafficLayerChange = (show) => {
    if (onToggleTrafficLayer) {
      onToggleTrafficLayer(show);
    } else {
      setLocalShowTrafficLayer(show);
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Center on central Bengaluru (between Hebbal and Electronic City)
    const map = L.map(mapContainerRef.current, {
      center: [12.9716, 77.5946],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    // Zoom controls placed at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Initial default tile layer: Standard OpenStreetMap (Guaranteed 100% road visibility across Bengaluru)
    const initialTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: ['a', 'b', 'c'],
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    tileLayerRef.current = initialTile;

    const layersGroup = L.layerGroup().addTo(map);
    const incidentGroup = L.layerGroup().addTo(map);
    const liveGroup = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    layersGroupRef.current = layersGroup;
    incidentGroupRef.current = incidentGroup;
    liveTrackingGroupRef.current = liveGroup;

    // Critical fix: call invalidateSize multiple times after DOM paint to ensure map fills 100% container
    const t1 = setTimeout(() => { if (map) map.invalidateSize(); }, 60);
    const t2 = setTimeout(() => { if (map) map.invalidateSize(); }, 250);
    const t3 = setTimeout(() => { if (map) map.invalidateSize(); }, 600);

    // Observe container resizes (e.g. sidebar collapse, window resize)
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      ro = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      ro.observe(mapContainerRef.current);
    }

    const onWindowResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    window.addEventListener('resize', onWindowResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', onWindowResize);
      if (ro) ro.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Map Tile Layer Switching (Street, Dark, Satellite)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    let newTile = null;

    if (mapLayerType === 'satellite') {
      // High-resolution Esri World Imagery
      newTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
        attribution: 'Tiles &copy; Esri',
      });
    } else if (mapLayerType === 'dark') {
      // High-resolution Esri World Dark Gray Canvas (Clean dark tiles, zero API keys or watermarks)
      newTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
      });
    } else {
      // Default: Standard OpenStreetMap (Displays every Bengaluru road, junction, and flyover)
      newTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        subdomains: ['a', 'b', 'c'],
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      });
    }

    newTile.addTo(map);
    tileLayerRef.current = newTile;

    // Invalidate size to ensure fresh tiles immediately cover full frame
    map.invalidateSize();
  }, [mapLayerType]);

  // Render Routes, Start/End Markers, and Traffic Overlays
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layers = layersGroupRef.current;
    if (!map || !layers || !routeData || !routeData.latLngs || routeData.latLngs.length === 0) return;

    layers.clearLayers();

    const startCoords = routeData.startCoords || { lat: routeData.latLngs[0][0], lon: routeData.latLngs[0][1] };
    const destCoords = routeData.destCoords || { lat: routeData.latLngs[routeData.latLngs.length - 1][0], lon: routeData.latLngs[routeData.latLngs.length - 1][1] };

    // 1. Start Marker (Green Pin with 'A' for Hebbal)
    const startIcon = L.divIcon({
      className: 'bg-transparent !border-0 flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-110 drop-shadow-md',
      html: `
        <div style="background: linear-gradient(135deg, #10b981, #059669); width: 28px; height: 28px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2.5px solid #ffffff; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.6); display: flex; align-items: center; justify-content: center;">
          <span style="transform: rotate(45deg); font-size: 11px; font-weight: 900; color: #ffffff;">A</span>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });

    L.marker([startCoords.lat, startCoords.lon], { icon: startIcon })
      .bindPopup(`<strong style="color:#10b981;">Route Origin</strong><br>${startCoords.name || 'Origin'}<br><span style="font-size:10px; color:#94a3b8;">${startCoords.lat.toFixed(4)}, ${startCoords.lon.toFixed(4)}</span>`)
      .addTo(layers);

    // 2. Destination Marker (Red Pin with 'B')
    const destIcon = L.divIcon({
      className: 'bg-transparent !border-0 flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-110 drop-shadow-md',
      html: `
        <div style="background: linear-gradient(135deg, #ef4444, #dc2626); width: 28px; height: 28px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2.5px solid #ffffff; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.6); display: flex; align-items: center; justify-content: center;">
          <span style="transform: rotate(45deg); font-size: 11px; font-weight: 900; color: #ffffff;">B</span>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });

    L.marker([destCoords.lat, destCoords.lon], { icon: destIcon })
      .bindPopup(`<strong style="color:#ef4444;">Destination</strong><br>${destCoords.name || 'Destination'}<br><span style="font-size:10px; color:#94a3b8;">${destCoords.lat.toFixed(4)}, ${destCoords.lon.toFixed(4)}</span>`)
      .addTo(layers);

    // 3. Polylines Rendering with High-Contrast Casing
    const coords = routeData.latLngs;

    if (activeRouteType === 'alternative' && rerouteData && rerouteData.geometry) {
      // CASE A: ALTERNATIVE DETOUR IS ACTIVE
      // Contrast casing underneath
      L.polyline(rerouteData.geometry, { color: '#070d1e', weight: 10, opacity: 0.75 }).addTo(layers);
      
      // Solid bright cyan active detour
      const altPoly = L.polyline(rerouteData.geometry, {
        color: '#06b6d4',
        weight: 6,
        opacity: 0.95
      }).addTo(layers);
      altPoly.bindPopup(`<strong>Active Detour Route</strong><br>${rerouteData.distance_km} km • ${rerouteData.duration_mins} mins`);

      // Faded original route
      L.polyline(coords, {
        color: '#64748b',
        weight: 4,
        opacity: 0.6,
        dashArray: '6, 8'
      }).bindPopup(`<strong>Original Corridor</strong><br>${routeData.distanceKm} km (Incident Affected)`).addTo(layers);

      map.invalidateSize();
      map.fitBounds(L.latLngBounds(rerouteData.geometry), { padding: [55, 55], maxZoom: 16 });

    } else {
      // CASE B: ORIGINAL ROUTE ACTIVE
      // Contrast casing underneath
      L.polyline(coords, { color: '#070d1e', weight: 10, opacity: 0.75 }).addTo(layers);

      // Base route is ALWAYS drawn in neutral blue (#2563eb)
      const baseRoute = L.polyline(coords, { color: '#2563eb', weight: 6, opacity: 0.95 }).addTo(layers);
      baseRoute.bindPopup(`<strong>Standard Route</strong><br>${routeData.distanceKm} km • ${routeData.durationMins} mins`);

      // Overlay dynamic traffic segments only when supported by valid telemetry
      if (effectiveShowTrafficLayer && trafficTelemetry && Array.isArray(trafficTelemetry.segments) && trafficTelemetry.segments.length > 0) {
        const segs = trafficTelemetry.segments;
        const totalPoints = coords.length;
        const segCount = segs.length;

        for (let i = 0; i < segCount; i++) {
          const seg = segs[i];
          const startIdx = Math.floor((i / segCount) * totalPoints);
          const endIdx = i === segCount - 1 ? totalPoints : Math.min(totalPoints, Math.floor(((i + 1) / segCount) * totalPoints) + 1);
          const slice = coords.slice(startIdx, endIdx);

          if (slice.length > 1) {
            let segColor = '#2563eb';
            let popupContent = '';

            if (effectiveTrafficMode === 'live' && trafficTelemetry.status === 'live') {
              // Live Mode (TomTom Traffic Flow API)
              // Thresholds:
              // ratio >= 0.75 -> Light (#10b981)
              // 0.45 <= ratio < 0.75 -> Moderate (#f59e0b)
              // ratio < 0.45 or road closure -> Heavy (#ef4444)
              segColor = seg.color || (
                seg.speed_ratio >= 0.75 ? '#10b981' :
                seg.speed_ratio >= 0.45 ? '#f59e0b' : '#ef4444'
              );
              popupContent = `
                <div class="text-xs">
                  <div class="font-bold flex items-center gap-1.5 mb-1" style="color:${segColor}">
                    <span>🚦</span> <span>Live Traffic: ${seg.congestion_level || 'Normal'}</span>
                  </div>
                  <div>Current Speed: <strong>${Math.round(seg.current_speed || 0)} km/h</strong></div>
                  <div>Free Flow Speed: <strong>${Math.round(seg.free_flow_speed || 0)} km/h</strong></div>
                  <div class="text-[10px] text-slate-400 mt-1">Source: TomTom Live Flow API</div>
                </div>
              `;
            } else if (effectiveTrafficMode === 'historical') {
              // Historical Mode (Bangalore Traffic Dataset CSV)
              if (seg.unmatched) {
                // Unmatched road segment: ALWAYS neutral slate grey, NEVER red!
                segColor = '#64748b';
                popupContent = `
                  <div class="text-xs">
                    <div class="font-bold text-slate-300 mb-1">Unmatched Road Segment</div>
                    <div class="text-[11px] text-slate-400">No historical record in Banglore_traffic_Dataset.csv.</div>
                    <div class="text-[10px] text-slate-400 mt-1">Rendered in neutral slate grey</div>
                  </div>
                `;
              } else {
                segColor = seg.color || (
                  seg.congestion_category === 'Heavy' ? '#ef4444' :
                  seg.congestion_category === 'Moderate' ? '#f59e0b' : '#10b981'
                );
                popupContent = `
                  <div class="text-xs">
                    <div class="font-bold flex items-center gap-1.5 mb-1" style="color:${segColor}">
                      <span>📊</span> <span>${seg.corridor_name || 'Historical Corridor'}</span>
                    </div>
                    <div>Congestion: <strong>${seg.congestion_category} (${seg.congestion_level_pct}%)</strong></div>
                    <div>Avg Speed: <strong>${Math.round(seg.average_speed_kmh || 0)} km/h</strong></div>
                    <div class="text-[10px] text-slate-400 mt-1">Source: Banglore_traffic_Dataset.csv</div>
                  </div>
                `;
              }
            }

            const poly = L.polyline(slice, {
              color: segColor,
              weight: 6,
              opacity: 0.95,
            }).addTo(layers);

            poly.bindPopup(popupContent);
          }
        }
      }

      // If alternative detour is available, show as distinct dashed cyan polyline
      if (rerouteData && rerouteData.has_alternative && rerouteData.geometry) {
        const dashedAlt = L.polyline(rerouteData.geometry, {
          color: '#06b6d4',
          weight: 5,
          opacity: 0.9,
          dashArray: '8, 12'
        }).addTo(layers);
        dashedAlt.bindPopup(`<strong>Alternative Bypass Detour</strong><br>${rerouteData.distance_km} km • ${rerouteData.duration_mins} mins`);
      }

      map.invalidateSize();
      map.fitBounds(L.latLngBounds(coords), { padding: [55, 55], maxZoom: 16 });
    }

  }, [routeData, rerouteData, activeRouteType, effectiveShowTrafficLayer, effectiveTrafficMode, trafficTelemetry]);

  // Handle Incident Marker Rendering & Focus on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const incGroup = incidentGroupRef.current;
    if (!map || !incGroup) return;

    incGroup.clearLayers();

    if (!incident || typeof incident.latitude !== 'number' || typeof incident.longitude !== 'number') {
      return;
    }

    const isVerified = incident.is_verified;
    const markerColor = incident.severity === 'High' ? '#ef4444' : '#ea580c';
    const statusText = isVerified ? 'Verified Official Incident' : 'Unverified Community Report';
    const photoImg = incident.photo_path
      ? `<div style="margin-top:6px; width:100%; height:75px; border-radius:6px; overflow:hidden; background:#000;"><img src="/api/photos/${incident.photo_path}" style="width:100%; height:100%; object-fit:cover;" /></div>`
      : '';

    const circle = L.circleMarker([incident.latitude, incident.longitude], {
      radius: 12,
      fillColor: markerColor,
      color: '#ffffff',
      weight: 2.5,
      opacity: 1,
      fillOpacity: 0.95
    }).addTo(incGroup);

    circle.bindPopup(`
      <div style="font-size:12px; line-height:1.4; min-width:180px;">
        <strong style="color:${markerColor}; font-size:13px; display:block; margin-bottom:4px;">⚠️ Incident Reported</strong>
        <div><strong>${incident.location || 'Reported Corridor'}</strong></div>
        <div style="font-size:11px; color:#94a3b8; margin:2px 0;">Type: ${incident.crash_type || 'Vehicle Incident'} • ${incident.severity || 'Moderate'}</div>
        <div style="font-size:11px; color:#94a3b8;">Status: <span style="color:${isVerified ? '#10b981' : '#f59e0b'}; font-weight:600;">${statusText}</span></div>
        <div style="font-size:11px; margin-top:4px; color:#e2e8f0;">${incident.description || 'Active incident reported along road corridor.'}</div>
        ${photoImg}
      </div>
    `);

    // If focused on this incident, pan to it and open popup
    if (focusCoords && Math.abs(focusCoords.lat - incident.latitude) < 0.0001 && Math.abs(focusCoords.lon - incident.longitude) < 0.0001) {
      map.setView([incident.latitude, incident.longitude], 15);
      circle.openPopup();
    }
  }, [incident, focusCoords]);

  // Render Live GPS Location Tracking Beacon
  useEffect(() => {
    const map = mapInstanceRef.current;
    const liveGroup = liveTrackingGroupRef.current;
    if (!map || !liveGroup) return;

    liveGroup.clearLayers();

    if (!liveLocation || typeof liveLocation.lat !== 'number' || typeof liveLocation.lon !== 'number') {
      return;
    }

    const { lat, lon, accuracy, speed } = liveLocation;

    // 1. Accuracy radius circle
    if (accuracy && accuracy > 0) {
      L.circle([lat, lon], {
        radius: Math.min(accuracy, 300),
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
        weight: 1.5,
        interactive: false,
      }).addTo(liveGroup);
    }

    // 2. High-precision GPS Location Puck with animated pulsing glow
    const liveIcon = L.divIcon({
      className: 'bg-transparent !border-0 flex items-center justify-center cursor-pointer',
      html: `
        <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: rgba(59, 130, 246, 0.4); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 14px; height: 14px; border-radius: 50%; background: #2563eb; border: 2.5px solid #ffffff; box-shadow: 0 0 10px rgba(37, 99, 235, 0.9);"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const speedStr = speed && speed > 0 ? ` • ${(speed * 3.6).toFixed(1)} km/h` : '';
    L.marker([lat, lon], { icon: liveIcon, zIndexOffset: 1000 })
      .bindPopup(`<strong>Your Current GPS Location</strong><br>Accuracy: ±${Math.round(accuracy || 10)}m${speedStr}`)
      .addTo(liveGroup);

  }, [liveLocation]);

  // Recenter Route Handler
  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.invalidateSize();
    if (activeRouteType === 'alternative' && rerouteData && rerouteData.geometry) {
      map.fitBounds(L.latLngBounds(rerouteData.geometry), { padding: [55, 55], maxZoom: 16 });
    } else if (routeData && routeData.latLngs) {
      map.fitBounds(L.latLngBounds(routeData.latLngs), { padding: [55, 55], maxZoom: 16 });
    }
  };

  return (
    <div className="relative w-full h-[560px] sm:h-[600px] lg:h-[640px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-navy-950">
      
      {/* Map Canvas (Guaranteed 100% width and height with absolute positioning) */}
      <div 
        id="routeMapCanvas" 
        ref={mapContainerRef} 
        className="w-full h-full absolute inset-0 z-0" 
      />

      {/* Top Left: Traffic Flow Legend Card */}
      <div className="absolute top-4 left-4 z-10 bg-navy-950/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-2xl max-w-xs text-xs text-slate-200">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <span className="text-sm">🚦</span>
            <span>Traffic Flow</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
              effectiveTrafficMode === 'live'
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
            }`}>
              {effectiveTrafficMode === 'live' ? 'LIVE TOMTOM' : 'CSV DATASET'}
            </span>
          </div>
          <label className="flex items-center gap-1 cursor-pointer">
            <input 
              type="checkbox"
              checked={effectiveShowTrafficLayer}
              onChange={(e) => handleShowTrafficLayerChange(e.target.checked)}
              className="accent-blue-600 rounded cursor-pointer"
            />
            <span className="text-[10px] text-slate-400 font-medium">Overlay</span>
          </label>
        </div>

        {/* Traffic Mode Selector */}
        <div className="grid grid-cols-2 gap-1 mb-2.5">
          <button
            type="button"
            onClick={() => handleTrafficModeChange('live')}
            className={`py-1 px-2 rounded text-[10px] font-bold transition-colors cursor-pointer ${
              effectiveTrafficMode === 'live'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            🔴 Live (TomTom)
          </button>
          <button
            type="button"
            onClick={() => handleTrafficModeChange('historical')}
            className={`py-1 px-2 rounded text-[10px] font-bold transition-colors cursor-pointer ${
              effectiveTrafficMode === 'historical'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            📊 Historical (CSV)
          </button>
        </div>

        {/* Live Traffic telemetry status or Historical dataset notice */}
        {effectiveTrafficMode === 'live' ? (
          <div>
            {trafficLoading ? (
              <div className="text-[11px] text-blue-300 py-1 flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span>Checking live corridor speeds...</span>
              </div>
            ) : trafficTelemetry && trafficTelemetry.status === 'live' ? (
              <div className="text-[10px] text-slate-400 mb-2 flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Real-time Speed</span>
                </span>
                <span>{trafficTelemetry.last_updated || 'Updated just now'}</span>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 mb-2 p-1.5 rounded bg-slate-900 border border-slate-800">
                <span className="font-semibold text-slate-300 block mb-0.5">Live Traffic Unavailable</span>
                <span>Route rendered in neutral blue; synthetic congestion is never displayed.</span>
              </div>
            )}

            {/* Threshold legend for live speed ratio */}
            <div className="space-y-1.5 text-[11px] pt-1 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="w-4 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-slate-300 font-medium">Light Flow (≥ 75% speed)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="text-slate-300 font-medium">Moderate (45%–74% speed)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-slate-300 font-medium">Heavy / Delay (&lt; 45% speed)</span>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-[10px] text-purple-300 mb-2 border-b border-slate-800/80 pb-1.5">
              <span>Banglore_traffic_Dataset.csv (16 Corridors)</span>
            </div>
            <div className="space-y-1.5 text-[11px] pt-1 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="w-4 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-slate-300 font-medium">Low Congestion (&lt; 50%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="text-slate-300 font-medium">Medium Congestion (50%–75%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-slate-300 font-medium">High Congestion (≥ 75%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-1.5 rounded-full bg-slate-500 shrink-0" />
                <span className="text-slate-400 font-medium">Unmatched Road (Neutral)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top Right: Layer Switcher (Street Map, Dark Mode, Satellite) */}
      <div className="absolute top-4 right-4 z-10 flex items-center bg-navy-950/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-2xl">
        <button
          type="button"
          onClick={() => setMapLayerType('street')}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors ${
            mapLayerType === 'street'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
          }`}
          title="Standard Street Map with all Bengaluru roads, flyovers, and labels"
        >
          <span>🗺️</span> <span>Street</span>
        </button>
        <button
          type="button"
          onClick={() => setMapLayerType('dark')}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors ${
            mapLayerType === 'dark'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
          }`}
          title="Classy Dark Navy Map"
        >
          <span>🌙</span> <span>Dark</span>
        </button>
        <button
          type="button"
          onClick={() => setMapLayerType('satellite')}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors ${
            mapLayerType === 'satellite'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
          }`}
          title="High-Resolution Satellite Imagery"
        >
          <span>🛰️</span> <span>Satellite</span>
        </button>
      </div>

      {/* Bottom Left: Recenter Route Button */}
      <button
        type="button"
        onClick={handleRecenter}
        className="absolute bottom-4 left-4 z-10 px-3 py-1.5 rounded-lg bg-navy-950/95 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-200 shadow-xl flex items-center gap-1.5 transition-colors"
        title="Recenter Map to Route"
      >
        <span>⌖</span>
        <span>Recenter Route</span>
      </button>

    </div>
  );
}
