// App.jsx
// VisionVoice — Live Camera Edition
// Replaced static image upload with a continuous live camera that
// describes the scene in real-time and reads it aloud automatically.

import { useState, useEffect } from "react";
import CameraView from "./components/CameraView";
import "./App.css";

const API_URL = "https://visionvoicee.onrender.com";

export default function App() {
  const [backendStatus, setBackendStatus] = useState("checking");
  const [cameraStatus,  setCameraStatus]  = useState("idle");
  // cameraStatus: "idle" | "active" | "error"

  // ── Ping the Flask backend on load ──────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/`, {
          method: "GET",
          signal: AbortSignal.timeout(4000),
        });
        setBackendStatus(res.ok ? "online" : "offline");
      } catch {
        setBackendStatus("offline");
      }
    };
    check();
  }, []);

  return (
    <div className="app">
      <div className="bg-orb bg-orb-1" aria-hidden="true" />
      <div className="bg-orb bg-orb-2" aria-hidden="true" />

      <main className="container">

        {/* ── Header ── */}
        <header className="header">
          <div className="logo" aria-hidden="true">👁️</div>
          <h1 className="app-title">VisionVoice</h1>
          <p className="app-subtitle">
            Point your camera at the world — AI describes what it sees, live
          </p>
          <div className="badge">✨ Live · BLIP + Web Speech API</div>
        </header>

        {/* ── Backend status dot ── */}
        <div className={`backend-status backend-status--${backendStatus}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {backendStatus === "checking" && "Checking backend..."}
          {backendStatus === "online"   && "Backend connected ✓"}
          {backendStatus === "offline"  && (
            <>Backend offline — <strong>run <code>python app.py</code> first</strong></>
          )}
        </div>

        {/* ── How it works ── */}
        <section className="how-it-works" aria-label="How it works">
          <div className="step">
            <span className="step-num">1</span>
            <span>Allow camera</span>
          </div>
          <div className="step-arrow">→</div>
          <div className="step">
            <span className="step-num">2</span>
            <span>AI reads the scene</span>
          </div>
          <div className="step-arrow">→</div>
          <div className="step">
            <span className="step-num">3</span>
            <span>Voice describes it</span>
          </div>
        </section>

        {/* ── Live Camera Section ── */}
        <section className="card camera-card" aria-label="Live camera view">
          <CameraView onStatusChange={setCameraStatus} />
        </section>

        {/* ── Info cards (shown only when camera is idle) ── */}
        {cameraStatus === "idle" && (
          <div className="info-cards">
            <div className="info-card">
              <span className="info-icon">🧠</span>
              <div>
                <strong>BLIP AI Model</strong>
                <p>Salesforce's image captioning model analyzes each frame</p>
              </div>
            </div>
            <div className="info-card">
              <span className="info-icon">🔊</span>
              <div>
                <strong>Web Speech API</strong>
                <p>Built-in browser speech reads descriptions instantly — no delay</p>
              </div>
            </div>
            <div className="info-card">
              <span className="info-icon">⚡</span>
              <div>
                <strong>Every 3.5 seconds</strong>
                <p>One frame captured, described, and spoken per interval</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <footer className="footer">
          <p>Built by salianbhy for accessibility · BLIP · Web Speech · Flask · React</p>
          <p className="footer-sub">College AI Project Demo</p>
        </footer>

      </main>
    </div>
  );
}
