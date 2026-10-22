import { useEffect, useRef, useState } from "react";
import { getSpeechVoices } from "./services/speech/WebSpeechService";
import "./VoiceSelector.css";

const TEST_VOICE_LINE =
  "That was a smooth one. Stay with me — we have more music coming up next.";

/**
 * @param {{
 *   activeVoiceName: string|null,
 *   onSelectVoice: (name: string|null) => void,
 *   speechRate: number,
 *   onRateChange: (rate: number) => void,
 *   speechPitch: number,
 *   onPitchChange: (pitch: number) => void,
 *   personalities: Array<{id: string, label: string}>,
 *   activePersonality: string,
 *   onSelectPersonality: (id: string) => void,
 *   onTest?: (text: string) => void,
 * }} props
 */
export function VoiceSelector({
  activeVoiceName,
  onSelectVoice,
  speechRate,
  onRateChange,
  speechPitch,
  onPitchChange,
  personalities,
  activePersonality,
  onSelectPersonality,
  onTest,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [voices, setVoices] = useState(null);
  const containerRef = useRef(null);

  // Load voices when panel first opens
  useEffect(() => {
    if (!isOpen || voices !== null) return;
    getSpeechVoices().then(setVoices);
  }, [isOpen, voices]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const activePersonalityLabel =
    personalities.find((p) => p.id === activePersonality)?.label ?? activePersonality;

  const displayName = activeVoiceName
    ? activeVoiceName.length > 18
      ? activeVoiceName.slice(0, 18) + "…"
      : activeVoiceName
    : "Default voice";

  return (
    <div className="voice-selector" ref={containerRef}>
      <button
        type="button"
        className="voice-selector-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Voice: ${displayName}, Personality: ${activePersonalityLabel}`}
      >
        <span className="voice-selector-icon" aria-hidden="true">🎙</span>
        <span className="voice-selector-name">{displayName}</span>
        <span className="voice-selector-personality-badge">{activePersonalityLabel}</span>
        <span className="voice-selector-arrow" aria-hidden="true">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="voice-selector-panel" role="dialog" aria-label="Voice settings">
          {/* ── Voice list ─────────────────────────────────────────────── */}
          <div className="voice-selector-section-label">Voice</div>
          <ul className="voice-selector-voice-list" role="listbox" aria-label="Available voices">
            <li
              className={`voice-selector-voice-item${activeVoiceName === null ? " voice-selector-voice-item--active" : ""}`}
              role="option"
              aria-selected={activeVoiceName === null}
              onClick={() => onSelectVoice(null)}
            >
              <span className="voice-selector-voice-name">Default voice</span>
              {activeVoiceName === null && (
                <span className="voice-selector-check" aria-hidden="true">✓</span>
              )}
            </li>
            {voices === null && (
              <li className="voice-selector-loading">Loading voices…</li>
            )}
            {voices?.length === 0 && (
              <li className="voice-selector-loading">No voices found</li>
            )}
            {voices?.map((v) => {
              const isActive = v.name === activeVoiceName;
              return (
                <li
                  key={v.voiceURI}
                  className={`voice-selector-voice-item${isActive ? " voice-selector-voice-item--active" : ""}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => onSelectVoice(v.name)}
                >
                  <span className="voice-selector-voice-name">{v.name}</span>
                  <span className="voice-selector-voice-lang">{v.lang}</span>
                  {v.default && (
                    <span className="voice-selector-voice-default">default</span>
                  )}
                  {isActive && (
                    <span className="voice-selector-check" aria-hidden="true">✓</span>
                  )}
                </li>
              );
            })}
          </ul>

          {/* ── Speed slider ───────────────────────────────────────────── */}
          <div className="voice-selector-section-label">Speed</div>
          <div className="voice-selector-slider-row">
            <input
              type="range"
              className="voice-selector-slider"
              min={0.5}
              max={2.0}
              step={0.05}
              value={speechRate}
              onChange={(e) => onRateChange(Number(e.target.value))}
              aria-label="Speech rate"
            />
            <span className="voice-selector-slider-value">×{speechRate.toFixed(2)}</span>
          </div>

          {/* ── Pitch slider ───────────────────────────────────────────── */}
          <div className="voice-selector-section-label">Pitch</div>
          <div className="voice-selector-slider-row">
            <input
              type="range"
              className="voice-selector-slider"
              min={0.0}
              max={2.0}
              step={0.05}
              value={speechPitch}
              onChange={(e) => onPitchChange(Number(e.target.value))}
              aria-label="Speech pitch"
            />
            <span className="voice-selector-slider-value">{speechPitch.toFixed(2)}</span>
          </div>

          {/* ── Personality ────────────────────────────────────────────── */}
          <div className="voice-selector-section-label">Host Personality</div>
          <div className="voice-selector-personality-row">
            <select
              className="voice-selector-personality-select"
              value={activePersonality}
              onChange={(e) => onSelectPersonality(e.target.value)}
              aria-label="Host personality"
            >
              {personalities.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* ── Test button ────────────────────────────────────────────── */}
          {onTest && (
            <div className="voice-selector-test-row">
              <button
                type="button"
                className="voice-selector-test-btn"
                onClick={() => onTest(TEST_VOICE_LINE)}
                title="Speak a sample radio line"
              >
                ▶ Test voice
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
