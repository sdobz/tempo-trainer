/**
 * MicrophoneControl — Web component for microphone setup and level display.
 *
 * Acts as the UI delegate for DetectorManager. Renders signal level, peak hold,
 * sensitivity threshold line, hit feedback, and device selection.
 *
 * All visualization values received from DetectorManager are normalized to [0, 1].
 * The component multiplies by 100 for CSS percentage positioning.
 */

import BaseComponent from "../base/base-component.js";
import { DetectorManagerContext } from "./detector-manager.js";
import { bindEvent, querySelector } from "../base/component-utils.js";

/**
 * @typedef {Object} MicrophoneControlState
 * @property {boolean} isConfigured - Whether sensitivity has been adjusted from default
 */

export default class MicrophoneControl extends BaseComponent {
  constructor() {
    super();
    /** @type {MicrophoneControlState} */
    this.state = { isConfigured: false };

    /** @type {Array<() => void>} */
    this._cleanups = [];

    /** @type {number[]} — setTimeout IDs for hit dot removal */
    this._hitTimers = [];

    // Element references (set in onMount)
    this.statusIndicator = null;
    this.select = null;
    this.level = null;
    this.levelBar = null;
    this.peakHold = null;
    this.sensitivityLine = null;
    this.sensitivityLabel = null;

    this._isAdjustingSensitivity = false;
    /** @type {import('./detector-manager.js').default|null} */
    this._detectorManager = null;
  }

  getTemplateUrl() {
    return "/src/features/microphone/microphone-control.html";
  }

  getStyleUrl() {
    return "/src/features/microphone/microphone-control.css";
  }

  async onMount() {
    this.statusIndicator = querySelector(
      this,
      "[data-microphone-status-indicator]",
    );
    this.select = querySelector(this, "[data-microphone-select]");
    this.level = querySelector(this, "[data-microphone-level]");
    this.levelBar = querySelector(this, "[data-microphone-level-bar]");
    this.peakHold = querySelector(this, "[data-microphone-peak-hold]");
    this.sensitivityLine = querySelector(
      this,
      "[data-microphone-threshold-line]",
    );
    this.sensitivityLabel = querySelector(
      this,
      "[data-microphone-threshold-label]",
    );

    // Register as the UI delegate — DetectorManager pushes initial state immediately
    this.consumeContext(DetectorManagerContext, (dm) => {
      this._detectorManager = dm;
      dm.setDelegate(this);
      this._setupUIEventListeners(dm);
      this._populateDevices(dm);
    });
  }

  onUnmount() {
    // Remove self as delegate to stop receiving callbacks after unmount
    if (this._detectorManager) {
      this._detectorManager.setDelegate(null);
    }
    // Cancel any pending hit-dot removal timers
    this._hitTimers.forEach((id) => clearTimeout(id));
    this._hitTimers = [];
    this._cleanups.forEach((fn) => fn());
    this._cleanups = [];
  }

  // ---------------------------------------------------------------------------
  // Delegate callbacks — all values are 0–1
  // ---------------------------------------------------------------------------

  /**
   * Current signal level (bar width).
   * @param {number} level 0–1
   */
  onLevelChanged(level) {
    this.levelBar.style.width = `${Math.round(level * 1000) / 10}%`;
  }

  /**
   * Peak-hold indicator position.
   * @param {number} peak 0–1
   */
  onPeakChanged(peak) {
    this.peakHold.style.left = `${Math.round(peak * 1000) / 10}%`;
  }

  /**
   * Sensitivity / threshold line position.
   * Emitted by both detectors as fixed sensitivity position (0–1).
   * @param {number} pos 0–1
   */
  onThresholdChanged(pos) {
    if (!this.sensitivityLine || !this.sensitivityLabel) return;
    // Round to 1 decimal place to avoid floating-point noise in CSS values
    const pct = Math.round(pos * 1000) / 10;
    this.sensitivityLine.style.left = `${pct}%`;
    this.sensitivityLabel.textContent = `Sensitivity: ${Math.round(pct)}%`;
  }

  /**
   * Hit detected.
   */
  onHit() {
    // Hit visualization now lives in timeline components via shared hit events.
  }

  /**
   * Device list updated (hardware event after getUserMedia).
   * @param {Array<{deviceId: string, label: string}>} devices
   * @param {string} selectedDeviceId
   */
  onDevicesChanged(devices, selectedDeviceId) {
    this._renderDeviceOptions(devices, selectedDeviceId);
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  /**
   * @param {boolean} isConfigured
   */
  updateStatus(isConfigured) {
    this.setState({ isConfigured });
    if (isConfigured) {
      this.statusIndicator.textContent = "✓ Configured";
      this.statusIndicator.classList.add("complete");
    } else {
      this.statusIndicator.textContent = "⚠️ Not configured";
      this.statusIndicator.classList.remove("complete");
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** @private */
  _setupUIEventListeners(detectorManager) {
    // Sensitivity adjustment via pointer drag on the level bar
    this._cleanups.push(
      bindEvent(this.level, "pointerdown", (e) =>
        this._onSensitivityPointerDown(e, detectorManager),
      ),
      bindEvent(this.level, "pointermove", (e) =>
        this._onSensitivityPointerMove(e, detectorManager),
      ),
      bindEvent(window, "pointerup", () => {
        this._isAdjustingSensitivity = false;
      }),
      bindEvent(this.select, "change", () =>
        this._onDeviceSelected(detectorManager),
      ),
    );
  }

  /** @private */
  async _populateDevices(detectorManager) {
    const devices = await detectorManager.getAvailableDevices();
    const selectedId = detectorManager._audioInput?.selectedDeviceId ?? "";
    this._renderDeviceOptions(devices, selectedId);
  }

  /** @private */
  _renderDeviceOptions(devices, selectedDeviceId) {
    this.select.innerHTML = "";
    if (devices.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No microphone found";
      this.select.appendChild(option);
      this.select.disabled = true;
      return;
    }
    this.select.disabled = false;
    devices.forEach((device) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label;
      this.select.appendChild(option);
    });
    this.select.value = selectedDeviceId || devices[0]?.deviceId || "";
  }

  /** @private */
  _onDeviceSelected(detectorManager) {
    const deviceId = this.select.value;
    if (deviceId) detectorManager.selectDevice(deviceId);
  }

  /** @private */
  _onSensitivityPointerDown(event, detectorManager) {
    this._isAdjustingSensitivity = true;
    this._setSensitivityFromPointer(event.clientX, detectorManager);
    this.level.setPointerCapture?.(event.pointerId);
  }

  /** @private */
  _onSensitivityPointerMove(event, detectorManager) {
    if (!this._isAdjustingSensitivity) return;
    this._setSensitivityFromPointer(event.clientX, detectorManager);
  }

  /** @private */
  _setSensitivityFromPointer(clientX, detectorManager) {
    const rect = this.level.getBoundingClientRect();
    const sensitivity = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width),
    );
    detectorManager.setSensitivity(sensitivity);
  }
}

// Register custom element
if (!customElements.get("microphone-control")) {
  customElements.define("microphone-control", MicrophoneControl);
}
