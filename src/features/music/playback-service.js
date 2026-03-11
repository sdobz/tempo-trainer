import { createContext } from "../component/context.js";

/**
 * Context token. Provided by MainComponent; consumed by orchestration/runtime modules.
 * @type {import('../component/context.js').Context<PlaybackService|null>}
 */
export const PlaybackServiceContext = createContext("playback-service", null);

/**
 * @typedef {{
 *   frequency?: number,
 *   durationSec?: number,
 *   gain?: number,
 *   type?: OscillatorType,
 * }} ClickProfile
 */

/**
 * PlaybackService renders short sounds on request.
 *
 * This service does not own transport, tempo, meter, or beat progression.
 * It only renders audio at explicitly requested times.
 */
class PlaybackService extends EventTarget {
  constructor() {
    super();
    /** @type {AudioContext|null} */
    this._audioContext = null;
    /** @type {ClickProfile} */
    this._clickProfile = {
      frequency: 440,
      durationSec: 0.05,
      gain: 1,
      type: "sine",
    };
  }

  /** @param {AudioContext|null} ctx */
  set audioContext(ctx) {
    this._audioContext = ctx;
  }

  /** @returns {AudioContext|null} */
  get audioContext() {
    return this._audioContext;
  }

  /**
   * @param {ClickProfile} profile
   */
  setClickProfile(profile) {
    this._clickProfile = { ...this._clickProfile, ...profile };
    this.dispatchEvent(
      new CustomEvent("changed", {
        detail: { field: "clickProfile", value: { ...this._clickProfile } },
      }),
    );
  }

  /** @returns {ClickProfile} */
  getClickProfile() {
    return { ...this._clickProfile };
  }

  /**
   * Render a metronome-like click at a specific audio time.
   * @param {number} atTime
   * @param {ClickProfile} [accentProfile]
   */
  renderClick(atTime, accentProfile = {}) {
    this._renderTone(atTime, { ...this._clickProfile, ...accentProfile });
  }

  /**
   * Render an arbitrary cue tone at a specific audio time.
   * @param {{ frequency?: number, durationSec?: number, gain?: number, type?: OscillatorType }} cue
   * @param {number} atTime
   */
  renderCue(cue, atTime) {
    this._renderTone(atTime, { ...this._clickProfile, ...cue });
  }

  /**
   * @param {number} atTime
   * @param {ClickProfile} profile
   */
  _renderTone(atTime, profile) {
    if (!this._audioContext) {
      this.dispatchEvent(
        new CustomEvent("fault", {
          detail: { code: "audio-context-missing" },
        }),
      );
      return;
    }

    if (!Number.isFinite(atTime)) {
      throw new TypeError("PlaybackService render time must be finite");
    }

    const ctx = this._audioContext;
    const frequency = profile.frequency ?? 440;
    const durationSec = profile.durationSec ?? 0.05;
    const gainValue = profile.gain ?? 1;
    const type = profile.type ?? "sine";

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, atTime);
    gain.gain.setValueAtTime(gainValue, atTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, atTime + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(atTime);
    osc.stop(atTime + durationSec);
  }
}

export default PlaybackService;
