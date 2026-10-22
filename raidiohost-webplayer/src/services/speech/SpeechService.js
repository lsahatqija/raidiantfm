/**
 * Abstract base class for speech synthesis services.
 * Extend this class to implement alternative TTS backends
 * (e.g. ElevenLabs, Azure Cognitive Services, etc.).
 */
export class SpeechService {
  /**
   * Speak the given text. Returns a Promise that resolves when
   * speech has finished, or rejects on error.
   * @param {string} _text
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  speak(_text) {
    return Promise.reject(new Error("SpeechService.speak() is not implemented."));
  }

  /**
   * Immediately cancel any in-progress speech.
   */
  cancel() {
    throw new Error("SpeechService.cancel() is not implemented.");
  }

  /**
   * Whether the service is currently speaking.
   * @returns {boolean}
   */
  get isSpeaking() {
    throw new Error("SpeechService.isSpeaking is not implemented.");
  }

  /**
   * Apply a voice configuration to the service.
   * Subclasses may override this to handle voice/rate/pitch settings.
   * @param {{ voiceName?: string|null, lang?: string|null, rate?: number, pitch?: number }} _config
   */
  // eslint-disable-next-line no-unused-vars
  setVoiceConfig(_config) {
    // Default no-op — override in subclasses that support voice configuration
  }
}
