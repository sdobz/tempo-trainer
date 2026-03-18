/**
 * CalibrationControl - Component for system calibration UI and logic
 *
 * Composes the Calibration domain logic with UI controls.
 * Provides a complete calibration experience with status display.
 */

import BaseComponent from "../component/base-component.js";
import { dispatchEvent } from "../component/component-utils.js";
import CalibrationDetector from "./calibration-detector.js";
import StorageManager from "../base/storage-manager.js";
import { TimelineServiceContext } from "../music/timeline-service.js";
import { AudioContextServiceContext } from "../audio/audio-context-manager.js";
import "../visualizers/timeline-visualization.js";

/** @typedef {import("./calibration-detector.js").CalibrationDetectorDelegate} CalibrationDetectorDelegate */

/**
 * CalibrationControl component - system calibration UI and logic
 *
 * Integrates the pure domain CalibrationDetector with UI controls and DOM manipulation.
 * Handles all user interactions and visual feedback.
 *
 * Events emitted:
 * - 'calibration-complete': When calibration is finished
 *
 * @extends BaseComponent
 * @implements {CalibrationDetectorDelegate}
 */
export default class CalibrationControl extends BaseComponent {
  constructor() {
    super();

    [this._getIsCalibrated, this._setIsCalibrated] =
      this.createSignalState(false);
    [this._getOffsetMs, this._setOffsetMs] = this.createSignalState(0);
    [this._getIsStarted, this._setIsStarted] = this.createSignalState(false);
    [this._getProgress, this._setProgress] = this.createSignalState({
      hits: 0,
      minHits: 10,
      confidence: 0,
      progressPercent: 0,
    });

    this.calibration = null;

    this._timelineService = null;
    this._audioContextService = null;
    this._timelineListenersBound = false;
    this._audioListenersBound = false;

    this.updateStatus = this._setIsCalibrated;
    this.onStatusChanged = (_message) => {};
    this.onOffsetChanged = this._setOffsetMs;
  }

  getTemplateUrl() {
    return new URL("./calibration-control.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./calibration-control.css", import.meta.url).href;
  }

  async onMount() {
    this.calibration = new CalibrationDetector(StorageManager, this);

    this.createEffect(() => {
      this.refs.offsetInput.value = String(Math.round(this._getOffsetMs()));
    });

    this.createEffect(() => {
      const isStarted = this._getIsStarted();
      this.refs.button.textContent = isStarted
        ? "Cancel Calibration"
        : "Auto Calibrate";
      this.refs.progressContainer.hidden = !isStarted;
    });

    this.createEffect(() => {
      const progress = this._getProgress();
      const clamped = Math.max(0, Math.min(100, progress.progressPercent));
      this.refs.progressFill.style.width = `${clamped}%`;
      this.refs.progressTrack.setAttribute(
        "aria-valuenow",
        String(Math.round(clamped)),
      );

      const hits = Number.isFinite(progress.hits) ? progress.hits : 0;
      const minHits = Number.isFinite(progress.minHits)
        ? Math.max(1, progress.minHits)
        : 10;
      const confidence = Number.isFinite(progress.confidence)
        ? Math.max(0, Math.min(100, progress.confidence))
        : 0;

      this.refs.progressStatus.textContent =
        hits < minHits
          ? `Hits ${hits}/${minHits}`
          : `Confidence ${Math.round(confidence)}%`;
    });

    this.consumeContext(TimelineServiceContext, (timelineService) => {
      this._timelineService = timelineService;
      if (timelineService && !this._timelineListenersBound) {
        this._timelineListenersBound = true;
        this.listen(timelineService, "changed", (event) => {
          const { field, value } = /** @type {CustomEvent} */ (event).detail;
          if (field === "tempo") {
            this.calibration?.setBeatDuration(
              60.0 / /** @type {number} */ (value),
            );
          }
          if (field === "beatsPerMeasure") {
            this.calibration?.setBeatsPerMeasure(/** @type {number} */ (value));
          }
        });
      }
      this._syncTimelineCalibrationSettings();
    });

    this.consumeContext(AudioContextServiceContext, (audioService) => {
      this._audioContextService = audioService;
      if (audioService && !this._audioListenersBound) {
        this._audioListenersBound = true;
        this.listen(audioService, "ready", () =>
          this._syncCalibrationAudioContext(),
        );
        this.listen(audioService, "changed", () =>
          this._syncCalibrationAudioContext(),
        );
      }
      this._syncCalibrationAudioContext();
    });

    this._setOffsetMs(this.calibration.getOffsetMs());
    this.onProgressChanged({
      hits: 0,
      minHits: this.calibration.minHits,
      confidence: 0,
      progressPercent: 0,
    });
    this.onCalibrationStateChanged(false);
    const hasCalibrationData = this._hasCalibrationData(this.calibration);
    this.updateStatus(hasCalibrationData);
    this.calibration.onStop(() => {
      dispatchEvent(this, "calibration-complete", {});
    });
  }

