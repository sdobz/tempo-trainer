import AudioInputSource from "./audio-input-source.js";
import ThresholdDetector from "./threshold-detector.js";
import AdaptiveDetector from "./adaptive-detector.js";
import {
  DETECTOR_TYPES,
  DEFAULT_THRESHOLD_PARAMS,
  DEFAULT_ADAPTIVE_PARAMS,
  serializeParams,
  deserializeParams,
} from "./detector-params.js";
import { createContext } from "../base/context.js";

/**
 * Context token.  Provided at document root by script.js;
 * consumed by microphone-control and onboarding-pane.
 * @type {import('../base/context.js').Context<DetectorManager|null>}
 */
export const DetectorManagerContext = createContext("detector-manager", null);

/**
 * DetectorManager — Owns the full lifetime of beat detection.
 *
 * Centralizes everything that was previously scattered across MicrophoneControl,
 * OnboardingPane, and script.js:
 *   - Audio hardware (AudioInputSource)
 *   - Detector creation and hot-swapping
 *   - Persistent DetectorParams serialization
 *   - onHit timing callback (always re-wired across detector switches)
 *   - Stable delegate forwarding (UI never holds a direct detector reference)
 *
 * script.js registers one instance in Services before component init:
 *   Services.register("detectorManager", new DetectorManager(StorageManager));
 *
 * AudioContext is injected lazily (browser requires user gesture):
 *   audioContextManager.setContextForComponents(metronome, detectorManager, calibration);
 *
 * Named detector configs (for future multi-instrument support):
 *   manager.setActiveDetector({ id: "snare", type: "adaptive", sensitivity: 0.7 });
 *   manager.setActiveDetector({ id: "kick",  type: "threshold", sensitivity: 0.3 });
 *
 * Detector delegate interface (all values normalized 0–1):
 *   onLevelChanged(level)       — current signal level
 *   onPeakChanged(peak)         — peak-hold indicator
 *   onThresholdChanged(pos)     — threshold/sensitivity line position
 *   onHit()                     — visual hit feedback
 *   onDevicesChanged(devs, id)  — device list updated (from AudioInputSource)
 */
class DetectorManager {
  /**
   * @param {Object} storageManager — StorageManager instance for params persistence
   */
  constructor(storageManager) {
    this._storage = storageManager;

    /** @type {AudioContext|null} Injected after first user gesture */
    this._audioContext = null;

    /** @type {AudioInputSource|null} Created when AudioContext becomes available */
    this._audioInput = null;

    /** @type {ThresholdDetector|AdaptiveDetector|null} */
    this._detector = null;

    /** @type {import("./detector-params.js").DetectorParams} */
    this._params = this._loadParams("default");

    /** @type {number} Session-scoped BPM source of truth for adaptive refractory */
    this._sessionBpm = 120;

    /**
     * UI delegate — receives forwarded callbacks.
     * Set by MicrophoneControl via setDelegate().
     * @type {Object|null}
     */
    this._delegate = null;

    /** @type {((hitAudioTime: number) => void)|null} */
    this._onHitTimingCallback = null;
  }

  // ---------------------------------------------------------------------------
  // Public API — AudioContext lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Setter for AudioContext injection (matches AudioContextManager.setContextForComponents).
   * Creates the AudioInputSource and initial detector on first injection.
   * @param {AudioContext} ctx
   */
  set audioContext(ctx) {
    this._audioContext = ctx;
    if (!this._audioInput) {
      this._audioInput = new AudioInputSource(ctx);
      this._audioInput.loadDevice(this._storage);
      this._audioInput.delegate = this;
      this._rebuildDetector();
    } else {
      this._audioInput.audioContext = ctx;
    }
  }

  /** @returns {AudioContext|null} */
  get audioContext() {
    return this._audioContext;
  }

  // ---------------------------------------------------------------------------
  // Public API — Delegate
  // ---------------------------------------------------------------------------

