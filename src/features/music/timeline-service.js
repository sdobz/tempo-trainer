import { createContext } from "../component/context.js";

/**
 * Context token. Provided by MainComponent; consumed by panes/visualizers needing timing state.
 * @type {import('../component/context.js').Context<TimelineService|null>}
 */
export const TimelineServiceContext = createContext("timeline-service", null);

/** @typedef {"stopped"|"playing"|"paused"} TransportState */

/**
 * TimelineService — canonical owner for tempo, meter, transport, and position.
 *
 * Event contract:
 * - "changed": coarse state updates { field, value, state }
 * - "transport": transport transition updates { state }
 * - "fault": runtime failures { code, error }
 */
class TimelineService extends EventTarget {
  /**
   * @param {{ tempo?: number, beatsPerMeasure?: number }} [initial]
   */
  constructor(initial = {}) {
    super();
    /** @type {number} */
    this._tempo = this._validateTempo(initial.tempo ?? 120);
    /** @type {number} */
    this._beatsPerMeasure = this._validateBeatsPerMeasure(
      initial.beatsPerMeasure ?? 4,
    );
    /** @type {TransportState} */
    this._transportState = "stopped";
    /** @type {number} */
    this._position = 0;
  }

  /** @returns {number} */
  get tempo() {
    return this._tempo;
  }

  /** @returns {number} */
  get beatDuration() {
    return 60 / this._tempo;
  }

  /** @returns {number} */
  get beatsPerMeasure() {
    return this._beatsPerMeasure;
  }

  /** @returns {TransportState} */
  get transportState() {
    return this._transportState;
  }

  /** @returns {number} */
  get position() {
    return this._position;
  }

  /**
   * @returns {{
   *   tempo: number,
   *   beatDuration: number,
   *   beatsPerMeasure: number,
   *   transportState: TransportState,
   *   position: number,
   * }}
   */
  getSnapshot() {
    return {
      tempo: this._tempo,
      beatDuration: this.beatDuration,
      beatsPerMeasure: this._beatsPerMeasure,
      transportState: this._transportState,
      position: this._position,
    };
  }

  /**
   * @param {number} bpm
   */
  setTempo(bpm) {
    const next = this._validateTempo(bpm);
    if (next === this._tempo) return;
    this._tempo = next;
    this._emitChanged("tempo", next);
  }

  /**
   * @param {number} n
   */
  setBeatsPerMeasure(n) {
    const next = this._validateBeatsPerMeasure(n);
    if (next === this._beatsPerMeasure) return;
    this._beatsPerMeasure = next;
    this._emitChanged("beatsPerMeasure", next);
  }

  play() {
    this._setTransportState("playing");
  }

  pause() {
    this._setTransportState("paused");
  }

  stop() {
    this._setTransportState("stopped");
    this.seekToDivision(0);
  }

  /**
   * @param {number} division
   */
  seekToDivision(division) {
    if (!Number.isFinite(division) || division < 0) {
      throw new TypeError(
        "TimelineService.seekToDivision requires a finite non-negative number",
      );
    }
    const next = Math.floor(division);
    if (next === this._position) return;
    this._position = next;
    this._emitChanged("position", next);
  }

  /**
   * @param {TransportState} next
   */
  _setTransportState(next) {
    if (this._transportState === next) return;
    this._transportState = next;
    this._emitChanged("transportState", next);
    this.dispatchEvent(
      new CustomEvent("transport", {
        detail: { state: next, snapshot: this.getSnapshot() },
      }),
    );
  }

  /**
   * @param {string} field
   * @param {unknown} value
   */
  _emitChanged(field, value) {
    this.dispatchEvent(
      new CustomEvent("changed", {
        detail: {
          field,
          value,
          state: this.getSnapshot(),
        },
      }),
    );
  }

  /**
   * @param {number} bpm
   * @returns {number}
   */
  _validateTempo(bpm) {
    if (!Number.isFinite(bpm) || bpm <= 0) {
      throw new TypeError(
        "TimelineService tempo must be a finite positive number",
      );
    }
    return Math.max(20, Math.min(360, Math.round(bpm)));
  }

  /**
   * @param {number} n
   * @returns {number}
   */
  _validateBeatsPerMeasure(n) {
    if (!Number.isFinite(n) || n <= 0) {
      throw new TypeError(
        "TimelineService beatsPerMeasure must be a finite positive number",
      );
    }
    return Math.max(1, Math.min(32, Math.round(n)));
  }
}

export default TimelineService;
