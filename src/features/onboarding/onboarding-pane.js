/**
 * OnboardingPane - Web component for onboarding flow.
 * Coordinates detector selection, microphone setup, calibration, and completion.
 */

import BaseComponent from "../base/base-component.js";
import Services from "../base/services.js";
import {
  bindEvent,
  dispatchEvent,
  querySelector,
} from "../base/component-utils.js";
import "../microphone/microphone-control.js";
import "../calibration/calibration-control.js";

/**
 * @typedef {Object} OnboardingState
 * @property {boolean} micConfigured - Whether microphone sensitivity has been adjusted
 * @property {boolean} calibrated    - Whether system has been calibrated
 */

/**
 * OnboardingPane component — guides users through setup.
 *
 * Events emitted:
 *   'complete': When user clicks "Go to Plan Editor"
 *
 * @extends BaseComponent
 */
export default class OnboardingPane extends BaseComponent {
  constructor() {
    super();
    /** @type {OnboardingState} */
    this.state = { micConfigured: false, calibrated: false };

    /** @type {Array<() => void>} */
    this._cleanups = [];

    // Element references (set in onMount)
    this.completeBtn = null;

    // Sub-component references
    this.microphoneControl = null;
    this.calibrationControl = null;
  }

  /**
   * Convenience getter so script.js can access the calibration domain object
   * without reaching through three levels of nesting.
   * @returns {import('../calibration/calibration-detector.js').default|null}
   */
  get calibration() {
    return this.calibrationControl?.calibration ?? null;
  }

  getTemplateUrl() {
    return "/src/features/onboarding/onboarding-pane.html";
  }

  getStyleUrl() {
    return "/src/features/onboarding/onboarding-pane.css";
  }

  async onMount() {
    this.completeBtn = querySelector(this, "[data-complete-btn]");

    const detectorRadios = this.querySelectorAll('input[name="detector"]');

    this.microphoneControl = querySelector(this, "microphone-control");
    this.calibrationControl = querySelector(this, "calibration-control");

    if (this.microphoneControl) await this.microphoneControl.componentReady;
    if (this.calibrationControl) await this.calibrationControl.componentReady;

    // Restore persisted detector type selection
    if (Services.has("detectorManager")) {
      const currentType = Services.get("detectorManager").getParams().type;
      detectorRadios.forEach((radio) => {
        radio.checked = radio.value === currentType;
      });
    }

    // Bind detector selection change
    detectorRadios.forEach((radio) => {
      this._cleanups.push(
        bindEvent(radio, "change", (e) => this._onDetectorChange(e)),
      );
    });

    this._cleanups.push(
      bindEvent(this.completeBtn, "click", () => this._onComplete()),
    );
  }

  onUnmount() {
    this._cleanups.forEach((fn) => fn());
    this._cleanups = [];
  }

  /**
   * Update onboarding status indicators.
   * @param {boolean} micConfigured
   * @param {boolean} calibrated
   */
  updateStatus(micConfigured, calibrated) {
    this.setState({ micConfigured, calibrated });
    this.microphoneControl?.updateStatus(micConfigured);
    this.calibrationControl?.updateStatus(calibrated);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Handle detector type radio change.
   * Delegates entirely to DetectorManager, which handles stop/create/rewire/start.
   * @private
   */
  _onDetectorChange(event) {
    if (!Services.has("detectorManager")) return;
    Services.get("detectorManager").setActiveDetector({ type: event.target.value });
  }

  /** @private */
  _onComplete() {
    dispatchEvent(this, "complete", {});
  }
}

customElements.define("onboarding-pane", OnboardingPane);
