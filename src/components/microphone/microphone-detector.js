/**
 * MicrophoneDetector - Web component for microphone device selection and level display
 * @module microphone-detector
 */

import BaseComponent from "../base/base-component.js";
import {
  querySelector,
  bindEvent,
  dispatchEvent,
  setText,
  toggleClass,
} from "../base/component-utils.js";

/**
 * @typedef {Object} MicrophoneState
 * @property {string|null} [error] Error message if initialization failed
 * @property {boolean} [isConnected] Whether microphone is selected
 * @property {number} [level] Current audio level 0-100
 * @property {number} [peakLevel] Peak level held
 * @property {number} [threshold] Hit detection threshold
 * @property {Array<string>} [recentHits] Recent hit times or labels
 */

/**
 * MicrophoneDetector component - device selection + level visualization.
 * Manages user-facing microphone controls and displays real-time audio level.
 *
 * Events emitted:
 * - 'deviceSelected': {detail: deviceId, label}
 * - 'threshold-changed': {detail: newThreshold}
 *
 * @extends BaseComponent
 */
export default class MicrophoneDetector extends BaseComponent {
  constructor() {
    super();
    /** @type {MicrophoneState} */
    this.state = {
      error: null,
      isConnected: false,
      level: 0,
      peakLevel: 0,
      threshold: 52,
      recentHits: [],
    };

    /** @type {HTMLSelectElement|null} */
    this.selectElement = null;
    /** @type {HTMLDivElement|null} */
    this.levelbarElement = null;
    /** @type {HTMLDivElement|null} */
    this.thresholdLineElement = null;
    /** @type {HTMLDivElement|null} */
    this.hitsListElement = null;
    /** @type {Array<() => void>} */
    this._cleanups = [];
  }

  getTemplateUrl() {
    return "./microphone-detector.html";
  }

  getStyleUrl() {
    return "./microphone.css";
  }

  async onMount() {
    // Query DOM elements
    this.selectElement = /** @type {HTMLSelectElement} */ (
      querySelector(this, ".microphone__select")
    );
    this.levelbarElement = querySelector(this, ".microphone__level-bar");
    this.thresholdLineElement = querySelector(this, ".microphone__threshold-line");
    this.hitsListElement = querySelector(this, ".microphone__hits-list");

    // Bind event listeners
    this._cleanups.push(
      bindEvent(this.selectElement, "change", (e) => this._onSelectChange(e)),
      bindEvent(this.thresholdLineElement, "click", () => this._onThresholdClick())
    );

    // Populate device list
    await this._populateDevices();
  }

  onUnmount() {
    this._cleanups.forEach((cleanup) => cleanup());
    this._cleanups = [];
  }

  /**
   * Update visual level bar based on state.
   * @param {MicrophoneState} oldState Previous state
   * @param {MicrophoneState} newState New state
   */
  onStateChange(oldState, newState) {
    // Skip DOM updates if no DOM elements are available (e.g., during tests)
    if (!this.levelbarElement) {
      return;
    }

    // Update level bar width
    if (newState.level !== oldState.level && this.levelbarElement) {
      this.levelbarElement.style.width = `${newState.level}%`;
    }

    // Update threshold line position
    if (newState.threshold !== oldState.threshold && this.thresholdLineElement) {
      const percent = (newState.threshold / 100) * 100;
      this.thresholdLineElement.style.left = `${percent}%`;
    }

    // Update error display
    if (newState.error !== oldState.error) {
      const errorEl = querySelector(this, ".microphone__error");
      if (newState.error) {
        errorEl.style.display = "block";
        setText(errorEl, `Error: ${newState.error}`);
      } else {
        errorEl.style.display = "none";
      }
    }

    // Update connection status
    if (newState.isConnected !== oldState.isConnected) {
      toggleClass(this, "microphone--connected", newState.isConnected);
    }

    // Update over-threshold styling
    if (newState.level !== oldState.level || newState.threshold !== oldState.threshold) {
      const overThreshold = newState.level > newState.threshold;
      const container = querySelector(this, ".microphone__level");
      toggleClass(container, "microphone__level--over-threshold", overThreshold);
    }
  }

  /**
   * Public API: Set audio level (0-100).
   * Called by audio detector to update visualization in real-time.
   * @param {number} level Audio level 0-100
   */
  setLevel(level) {
    this.setState({ ...this.state, level: Math.min(100, Math.max(0, level)) });
  }

  /**
   * Public API: Set peak level indicator.
   * @param {number} peak Peak level 0-100
   */
  setPeak(peak) {
    this.setState({ ...this.state, peakLevel: Math.min(100, Math.max(0, peak)) });
  }

  /**
   * Public API: Set hit detection threshold.
   * @param {number} threshold Threshold value 0-100
   */
  setThreshold(threshold) {
    this.setState({ ...this.state, threshold });
    dispatchEvent(this, "threshold-changed", { threshold });
  }

  /**
   * Public API: Add recent hit to display list.
   * @param {string} label Hit label (e.g., timestamp or formatted time)
   */
  addHit(label) {
    const hits = [...this.state.recentHits, label];
    // Keep only last 20 hits
    const trimmed = hits.slice(Math.max(0, hits.length - 20));
    this.setState({ ...this.state, recentHits: trimmed });
    this._updateHitsList();
  }

  /**
   * Public API: Clear hit list.
   */
  clearHits() {
    this.setState({ ...this.state, recentHits: [] });
    this._updateHitsList();
  }

  /**
   * Populate microphone device list.
   * @private
   * @returns {Promise<void>}
   */
  async _populateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");

      if (!this.selectElement) return;

      // Clear existing options
      this.selectElement.innerHTML = "";

      if (audioInputs.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No microphone found";
        this.selectElement.appendChild(option);
        this.setState({ ...this.state, error: "No microphone devices available" });
        return;
      }

      // Add devices to select
      audioInputs.forEach((device, index) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `Microphone ${index + 1}`;
        this.selectElement.appendChild(option);
      });

      this.setState({ ...this.state, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setState({
        ...this.state,
        error: `Failed to enumerate devices: ${message}`,
      });
    }
  }

  /**
   * Handle device select change.
   * @private
   * @param {Event} e Change event
   */
  _onSelectChange(e) {
    const deviceId = this.selectElement?.value || "";
    dispatchEvent(this, "device-selected", { deviceId });
    this.setState({ ...this.state, isConnected: !!deviceId });
  }

  /**
   * Handle threshold line click - adjust threshold.
   * @private
   */
  _onThresholdClick() {
    // In a real implementation, you'd calculate mouse position
    // For now, step up/down threshold
    const step = 5;
    const newThreshold = Math.min(100, this.state.threshold + step);
    this.setThreshold(newThreshold);
  }

  /**
   * Update hits list visual display.
   * @private
   */
  _updateHitsList() {
    if (!this.hitsListElement) return;

    this.hitsListElement.innerHTML = "";
    const hits = /** @type {MicrophoneState} */ (this.state).recentHits || [];
    hits.forEach((hit) => {
      const span = document.createElement('span');
      span.className = 'microphone__hit-badge';
      span.textContent = hit;
      if (this.hitsListElement) {
        this.hitsListElement.appendChild(span);
      }
    });
  }
}

// Register custom element
customElements.define("microphone-detector", MicrophoneDetector);
