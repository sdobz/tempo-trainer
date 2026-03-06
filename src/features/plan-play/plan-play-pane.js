/**
 * PlanPlayPane - Web component for training session playback
 * Manages session controls, beat display, timeline visualization, and scoring
 * @module plan-play-pane
 */

import BaseComponent from "../base/base-component.js";
import {
  bindEvent,
  dispatchEvent,
  querySelector,
} from "../base/component-utils.js";
import { PlaybackState, PlaybackContext } from "./playback-state.js";
import { SessionStateContext } from "../base/session-state.js";
import "../visualizers/timeline-visualization.js";
import "../visualizers/plan-visualizer.js";
import "../base/app-notification.js";

/**
 * @typedef {Object} PlanPlayState
 * @property {boolean} isPlaying - Whether session is currently running
 * @property {number} currentMeasure - Current measure index
 * @property {number} overallScore - Overall score percentage
 */

/**
 * PlanPlayPane component - manages training session playback
 *
 * Events emitted:
 * - 'session-start': When start button is clicked (data: { bpm, beatsPerMeasure })
 * - 'session-stop': When stop button is clicked
 * - 'navigate': When user wants to navigate (data: { pane: string })
 *
 * @extends BaseComponent
 */
export default class PlanPlayPane extends BaseComponent {
  constructor() {
    super();

    /** @type {PlanPlayState} */
    this.state = {
      isPlaying: false,
      currentMeasure: 0,
      overallScore: 0,
    };

    /** @type {Array<() => void>} */
    this._cleanups = [];

    // Subscribable playback state — provided to descendant visualizers via PlaybackContext
    this._playbackState = new PlaybackState();

    // SessionState reference obtained via consumeContext (wired in onMount)
    /** @type {import('../base/session-state.js').default|null} */
    this._sessionState = null;

    // Direct timeline ref for imperative playback operations (centerAt, addDetection, etc.)
    /** @type {any} */
    this.timelineViz = null;

    // DOM element references (set in onMount)
    this.bpmInput = null;
    this.timeSignatureSelect = null;
    this.beatIndicator = null;
    this.statusDiv = null;
    this.startBtn = null;
    this.stopBtn = null;
    this.timelineViewport = null;
    this.timelineTrack = null;
    this.timelineNowLine = null;
    this.overallScoreDisplay = null;
    this.viewResultsBtn = null;
    this.calibrationWarning = null;
  }

  getTemplateUrl() {
    return "/src/features/plan-play/plan-play-pane.html";
  }

  getStyleUrl() {
    return "/src/features/plan-play/plan-play-pane.css";
  }

  onMount() {
    // Query all DOM elements
    this.bpmInput = querySelector(this, "[data-bpm-input]");
    this.timeSignatureSelect = querySelector(
      this,
      "[data-time-signature-select]",
    );
    this.beatIndicator = querySelector(this, "[data-beat-indicator]");
    this.statusDiv = querySelector(this, "[data-status]");
    this.startBtn = querySelector(this, "[data-start-btn]");
    this.stopBtn = querySelector(this, "[data-stop-btn]");
    this.overallScoreDisplay = querySelector(this, "[data-overall-score]");
    this.viewResultsBtn = querySelector(this, "[data-view-results-btn]");
    this.calibrationWarning = querySelector(this, "[data-calibration-warning]");

    // Obtain direct ref to timeline for imperative playback operations
    this.timelineViz = this.querySelector("timeline-visualization");

    // Provide PlaybackContext so descendant visualizers can subscribe to playback state
    this.provideContext(PlaybackContext, () => this._playbackState);

    // Subscribe to playbackState for own DOM rendering
    this._cleanups.push(
      this._playbackState.subscribe((state) => {
        // Beat indicator
        if (state.beat) {
          this.beatIndicator.textContent = String(state.beat.beatNum);
          this.beatIndicator.className = "beat-indicator";
          if (state.beat.shouldShow) {
            this.beatIndicator.classList.add(
              state.beat.isDownbeat ? "downbeat" : "active",
            );
          }
        } else {
          this.beatIndicator.textContent = "";
          this.beatIndicator.className = "beat-indicator";
        }
        // Status
        this.statusDiv.textContent = state.status;
        // Score
        const formattedScore = String(Math.round(state.overallScore)).padStart(
          2,
          "00",
        );
        this.overallScoreDisplay.textContent =
          "Overall Score: " + formattedScore;
        this.setState({ overallScore: state.overallScore });
        // Playing state
        this.setPlaying(state.isPlaying);
      }),
    );

    // Consume SessionStateContext — wire BPM into the pane's own display
    this.consumeContext(SessionStateContext, (ss) => {
      this._sessionState = ss;
      // Initialise from current session state
      this.setBPM(ss.bpm);
      this._cleanups.push(
        ss.subscribe({
          onBPMChange: (bpm) => this.setBPM(bpm),
        }),
      );
    });

    // BPM / time-signature input listeners — update SessionState so all consumers see the change
    this._cleanups.push(
      bindEvent(this.bpmInput, "input", () => {
        const bpm = parseInt(this.bpmInput.value, 10);
        if (!isNaN(bpm) && this._sessionState) this._sessionState.setBPM(bpm);
      }),
    );
    this._cleanups.push(
      bindEvent(this.timeSignatureSelect, "change", () => {
        const beatsPerMeasure = parseInt(
          this.timeSignatureSelect.value.split("/")[0],
          10,
        );
        if (!isNaN(beatsPerMeasure) && this._sessionState)
          this._sessionState.setBeatsPerMeasure(beatsPerMeasure);
      }),
    );

    // Bind event listeners
    this._cleanups.push(
      bindEvent(this.startBtn, "click", () => this._onStart()),
    );
    this._cleanups.push(bindEvent(this.stopBtn, "click", () => this._onStop()));
    this._cleanups.push(
      bindEvent(this.viewResultsBtn, "click", () => this._onViewResults()),
    );
    this._cleanups.push(
      bindEvent(this.calibrationWarning, "notification-action", () =>
        this._onCalibrationWarningAction(),
      ),
    );
  }