  /**
   * Set the UI delegate that receives forwarded detector callbacks.
   * Called by MicrophoneControl on mount.
   * @param {Object} delegate
   */
  setDelegate(delegate) {
    this._delegate = delegate;
    // Immediately push current sensitivity so the UI initializes correctly
    delegate?.onThresholdChanged?.(this._params.sensitivity);
  }

  // ---------------------------------------------------------------------------
  // Public API — Detection control
  // ---------------------------------------------------------------------------

  /** @returns {boolean} */
  get isRunning() {
    return this._detector?.isRunning ?? false;
  }

  /**
   * Start detection. Creates AudioInputSource/detector if AudioContext is ready.
   * @returns {Promise<boolean>}
   */
  async start() {
    if (!this._detector) return false;
    return this._detector.start();
  }

  /**
   * Stop detection and release the microphone stream.
   */
  stop() {
    this._detector?.stop();
  }

  // ---------------------------------------------------------------------------
  // Public API — Sensitivity
  // ---------------------------------------------------------------------------

  /** @returns {number} Current sensitivity (0–1) */
  get sensitivity() {
    return this._params.sensitivity;
  }

  /**
   * Update sensitivity on the active detector and persist it.
   * @param {number} value 0–1
   */
  setSensitivity(value) {
    const clamped = Math.max(0, Math.min(1, value));
    this._params = { ...this._params, sensitivity: clamped };
    this._saveParams(this._params);
    this._detector?.setSensitivity?.(clamped);
  }

  /**
   * Update session BPM for adaptive refractory scaling.
   * This value is driven by SessionState and treated as runtime truth.
   * @param {number} bpm
   */
  setSessionBpm(bpm) {
    const clamped = Math.max(40, Math.min(240, bpm));
    this._sessionBpm = clamped;

    if (this._params.type === DETECTOR_TYPES.ADAPTIVE) {
      this._params = { ...this._params, bpm: clamped };
      this._saveParams(this._params);
    }

    this._detector?.setBpm?.(clamped);
  }

  // ---------------------------------------------------------------------------
  // Public API — Hit timing callback
  // ---------------------------------------------------------------------------

  /**
   * Register a timing callback for drill scoring.
   * Re-wired automatically on every setActiveDetector() call.
   * @param {(hitAudioTime: number) => void} callback
   */
  onHit(callback) {
    this._onHitTimingCallback = callback;
    this._detector?.onHit(callback);
  }

  // ---------------------------------------------------------------------------
  // Public API — Device management
  // ---------------------------------------------------------------------------

  /**
   * Enumerate available audio input devices.
   * @returns {Promise<Array<{deviceId: string, label: string}>>}
   */
  async getAvailableDevices() {
    return this._audioInput?.getAvailableDevices() ?? [];
  }

  /**
   * Select a microphone by device ID. Persists the choice.
   * Restarts detection if currently running so the new device takes effect.
   * @param {string} deviceId
   */
  selectDevice(deviceId) {
    if (!this._audioInput) return;
    this._audioInput.saveDevice(this._storage, deviceId);
    if (this.isRunning) {
      this._detector.start(); // restart with new device
    }
  }

  // ---------------------------------------------------------------------------
  // Public API — Detector switching
  // ---------------------------------------------------------------------------

  /**
   * Return a copy of the current DetectorParams.
   * @returns {import("./detector-params.js").DetectorParams}
   */
  getParams() {
    return { ...this._params };
  }

  /**
   * Switch to a new detector configuration.
   *
   * Stops the current detector, creates a new one from params, re-wires the
   * onHit timing callback, and starts the new detector if the previous one
   * was running.
   *
   * @param {Partial<import("./detector-params.js").DetectorParams>} paramsOverride
   */
  setActiveDetector(paramsOverride) {
    const wasRunning = this.isRunning;
    this.stop();

    const nextParams = { ...this._params, ...paramsOverride };
    if (nextParams.type === DETECTOR_TYPES.ADAPTIVE) {
      nextParams.bpm = this._sessionBpm;
    }

    this._params = nextParams;
    this._saveParams(this._params);
    this._rebuildDetector();

    // Push new sensitivity to UI
    this._delegate?.onThresholdChanged?.(this._params.sensitivity);

    if (wasRunning) {
      this._detector.start();
    }
  }

