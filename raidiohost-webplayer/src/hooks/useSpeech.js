import { useCallback, useEffect, useRef, useState } from "react";
import { WebSpeechService } from "../services/speech/WebSpeechService";
import { DEFAULT_PERSONALITY_ID, PERSONALITY_OPTIONS, getPersonalityById } from "../services/speech/voicePresets";

const VOICE_NAME_KEY    = "raidiohost-voice-name";
const SPEECH_RATE_KEY   = "raidiohost-speech-rate";
const SPEECH_PITCH_KEY  = "raidiohost-speech-pitch";
const PERSONALITY_KEY   = "raidiohost-personality";

function getStorage(key, defaultValue) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStorage(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* non-fatal */ }
}

/**
 * React hook that wraps a SpeechService instance.
 *
 * @param {import("../services/speech/SpeechService").SpeechService} [serviceInstance]
 *   Optional custom speech service. Defaults to WebSpeechService.
 */
export function useSpeech(serviceInstance) {
  const [activeVoiceName, setActiveVoiceNameState]     = useState(() => getStorage(VOICE_NAME_KEY, null));
  const [speechRate, setSpeechRateState]               = useState(() => getStorage(SPEECH_RATE_KEY, 1.0));
  const [speechPitch, setSpeechPitchState]             = useState(() => getStorage(SPEECH_PITCH_KEY, 1.0));
  const [activePersonality, setActivePersonalityState] = useState(() => getStorage(PERSONALITY_KEY, DEFAULT_PERSONALITY_ID));

  const serviceRef = useRef(null);
  if (serviceRef.current === null) {
    const service = serviceInstance ?? new WebSpeechService({
      voiceName: getStorage(VOICE_NAME_KEY, null),
      rate:      getStorage(SPEECH_RATE_KEY, 1.0),
      pitch:     getStorage(SPEECH_PITCH_KEY, 1.0),
    });
    serviceRef.current = service;
  }

  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const service = serviceRef.current;
    return () => { service.cancel(); };
  }, []);

  const setActiveVoice = useCallback((name) => {
    setActiveVoiceNameState(name);
    setStorage(VOICE_NAME_KEY, name);
    serviceRef.current.setVoiceConfig({ voiceName: name });
  }, []);

  const setSpeechRate = useCallback((rate) => {
    setSpeechRateState(rate);
    setStorage(SPEECH_RATE_KEY, rate);
    serviceRef.current.setVoiceConfig({ rate });
  }, []);

  const setSpeechPitch = useCallback((pitch) => {
    setSpeechPitchState(pitch);
    setStorage(SPEECH_PITCH_KEY, pitch);
    serviceRef.current.setVoiceConfig({ pitch });
  }, []);

  const setActivePersonality = useCallback((id) => {
    const p = getPersonalityById(id);
    setActivePersonalityState(p.id);
    setStorage(PERSONALITY_KEY, p.id);
  }, []);

  const speak = useCallback(async (text) => {
    if (!text) return;
    setIsSpeaking(true);
    try {
      await serviceRef.current.speak(text);
    } finally {
      setIsSpeaking(false);
    }
  }, []);

  const cancel = useCallback(() => {
    serviceRef.current.cancel();
    setIsSpeaking(false);
  }, []);

  const setSpeechVolume = useCallback((v) => {
    serviceRef.current.setVoiceConfig({ volume: v });
  }, []);

  return {
    speak, cancel, isSpeaking, setSpeechVolume, serviceRef,
    personalities: PERSONALITY_OPTIONS,
    activeVoiceName, setActiveVoice,
    speechRate, setSpeechRate,
    speechPitch, setSpeechPitch,
    activePersonality, setActivePersonality,
  };
}

