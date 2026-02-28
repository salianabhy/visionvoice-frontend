// CameraView.jsx — Fixed Version
//
// ROOT CAUSES OF "not analysing" bug:
//
// BUG 1 — Shared canvas race condition:
//   The edge loop ran every 80ms and called capCvs.width = video.videoWidth,
//   which CLEARS the canvas. The AI capture also drew onto that same canvas
//   then called toBlob(). If the edge loop resized the canvas between the
//   drawImage() and toBlob() calls, toBlob() got a blank white image.
//   BLIP then described "a white background" or the callback silently failed.
//   FIX: Two separate canvases — edgeSrcCanvas (edge loop only) and
//        aiCanvas (AI capture only). They never touch each other.
//
// BUG 2 — Stale closure in setInterval:
//   captureAndDescribe was created with useCallback([speak]).
//   The setInterval inside startCamera captured the version of
//   captureAndDescribe at mount time. When speak changed (isMuted toggle),
//   a new captureAndDescribe was created but the old interval kept calling
//   the outdated one.
//   FIX: Store the latest captureAndDescribe in a ref. The interval always
//        calls captureRef.current() — always the freshest version.

import { useRef, useState, useEffect, useCallback } from "react";

const BACKEND        = "https://visionvoicee.onrender.com";
const CAPTURE_EVERY  = 7000;  // 7s between AI calls
const JPEG_QUALITY   = 0.92;
const EDGE_INTERVAL  = 80;    // ~12fps edge redraw

// ── Sobel edge detection (runs in browser, no library) ────────────────────────
function applySobel(srcCanvas, dstCanvas, color = "#38bdf8", threshold = 30) {
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;
  if (!sw || !sh) return;

  const srcCtx = srcCanvas.getContext("2d");
  const dstCtx = dstCanvas.getContext("2d");
  dstCanvas.width  = sw;
  dstCanvas.height = sh;

  const src = srcCtx.getImageData(0, 0, sw, sh);
  const dst = dstCtx.createImageData(sw, sh);
  const d   = src.data;

  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  const luma = (x, y) => {
    if (x < 0 || x >= sw || y < 0 || y >= sh) return 0;
    const i = (y * sw + x) * 4;
    return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  };

  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const gx =
        -luma(x-1,y-1) + luma(x+1,y-1) +
        -2*luma(x-1,y) + 2*luma(x+1,y) +
        -luma(x-1,y+1) + luma(x+1,y+1);
      const gy =
        luma(x-1,y-1) + 2*luma(x,y-1) + luma(x+1,y-1) +
        -luma(x-1,y+1) - 2*luma(x,y+1) - luma(x+1,y+1);
      const mag = Math.sqrt(gx*gx + gy*gy);
      const i = (y * sw + x) * 4;
      if (mag > threshold) {
        dst.data[i]   = r;
        dst.data[i+1] = g;
        dst.data[i+2] = b;
        dst.data[i+3] = Math.min(255, mag * 1.2);
      } else {
        dst.data[i+3] = 0;
      }
    }
  }
  dstCtx.putImageData(dst, 0, 0);
}

