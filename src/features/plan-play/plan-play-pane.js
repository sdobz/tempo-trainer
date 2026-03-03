/**
 * PlanPlayPane - Web component for training session playback
 * Manages session controls, beat display, timeline visualization, and scoring
 * @module plan-play-pane
 */

import BaseComponent from "../base/base-component.js";
import { querySelector, bindEvent, dispatchEvent } from "../base/component-utils.js";
import "./timeline-visualization.js";

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

    // Injected dependencies (set externally)
    this.drillPlan = null;
    this.scorer = null;

    // Component references (set in onMount)
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
  }

  getTemplateUrl() {
    return "/src/features/plan-play/plan-play-pane.html";
  }

  getStyleUrl() {
    return "/src/features/plan-play/plan-play-pane.css";
  }

  async onMount() {
    // Query all DOM elements
    this.bpmInput = querySelector(this, "[data-bpm-input]");
    this.timeSignatureSelect = querySelector(this, "[data-time-signature-select]");
    this.beatIndicator = querySelector(this, "[data-beat-indicator]");
    this.statusDiv = querySelector(this, "[data-status]");
    this.startBtn = querySelector(this, "[data-start-btn]");
    this.stopBtn = querySelector(this, "[data-stop-btn]");
    this.overallScoreDisplay = querySelector(this, "[data-overall-score]");
    this.viewResultsBtn = querySelector(this, "[data-view-results-btn]");

    // Get reference to timeline-visualization component
    this.timelineViz = this.querySelector("timeline-visualization");

    // Bind event listeners
    this._cleanups.push(bindEvent(this.startBtn, "click", () => this._onStart()));
    this._cleanups.push(bindEvent(this.stopBtn, "click", () => this._onStop()));
    this._cleanups.push(bindEvent(this.viewResultsBtn, "click", () => this._onViewResults()));
  }

  onUnmount() {
    this._cleanups.forEach((cleanup) => cleanup());
    this._cleanups = [];
  }

  /**
   * Initialize the component with dependencies
   * @param {DrillPlan} drillPlan
   * @param {Scorer} scorer
   */
  init(drillPlan, scorer) {
    this.drillPlan = drillPlan;
    this.scorer = scorer;
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
   * Update beat indicator display
   * @param {number} beatNumber - 1-indexed beat number
   * @param {boolean} isDownbeat - Whether this is the first beat of measure
   * @param {boolean} shouldShow - Whether to show the beat visually
   */
  updateBeatIndicator(beatNumber, isDownbeat, shouldShow) {
    this.beatIndicator.textContent = String(beatNumber);
    this.beatIndicator.className = "beat-indicator";
    if (shouldShow) {
      this.beatIndicator.classList.add(isDownbeat ? "downbeat" : "active");
    }
  }

  /**
   * Clear beat indicator
   */
  clearBeatIndicator() {
    this.beatIndicator.textContent = "";
    this.beatIndicator.className = "beat-indicator";
  }

  /**
   * Update status message
   */
  setStatus(message) {
    this.statusDiv.textContent = message;
  }

  /**
   * Update overall score display
   */
  updateScore(score) {
    this.setState({ overallScore: score });
    const formattedScore = String(Math.round(score)).padStart(2, "0");
    this.overallScoreDisplay.textContent = "Overall Score: " + formattedScore;
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
    this.clearBeatIndicator();
    this.setStatus("Ready.");
    this.updateScore(0);
    this.setPlaying(false);
    this.setState({ currentMeasure: 0 });
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
}

// Register the component
customElements.define("plan-play-pane", PlanPlayPane);
