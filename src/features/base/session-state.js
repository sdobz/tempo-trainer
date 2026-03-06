/**
 * SessionState — single source of truth for session-scoped shared values.
 *
 * Owns: BPM, beatsPerMeasure, drill plan data.
 *
 * Consumers subscribe once; mutations call `setBPM()`, `setBeatsPerMeasure()`,
 * or `setPlan()`, which notify all registered handlers automatically.
 * This replaces the manual fan-out blocks that previously appeared in script.js
 * and in DrillSessionManager.startSession().
 *
 * Usage:
 *   const sessionState = new SessionState();
 *
 *   // Subscribe (returns an unsubscribe function)
 *   const unsub = sessionState.subscribe({
 *     onBPMChange: (bpm) => metronome.setBPM(bpm),
 *     onBeatsPerMeasureChange: (n) => scorer.setBeatsPerMeasure(n),
 *     onPlanChange: (planData) => scorer.setDrillPlan(planData?.plan ?? []),
 *   });
 *
 *   // Mutate (notifies all subscribers)
 *   sessionState.setBPM(140);
 *
 *   // Read current value
 *   console.log(sessionState.bpm, sessionState.beatDuration);
 */

/**
 * @typedef {Object} SessionStateHandlers
 * @property {((bpm: number) => void)=} onBPMChange
 * @property {((n: number) => void)=} onBeatsPerMeasureChange
 * @property {((planData: any) => void)=} onPlanChange
 */

class SessionState {
  /**
   * @param {number} [initialBPM=120]
   * @param {number} [initialBeatsPerMeasure=4]
   */
  constructor(initialBPM = 120, initialBeatsPerMeasure = 4) {
    /** @type {number} */
    this._bpm = initialBPM;
    /** @type {number} */
    this._beatsPerMeasure = initialBeatsPerMeasure;
    /** @type {any} */
    this._plan = null;
    /** @type {SessionStateHandlers[]} */
    this._subscribers = [];
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

  /** @returns {any} Current plan data (object or null) */
  get plan() {
    return this._plan;
  }

  // ---------------------------------------------------------------------------
  // Setters — each notifies relevant subscribers
  // ---------------------------------------------------------------------------

  /**
   * Update BPM and notify subscribers.
   * @param {number} bpm
   */
  setBPM(bpm) {
    this._bpm = bpm;
    this._notify("onBPMChange", bpm);
  }

  /**
   * Update beats-per-measure and notify subscribers.
   * @param {number} n
   */
  setBeatsPerMeasure(n) {
    this._beatsPerMeasure = n;
    this._notify("onBeatsPerMeasureChange", n);
  }

  /**
   * Update the drill plan and notify subscribers.
   * @param {any} planData
   */
  setPlan(planData) {
    this._plan = planData;
    this._notify("onPlanChange", planData);
  }

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  /**
   * Register a set of handlers to be called when state changes.
   * Only provide the handlers you care about; others are ignored.
   *
   * @param {SessionStateHandlers} handlers
   * @returns {() => void} Unsubscribe function — call to stop receiving updates
   */
  subscribe(handlers) {
    this._subscribers.push(handlers);
    return () => {
      const i = this._subscribers.indexOf(handlers);
      if (i !== -1) this._subscribers.splice(i, 1);
    };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * @param {keyof SessionStateHandlers} handlerName
   * @param {any} value
   * @private
   */
  _notify(handlerName, value) {
    for (const sub of this._subscribers) {
      if (typeof sub[handlerName] === "function") {
        sub[handlerName](value);
      }
    }
  }
}

export default SessionState;