function isSimilar(a, b) {
  if (!a || !b) return false;
  const wa = new Set(a.toLowerCase().split(/\s+/));
  const wb = new Set(b.toLowerCase().split(/\s+/));
  const shared = [...wa].filter(w => wb.has(w)).length;
  return shared / Math.max(wa.size, wb.size) > 0.72;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CameraView({ onStatusChange }) {
  const videoRef    = useRef(null);
  const aiCanvas    = useRef(null);    // FIX: dedicated canvas for AI capture only
  const edgeSrc     = useRef(null);    // FIX: dedicated canvas for edge loop only
  const edgeCanvas  = useRef(null);    // overlay shown on screen
  const streamRef   = useRef(null);
  const captureTimer = useRef(null);
  const edgeTimer   = useRef(null);
  const isBusyRef   = useRef(false);
  const lastDescRef = useRef("");
  const captureRef  = useRef(null);    // FIX: always holds latest captureAndDescribe

  const [cameraState,  setCameraState]  = useState("idle");
  const [description,  setDescription]  = useState("");
  const [isAnalyzing,  setIsAnalyzing]  = useState(false);
  const [isSpeaking,   setIsSpeaking]   = useState(false);
  const [errorMsg,     setErrorMsg]     = useState("");
  const [frameCount,   setFrameCount]   = useState(0);
  const [isMuted,      setIsMuted]      = useState(false);
  const [edgeColor,    setEdgeColor]    = useState("#38bdf8");
  const [edgeStrength, setEdgeStrength] = useState(30);
  const [showEdge,     setShowEdge]     = useState(true);
  const [hazardAlert,  setHazardAlert]  = useState(null); // null | "stairs ahead" etc.

  // Store latest values in refs so intervals never go stale
  const isMutedRef      = useRef(isMuted);
  const showEdgeRef     = useRef(showEdge);
  const edgeColorRef    = useRef(edgeColor);
  const edgeStrengthRef = useRef(edgeStrength);

  useEffect(() => { isMutedRef.current      = isMuted;      }, [isMuted]);
  useEffect(() => { showEdgeRef.current     = showEdge;     }, [showEdge]);
  useEffect(() => { edgeColorRef.current    = edgeColor;    }, [edgeColor]);
  useEffect(() => { edgeStrengthRef.current = edgeStrength; }, [edgeStrength]);

  // ── Speak ─────────────────────────────────────────────────────────────────
  const speak = useCallback((text) => {
    if (isMutedRef.current || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u  = new SpeechSynthesisUtterance(text);
    u.rate   = 0.95;
    u.lang   = "en-US";
    u.onstart = () => setIsSpeaking(true);
    u.onend   = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(u);
  }, []); // no deps — reads isMuted via ref, never stale

  // ── AI capture (uses aiCanvas only — never touches edgeSrc) ───────────────
  const captureAndDescribe = useCallback(async () => {
    if (isBusyRef.current) return;

    const video = videoRef.current;
    const cvs   = aiCanvas.current;   // FIX: own dedicated canvas
    if (!video || !cvs || video.readyState < 2 || video.videoWidth === 0) return;

    // Snapshot the current video frame into the AI canvas
    cvs.width  = video.videoWidth;
    cvs.height = video.videoHeight;
    cvs.getContext("2d").drawImage(video, 0, 0);

    // Convert to blob — this canvas is ONLY written to here, no race condition
    cvs.toBlob(async (blob) => {
      if (!blob || blob.size < 1000) {
        // Blob too small = blank canvas (shouldn't happen now but safety net)
        console.warn("Captured blob too small, skipping.");
        return;
      }

      isBusyRef.current = true;
      setIsAnalyzing(true);
      console.log(`[VisionVoice] Sending frame to backend (${Math.round(blob.size/1024)}KB)...`);

      try {
        const fd = new FormData();
        fd.append("image", blob, "frame.jpg");

        const res = await fetch(`${BACKEND}/describe-image`, {
          method: "POST",
          body: fd,
        });

        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `HTTP ${res.status}`);
        }

        const data    = await res.json();
        const newDesc = data.description || "";
        const hazard  = data.hazard || {};

        console.log(`[VisionVoice] Got description: ${newDesc}`);
        console.log(`[VisionVoice] Hazard:`, hazard);

        // ── Handle hazard alert FIRST (higher priority than description) ──────
        if (hazard.hazard_detected && hazard.hazard_type) {
          const priority = hazard.hazard_priority || 4;
          setHazardAlert({
            type:     hazard.hazard_type,
            emoji:    hazard.hazard_emoji || "⚠️",
            priority, // 1=critical, 2=serious, 3=high, 4=medium, 5=low
          });

          // Urgency of the spoken warning scales with priority
          window.speechSynthesis.cancel();
          const warningText = priority <= 2
            ? `Danger! ${hazard.hazard_type}!`          // critical/serious — short sharp
            : `Warning. ${hazard.hazard_type}.`;         // medium/low — calmer

          const warning    = new SpeechSynthesisUtterance(warningText);
          warning.rate     = priority <= 2 ? 1.1 : 0.9; // faster for critical
          warning.volume   = 1.0;
          warning.lang     = "en-US";
          window.speechSynthesis.speak(warning);

          // How long the red overlay stays — longer for critical hazards
          const flashDuration = priority <= 2 ? 5001 : 3500;
          setTimeout(() => setHazardAlert(null), flashDuration);

          // Wait for warning to finish then speak description
          const descDelay = priority <= 2 ? 3000 : 2500;
          setTimeout(() => {
            setDescription(newDesc);
            setFrameCount(n => n + 1);
            if (!isSimilar(newDesc, lastDescRef.current)) {
              lastDescRef.current = newDesc;
              speak(newDesc);
            }
          }, descDelay);

        } else {
          // ── No hazard — normal flow ─────────────────────────────────────────
          setHazardAlert(null);
          setDescription(newDesc);
          setFrameCount(n => n + 1);
          if (!isSimilar(newDesc, lastDescRef.current)) {
            lastDescRef.current = newDesc;
            speak(newDesc);
          }
        }
      } catch (err) {
        console.error("[VisionVoice] AI capture error:", err.message);
      } finally {
        isBusyRef.current = false;
        setIsAnalyzing(false);
      }
    }, "image/jpeg", JPEG_QUALITY);
  }, [speak]);

  // FIX: Always keep ref pointing to latest captureAndDescribe
  // The interval calls captureRef.current() — never a stale version
  useEffect(() => {
    captureRef.current = captureAndDescribe;
  }, [captureAndDescribe]);

  // ── Edge loop (uses edgeSrc only — never touches aiCanvas) ────────────────
  const startEdgeLoop = useCallback(() => {
    if (edgeTimer.current) clearInterval(edgeTimer.current);

    edgeTimer.current = setInterval(() => {
      const video  = videoRef.current;
      const srcCvs = edgeSrc.current;    // FIX: own canvas, never shared
      const dstCvs = edgeCanvas.current;
      if (!video || !srcCvs || !dstCvs || video.readyState < 2 || video.videoWidth === 0) return;

      if (!showEdgeRef.current) {
        // Clear overlay when turned off
        const ctx = dstCvs.getContext("2d");
        dstCvs.width  = video.videoWidth;
        dstCvs.height = video.videoHeight;
        ctx.clearRect(0, 0, dstCvs.width, dstCvs.height);
        return;
      }

      srcCvs.width  = video.videoWidth;
      srcCvs.height = video.videoHeight;
      srcCvs.getContext("2d").drawImage(video, 0, 0);
      applySobel(srcCvs, dstCvs, edgeColorRef.current, edgeStrengthRef.current);
    }, EDGE_INTERVAL);
  }, []); // no deps — reads everything via refs

  // ── Start camera ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraState("requesting");
    setErrorMsg("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      streamRef.current          = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setCameraState("active");
      onStatusChange?.("active");

      // Start edge loop (visual, fast)
      startEdgeLoop();

      // FIX: interval calls captureRef.current — always the latest function
      captureTimer.current = setInterval(() => {
        captureRef.current?.();
      }, CAPTURE_EVERY);

      // First capture after 1.5s
      setTimeout(() => captureRef.current?.(), 1500);

    } catch (err) {
      const msgs = {
        NotAllowedError:       "Camera permission denied. Allow it in browser settings and refresh.",
        PermissionDeniedError: "Camera permission denied. Allow it in browser settings and refresh.",
        NotFoundError:         "No camera found on this device.",
        NotReadableError:      "Camera is in use by another app. Close it and try again.",
      };
      setErrorMsg(msgs[err.name] || `Camera error: ${err.message}`);
      setCameraState("error");
      onStatusChange?.("error");
    }
  }, [startEdgeLoop, onStatusChange]);

  // ── Stop camera ───────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    clearInterval(captureTimer.current);
    clearInterval(edgeTimer.current);
    captureTimer.current = null;
    edgeTimer.current    = null;

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    window.speechSynthesis?.cancel();

    const dstCvs = edgeCanvas.current;
    if (dstCvs) dstCvs.getContext("2d").clearRect(0, 0, dstCvs.width, dstCvs.height);

    isBusyRef.current   = false;
    lastDescRef.current = "";

    setCameraState("idle");
    setDescription("");
    setFrameCount(0);
    setIsAnalyzing(false);
    setIsSpeaking(false);
    onStatusChange?.("idle");
  }, [onStatusChange]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const toggleMute = () => {
    setIsMuted(m => { if (!m) window.speechSynthesis?.cancel(); return !m; });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="camera-view">

      {/* FIX: Two separate hidden canvases */}
      <canvas ref={aiCanvas}  style={{ display: "none" }} aria-hidden="true" />
      <canvas ref={edgeSrc}   style={{ display: "none" }} aria-hidden="true" />

      {/* ── Viewport ── */}
      <div className={`camera-viewport ${cameraState === "active" ? "active" : ""}`}>

        <video
          ref={videoRef}
          className="camera-feed"
          autoPlay playsInline muted
          aria-label="Live camera feed"
        />

        <canvas ref={edgeCanvas} className="edge-overlay" aria-hidden="true" />

        {cameraState === "idle" && (
          <div className="camera-placeholder">
            <div className="camera-icon">📷</div>
            <p>Camera is off</p>
            <p className="camera-placeholder-sub">Press Start to begin</p>
          </div>
        )}
        {cameraState === "requesting" && (
          <div className="camera-placeholder">
            <div className="camera-spinner" />
            <p>Requesting camera access...</p>
            <p className="camera-placeholder-sub">Allow access in your browser</p>
          </div>
        )}
        {cameraState === "error" && (
          <div className="camera-placeholder camera-placeholder--error">
            <div className="camera-icon">⚠️</div>
            <p className="camera-error-text">{errorMsg}</p>
          </div>
        )}

        {cameraState === "active" && (
          <>
            <div className="recording-badge"><span className="rec-dot" /> LIVE</div>
            {isAnalyzing && (
              <div className="analyzing-badge">
                <span className="analyzing-spinner" /> Analyzing...
              </div>
            )}
            {isSpeaking && <div className="speaking-badge">🔊 Speaking...</div>}
            <div className="frame-counter">{frameCount} analyzed</div>
            <CountdownBar duration={CAPTURE_EVERY} isAnalyzing={isAnalyzing} />

            {/* ── Hazard alert overlay — color scales with priority ── */}
            {hazardAlert && (
              <div
                className={`hazard-overlay hazard-priority-${hazardAlert.priority}`}
                role="alert"
                aria-live="assertive"
              >
                <div className="hazard-pulse" aria-hidden="true" />
                <span className="hazard-icon">{hazardAlert.emoji}</span>
                <span className="hazard-title">
                  {hazardAlert.priority <= 2 ? "⚠️ DANGER" : "⚠️ CAUTION"}
                </span>
                <span className="hazard-type">
                  {hazardAlert.type.toUpperCase()}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Edge controls ── */}
      {cameraState === "active" && (
        <div className="edge-controls" role="group" aria-label="Edge overlay controls">
          <div className="edge-controls-header">
            <span className="edge-controls-label">🔲 Edge Outline</span>
            <button
              className={`edge-toggle ${showEdge ? "on" : "off"}`}
              onClick={() => setShowEdge(s => !s)}
            >
              {showEdge ? "ON" : "OFF"}
            </button>
          </div>
          {showEdge && (
            <div className="edge-sliders">
              <label className="edge-slider-label">
                <span>Sensitivity</span>
                <span className="slider-value">{edgeStrength}</span>
                <input
                  type="range" min="5" max="80" step="5"
                  value={edgeStrength}
                  onChange={e => setEdgeStrength(Number(e.target.value))}
                />
              </label>
              <label className="edge-color-label">
                <span>Edge Color</span>
                <div className="color-swatches">
                  {[
                    { hex: "#38bdf8", name: "Sky blue" },
                    { hex: "#34d399", name: "Green"    },
                    { hex: "#f472b6", name: "Pink"     },
                    { hex: "#fb923c", name: "Orange"   },
                    { hex: "#facc15", name: "Yellow"   },
                    { hex: "#ffffff", name: "White"    },
                  ].map(c => (
                    <button
                      key={c.hex}
                      className={`color-swatch ${edgeColor === c.hex ? "selected" : ""}`}
                      style={{ background: c.hex }}
                      onClick={() => setEdgeColor(c.hex)}
                      aria-label={c.name}
                    />
                  ))}
                </div>
              </label>
            </div>
          )}
        </div>
      )}

      {/* ── Hazard summary banner ── */}
      {hazardAlert && (
        <div className={`hazard-banner hazard-banner-priority-${hazardAlert.priority}`} role="status">
          <span>{hazardAlert.emoji}</span>
          <span>
            <strong>{hazardAlert.priority <= 2 ? "DANGER" : "Caution"}:</strong>{" "}
            {hazardAlert.type}
          </span>
        </div>
      )}

      {/* ── Description ── */}
      {description && (
        <div className="live-description" role="region" aria-live="polite">
          <div className="live-desc-header">
            <span className="live-desc-icon">👁️</span>
            <span className="live-desc-label">What I see</span>
            {isAnalyzing && <span className="desc-updating">updating...</span>}
          </div>
          <p className="live-desc-text" tabIndex={0}>{description}</p>
        </div>
      )}

      {/* ── Controls ── */}
      <div className="camera-controls">
        {cameraState !== "active" ? (
          <button
            className="btn btn-primary camera-start-btn"
            onClick={startCamera}
            disabled={cameraState === "requesting"}
          >
            {cameraState === "requesting"
              ? <><span className="spinner" /> Requesting...</>
              : <>▶ Start Live Description</>}
          </button>
        ) : (
          <div className="camera-active-controls">
            <button className="btn btn-danger" onClick={stopCamera}>⏹ Stop</button>
            <button className={`btn mute-btn ${isMuted ? "muted" : ""}`} onClick={toggleMute}>
              {isMuted ? "🔇 Muted" : "🔊 Sound On"}
            </button>
            <button
              className="btn speak-now-btn"
              onClick={() => description && speak(description)}
              disabled={!description || isSpeaking}
            >
              🔁 Repeat
            </button>
          </div>
        )}
      </div>

      {cameraState === "idle" && (
        <p className="camera-hint">
          AI captures a frame every 7 seconds for accurate descriptions.
          Edge outlines highlight objects in real time.
        </p>
      )}
    </div>
  );
}

// ── Countdown bar ─────────────────────────────────────────────────────────────
function CountdownBar({ duration, isAnalyzing }) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setProgress(0);
    const tick = setInterval(() => {
      const pct = Math.min(((Date.now() - startRef.current) / duration) * 100, 100);
      setProgress(pct);
      if (pct >= 100) { startRef.current = Date.now(); setProgress(0); }
    }, 50);
    return () => clearInterval(tick);
  }, [duration, isAnalyzing]);

  return (
    <div className="countdown-bar-track" aria-hidden="true">
      <div className="countdown-bar-fill" style={{ width: `${progress}%`, opacity: isAnalyzing ? 0.4 : 1 }} />
    </div>
  );
}