  // ---------------------------------------------------------------------------
  // Delegate forwarding (detector → manager → UI delegate)
  // ---------------------------------------------------------------------------

  /** @param {number} level 0–1 */
  onLevelChanged(level) {
    this._delegate?.onLevelChanged?.(level);
  }

  /** @param {number} peak 0–1 */
  onPeakChanged(peak) {
    this._delegate?.onPeakChanged?.(peak);
  }

  /** @param {number} pos 0–1 */
  onThresholdChanged(pos) {
    this._delegate?.onThresholdChanged?.(pos);
  }

  onHitFromDetector() {
    this._delegate?.onHit?.();
  }

  /**
   * @param {Array<{deviceId: string, label: string}>} devices
   * @param {string} selectedId
   */
  onDevicesChanged(devices, selectedId) {
    this._delegate?.onDevicesChanged?.(devices, selectedId);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Reconstruct the detector instance from current params.
   * Called after AudioContext injection and after setActiveDetector().
   * @private
   */
  _rebuildDetector() {
    if (!this._audioInput) return;

    const params = this._params;
    const delegate = this._buildDetectorDelegate();

    switch (params.type) {
      case DETECTOR_TYPES.THRESHOLD:
        this._detector = new ThresholdDetector(
          this._audioInput,
          params,
          delegate,
        );
        break;
      case DETECTOR_TYPES.ADAPTIVE:
        this._detector = new AdaptiveDetector(
          this._audioInput,
          { ...params, bpm: this._sessionBpm },
          delegate,
        );
        break;
      default:
        this._detector = new ThresholdDetector(
          this._audioInput,
          params,
          delegate,
        );
    }

    // Re-wire timing callback if one was registered
    if (this._onHitTimingCallback) {
      this._detector.onHit(this._onHitTimingCallback);
    }
  }

  /**
   * Build an inline delegate object that forwards to this manager's methods.
   * Using an inline object keeps the detector unaware of DetectorManager.
   * @private
   * @returns {Object}
   */
  _buildDetectorDelegate() {
    return {
      onLevelChanged: (v) => this.onLevelChanged(v),
      onPeakChanged: (v) => this.onPeakChanged(v),
      onThresholdChanged: (v) => this.onThresholdChanged(v),
      onHit: () => this.onHitFromDetector(),
    };
  }

  /**
   * Load DetectorParams from storage. Falls back to type-appropriate defaults.
   * @private
   * @param {string} id
   * @returns {import("./detector-params.js").DetectorParams}
   */
  _loadParams(id) {
    const raw = this._storage.get(`tempoTrainer.detectorParams.${id}`);
    if (raw) {
      const parsed = deserializeParams(raw);
      if (parsed && parsed.type) return parsed;
    }

    // Migration: read legacy separate keys if present
    const legacyType = this._storage.get("tempoTrainer.detectorType");
    if (legacyType === DETECTOR_TYPES.ADAPTIVE) {
      return { ...DEFAULT_ADAPTIVE_PARAMS, id };
    }

    const legacyThreshold = this._storage.getInt(
      "tempoTrainer.hitThreshold",
      -1,
    );
    if (legacyThreshold >= 0) {
      const sensitivity = 1 - legacyThreshold / 128;
      return { ...DEFAULT_THRESHOLD_PARAMS, id, sensitivity };
    }

    return { ...DEFAULT_THRESHOLD_PARAMS, id };
  }

  /**
   * Persist current DetectorParams to storage.
   * @private
   * @param {import("./detector-params.js").DetectorParams} params
   */
  _saveParams(params) {
    this._storage.set(
      `tempoTrainer.detectorParams.${params.id}`,
      serializeParams(params),
    );
  }
}

export default DetectorManager;
