import { createContext } from "../component/context.js";

/**
 * Context token.  Provided at the document root by script.js;
 * consumed by plan-play-pane and any other component that needs session data.
 * @type {import('../component/context.js').Context<SessionState|null>}
 */
export const SessionStateContext = createContext("session-state", null);

/**
 * SessionState — single source of truth for session-scoped shared values.
 *
 * [Phase 2 seam] Canonical timing ownership moved to TimelineService.
 * SessionState retains BPM/beatsPerMeasure as compatibility mirrors and
 * still carries drill plan data for legacy consumers.
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
  // Setters — notify compatibility subscribers
  // ---------------------------------------------------------------------------

  /**
   * [Phase 2 seam] Update mirrored BPM and notify compatibility subscribers.
   * @param {number} bpm
   */
  setBPM(bpm) {
    this._bpm = bpm;
    this._notify("onBPMChange", bpm);
    // [Phase 0 compat shim] Emit EventTarget event. Remove after all consumers use events: target=Phase 4.
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
    this._notify("onBeatsPerMeasureChange", n);
    // [Phase 0 compat shim] Emit EventTarget event. Remove after all consumers use events: target=Phase 4.
    this.dispatchEvent(
      new CustomEvent("changed", {
        detail: { field: "beatsPerMeasure", value: n },
      }),
    );
  }

  /**
   * Update the drill plan and notify subscribers.
   * @param {any} planData
   */
  setPlan(planData) {
    this._plan = planData;
    this._notify("onPlanChange", planData);
    // [Phase 0 compat shim] Emit EventTarget event. Remove after all consumers use events: target=Phase 4.
    this.dispatchEvent(
      new CustomEvent("changed", {
        detail: { field: "plan", value: planData },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  /**
   * Register a set of handlers to be called when state changes.
   * Only provide the handlers you care about; others are ignored.
   *
   * [Phase 0 compat shim] Deprecated in favor of EventTarget.addEventListener().
   * Remove this method after all consumers migrate: target=Phase 4.
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

export { SessionState };
export default SessionState;
