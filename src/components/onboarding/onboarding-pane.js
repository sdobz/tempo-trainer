/**
 * OnboardingPane - Web component for onboarding flow
 * Coordinates microphone selection, calibration, and completion
 * @module onboarding-pane
 */

import BaseComponent from "../base/base-component.js";
import { querySelector, bindEvent, dispatchEvent } from "../base/component-utils.js";

/**
 * @typedef {Object} OnboardingState
 * @property {boolean} micConfigured - Whether microphone threshold has been adjusted
 * @property {boolean} calibrated - Whether system has been calibrated
 */

/**
 * OnboardingPane component - guides users through setup
 *
 * Events emitted:
 * - 'complete': When user clicks "Go to Plan Editor"
 *
 * @extends BaseComponent
 */
export default class OnboardingPane extends BaseComponent {
  constructor() {
    super();
    /** @type {OnboardingState} */
    this.state = {
      micConfigured: false,
      calibrated: false,
    };

    /** @type {Array<() => void>} */
    this._cleanups = [];

    // Element references (set in onMount)
    this.micStatusEl = null;
    this.calibStatusEl = null;
    this.micStepEl = null;
    this.calibStepEl = null;
    this.completeBtn = null;

    // Public element references for external wiring
    this.micSelect = null;
    this.micLevel = null;
    this.micLevelBar = null;
    this.micPeakHold = null;
    this.micThresholdLine = null;
    this.micThresholdLabel = null;
    this.hitsList = null;
    this.calibrationBtn = null;
    this.calibrationStatus = null;
    this.calibrationResult = null;
  }

  getTemplateUrl() {
    return "/src/components/onboarding/onboarding-pane.html";
  }

  getStyleUrl() {
    return "/src/components/onboarding/onboarding-pane.css";
  }

  async onMount() {
    // Query DOM elements for status updates
    this.micStatusEl = querySelector(this, "[data-mic-status]");
    this.calibStatusEl = querySelector(this, "[data-calibration-status-indicator]");
    this.micStepEl = querySelector(this, "#step-microphone");
    this.calibStepEl = querySelector(this, "#step-calibration");
    this.completeBtn = querySelector(this, "[data-complete-btn]");

    // Query elements that external modules will need
    this.micSelect = querySelector(this, "[data-mic-select]");
    this.micLevel = querySelector(this, "[data-mic-level]");
    this.micLevelBar = querySelector(this, "[data-mic-level-bar]");
    this.micPeakHold = querySelector(this, "[data-mic-peak-hold]");
    this.micThresholdLine = querySelector(this, "[data-mic-threshold-line]");
    this.micThresholdLabel = querySelector(this, "[data-mic-threshold-label]");
    this.hitsList = querySelector(this, "[data-hits-list]");
    this.calibrationBtn = querySelector(this, "[data-calibration-btn]");
    this.calibrationStatus = querySelector(this, "[data-calibration-status]");
    this.calibrationResult = querySelector(this, "[data-calibration-result]");

    // Bind complete button
    this._cleanups.push(
      bindEvent(this.completeBtn, "click", () => this._onComplete())
    );
  }

  onUnmount() {
    this._cleanups.forEach((cleanup) => cleanup());
    this._cleanups = [];
  }

  /**
   * Update onboarding status indicators
   * @param {boolean} micConfigured - Whether microphone is configured
   * @param {boolean} calibrated - Whether system is calibrated
   */
  updateStatus(micConfigured, calibrated) {
    this.setState({ micConfigured, calibrated });

    // Update microphone status
    if (micConfigured) {
      this.micStatusEl.textContent = "✓ Configured";
      this.micStatusEl.classList.add("complete");
    } else {
      this.micStatusEl.textContent = "⚠️ Not configured";
      this.micStatusEl.classList.remove("complete");
    }
    this.micStepEl.classList.toggle("complete", micConfigured);

    // Update calibration status
    if (calibrated) {
      this.calibStatusEl.textContent = "✓ Calibrated";
      this.calibStatusEl.classList.add("complete");
    } else {
      this.calibStatusEl.textContent = "⚠️ Not calibrated";
      this.calibStatusEl.classList.remove("complete");
    }
    this.calibStepEl.classList.toggle("complete", calibrated);
  }

  /**
   * Handle completion button click
   * @private
   */
  _onComplete() {
    dispatchEvent(this, "complete", {});
  }
}

// Register custom element
if (!customElements.get("onboarding-pane")) {
  customElements.define("onboarding-pane", OnboardingPane);
}
