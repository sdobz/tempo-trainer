/**
 * OnboardingPane - Web component for onboarding flow.
 * Coordinates detector selection, microphone setup, calibration, and completion.
 */

import BaseComponent from "../component/base-component.js";
import { DetectorManagerContext } from "../microphone/detector-manager.js";
import {
  DEFAULT_ADAPTIVE_PARAMS,
  DEFAULT_THRESHOLD_PARAMS,
  DETECTOR_TYPES,
} from "../microphone/detector-params.js";
import { dispatchEvent, querySelector } from "../component/component-utils.js";
import "../microphone/microphone-control.js";
import "../calibration/calibration-control.js";
import "../visualizers/timeline-visualization.js";

/**
 * @typedef {Object} OnboardingState
 * @property {boolean} isReady - Whether setup is complete
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
    this.state = { isReady: false, micConfigured: false, calibrated: false };

    // Element references (set in onMount)
    this.completeBtn = null;
    this.setupStatus = null;
    this.detectorSelect = null;

    // Sub-component references
    this.microphoneControl = null;
    this.calibrationControl = null;
    /** @type {import('../microphone/detector-manager.js').default|null} */
    this._detectorManager = null;
  }

  /**
   * Convenience getter so app orchestration can access the calibration domain object
   * without reaching through three levels of nesting.
   * @returns {import('../calibration/calibration-detector.js').default|null}
   */
  get calibration() {
    return this.calibrationControl?.calibration ?? null;
  }

  getTemplateUrl() {
    return new URL("./onboarding-pane.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./onboarding-pane.css", import.meta.url).href;
  }

  async onMount() {
    this.completeBtn = querySelector(this, "[data-complete-btn]");
    this.setupStatus = querySelector(this, "[data-setup-status]");
    this.detectorSelect = querySelector(this, "[data-detector-select]");

    this.microphoneControl = querySelector(this, "microphone-control");
    this.calibrationControl = querySelector(this, "calibration-control");

    if (this.microphoneControl) await this.microphoneControl.componentReady;
    if (this.calibrationControl) await this.calibrationControl.componentReady;

    // Restore persisted detector type selection via context
    this.consumeContext(DetectorManagerContext, (dm) => {
      this._detectorManager = dm;
      const currentType = dm.getParams().type;
      if (this.detectorSelect) {
        this.detectorSelect.value = currentType;
      }
      this.refreshSetupStatus();
    });

    // Bind detector selection change
    if (this.detectorSelect) {
      this.listen(this.detectorSelect, "change", (e) =>
        this._onDetectorChange(e),
      );
    }

    if (this.microphoneControl?.level) {
      this.listen(this.microphoneControl.level, "pointerup", () => {
        this.refreshSetupStatus();
      });
    }

    this.listen(this, "calibration-complete", () => this.refreshSetupStatus());
    this.listen(this, "calibration-start-request", () =>
      this.refreshSetupStatus(),
    );

    this.listen(this.completeBtn, "click", () => this._onComplete());

    this.refreshSetupStatus();
  }

  /** @returns {boolean} */
  hasCalibrationData() {
    const calibration = this.calibration;
    if (!calibration) return false;
    if (typeof calibration.hasCalibrationData === "function") {
      return calibration.hasCalibrationData();
    }
    return calibration.getOffsetMs() !== 0;
  }

  /**
   * Recompute setup readiness from live detector + calibration state.
   */
  refreshSetupStatus() {
    const detectorType = this._detectorManager?.getParams().type;
    const defaultSensitivity =
      detectorType === DETECTOR_TYPES.ADAPTIVE
        ? DEFAULT_ADAPTIVE_PARAMS.sensitivity
        : DEFAULT_THRESHOLD_PARAMS.sensitivity;

    const sensitivity =
      this._detectorManager?.sensitivity ?? defaultSensitivity;
    const micConfigured = Math.abs(sensitivity - defaultSensitivity) > 0.01;
    const calibrated = this.hasCalibrationData();
    const isReady = micConfigured && calibrated;

    this.setState({ isReady, micConfigured, calibrated });

    if (typeof this.microphoneControl?.updateStatus === "function") {
      this.microphoneControl.updateStatus(micConfigured);
    }
    if (typeof this.calibrationControl?.updateStatus === "function") {
      this.calibrationControl.updateStatus(calibrated);
    }
    this._renderSetupStatus(isReady);

    dispatchEvent(this, "setup-status-changed", {
      isReady,
      micConfigured,
      calibrated,
    });
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
    if (!this._detectorManager) return;
    const nextType = event.target.value;
    this._detectorManager.setActiveDetector({
      type: nextType,
    });
    this.refreshSetupStatus();
  }

  /** @private */
  _onComplete() {
    if (!this.state.isReady) return;
    dispatchEvent(this, "complete", {});
  }

  /**
   * @param {boolean} isReady
   * @private
   */
  _renderSetupStatus(isReady) {
    if (this.completeBtn) {
      this.completeBtn.disabled = !isReady;
    }

    if (!this.setupStatus) return;

    this.setupStatus.textContent = isReady
      ? "✓ Setup ready"
      : "⚠️ Setup incomplete";
    this.setupStatus.classList.toggle("complete", isReady);
  }
}

customElements.define("onboarding-pane", OnboardingPane);
