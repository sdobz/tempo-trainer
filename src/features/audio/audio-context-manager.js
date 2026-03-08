import { createContext } from "../component/context.js";

/**
 * @type {import('../component/context.js').Context<AudioContextManager|null>}
 */
export const AudioContextServiceContext = createContext(
  "audio-context-service",
  null,
);

/**
 * AudioContextManager manages the shared Web Audio API AudioContext lifecycle.
 * Emits a "ready" event once the context is first created.
 */
class AudioContextManager extends EventTarget {
  constructor() {
    super();
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
      const AudioContextClass =
        globalThis.AudioContext || webkitWindow.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error("Web Audio API not available");
      }

      this.audioContext = new AudioContextClass();
      this.dispatchEvent(
        new CustomEvent("ready", { detail: { context: this.audioContext } }),
      );
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
