// AudioPlayer.jsx
// Fixed version — 4 bugs corrected:
//
// BUG 1 (was): load() then play() immediately → play fires before audio is ready → silent fail
// FIX:         Removed manual load()/play() — use onCanPlay event instead.
//              Browser calls onCanPlay exactly when audio is ready. Then we play.
//
// BUG 2 (was): No onError handler → fetch failures were invisible
// FIX:         Added onError that reads browser error code and shows a clear message
//
// BUG 3 (was): No key={audioUrl} → React reused same <audio> element, src change unreliable
// FIX:         key={audioUrl} forces React to destroy + recreate <audio> on every new URL
//
// BUG 4 (was): useEffect triggered play before audio was buffered → race condition
// FIX:         Removed useEffect entirely — onCanPlay handles auto-play timing correctly

import { useRef, useState } from "react";

// ── Production backend on Render ─────────────────────────────────────────────
const BACKEND = "https://visionvoice-backend.onrender.com";

export default function AudioPlayer({ audioUrl }) {
  const audioRef = useRef(null);

  const [isPlaying,   setIsPlaying]   = useState(false);
  const [duration,    setDuration]    = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isReady,     setIsReady]     = useState(false);   // true once browser says canplay
  const [audioError,  setAudioError]  = useState(null);    // holds error message if load fails

  // Full URL the browser fetches the MP3 from
  const fullUrl = `${BACKEND}${audioUrl}`;

  // ── FIX 1 + 4: Only auto-play AFTER browser fires canPlay ────────────────
  // This replaces the old useEffect + load() + play() approach entirely.
  // The browser knows exactly when audio is buffered — we just listen for it.
  const handleCanPlay = () => {
    setIsReady(true);
    audioRef.current?.play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        // Browser may block auto-play (policy) — user can click ▶ manually
        setIsPlaying(false);
      });
  };

  const handleTimeUpdate = () => {
    setCurrentTime(audioRef.current?.currentTime || 0);
  };

  const handleLoadedMetadata = () => {
    setDuration(audioRef.current?.duration || 0);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // ── FIX 2: Catch audio load failures and show actionable message ──────────
  const handleError = () => {
    const code = audioRef.current?.error?.code;
    const messages = {
      1: "Audio loading was aborted.",
      2: "Network error — could not fetch the audio file.",
      3: "Audio file is corrupted or unsupported format.",
      4: "Audio format not supported by this browser.",
    };
    const msg = messages[code] || "Unknown audio error.";
    console.error("AudioPlayer error code:", code, msg);
    setAudioError(`${msg} Try opening directly: ${fullUrl}`);
    setIsPlaying(false);
    setIsReady(false);
  };

  // ── Controls ───────────────────────────────────────────────────────────────
  const togglePlay = () => {
    if (!audioRef.current || !isReady) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.warn("Play blocked:", err));
    }
  };

  const handleProgressClick = (e) => {
    if (!audioRef.current || !duration) return;
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = ratio * duration;
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-player" role="region" aria-label="Audio description player">

      {/*
        FIX 3: key={audioUrl} — when audioUrl changes, React destroys this
        element completely and creates a fresh one. The browser then
        automatically fetches the new src without needing manual load() calls.

        FIX 1: No useEffect/load()/play() here — onCanPlay handles it.
        preload="auto" tells the browser to start buffering immediately.
      */}
      <audio
        key={audioUrl}
        ref={audioRef}
        src={fullUrl}
        preload="auto"
        onCanPlay={handleCanPlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleError}
        aria-label="Audio description of the uploaded image"
      />

      {/* Loading indicator while audio buffers */}
      {!isReady && !audioError && (
        <div className="audio-loading" role="status" aria-live="polite">
          <span className="audio-loading-spinner" aria-hidden="true" />
          Loading audio...
        </div>
      )}

      {/* FIX 2: Error message with direct link to file */}
      {audioError && (
        <div className="audio-error" role="alert">
          <strong>⚠️ Audio error:</strong> {audioError}
          <br />
          <a
            href={fullUrl}
            target="_blank"
            rel="noreferrer"
            className="error-link"
          >
            Try opening the audio file directly ↗
          </a>
        </div>
      )}

      {/* Player controls — only shown once audio loaded successfully */}
      {isReady && !audioError && (
        <div className="player-controls">
          <button
            className="play-btn"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause audio" : "Play audio description"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <div className="player-right">
            <div
              className="progress-bar"
              onClick={handleProgressClick}
              role="slider"
              aria-label="Audio progress"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              onKeyDown={(e) => {
                if (!audioRef.current) return;
                if (e.key === "ArrowRight") audioRef.current.currentTime += 5;
                if (e.key === "ArrowLeft")  audioRef.current.currentTime -= 5;
              }}
            >
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="time-display" aria-live="polite">
              <span>{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Download link — always visible so user can get the file even if player fails */}
      <a
        href={fullUrl}
        download="description.mp3"
        className="download-link"
        aria-label="Download audio description as MP3"
      >
        ⬇ Download Audio
      </a>
    </div>
  );
}