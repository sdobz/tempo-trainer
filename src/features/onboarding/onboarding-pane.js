/**
 * OnboardingPane - Web component for onboarding flow
 * Coordinates detector selection, microphone setup, calibration, and completion
 * @module onboarding-pane
 */

import BaseComponent from "../base/base-component.js";
import {
  bindEvent,
  dispatchEvent,
  querySelector,
} from "../base/component-utils.js";
import DetectorFactory from "../microphone/detector-factory.js";
import StorageManager from "../base/storage-manager.js";
import "../microphone/microphone-control.js";
import "../calibration/calibration-control.js";

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

    // audioContext shared with microphone control for detector switching
    this.audioContext = null;

    // Element references (set in onMount)
    this.completeBtn = null;

    // Sub-component references
    this.microphoneControl = null;
    this.calibrationControl = null;
  }

  getTemplateUrl() {
    return "/src/features/onboarding/onboarding-pane.html";
  }

  getStyleUrl() {
    return "/src/features/onboarding/onboarding-pane.css";
  }

  async onMount() {
    // Query DOM elements
    this.completeBtn = querySelector(this, "[data-complete-btn]");

    // Get detector selection radio buttons
    const detectorRadios = this.querySelectorAll('input[name="detector"]');

    // Get reference to sub-components
    this.microphoneControl = querySelector(this, "microphone-control");
    this.calibrationControl = querySelector(this, "calibration-control");

    // Wait for both sub-components to be ready
    if (this.microphoneControl) {
      await this.microphoneControl.componentReady;
      // Save reference to audioContext so detector can be switched without reload
      this.audioContext = this.microphoneControl.audioContext;
    }
    if (this.calibrationControl) {
      await this.calibrationControl.componentReady;
    }

    // Restore persisted detector selection
    const currentDetectorType =
      DetectorFactory.getPreferredType(StorageManager);
    detectorRadios.forEach((radio) => {
      radio.checked = radio.value === currentDetectorType;
    });

    // Bind detector selection change
    detectorRadios.forEach((radio) => {
      this._cleanups.push(
        bindEvent(radio, "change", (e) => this._onDetectorChange(e)),
      );
    });

    // Bind complete button
    this._cleanups.push(
      bindEvent(this.completeBtn, "click", () => this._onComplete()),
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
   * Handle detector selection change
   * @private
   */
  _onDetectorChange(event) {
    const detectorType = event.target.value;
    DetectorFactory.setPreferredType(StorageManager, detectorType);

    // Stop running detector
    if (
      this.microphoneControl &&
      this.microphoneControl.micDetector?.isRunning
    ) {
      this.microphoneControl.micDetector.stop();
    }

    // Recreate detector with new type, passing the audioContext for persistent connection
    if (this.microphoneControl && this.audioContext) {
      const newDetector = DetectorFactory.createPreferred(
        StorageManager,
        this.microphoneControl,
        this.audioContext,
      );
      this.microphoneControl.setDetector(newDetector);
      // If the old detector was running, start the new one
      if (this.microphoneControl.state?.isConfigured) {
        newDetector.start();
      }
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
