import { createContext } from "../component/context.js";

/**
 * Context token. Provided by MainComponent; consumed by panes/visualizers needing timing state.
 * @type {import('../component/context.js').Context<TimelineService|null>}
 */
export const TimelineServiceContext = createContext("timeline-service", null);

/** @typedef {"stopped"|"playing"|"paused"} TransportState */

/**
 * TimelineService — canonical owner for tempo, meter, transport, position, and beat scheduling.
 *
 * Event contract:
 * - "changed": coarse state updates { field, value, state }
 * - "transport": transport transition updates { state }
 * - "tick": beat tick event { beatInMeasure, time, timeUntilBeat }
 * - "fault": runtime failures { code, error }
 */
class TimelineService extends EventTarget {
  /**
   * @param {{ tempo?: number, beatsPerMeasure?: number, audioContext?: AudioContext }} [initial]
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

    // Scheduler state for beat emission
    /** @type {AudioContext|null} */
    this._audioContext = initial.audioContext ?? null;
    /** @type {number} */
    this._lookahead = 25.0; // ms
    /** @type {number} */
    this._scheduleAheadTime = 0.1; // seconds
    /** @type {boolean} */
    this._isScheduling = false;
    /** @type {number|null} */
    this._schedulerIntervalID = null;
    /** @type {number} */
    this._nextNoteTime = 0;
    /** @type {number} */
    this._currentBeatInMeasure = 0;
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
   * Set the audio context (required for beat scheduling).
   * @param {AudioContext|null} ctx
   */
  setAudioContext(ctx) {
    this._audioContext = ctx;
  }

  /**
   * Get the current audio time from the context (or 0 if no context).
   * @returns {number}
   */
  getAudioTime() {
    return this._audioContext?.currentTime ?? 0;
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
    if (this._audioContext && !this._isScheduling) {
      this._startScheduler();
    }
  }

  pause() {
    this._setTransportState("paused");
    this._stopScheduler();
  }

  stop() {
    this._stopScheduler();
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
   * Start the beat scheduler loop.
   * @private
   */
  _startScheduler() {
    if (!this._audioContext || this._isScheduling) return;

    this._audioContext.resume();
    this._isScheduling = true;
    this._nextNoteTime = this._audioContext.currentTime + 0.1;
    this._currentBeatInMeasure = 0;

    this._schedulerIntervalID = setInterval(
      () => this._scheduler(),
      this._lookahead,
    );
  }

  /**
   * Stop the beat scheduler loop.
   * @private
   */
  _stopScheduler() {
    if (!this._isScheduling) return;

    if (this._schedulerIntervalID) {
      clearInterval(this._schedulerIntervalID);
      this._schedulerIntervalID = null;
    }

    this._isScheduling = false;
  }

  /**
   * Scheduler loop that processes and emits upcoming beat ticks.
   * @private
   */
  _scheduler() {
    if (!this._audioContext || !this._isScheduling) return;

    while (
      this._nextNoteTime <
      this._audioContext.currentTime + this._scheduleAheadTime
    ) {
      const beatInMeasure = this._currentBeatInMeasure;
      const time = this._nextNoteTime;
      const timeUntilBeat = this._nextNoteTime - this._audioContext.currentTime;

      // Emit tick event for subscribers
      this.dispatchEvent(
        new CustomEvent("tick", {
          detail: {
            beatInMeasure,
            time,
            timeUntilBeat,
          },
        }),
      );

      this._updateBeat();
    }
  }

  /**
   * Update beat position and check for measure completion.
   * @private
   */
  _updateBeat() {
    this._nextNoteTime += this.beatDuration;
    this._currentBeatInMeasure++;

    if (this._currentBeatInMeasure >= this._beatsPerMeasure) {
      this._currentBeatInMeasure = 0;

      // Emit measure-complete event
      this.dispatchEvent(
        new CustomEvent("measure-complete", {
          detail: { measureStarted: true },
        }),
      );
    }
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
