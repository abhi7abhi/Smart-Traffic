import React, { useState, useRef, useEffect, useCallback } from 'react';
import { submitCrashReport, fetchUserCrashReports } from '../services/api';
import { resolveCoordinates, KNOWN_LOCATIONS } from '../services/osrm';

export default function ReportCrashView({ currentUser, onOpenLogin, onOpenRegister, onReportSuccess }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const getTodayDate = () => new Date().toISOString().slice(0, 10);
  const getCurrentTime = () => new Date().toTimeString().slice(0, 5);

  const [facingMode, setFacingMode] = useState('environment'); // 'user' or 'environment'
  const [cameraActive, setCameraActive] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [cameraError, setCameraError] = useState('');

  // Form Fields: Date, Time, Location, Crash Type, Severity, Road Condition, Description
  const [reportDate, setReportDate] = useState(getTodayDate);
  const [reportTime, setReportTime] = useState(getCurrentTime);
  const [location, setLocation] = useState('Hosur Road near Silk Board, Bengaluru');
  const [crashType, setCrashType] = useState('Two-Wheeler Accident');
  const [severity, setSeverity] = useState('Moderate');
  const [weatherCondition, setWeatherCondition] = useState('Dry Surface');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // User's Previously Submitted Reports
  const [previousReports, setPreviousReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportsError, setReportsError] = useState(null);

  // Load user's previously submitted crash reports
  const loadUserReports = useCallback(async () => {
    if (!currentUser) {
      setPreviousReports([]);
      return;
    }
    setLoadingReports(true);
    setReportsError(null);
    try {
      const data = await fetchUserCrashReports();
      setPreviousReports(data.reports || []);
    } catch (err) {
      console.warn('Error loading previous reports:', err);
      setReportsError('Could not load previous crash reports.');
    } finally {
      setLoadingReports(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadUserReports();
  }, [loadUserReports]);

  // Initialize camera stream ONLY when user is authenticated
  const startCamera = async (mode = facingMode) => {
    stopCamera();
    setCameraError('');
    try {
      const constraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError('Camera access unavailable. You can also capture or upload a photo below.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (currentUser) {
      startCamera(facingMode);
    }
    return () => stopCamera();
  }, [currentUser, facingMode]);

  const flipCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setPhotoDataUrl(dataUrl);
    setPhotoPreview(dataUrl);
    setSubmitError('');
  };

  const handleFileFallback = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target.result;
        setPhotoDataUrl(dataUrl);
        setPhotoPreview(dataUrl);
        setSubmitError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const retakePhoto = () => {
    setPhotoDataUrl('');
    setPhotoPreview(null);
    startCamera(facingMode);
  };

  const [lastSubmitted, setLastSubmitted] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess(false);

    if (!currentUser) {
      setSubmitError('Authentication required. Please log in before reporting an incident.');
      return;
    }

    if (!location.trim()) {
      setSubmitError('Accident location is required.');
      return;
    }

    if (!description.trim()) {
      setSubmitError('Description is required. Please explain what happened at the scene.');
      return;
    }

    if (!photoDataUrl) {
      setSubmitError('Mandatory In-App Camera Photo required. Please capture a live photo before submitting.');
      return;
    }

    setSubmitting(true);
    const coords = resolveCoordinates(location) || { lat: 12.9716, lon: 77.5946 };
    const now = new Date();

    try {
      const payload = {
        location: location.trim(),
        latitude: coords.lat,
        longitude: coords.lon,
        crash_type: crashType,
        severity: severity,
        road_condition: weatherCondition,
        description: description.trim(),
        photo_data: photoDataUrl,
        report_date: reportDate,
        report_time: reportTime,
        captured_at: now.toISOString(),
        capture_lat: coords.lat,
        capture_lng: coords.lon,
      };

      const result = await submitCrashReport(payload);
      setSubmitSuccess(true);
      setLastSubmitted({
        reportId: result.report_id,
        location: location.trim(),
        severity: severity,
        crashType: crashType,
        status: result.status || 'Pending'
      });
      setDescription('');
      setPhotoDataUrl('');
      setPhotoPreview(null);
      await loadUserReports();
      if (onReportSuccess) onReportSuccess(result);
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. GUEST VIEW: Clean sign-in prompt (Form is NOT opened for unauthenticated users)
  // ─────────────────────────────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-20 text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-3xl mx-auto flex items-center justify-center shadow-lg shadow-amber-500/10">
          🛡️
        </div>
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Authentication Required</span>
          <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">Sign In to Report an Incident</h2>
        </div>
        <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
          Please log in or create an account before reporting an incident. This helps us identify the reporter and maintain reliable incident records.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            id="btnReportLoginPrompt"
            type="button"
            onClick={onOpenLogin}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02]"
          >
            Log In
          </button>
          <button
            id="btnReportRegisterPrompt"
            type="button"
            onClick={onOpenRegister}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-all hover:scale-[1.02]"
          >
            Create Account
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. AUTHENTICATED USER VIEW: Incident reporting form with camera capture
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fade-in">
      
      {/* Header */}
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Incident Dispatch</span>
        <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Submit Incident Report</h1>
        <p className="text-xs text-slate-400 mt-1">
          Mandatory in-app camera capture ensures tamper-proof verification before incident broadcast.
        </p>
      </div>

      {submitSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">✅</span>
            <strong className="text-sm font-bold text-white">Crash Report Successfully Registered!</strong>
          </div>
          <p className="text-slate-300 leading-relaxed">
            Report ID: <strong className="text-emerald-400">CR-{String(lastSubmitted?.reportId || '').padStart(4, '0')}</strong> • Status: <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">{lastSubmitted?.status || 'Pending'}</span>
          </p>
          <p className="text-slate-400 text-[11px]">
            Your report is live in the Community Accident Alert System. Drivers with routes passing through <strong className="text-white">{lastSubmitted?.location}</strong> will be warned and offered an alternative detour.
          </p>
        </div>
      )}

      {submitError && (
        <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>{submitError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Column: Camera Viewport (6 cols) */}
        <div className="md:col-span-6 bg-navy-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase text-white flex items-center gap-2">
                <span>📸</span> <span>Mandatory In-App Camera</span>
              </span>

              {/* Flip Camera Button */}
              <button
                id="btnFlipCamera"
                type="button"
                onClick={flipCamera}
                className="btn-flip-camera px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition-colors [touch-action:manipulation]"
                title="Flip Camera"
              >
                <span>🔄</span> <span>Flip Camera</span>
              </button>
            </div>

            {/* Viewport Frame */}
            <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-black border border-slate-700/80 flex items-center justify-center">
              {photoPreview ? (
                <img src={photoPreview} alt="Captured crash" className="w-full h-full object-cover" />
              ) : (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {!cameraActive && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-navy-950/90 text-xs text-slate-400">
                      <span className="text-3xl mb-2">📷</span>
                      <p>{cameraError || 'Camera stream offline.'}</p>
                    </div>
                  )}
                </>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </div>

          {/* Camera Action Buttons */}
          <div className="mt-4 flex flex-col gap-2">
            {photoPreview ? (
              <button
                type="button"
                onClick={retakePhoto}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition-colors"
              >
                🔄 Retake Photo
              </button>
            ) : (
              <button
                type="button"
                onClick={capturePhoto}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs uppercase tracking-wider shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.01]"
              >
                📸 Capture Crash Photo
              </button>
            )}

            <div className="text-center mt-1">
              <label className="text-[11px] text-slate-400 hover:text-white cursor-pointer underline">
                Or upload image from device
                <input type="file" accept="image/*" onChange={handleFileFallback} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Incident Telemetry Inputs (6 cols) */}
        <div className="md:col-span-6 bg-navy-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          
          {/* Date and Time Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Incident Date
              </label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Incident Time
              </label>
              <input
                type="time"
                value={reportTime}
                onChange={(e) => setReportTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Corridor / Incident Location
            </label>
            <input
              type="text"
              list="reportLocList"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Hosur Road near Silk Board"
              className="w-full px-3.5 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none"
              required
            />
            <datalist id="reportLocList">
              {Object.keys(KNOWN_LOCATIONS).map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Crash Type</label>
              <select
                value={crashType}
                onChange={(e) => setCrashType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none"
              >
                <option value="Two-Wheeler Accident">Two-Wheeler Accident</option>
                <option value="Rear-End Collision">Rear-End Collision</option>
                <option value="Side Impact / T-Bone">Side Impact / T-Bone</option>
                <option value="Pedestrian Incident">Pedestrian Incident</option>
                <option value="Vehicle Breakdown">Vehicle Breakdown</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Surface / Weather Condition</label>
            <select
              value={weatherCondition}
              onChange={(e) => setWeatherCondition(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none"
            >
              <option value="Dry Surface">Dry Surface</option>
              <option value="Wet / Waterlogged">Wet / Waterlogged</option>
              <option value="Poor Visibility / Fog">Poor Visibility / Fog</option>
              <option value="Under Construction">Under Construction</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description / Notes
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe road conditions, blocked lanes, or emergency services presence..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs focus:border-blue-500 focus:outline-none resize-none"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || !photoDataUrl}
              className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg transition-all ${
                !photoDataUrl
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : submitting
                  ? 'bg-blue-700 text-white cursor-wait'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 hover:scale-[1.01]'
              }`}
            >
              {submitting ? 'Submitting Report...' : !photoDataUrl ? '📸 Capture Live Photo First' : '🚀 Broadcast Verified Report'}
            </button>
          </div>

        </div>

      </form>

      {/* Previously Submitted Crash Reports Table */}
      <div className="bg-navy-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>📋</span>
              <span>Your Submitted Crash Reports</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Review and track incident reports previously submitted from your authenticated account.
            </p>
          </div>
          <button
            type="button"
            onClick={loadUserReports}
            disabled={loadingReports}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span className={loadingReports ? 'animate-spin' : ''}>🔄</span>
            <span>Refresh Reports</span>
          </button>
        </div>

        {reportsError && (
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs rounded-xl">
            {reportsError}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-navy-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Date</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Time</th>
                <th className="px-4 py-3 font-bold">Location</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Crash Type</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Road Condition</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-[#070d1e]/50 font-normal">
              {loadingReports ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-400">
                    <span className="inline-block animate-spin text-lg mb-1">⏳</span>
                    <div>Loading your submitted reports...</div>
                  </td>
                </tr>
              ) : previousReports.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-10 text-center text-slate-400">
                    <div className="max-w-sm mx-auto space-y-1.5">
                      <span className="text-2xl block">📝</span>
                      <p className="text-xs font-semibold text-slate-300">No crash reports submitted yet</p>
                      <p className="text-[11px] text-slate-500">
                        Use the incident dispatch form above with your camera to report a road crash.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                previousReports.map((item) => {
                  const sevLower = (item.severity || '').toLowerCase();
                  let sevClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                  if (sevLower.includes('high') || sevLower.includes('critical')) {
                    sevClass = 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold';
                  } else if (sevLower.includes('med') || sevLower.includes('mod')) {
                    sevClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold';
                  }

                  const dateDisplay = item.report_date || (item.created_at ? item.created_at.slice(0, 10) : '—');
                  const timeDisplay = item.report_time || (item.created_at ? item.created_at.slice(11, 16) : '—');

                  return (
                    <tr key={item.report_id || Math.random()} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-200 whitespace-nowrap">
                        {dateDisplay}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                        {timeDisplay}
                      </td>
                      <td className="px-4 py-3 font-semibold text-white max-w-xs truncate" title={item.location}>
                        {item.location}
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {item.crash_type || 'Accident'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {item.road_condition || 'Normal'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] border tracking-wide uppercase inline-flex items-center gap-1 ${sevClass}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {item.severity || 'Low'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