  /**
   * Override the calibration detector instance (for testing or special cases)
   * @param {CalibrationDetector} detector - The detector instance to use
   */
  setDetector(detector) {
    this.calibration = detector;
    if (this.calibration) {
      this._setOffsetMs(this.calibration.getOffsetMs());
      this._setIsCalibrated(this._hasCalibrationData(this.calibration));
      this.onProgressChanged({
        hits: 0,
        minHits: this.calibration.minHits ?? 10,
        confidence: 0,
        progressPercent: 0,
      });
      this.calibration.onStop(() => {
        dispatchEvent(this, "calibration-complete", {});
      });
    }
  }

  /**
   * Determine whether detector has calibration data.
   * Supports older detector mocks that only expose getOffsetMs().
   * @param {CalibrationDetector|any} detector
   * @returns {boolean}
   * @private
   */
  _hasCalibrationData(detector) {
    if (detector && typeof detector.hasCalibrationData === "function") {
      return detector.hasCalibrationData();
    }
    return Boolean(
      detector &&
      typeof detector.getOffsetMs === "function" &&
      detector.getOffsetMs() !== 0,
    );
  }

  onUnmount() {
    if (this.calibration) {
      this.calibration.stop("Component unmounted");
      this.calibration = null;
    }
    this._timelineListenersBound = false;
    this._audioListenersBound = false;
  }

  /** @private */
  _syncTimelineCalibrationSettings() {
    if (!this.calibration || !this._timelineService) return;
    this.calibration.setBeatDuration(this._timelineService.beatDuration);
    this.calibration.setBeatsPerMeasure(this._timelineService.beatsPerMeasure);
  }

  /** @private */
  _syncCalibrationAudioContext() {
    if (!this.calibration || !this._audioContextService) return;
    this.calibration.audioContext = this._audioContextService.getContext();
  }

  /** @private */
  _nudgeOffset(delta) {
    const current = this._getOffsetMs();
    const next = Math.max(-300, Math.min(300, current + delta));
    this._setOffsetMs(next);
    if (this.calibration) {
      this.calibration.offsetMs = next;
    }
  }

  /**
   * Handler for calibration button click
   * @param {Event} event
   * @param {HTMLElement} element
   */
  handleCalibrationButtonClick(event, element) {
    if (!this.calibration) return;

    if (this._getIsStarted()) {
      this.calibration.stop("Button clicked");
    } else {
      this.calibration.start();
    }
  }

  /**
   * Handler for offset input change
   * @param {Event} event
   * @param {HTMLElement} element
   */
  handleOffsetInputChanged(event, element) {
    const value = parseInt(this.refs.offsetInput.value) || 0;
    const clamped = Math.max(-300, Math.min(300, value));
    this._setOffsetMs(clamped);
    if (this.calibration) {
      this.calibration.offsetMs = clamped;
    }
  }

  /**
   * Handler for offset increment button
   * @param {Event} event
   * @param {HTMLElement} element
   */
  handleNudgeOffsetUp(event, element) {
    this._nudgeOffset(1);
  }

  /**
   * Handler for offset decrement button
   * @param {Event} event
   * @param {HTMLElement} element
   */
  handleNudgeOffsetDown(event, element) {
    this._nudgeOffset(-1);
  }

  /**
   * Delegate method: Handle calibration state changes from detector
   * @param {boolean} isStarted - Whether calibration is running
   */
  onCalibrationStateChanged(isStarted) {
    this._setIsStarted(isStarted);
    dispatchEvent(this, "calibration-state-changed", { isStarted });
  }

  /**
   * Delegate method: Handle calibration progress updates.
   * @param {{ hits: number, minHits: number, confidence: number, progressPercent: number }} progress
   */
  onProgressChanged(progress) {
    this._setProgress(progress);
    dispatchEvent(this, "calibration-progress", progress);
  }
}

// Register custom element
if (!customElements.get("calibration-control")) {
  customElements.define("calibration-control", CalibrationControl);
}
