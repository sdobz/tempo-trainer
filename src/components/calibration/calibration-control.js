/**
 * CalibrationControl - Component for system calibration UI and logic
 *
 * Composes the Calibration domain logic with UI controls.
 * Provides a complete calibration experience with status display.
 */

import BaseComponent from "../base/base-component.js";
import { querySelector, bindEvent, dispatchEvent } from "../base/component-utils.js";
import Calibration from "../../calibration.js";

/**
 * @typedef {Object} CalibrationControlState
 * @property {boolean} isCalibrated - Whether calibration is complete
 */

/**
 * CalibrationControl component - system calibration UI and logic
 *
 * Events emitted:
 * - 'calibration-complete': When calibration is finished
 *
 * @extends BaseComponent
 */
export default class CalibrationControl extends BaseComponent {
  constructor() {
    super();

    /** @type {CalibrationControlState} */
    this.state = {
      isCalibrated: false,
    };

    /** @type {Calibration|null} */
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
    return "/src/components/calibration/calibration-control.html";
  }

  getStyleUrl() {
    return "/src/components/calibration/calibration-control.css";
  }

  async onMount() {
    // Query element references
    this.statusIndicator = querySelector(this, "[data-calibration-status-indicator]");
    this.button = querySelector(this, "[data-calibration-btn]");
    this.statusEl = querySelector(this, "[data-calibration-status]");
    this.resultEl = querySelector(this, "[data-calibration-result]");

    // Create calibration domain logic instance
    this.calibration = new Calibration(null, {
      button: this.button,
      status: this.statusEl,
      result: this.resultEl,
    });

    // Listen for calibration completion
    this.calibration.onStop(() => {
      dispatchEvent(this, "calibration-complete", {});
    });
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
