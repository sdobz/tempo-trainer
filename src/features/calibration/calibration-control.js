/**
 * CalibrationControl - Component for system calibration UI and logic
 *
 * Composes the Calibration domain logic with UI controls.
 * Provides a complete calibration experience with status display.
 */

import BaseComponent from "../component/base-component.js";
import { dispatchEvent, querySelector } from "../component/component-utils.js";
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

    this.statusIndicator = null;
    this.button = null;
    this.timelineEl = null;
    this.progressContainer = null;
    this.progressTrack = null;
    this.progressFill = null;
    this.progressStatus = null;
    this.offsetInput = null;
    this.offsetDecBtn = null;
    this.offsetIncBtn = null;

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
    this.button = querySelector(this, "[data-calibration-btn]");
    this.timelineEl = querySelector(this, "[data-calibration-timeline]");
    this.progressContainer = querySelector(this, "[data-calibration-progress]");
    this.progressTrack = querySelector(
      this,
      "[data-calibration-progress-track]",
    );
    this.progressFill = querySelector(this, "[data-calibration-progress-fill]");
    this.progressStatus = querySelector(
      this,
      "[data-calibration-progress-status]",
    );
    this.offsetInput = querySelector(this, "[data-calibration-offset-input]");
    this.offsetDecBtn = querySelector(this, "[data-offset-dec]");
    this.offsetIncBtn = querySelector(this, "[data-offset-inc]");

    this.listen(this.button, "click", (event) =>
      this._onCalibrationButtonClick(event),
    );
    this.listen(this.offsetInput, "change", () => this._applyOffsetInput());
    this.listen(this.offsetIncBtn, "click", () => this._nudgeOffset(1));
    this.listen(this.offsetDecBtn, "click", () => this._nudgeOffset(-1));

    this.calibration = new CalibrationDetector(StorageManager, this);

    this.createEffect(() => {
      this.offsetInput.value = String(Math.round(this._getOffsetMs()));
    });

    this.createEffect(() => {
      const isStarted = this._getIsStarted();
      this.button.textContent = isStarted
        ? "Cancel Calibration"
        : "Auto Calibrate";
      this.progressContainer.hidden = !isStarted;
    });

    this.createEffect(() => {
      const progress = this._getProgress();
      const clamped = Math.max(0, Math.min(100, progress.progressPercent));
      this.progressFill.style.width = `${clamped}%`;
      this.progressTrack.setAttribute(
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

      this.progressStatus.textContent =
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

  /**
   * Handle calibration button click and emit a cancellable start request.
   * @param {MouseEvent} event
   * @private
   */
  _onCalibrationButtonClick(event) {
    if (!this.calibration) return;

    if (!this.calibration.isCalibrating) {
      const shouldStart = this.dispatchEvent(
        new CustomEvent("calibration-start-request", {
          detail: {
            sourceEvent: event,
          },
          bubbles: true,
          composed: true,
          cancelable: true,
        }),
      );

      if (!shouldStart) {
        return;
      }
    }

    this.calibration.toggle();
  }

  /** @private */
  _applyOffsetInput() {
    if (!this.calibration || !this.offsetInput) return;
    const parsed = Number.parseFloat(this.offsetInput.value);
    if (Number.isNaN(parsed)) return;
    const nextOffset = Math.max(-300, Math.min(300, parsed));
    this.calibration.setOffsetMs(nextOffset);
    this._setOffsetMs(nextOffset);
    this._setIsCalibrated(true);
  }

  /**
   * @param {number} deltaMs
   * @private
   */
  _nudgeOffset(deltaMs) {
    if (!this.offsetInput) return;
    const current = Number.parseFloat(this.offsetInput.value || "0");
    const safeCurrent = Number.isNaN(current) ? 0 : current;
    this.offsetInput.value = String(Math.round(safeCurrent + deltaMs));
    this._applyOffsetInput();
  }
}

// Register custom element
if (!customElements.get("calibration-control")) {
  customElements.define("calibration-control", CalibrationControl);
}
