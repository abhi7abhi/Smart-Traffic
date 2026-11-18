import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export default function HomeHeroMap() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Initialize Leaflet map centered on Bengaluru arterial core
    const map = L.map(mapContainerRef.current, {
      center: [12.9716, 77.6150],
      zoom: 12,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false, // Prevent page scrolling interception
    });

    // Dark canvas base layer
    const darkBaseLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 16,
        attribution: 'Tiles &copy; Esri',
      }
    ).addTo(map);

    // High-Definition Night Traffic Map ImageOverlay (Matching Screenshot 1 exactly)
    const imageBounds = [
      [12.8000, 77.4600], // South-West (Electronic City / Nice Rd perimeter)
      [13.1400, 77.7800], // North-East (Hebbal / Airport Rd / Whitefield perimeter)
    ];

    const trafficOverlay = L.imageOverlay('/assets/hero-bengaluru-map-hd.png', imageBounds, {
      opacity: 0.98,
      interactive: false,
    }).addTo(map);

    // Interactive Leaflet Zoom Controls placed at bottom right (Matching screenshot layout)
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Active live incidents layer group with interactive popups
    const incidentsGroup = L.layerGroup().addTo(map);

    fetch('/api/incidents/active')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !data.incidents) return;
        data.incidents.forEach((inc) => {
          if (!inc.latitude || !inc.longitude) return;
          const markerIcon = L.divIcon({
            className: 'bg-transparent border-0',
            html: `
              <div style="transform: translate(-50%, -50%); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 14px; height: 14px; background: #ef4444; border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 0 8px rgba(239, 68, 68, 0.9);">
                <span style="color: #ffffff; font-size: 8px; font-weight: bold; line-height: 1;">!</span>
              </div>
            `,
            iconSize: [14, 14],
          });

          const m = L.marker([inc.latitude, inc.longitude], { icon: markerIcon }).addTo(incidentsGroup);
          m.bindPopup(`
            <div style="font-family: system-ui, sans-serif; font-size: 12px; color: #0f172a; min-width: 170px;">
              <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background-color: #fee2e2; color: #b91c1c;">
                LIVE INCIDENT
              </span>
              <div style="font-weight: bold; margin-top: 4px; font-size: 13px;">${inc.crash_type}</div>
              <div style="font-size: 11px; color: #475569;">${inc.location}</div>
              <div style="margin-top: 4px; font-size: 10px; color: ${inc.is_verified ? '#059669' : '#d97706'}; font-weight: 600;">
                ${inc.verification_badge || (inc.is_verified ? 'Verified Official Incident' : 'Pending Verification')}
              </div>
            </div>
          `);
        });
      })
      .catch((err) => {
        console.warn('Active incidents API check skipped:', err);
      });

    mapInstanceRef.current = map;

    // Staggered size invalidation to ensure full container coverage
    const t1 = setTimeout(() => { if (map) map.invalidateSize(); }, 80);
    const t2 = setTimeout(() => { if (map) map.invalidateSize(); }, 300);

    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      ro = new ResizeObserver(() => {
        if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
      });
      ro.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (ro) ro.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-[400px] sm:h-[460px] lg:h-full min-h-[460px] overflow-hidden select-none">
      
      {/* Real Interactive Leaflet Map Canvas */}
      <div
        ref={mapContainerRef}
        className="w-full h-full absolute inset-0 z-0 bg-[#060b18] outline-none"
      />

      {/* Natural Left Edge Gradient Fade Mask (Seamless blend into dark navy hero on desktop) */}
      <div className="hidden lg:block pointer-events-none absolute inset-y-0 left-0 w-36 bg-gradient-to-r from-[#060b18] via-[#060b18]/80 to-transparent z-10" />

      {/* Top Edge Gradient Fade */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#060b18] to-transparent z-10" />

      {/* Bottom Edge Gradient Fade */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#060b18] to-transparent z-10" />

      {/* Top Right Live Telemetry Badge (Matching Screenshot 1 exactly) */}
      <div className="absolute top-4 right-4 z-20 pointer-events-none">
        <div className="px-3 py-1.5 rounded-lg bg-black/85 border border-slate-700/80 text-[10px] font-mono text-slate-300 font-bold tracking-wider backdrop-blur-md shadow-xl flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>BENGALURU - NIGHT TRAFFIC [GMT+5:30]</span>
        </div>
      </div>

    </div>
  );
}
