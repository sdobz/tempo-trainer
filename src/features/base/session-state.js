import { createContext } from "../component/context.js";

/**
 * Context token.  Provided at the document root by main composition root;
 * consumed by plan-play-pane and any other component that needs session data.
 * @type {import('../component/context.js').Context<SessionState|null>}
 */
export const SessionStateContext = createContext("session-state", null);

/**
 * SessionState — single source of truth for session-scoped shared values.
 *
 * TimelineService owns canonical tempo/meter. SessionState now exposes
 * lightweight timing mirrors and emits coarse `changed` events for
 * session-scoped consumers that still require this context.
 */

class SessionState extends EventTarget {
  /**
   * @param {number} [initialBPM=120]
   * @param {number} [initialBeatsPerMeasure=4]
   */
  constructor(initialBPM = 120, initialBeatsPerMeasure = 4) {
    super();
    /** @type {number} */
    this._bpm = initialBPM;
    /** @type {number} */
    this._beatsPerMeasure = initialBeatsPerMeasure;
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /** @returns {number} Current BPM */
  get bpm() {
    return this._bpm;
  }

  /** @returns {number} Beat duration in seconds (60 / bpm) */
  get beatDuration() {
    return 60 / this._bpm;
  }

  /** @returns {number} Beats per measure */
  get beatsPerMeasure() {
    return this._beatsPerMeasure;
  }

  // ---------------------------------------------------------------------------
  // Setters
  // ---------------------------------------------------------------------------

  /**
   * [Phase 2 seam] Update mirrored BPM and notify compatibility subscribers.
   * @param {number} bpm
   */
  setBPM(bpm) {
    this._bpm = bpm;
    this.dispatchEvent(
      new CustomEvent("changed", { detail: { field: "bpm", value: bpm } }),
    );
  }

  /**
   * [Phase 2 seam] Update mirrored meter and notify compatibility subscribers.
   * @param {number} n
   */
  setBeatsPerMeasure(n) {
    this._beatsPerMeasure = n;
    this.dispatchEvent(
      new CustomEvent("changed", {
        detail: { field: "beatsPerMeasure", value: n },
      }),
    );
  }
}

export { SessionState };
export default SessionState;
