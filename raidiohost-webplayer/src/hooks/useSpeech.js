import { useCallback, useEffect, useRef, useState } from "react";
import { WebSpeechService } from "../services/speech/WebSpeechService";
import { DEFAULT_PERSONALITY_ID, PERSONALITY_OPTIONS, getPersonalityById } from "../services/speech/voicePresets";
import { getUserStorage, setUserStorage } from "../utils/userStorage";

const VOICE_NAME_KEY = "voice-name";
const SPEECH_RATE_KEY = "speech-rate";
const SPEECH_PITCH_KEY = "speech-pitch";
const PERSONALITY_KEY = "personality";

/**
 * React hook that wraps a SpeechService instance.
 *
 * @param {import("../services/speech/SpeechService").SpeechService} [serviceInstance]
 *   Optional custom speech service. Defaults to WebSpeechService.
 */
export function useSpeech(sessionKey, serviceInstance) {
  const [, refreshPreferences] = useState(0);
  const activeVoiceName = getUserStorage(sessionKey, VOICE_NAME_KEY, null);
  const speechRate = getUserStorage(sessionKey, SPEECH_RATE_KEY, 1.0);
  const speechPitch = getUserStorage(sessionKey, SPEECH_PITCH_KEY, 1.0);
  const activePersonality = getUserStorage(sessionKey, PERSONALITY_KEY, DEFAULT_PERSONALITY_ID);

  const serviceRef = useRef(null);
  if (serviceRef.current === null) {
    const service = serviceInstance ?? new WebSpeechService({
      voiceName: activeVoiceName,
      rate: speechRate,
      pitch: speechPitch,
    });
    serviceRef.current = service;
  }

  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const service = serviceRef.current;
    return () => { service.cancel(); };
  }, []);

  useEffect(() => {
    const service = serviceRef.current;
    service.cancel();
    service.setVoiceConfig({ voiceName: activeVoiceName, rate: speechRate, pitch: speechPitch });
  }, [sessionKey, activeVoiceName, speechRate, speechPitch]);

  const setActiveVoice = useCallback((name) => {
    if (!sessionKey) return;
    setUserStorage(sessionKey, VOICE_NAME_KEY, name);
    refreshPreferences((value) => value + 1);
    serviceRef.current.setVoiceConfig({ voiceName: name });
  }, [sessionKey]);

  const setSpeechRate = useCallback((rate) => {
    if (!sessionKey) return;
    setUserStorage(sessionKey, SPEECH_RATE_KEY, rate);
    refreshPreferences((value) => value + 1);
    serviceRef.current.setVoiceConfig({ rate });
  }, [sessionKey]);

  const setSpeechPitch = useCallback((pitch) => {
    if (!sessionKey) return;
    setUserStorage(sessionKey, SPEECH_PITCH_KEY, pitch);
    refreshPreferences((value) => value + 1);
    serviceRef.current.setVoiceConfig({ pitch });
  }, [sessionKey]);

  const setActivePersonality = useCallback((id) => {
    if (!sessionKey) return;
    const p = getPersonalityById(id);
    setUserStorage(sessionKey, PERSONALITY_KEY, p.id);
    refreshPreferences((value) => value + 1);
  }, [sessionKey]);

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

