/**
 * CalibrationControl - Component for system calibration UI and logic
 *
 * Composes the Calibration domain logic with UI controls.
 * Provides a complete calibration experience with status display.
 */

import BaseComponent from "../base/base-component.js";
import {
  bindEvent,
  dispatchEvent,
  querySelector,
} from "../base/component-utils.js";
import CalibrationDetector from "./calibration-detector.js";
import StorageManager from "../base/storage-manager.js";

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

    /** @type {Object} */
    this.state = {
      isCalibrated: false,
    };

    /** @type {CalibrationDetector|null} */
    this.calibration = null;

    /** @type {Array<() => void>} */
    this._cleanups = [];

    // UI element references
    this.statusIndicator = null;
    this.button = null;
    this.statusEl = null;
    this.resultEl = null;
  }

  getTemplateUrl() {
    return "/src/features/calibration/calibration-control.html";
  }

  getStyleUrl() {
    return "/src/features/calibration/calibration-control.css";
  }

  async onMount() {
    // Query element references
    this.statusIndicator = querySelector(
      this,
      "[data-calibration-status-indicator]",
    );
    this.button = querySelector(this, "[data-calibration-btn]");
    this.statusEl = querySelector(this, "[data-calibration-status]");
    this.resultEl = querySelector(this, "[data-calibration-result]");

    // Setup button click handler
    this._cleanups.push(
      bindEvent(this.button, "click", () => this.calibration?.toggle()),
    );

    // Create domain instance with injected dependencies
    // - StorageManager: stateless utility, safe to reference directly
    // - this: component acts as the delegate for callbacks
    // - optional audioContext can be passed to setDetector() if needed
    this.calibration = new CalibrationDetector(StorageManager, this);

    // Hydrate UI from persisted calibration state
    this.onOffsetChanged(this.calibration.getOffsetMs());
    const hasCalibrationData = this._hasCalibrationData(this.calibration);
    this.updateStatus(hasCalibrationData);
    if (hasCalibrationData) {
      this.onStatusChanged("Calibration loaded from saved settings.");
    }

    // Listen for calibration completion
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
      this.onOffsetChanged(this.calibration.getOffsetMs());
      this.updateStatus(this._hasCalibrationData(this.calibration));
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
      detector && typeof detector.getOffsetMs === "function" &&
        detector.getOffsetMs() !== 0,
    );
  }

  onUnmount() {
    if (this.calibration) {
      this.calibration.stop("Component unmounted");
      this.calibration = null;
    }

    this._cleanups.forEach((cleanup) => cleanup());
    this._cleanups = [];
  }

  /**
   * Delegate method: Handle status message changes from detector
   * @param {string} message - Status message to display
   */
  onStatusChanged(message) {
    if (this.statusEl) {
      this.statusEl.textContent = message;
    }
  }

  /**
   * Delegate method: Handle offset value changes from detector
   * @param {number} offsetMs - Offset value in milliseconds
   */
  onOffsetChanged(offsetMs) {
    if (this.resultEl) {
      const roundedOffset = Math.round(offsetMs);
      this.resultEl.textContent = `Offset compensation: ${roundedOffset} ms`;
    }
  }

  /**
   * Delegate method: Handle calibration state changes from detector
   * @param {boolean} isStarted - Whether calibration is running
   */
  onCalibrationStateChanged(isStarted) {
    if (this.button) {
      this.button.textContent = isStarted
        ? "Stop Calibration"
        : "Start Calibration";
    }
  }

  /**
   * Update calibration status indicator
   * @param {boolean} isCalibrated - Whether calibration is complete
   */
  updateStatus(isCalibrated) {
    this.setState({ isCalibrated });

    if (isCalibrated) {
      this.statusIndicator.textContent = "✓ Calibrated";
      this.statusIndicator.classList.add("complete");
    } else {
      this.statusIndicator.textContent = "⚠️ Not calibrated";
      this.statusIndicator.classList.remove("complete");
    }
  }
}

// Register custom element
if (!customElements.get("calibration-control")) {
  customElements.define("calibration-control", CalibrationControl);
}
