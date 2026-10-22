import { SpeechService } from "./SpeechService";

/**
 * Web Speech API implementation of SpeechService.
 * Uses window.speechSynthesis (built into modern browsers).
 * Falls back silently in environments where the API is unavailable.
 */
export class WebSpeechService extends SpeechService {
  /**
   * @param {{ voiceName?: string|null, lang?: string|null, rate?: number, pitch?: number }} [config]
   */
  constructor(config = {}) {
    super();
    this._utterance = null;
    this._config = { voiceName: null, lang: null, rate: 1.0, pitch: 1.0, volume: 1.0, ...config };
  }

  /**
   * Update the voice configuration applied on future speak() calls.
   * @param {{ voiceName?: string|null, lang?: string|null, rate?: number, pitch?: number }} config
   */
  setVoiceConfig(config) {
    this._config = { ...this._config, ...config };
    // Apply volume immediately to any in-progress utterance
    if (this._utterance != null && config.volume != null) {
      this._utterance.volume = Math.min(1, Math.max(0, config.volume));
    }
  }

  /**
   * Resolve the best matching SpeechSynthesisVoice for the current config.
   * Waits for the voiceschanged event if voices haven't loaded yet.
   * @returns {Promise<SpeechSynthesisVoice|null>}
   */
  async _resolveVoice() {
    let voices = window.speechSynthesis.getVoices();

    if (voices.length === 0) {
      voices = await new Promise((resolve) => {
        const onVoicesChanged = () => resolve(window.speechSynthesis.getVoices());
        window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged, { once: true });
        // Timeout fallback in case voiceschanged never fires
        setTimeout(() => {
          window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
          resolve([]);
        }, 3000);
      });
    }

    if (voices.length === 0) return null;

    const { voiceName } = this._config;
    if (voiceName) {
      const match = voices.find((v) => v.name === voiceName);
      if (match) return match;
    }

    // No specific voice requested — let the browser use its default
    return null;
  }

  async speak(text) {
    if (!window.speechSynthesis) {
      return Promise.resolve();
    }

    const normalised = prepareTextForSpeech(text);

    // Cancel any in-progress speech before starting new
    window.speechSynthesis.cancel();

    const voice = await this._resolveVoice();

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(normalised);
      this._utterance = utterance;

      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? this._config.lang ?? "en-US";
      if (this._config.rate != null) utterance.rate = this._config.rate;
      if (this._config.pitch != null) utterance.pitch = this._config.pitch;
      if (this._config.volume != null) utterance.volume = Math.min(1, Math.max(0, this._config.volume));

      utterance.onend = () => {
        this._utterance = null;
        resolve();
      };

      utterance.onerror = (event) => {
        this._utterance = null;
        // "interrupted" fires when cancel() is called — treat as a normal stop
        if (event.error === "interrupted" || event.error === "canceled") {
          resolve();
        } else {
          reject(new Error(`SpeechSynthesisUtterance error: ${event.error}`));
        }
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  cancel() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    this._utterance = null;
  }

  get isSpeaking() {
    if (!window.speechSynthesis) return false;
    return window.speechSynthesis.speaking;
  }
}

// ─── Functional API ───────────────────────────────────────────────────────────

/**
 * Normalize text before handing it to the speech engine.
 * @param {string} text
 * @returns {string}
 */
export function prepareTextForSpeech(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "and")
    .replace(/\bfeat\./gi, "featuring")
    .replace(/\bft\./gi, "featuring")
    .replace(/\bvs\./gi, "versus")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Load available speech synthesis voices.
 * Handles async loading via the voiceschanged event.
 * Returns an empty array if speechSynthesis is not supported.
 * @returns {Promise<SpeechSynthesisVoice[]>}
 */
export function getSpeechVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return Promise.resolve([]);
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);

  return new Promise((resolve) => {
    const onChanged = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", onChanged, { once: true });
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", onChanged);
      resolve([]);
    }, 3000);
  });
}

/**
 * Select the best available voice for a given profile using keyword matching.
 *
 * Priority:
 *  1. First preferredVoiceKeyword that matches voice.name / voice.lang / voice.voiceURI
 *  2. First fallbackKeyword match
 *  3. First voice whose lang starts with preferredLang
 *  4. Browser default voice
 *  5. voices[0]
 *
 * @param {SpeechSynthesisVoice[]} voices
 * @param {import("./voicePresets").HostVoiceProfile} profile
 * @param {string} [preferredLang]
 * @returns {SpeechSynthesisVoice|null}
 */
export function selectVoiceForProfile(voices, profile, preferredLang = "en") {
  if (!voices || voices.length === 0) return null;

  const matchesKeyword = (voice, keyword) => {
    const kw = keyword.toLowerCase();
    return (
      voice.name.toLowerCase().includes(kw) ||
      voice.lang.toLowerCase().includes(kw) ||
      voice.voiceURI.toLowerCase().includes(kw)
    );
  };

  // 1. Preferred voice keywords (priority order)
  if (profile.preferredVoiceKeywords?.length) {
    for (const kw of profile.preferredVoiceKeywords) {
      const match = voices.find((v) => matchesKeyword(v, kw));
      if (match) return match;
    }
  }

  // 2. Fallback keywords
  if (profile.fallbackKeywords?.length) {
    for (const kw of profile.fallbackKeywords) {
      const match = voices.find((v) => matchesKeyword(v, kw));
      if (match) return match;
    }
  }

  // 3. Language match
  if (preferredLang) {
    const langLower = preferredLang.toLowerCase();
    const byLang = voices.find((v) => v.lang.toLowerCase().startsWith(langLower));
    if (byLang) return byLang;
  }

  // 4. Browser default
  const defaultVoice = voices.find((v) => v.default);
  if (defaultVoice) return defaultVoice;

  // 5. First available
  return voices[0] ?? null;
}

/**
 * Speak text using a named host voice profile.
 * Cancels any current speech before starting.
 * @param {string} text
 * @param {string} [profileId]
 * @returns {Promise<void>}
 */
export async function speakWithProfile(text, profileId = "smooth") {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  const normalised = prepareTextForSpeech(text);
  if (!normalised) return;

  const profile = getProfileById(profileId);
  const voices = await getSpeechVoices();
  const voice = selectVoiceForProfile(voices, profile);

  window.speechSynthesis.cancel();

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(normalised);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "en-US";
    utterance.rate = profile.rate;
    utterance.pitch = profile.pitch;
    utterance.volume = profile.volume;

    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      if (e.error === "interrupted" || e.error === "canceled") resolve();
      else reject(new Error(`Speech error: ${e.error}`));
    };

    window.speechSynthesis.speak(utterance);
  });
}

/** Cancel any in-progress speech. */
export function cancelSpeech() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/** Pause in-progress speech. */
export function pauseSpeech() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.pause();
  }
}

/** Resume paused speech. */
export function resumeSpeech() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.resume();
  }
}

/**
 * Log all available voices to the console as a table.
 * Useful for debugging voice selection.
 */
export async function logAvailableVoices() {
  const voices = await getSpeechVoices();
  if (voices.length === 0) {
    console.log("[WebSpeech] No voices available.");
    return;
  }
  console.table(
    voices.map((v) => ({
      name: v.name,
      lang: v.lang,
      voiceURI: v.voiceURI,
      localService: v.localService,
      default: v.default,
    })),
  );
}