  onUnmount() {
    this._cleanups.forEach((cleanup) => cleanup());
    this._cleanups = [];
  }

  // --- Public Methods ---

  /**
   * Get BPM value
   * @returns {number}
   */
  getBPM() {
    return parseInt(this.bpmInput.value, 10);
  }

  /**
   * Set BPM value
   * @param {number} bpm
   */
  setBPM(bpm) {
    this.bpmInput.value = String(bpm);
  }

  /**
   * Get beats per measure from time signature
   * @returns {number}
   */
  getBeatsPerMeasure() {
    return parseInt(this.timeSignatureSelect.value.split("/")[0], 10);
  }

  /**
   * Set time signature
   * @param {string} timeSignature - e.g. "4/4"
   */
  setTimeSignature(timeSignature) {
    this.timeSignatureSelect.value = timeSignature;
  }

  /**
   * Get the PlaybackState instance (used by DrillSessionManager).
   * @returns {PlaybackState}
   */
  get playbackState() {
    return this._playbackState;
  }

  /**
   * Enable/disable start button
   * @param {boolean} disabled
   */
  setStartDisabled(disabled) {
    this.startBtn.disabled = disabled;
  }

  /**
   * Enable/disable stop button
   * @param {boolean} disabled
   */
  setStopDisabled(disabled) {
    this.stopBtn.disabled = disabled;
  }

  /**
   * Set playing state and update UI accordingly
   * @param {boolean} isPlaying
   */
  setPlaying(isPlaying) {
    this.setState({ isPlaying });
    this.setStartDisabled(isPlaying);
    this.setStopDisabled(!isPlaying);
  }

  /**
   * Reset to initial state
   */
  reset() {
    this._playbackState.update({
      beat: null,
      status: "Ready.",
      scores: [],
      overallScore: 0,
      highlight: -1,
      isPlaying: false,
    });
    this.setState({ currentMeasure: 0 });

    if (this.timelineViz) {
      if (typeof this.timelineViz.clearDetections === "function") {
        this.timelineViz.clearDetections();
      }
      if (typeof this.timelineViz.centerAt === "function") {
        this.timelineViz.centerAt(0);
      }
    }
  }

  /**
   * Show/hide warning when calibration data is missing.
   * @param {boolean} shouldShow
   */
  setCalibrationWarningVisible(shouldShow) {
    if (!this.calibrationWarning) return;

    if (shouldShow) {
      this.calibrationWarning.show({
        type: "warning",
        message:
          "Microphone offset is not calibrated. Timing feedback may be inaccurate.",
        actionLabel: "Calibrate Now",
        actionDetail: { pane: "onboarding", params: { target: "calibration" } },
      });
      return;
    }

    this.calibrationWarning.hide();
  }

  // --- Private Methods ---

  /**
   * Handle start button click
   */
  _onStart() {
    const bpm = this.getBPM();
    const beatsPerMeasure = this.getBeatsPerMeasure();

    dispatchEvent(this, "session-start", { bpm, beatsPerMeasure });
  }

  /**
   * Handle stop button click
   */
  _onStop() {
    dispatchEvent(this, "session-stop", {});
  }

  /**
   * Handle view results button click
   */
  _onViewResults() {
    dispatchEvent(this, "navigate", { pane: "plan-history" });
  }

  /**
   * Handle calibration warning CTA action.
   */
  _onCalibrationWarningAction() {
    dispatchEvent(this, "navigate", {
      pane: "onboarding",
      params: { target: "calibration" },
    });
  }
}

// Register the component
customElements.define("plan-play-pane", PlanPlayPane);
