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
import { dispatchEvent } from "../component/component-utils.js";
import "../microphone/microphone-control.js";
import "../calibration/calibration-control.js";
import "../visualizers/timeline-visualization.js";

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
    [this._getIsReady, this._setIsReady] = this.createSignalState(false);
    [this._getMicConfigured, this._setMicConfigured] =
      this.createSignalState(false);
    [this._getCalibrated, this._setCalibrated] = this.createSignalState(false);

    this.microphoneControl = null;
    this.calibrationControl = null;
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
    this.microphoneControl = this.refs.microphoneControl;
    this.calibrationControl = this.refs.calibrationControl;

    this.createEffect(() => {
      const isReady = this._getIsReady();
      this.refs.completeBtn.disabled = !isReady;
      this.refs.setupStatus.textContent = isReady
        ? "✓ Setup ready"
        : "⚠️ Setup incomplete";
      this.refs.setupStatus.classList.toggle("complete", isReady);
    });

    if (this.microphoneControl) await this.microphoneControl.componentReady;
    if (this.calibrationControl) await this.calibrationControl.componentReady;

    // Restore persisted detector type selection via context
    this.consumeContext(DetectorManagerContext, (dm) => {
      this._detectorManager = dm;
      const currentType = dm.getParams().type;
      if (this.refs.detectorSelect) {
        this.refs.detectorSelect.value = currentType;
      }
      this.refreshSetupStatus();
    });

    const microphoneLevel = this.microphoneControl?.refs?.level;
    if (microphoneLevel) {
      this.listen(microphoneLevel, "pointerup", () => {
        this.refreshSetupStatus();
      });
    }

    this.listen(this, "calibration-complete", () => this.refreshSetupStatus());
    this.listen(this, "calibration-start-request", () =>
      this.refreshSetupStatus(),
    );

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

    this._setMicConfigured(micConfigured);
    this._setCalibrated(calibrated);
    this._setIsReady(isReady);

    if (typeof this.microphoneControl?.updateStatus === "function") {
      this.microphoneControl.updateStatus(micConfigured);
    }
    if (typeof this.calibrationControl?.updateStatus === "function") {
      this.calibrationControl.updateStatus(calibrated);
    }

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
  handleDetectorChange(event) {
    if (!this._detectorManager) return;
    const nextType = event.target.value;
    this._detectorManager.setActiveDetector({
      type: nextType,
    });
    this.refreshSetupStatus();
  }

  handleCompleteClick() {
    if (!this._getIsReady()) return;
    dispatchEvent(this, "complete", {});
  }
}

customElements.define("onboarding-pane", OnboardingPane);
