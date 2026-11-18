import React, { useState, useEffect, useRef } from 'react';
import { searchLocations } from '../services/osrm';

/**
 * Reusable location input with real-time debounced geocoding autocomplete.
 * Strictly uses Tailwind CSS classes with zero inline styles.
 * Provides distinct place names, localities, and prevents arbitrary fallbacks.
 */
export default function LocationAutocompleteInput({
  id,
  label,
  value,
  onChange,
  onSelectLocation,
  onClear,
  placeholder = 'Search location...',
  iconType = 'origin', // 'origin' (green pin) or 'destination' (red pin)
  rightSlot = null,
  disabled = false,
  required = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const containerRef = useRef(null);
  const debounceTimer = useRef(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch suggestions with 300ms debounce
  const fetchSuggestions = (query) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        const results = await searchLocations(query.trim(), 6);
        setSuggestions(results || []);
        setIsOpen(true);
        setHighlightIndex(-1);
      } catch (err) {
        console.warn('Autocomplete fetch error:', err);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleInputChange = (e) => {
    const text = e.target.value;
    onChange(text);
    fetchSuggestions(text);
  };

  const handleSelect = (item) => {
    const formattedName = item.display_name || item.name;
    onSelectLocation({
      name: item.name,
      displayName: formattedName,
      lat: item.lat,
      lon: item.lon,
      placeId: item.place_id,
    });
    setIsOpen(false);
    setSuggestions([]);
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="w-full flex items-center gap-2 bg-[#111e3e]/90 border border-white/10 rounded-xl px-3.5 py-2.5 text-left relative focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400/40 transition-all">
        
        {/* Pin Icon */}
        <span className="shrink-0">
          {iconType === 'origin' ? (
            <svg className="w-4 h-4 fill-emerald-500" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 fill-rose-500" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          )}
        </span>

        {/* Input & Label */}
        <div className="flex-1 min-w-0 pr-1">
          {label && (
            <label htmlFor={id} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block leading-none mb-0.5">
              {label}
            </label>
          )}
          <input
            id={id}
            type="text"
            value={value}
            onChange={handleInputChange}
            onFocus={() => {
              if (suggestions.length > 0) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            autoComplete="off"
            className="w-full bg-transparent text-white text-xs sm:text-sm font-semibold placeholder-slate-500 focus:outline-none"
          />
        </div>

        {/* Right Action Slot (My Location, Clear button, Loading spinner) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {loading && (
            <svg className="w-3.5 h-3.5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
          )}

          {rightSlot}

          {value && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="text-slate-400 hover:text-white text-xs px-1"
              aria-label="Clear location input"
              title="Clear"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Floating Autocomplete Suggestions Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#0b142a] border border-slate-700/80 rounded-xl shadow-[0_12px_30px_rgba(0,0,0,0.7)] z-50 overflow-hidden divide-y divide-slate-800/80 max-h-64 overflow-y-auto">
          {suggestions.length === 0 ? (
            <div className="px-4 py-3 text-center text-xs text-slate-400">
              No matching locations found in Bengaluru area.
            </div>
          ) : (
            suggestions.map((item, idx) => {
              const isHighlighted = idx === highlightIndex;
              return (
                <button
                  key={item.place_id || idx}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  className={`w-full px-3.5 py-2.5 text-left flex items-start gap-2.5 transition-colors cursor-pointer ${
                    isHighlighted ? 'bg-blue-600/25 text-white' : 'hover:bg-slate-800/60 text-slate-200'
                  }`}
                >
                  <span className="shrink-0 mt-0.5 text-slate-400">
                    📍
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-white truncate">
                      {item.name}
                    </div>
                    {item.secondary && (
                      <div className="text-[11px] text-slate-400 truncate">
                        {item.secondary}
                      </div>
                    )}
                  </div>
                  {item.lat && item.lon && (
                    <span className="shrink-0 text-[10px] font-mono text-cyan-400/80 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-800/30">
                      {item.lat.toFixed(2)}°, {item.lon.toFixed(2)}°
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
