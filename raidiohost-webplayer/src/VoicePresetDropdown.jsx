import { useEffect, useMemo, useRef, useState } from "react";
import { getSpeechVoices, selectVoiceForProfile } from "./services/speech/WebSpeechService";
import "./VoicePresetDropdown.css";

const TEST_VOICE_LINE =
  "That was a smooth one. Stay with me — we have more music coming up next.";

/**
 * @param {{
 *   presets: import("./services/speech/voicePresets").HostVoiceProfile[],
 *   activePresetId: string,
 *   onSelect: (id: string) => void,
 *   onTest?: () => void,
 * }} props
 */
export function VoicePresetDropdown({ presets, activePresetId, onSelect, onTest }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isVoicesOpen, setIsVoicesOpen] = useState(false);
  const [availableVoices, setAvailableVoices] = useState(null);
  const containerRef = useRef(null);

  const activePreset = presets.find((p) => p.id === activePresetId) ?? presets[0];

  // Load available voices when the debug section is first expanded
  useEffect(() => {
    if (!isVoicesOpen || availableVoices !== null) return;
    getSpeechVoices().then(setAvailableVoices);
  }, [isVoicesOpen, availableVoices]);

  // Determine which voice the active profile would actually use
  const activeVoiceURI = useMemo(() => {
    if (!availableVoices) return null;
    const selected = selectVoiceForProfile(availableVoices, activePreset);
    return selected?.voiceURI ?? null;
  }, [availableVoices, activePreset]);

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

  return (
    <div className="voice-preset-dropdown" ref={containerRef}>
      <button
        type="button"
        className="voice-preset-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Host personality: ${activePreset.label}`}
      >
        <span className="voice-preset-icon" aria-hidden="true">🎙</span>
        {activePreset.label}
        <span className="voice-preset-arrow" aria-hidden="true">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen && (
        <div className="voice-preset-panel">
          <div className="voice-preset-heading" aria-hidden="true">Host Personality</div>

          <ul role="listbox" aria-label="Host personality" className="voice-preset-list">
            {presets.map((preset) => {
              const isActive = preset.id === activePresetId;
              return (
                <li
                  key={preset.id}
                  className={`voice-preset-option${isActive ? " voice-preset-option--active" : ""}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onSelect(preset.id);
                    setIsOpen(false);
                  }}
                >
                  <span className="voice-preset-option-label">{preset.label}</span>
                  <span className="voice-preset-option-meta">×{preset.rate.toFixed(2)}</span>
                  {isActive && <span className="voice-preset-option-check" aria-hidden="true">✓</span>}
                </li>
              );
            })}
          </ul>

          {onTest && (
            <div className="voice-preset-test-row">
              <button
                type="button"
                className="voice-preset-test-btn"
                onClick={() => onTest(TEST_VOICE_LINE)}
                title="Speak a sample radio line"
              >
                ▶ Test voice
              </button>
            </div>
          )}

          <div className="voice-preset-debug-row">
            <button
              type="button"
              className="voice-preset-debug-toggle"
              onClick={() => setIsVoicesOpen((v) => !v)}
              aria-expanded={isVoicesOpen}
            >
              {isVoicesOpen ? "▲" : "▼"} Available voices
              {availableVoices !== null && ` (${availableVoices.length})`}
            </button>

            {isVoicesOpen && (
              <ul className="voice-preset-voices-list">
                {availableVoices === null && (
                  <li className="voice-preset-voices-loading">Loading…</li>
                )}
                {availableVoices?.length === 0 && (
                  <li className="voice-preset-voices-loading">No voices found</li>
                )}
                {availableVoices?.map((v) => {
                  const isActiveVoice = v.voiceURI === activeVoiceURI;
                  return (
                    <li
                      key={v.voiceURI}
                      className={`voice-preset-voices-item${isActiveVoice ? " voice-preset-voices-item--active" : ""}`}
                    >
                      <span className="voice-preset-voices-name">{v.name}</span>
                      <span className="voice-preset-voices-lang">{v.lang}</span>
                      {v.default && <span className="voice-preset-voices-default">default</span>}
                      {isActiveVoice && <span className="voice-preset-voices-in-use">in use</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
