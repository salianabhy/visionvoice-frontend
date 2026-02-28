// DescriptionResult.jsx
// Displays the AI-generated text description and embeds the AudioPlayer.
// NOTE: This component is currently unused — the app runs in live camera mode.
// Keep this if you plan to re-add the static image upload feature later.

import AudioPlayer from "./AudioPlayer";

const BACKEND = "https://visionvoicee.onrender.com";

export default function DescriptionResult({ description, audioUrl, error }) {

  // ── Error state ───────────────────────────────────────────────────────────
  // error can be a plain string OR a structured { title, detail, steps } object
  if (error) {
    const title  = error?.title  || "Something went wrong";
    const detail = error?.detail || (typeof error === "string" ? error : "Unknown error");
    const steps  = error?.steps  || [];

    return (
      <div className="result-card error-card" role="alert" aria-live="assertive">
        <div className="result-icon">⚠️</div>
        <h2 className="result-title">{title}</h2>
        <p className="error-message">{detail}</p>

        {/* Step-by-step fix instructions if provided */}
        {steps.length > 0 && (
          <div className="error-steps">
            <p className="error-steps-label">How to fix it:</p>
            <ol className="error-steps-list">
              {steps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </div>
        )}

        {/* Updated to show the Render URL, not localhost */}
        <p className="error-hint">
          Confirm the backend is running by opening{" "}
          <a
            href={`${BACKEND}/`}
            target="_blank"
            rel="noreferrer"
            className="error-link"
          >
            {BACKEND}
          </a>{" "}
          — you should see a JSON status message.
        </p>
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────
  return (
    <div className="result-card" role="region" aria-label="Image description results">
      <div className="success-badge" aria-hidden="true">
        ✅ Description Ready
      </div>

      <div className="description-section">
        <h2 className="result-title">📝 Image Description</h2>
        <p
          className="description-text"
          aria-label={`Image description: ${description}`}
          tabIndex={0}
        >
          {description}
        </p>
      </div>

      <div className="audio-section">
        <h2 className="result-title">🔊 Listen to Description</h2>
        <AudioPlayer audioUrl={audioUrl} />
      </div>
    </div>
  );
}
