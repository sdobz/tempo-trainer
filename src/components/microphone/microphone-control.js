/**
 * MicrophoneControl - Web component for microphone device selection and level display
 *
 * Integrates the pure domain MicrophoneDetector with UI controls and DOM manipulation.
 * Handles all user interactions and visual feedback.
 */

import BaseComponent from "../base/base-component.js";
import { querySelector, bindEvent, dispatchEvent } from "../base/component-utils.js";
import MicrophoneDetector from "../../microphone-detector.js";
import StorageManager from "../../storage-manager.js";

/** @typedef {import("../../microphone-detector.js").MicrophoneDetectorDelegate} MicrophoneDetectorDelegate */

/**
 * @typedef {Object} MicrophoneControlState
 * @property {boolean} isConfigured - Whether microphone threshold has been adjusted
 */

/**
 * MicrophoneControl component - microphone device selection and level display
 *
 * Events emitted:
 * - 'microphone-configured': When threshold is adjusted
 *
 * @extends BaseComponent
 */
export default class MicrophoneControl extends BaseComponent {
  constructor() {
    super();
    /** @type {MicrophoneControlState} */
    this.state = {
      isConfigured: false,
    };

    /** @type {Array<() => void>} */
    this._cleanups = [];

    // Element references (set in onMount)
    this.statusIndicator = null;
    this.select = null;
    this.level = null;
    this.levelBar = null;
    this.peakHold = null;
    this.thresholdLine = null;
    this.thresholdLabel = null;
    this.hitsList = null;

    // Domain instance
    this.micDetector = null;

    // Threshold adjustment state
    this._isAdjustingThreshold = false;
  }

  getTemplateUrl() {
    return "/src/components/microphone/microphone-control.html";
  }

  getStyleUrl() {
    return "/src/components/microphone/microphone-control.css";
  }

  async onMount() {
    // Query element references
    this.statusIndicator = querySelector(this, "[data-microphone-status-indicator]");
    this.select = querySelector(this, "[data-microphone-select]");
    this.level = querySelector(this, "[data-microphone-level]");
    this.levelBar = querySelector(this, "[data-microphone-level-bar]");
    this.peakHold = querySelector(this, "[data-microphone-peak-hold]");
    this.thresholdLine = querySelector(this, "[data-microphone-threshold-line]");
    this.thresholdLabel = querySelector(this, "[data-microphone-threshold-label]");
    this.hitsList = querySelector(this, "[data-microphone-hits-list]");

    // Create domain instance with injected dependencies
    // MicrophoneControl itself is the delegate - it implements MicrophoneDetectorDelegate
    this.micDetector = new MicrophoneDetector(StorageManager, this);

    // Setup UI event listeners
    this._setupUIEventListeners();

    // Populate device select
    await this._populateDevices();
  }

  onUnmount() {
    if (this.micDetector && this.micDetector.isRunning) {
      this.micDetector.stop();
    }

    this._cleanups.forEach((cleanup) => cleanup());
    this._cleanups = [];
  }

  /**
   * Delegate method: Handle level changes from detector
   * Updates level bar width based on audio level
   * @param {number} level Audio level 0-100
   */
  onLevelChanged(level) {
    this.levelBar.style.width = `${level}%`;
  }

  /**
   * Delegate method: Handle peak changes from detector
   * Updates peak hold indicator position
   * @param {number} peak Peak level 0-100
   */
  onPeakChanged(peak) {
    this.peakHold.style.left = `${peak}%`;
  }

  /**
   * Delegate method: Handle threshold state changes from detector
   * Updates over-threshold visual state
   * @param {boolean} isOver Whether level is over threshold
   */
  onOverThreshold(isOver) {
    this.level.classList.toggle("over-threshold", isOver);
  }

  /**
   * Delegate method: Handle hit detection from detector
   * Adds visual feedback for hit (brief dot in hits list)
   */
  onHit() {
    const hitElement = document.createElement("div");
    hitElement.className = "hit-entry";
    hitElement.setAttribute("aria-label", "Hit detected");
    hitElement.title = "Hit detected";
    this.hitsList.appendChild(hitElement);

    // Keep only last 6 hits visible
    while (this.hitsList.children.length > 6) {
      const firstChild = this.hitsList.firstElementChild;
      if (firstChild) {
        this.hitsList.removeChild(firstChild);
      }
    }

    // Auto-remove after animation
    setTimeout(() => {
      hitElement.remove();
    }, 2400);
  }

  /**
   * Delegate method: Handle threshold changes from detector
   * Updates threshold display values
   * @param {number} threshold Threshold value
   */
  onThresholdChanged(threshold) {
    const percent = (threshold / 128) * 100;
    this.thresholdLine.style.left = `${percent}%`;
    this.thresholdLabel.textContent = `Threshold: ${threshold}`;
  }

  /**
   * Setup UI event listeners for user interactions
   * @private
   */
  _setupUIEventListeners() {
    // Threshold adjustment via pointer
    this._cleanups.push(
      bindEvent(this.level, "pointerdown", (e) => this._onThresholdPointerDown(e)),
      bindEvent(this.level, "pointermove", (e) => this._onThresholdPointerMove(e)),
      bindEvent(window, "pointerup", () => this._onThresholdPointerUp()),
      bindEvent(this.select, "change", () => this._onDeviceSelected())
    );
  }

  /**
   * Populate device select with available microphones
   * @private
   */
  async _populateDevices() {
    const devices = await this.micDetector.getAvailableDevices();
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

    // Pre-select previously selected device or first device
    const selected = this.micDetector.selectedDeviceId;
    this.select.value = selected || devices[0]?.deviceId || "";
  }

  /**
   * Handle device selection change
   * @private
   */
  _onDeviceSelected() {
    const deviceId = this.select.value;
    if (deviceId) {
      this.micDetector.selectDevice(deviceId);
      if (this.micDetector.isRunning) {
        this.micDetector.start();
      }
    }
  }

  /**
   * Handle threshold pointer down
   * @private
   */
  _onThresholdPointerDown(event) {
    this._isAdjustingThreshold = true;
    this._setThresholdFromPointer(event.clientX);
    if (this.level.setPointerCapture) {
      this.level.setPointerCapture(event.pointerId);
    }
  }

  /**
   * Handle threshold pointer move
   * @private
   */
  _onThresholdPointerMove(event) {
    if (!this._isAdjustingThreshold) return;
    this._setThresholdFromPointer(event.clientX);
  }

  /**
   * Handle threshold pointer up
   * @private
   */
  _onThresholdPointerUp() {
    this._isAdjustingThreshold = false;
  }

  /**
   * Calculate and set threshold from pointer position
   * @private
   */
  _setThresholdFromPointer(clientX) {
    const rect = this.level.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const threshold = Math.round(ratio * 128);
    this.micDetector.setThreshold(threshold);
  }

  /**
   * Update microphone status indicator
   * @param {boolean} isConfigured - Whether microphone threshold has been adjusted
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
}

// Register custom element
if (!customElements.get("microphone-control")) {
  customElements.define("microphone-control", MicrophoneControl);
}
