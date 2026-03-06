/**
 * AudioContextManager manages the Web Audio API AudioContext lifecycle.
 * Handles lazy initialization, user gesture requirements, and component injection.
 */
class AudioContextManager {
  constructor() {
    /** @type {AudioContext|null} */
    this.audioContext = null;
  }

  /**
   * Ensures AudioContext exists, creating it if necessary.
   * Handles browser vendor prefixes and user gesture requirements.
   * @returns {Promise<AudioContext>} The AudioContext instance
   * @throws {Error} If Web Audio API is not available
   */
  async ensureContext() {
    if (this.audioContext) {
      // Resume if suspended (common after user gesture)
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
      return this.audioContext;
    }

    // Create new AudioContext with vendor prefix support
    try {
      const webkitWindow =
        /** @type {Window & { webkitAudioContext?: typeof AudioContext }} */ (
          globalThis
        );
      const AudioContextClass = globalThis.AudioContext ||
        webkitWindow.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error("Web Audio API not available");
      }

      this.audioContext = new AudioContextClass();
      // Fire one-time onContextCreated listeners
      if (this._contextCreatedCallbacks) {
        for (const cb of this._contextCreatedCallbacks) {
          cb(this.audioContext);
        }
        this._contextCreatedCallbacks = [];
      }
      return this.audioContext;
    } catch (e) {
      console.error("Failed to create AudioContext:", e);
      throw new Error("Web Audio API not available");
    }
  }

  /**
   * Gets the current AudioContext instance without creating one.
   * @returns {AudioContext|null} The AudioContext or null if not yet created
   */
  getContext() {
    return this.audioContext;
  }

  /**
   * Injects the AudioContext into audio-dependent components.
   * @param {Object} metronome - Metronome instance
   * @param {Object} [micDetector] - MicrophoneDetector instance (optional)
   * @param {Object} [calibration] - CalibrationDetector instance (optional)
   */
  setContextForComponents(metronome, micDetector, calibration) {
    if (!this.audioContext) {
      console.warn("AudioContext not yet created. Call ensureContext() first.");
      return;
    }

    metronome.audioContext = this.audioContext;

    if (micDetector) {
      micDetector.audioContext = this.audioContext;
    }

    if (calibration) {
      calibration.audioContext = this.audioContext;
    }
  }

  /**
   * Register a callback that fires once when the AudioContext is first created.
   * If the context already exists the callback is invoked immediately.
   * Use this instead of calling setContextForComponents() in multiple places.
   *
   * @param {(ctx: AudioContext) => void} callback
   */
  onContextCreated(callback) {
    if (this.audioContext) {
      callback(this.audioContext);
      return;
    }
    if (!this._contextCreatedCallbacks) {
      this._contextCreatedCallbacks = [];
    }
    this._contextCreatedCallbacks.push(callback);
  }

  /**
   * Resumes the AudioContext if it's suspended.
   * Useful for handling user gesture requirements.
   * @returns {Promise<void>}
   */
  async resume() {
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }
}

export default AudioContextManager;
