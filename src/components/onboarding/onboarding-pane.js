/**
 * OnboardingPane - Web component for onboarding flow
 * Coordinates microphone selection, calibration, and completion
 * @module onboarding-pane
 */

import BaseComponent from "../base/base-component.js";
import { querySelector, bindEvent, dispatchEvent } from "../base/component-utils.js";
import MicrophoneControl from "../microphone/microphone-control.js";
import CalibrationControl from "../calibration/calibration-control.js";

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
    this.completeBtn = null;

    // Sub-component references
    this.microphoneControl = null;
    this.calibrationControl = null;
  }

  getTemplateUrl() {
    return "/src/components/onboarding/onboarding-pane.html";
  }

  getStyleUrl() {
    return "/src/components/onboarding/onboarding-pane.css";
  }

  async onMount() {
    // Query DOM elements
    this.completeBtn = querySelector(this, "[data-complete-btn]");

    // Get reference to sub-components
    this.microphoneControl = querySelector(this, "microphone-control");
    this.calibrationControl = querySelector(this, "calibration-control");

    // Wait for both sub-components to be ready
    if (this.microphoneControl) {
      await this.microphoneControl.componentReady;
    }
    if (this.calibrationControl) {
      await this.calibrationControl.componentReady;
    }

    // Bind complete button
    this._cleanups.push(bindEvent(this.completeBtn, "click", () => this._onComplete()));
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

    // Update microphone status via sub-component
    if (this.microphoneControl) {
      this.microphoneControl.updateStatus(micConfigured);
    }

    // Update calibration status via sub-component
    if (this.calibrationControl) {
      this.calibrationControl.updateStatus(calibrated);
    }
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
customElements.define("onboarding-pane", OnboardingPane);
