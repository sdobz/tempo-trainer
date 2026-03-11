import AudioInputSource from "./audio-input-source.js";
import ThresholdDetector from "./threshold-detector.js";
import AdaptiveDetector from "./adaptive-detector.js";
import {
  DETECTOR_TYPES,
  DEFAULT_THRESHOLD_PARAMS,
  DEFAULT_ADAPTIVE_PARAMS,
  serializeParams,
  deserializeParams,
  normalizeDetectorParams,
} from "./detector-params.js";
import { createContext } from "../component/context.js";

/**
 * Context token.  Provided at document root by main composition root;
 * consumed by microphone-control and onboarding-pane.
 * @type {import('../component/context.js').Context<DetectorManager|null>}
 */
export const DetectorManagerContext = createContext("detector-manager", null);

/**
 * DetectorManager — Owns the full lifetime of beat detection.
 *
 * Centralizes everything that was previously scattered across MicrophoneControl,
 * OnboardingPane, and app orchestration:
 *   - Audio hardware (AudioInputSource)
 *   - Detector creation and hot-swapping
 *   - Persistent DetectorParams serialization
 *   - onHit timing callback (always re-wired across detector switches)
 *   - Stable delegate forwarding (UI never holds a direct detector reference)
 *
 * main.js composition creates one instance before component context consumers mount.
 *
 * AudioContext is injected lazily (browser requires user gesture):
 *   detectorManager.audioContext = audioContextService.getContext();
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
class DetectorManager extends EventTarget {
  /**
   * @param {Object} storageManager — StorageManager instance for params persistence
   */
  constructor(storageManager) {
    super();
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

    /** @type {Set<(hitAudioTime: number) => void>} */
    this._hitListeners = new Set();
  }

  // ---------------------------------------------------------------------------
  // Public API — AudioContext lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Setter for AudioContext injection from the shared audio context service.
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
   * Toggle detector start/stop.
   * [Phase 0] Returns Promise<boolean> indicating success.
   * @returns {Promise<boolean>}
   */
  async start() {
    if (!this._detector) return false;
    try {
      const result = await this._detector.start();
      // [Phase 0 event] Emit state change when detector starts.
      this.dispatchEvent(
        new CustomEvent("changed", {
          detail: { field: "running", value: true },
        }),
      );
      return result;
    } catch (error) {
      // [Phase 0 event] Emit fault for async failures in detector startup.
      this.dispatchEvent(
        new CustomEvent("fault", {
          detail: { code: "detector-start-failed", error },
        }),
      );
      return false;
    }
  }

  /**
   * Stop detection and release the microphone stream.
   */
  stop() {
    this._detector?.stop();
    // [Phase 0 event] Emit state change when detector stops.
    this.dispatchEvent(
      new CustomEvent("changed", {
        detail: { field: "running", value: false },
      }),
    );
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
    this.dispatchEvent(
      new CustomEvent("changed", {
        detail: { field: "sensitivity", value: clamped },
      }),
    );
  }

  /**
   * Update session BPM for adaptive refractory scaling.
   * [Phase 2] This value is driven by TimelineService and treated as runtime truth.
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

  /**
   * Subscribe to detector hit events without replacing the primary timing callback.
   * @param {(hitAudioTime: number) => void} listener
   * @returns {() => void}
   */
  addHitListener(listener) {
    this._hitListeners.add(listener);
    return () => this._hitListeners.delete(listener);
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
   * @param {import("./detector-params.js").DetectorParamsUpdate} paramsOverride
   */
  setActiveDetector(paramsOverride) {
    const wasRunning = this.isRunning;
    this.stop();

    const switchingTo =
      paramsOverride.type === DETECTOR_TYPES.ADAPTIVE
        ? DETECTOR_TYPES.ADAPTIVE
        : paramsOverride.type === DETECTOR_TYPES.THRESHOLD
          ? DETECTOR_TYPES.THRESHOLD
          : this._params.type;

    const seeded =
      switchingTo === DETECTOR_TYPES.ADAPTIVE
        ? {
            ...DEFAULT_ADAPTIVE_PARAMS,
            id: this._params.id,
            sensitivity: this._params.sensitivity,
          }
        : {
            ...DEFAULT_THRESHOLD_PARAMS,
            id: this._params.id,
            sensitivity: this._params.sensitivity,
          };

    const rawNext = { ...seeded, ...this._params, ...paramsOverride };
    this._params = normalizeDetectorParams(rawNext, this._params.id);

    if (this._params.type === DETECTOR_TYPES.ADAPTIVE) {
      this._params = { ...this._params, bpm: this._sessionBpm };
    }

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

  /**
   * @param {number=} hitAudioTime
   */
  onHitFromDetector(hitAudioTime) {
    this._delegate?.onHit?.();

    const resolvedHitTime =
      typeof hitAudioTime === "number"
        ? hitAudioTime
        : (this._audioContext?.currentTime ?? 0);

    // [Phase 0 event] Emit hit stream event for scoring and timing.
    this.dispatchEvent(
      new CustomEvent("hit", { detail: { time: resolvedHitTime } }),
    );

    this._hitListeners.forEach((listener) => {
      try {
        listener(resolvedHitTime);
      } catch {
        // Ignore listener errors to avoid disrupting detection loop
      }
    });
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
      onHit: (hitAudioTime) => this.onHitFromDetector(hitAudioTime),
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
      if (parsed && parsed.type) return normalizeDetectorParams(parsed, id);
    }

    // Migration: read legacy separate keys if present
    const legacyType = this._storage.get("tempoTrainer.detectorType");
    if (legacyType === DETECTOR_TYPES.ADAPTIVE) {
      return normalizeDetectorParams({ ...DEFAULT_ADAPTIVE_PARAMS, id }, id);
    }

    const legacyThreshold = this._storage.getInt(
      "tempoTrainer.hitThreshold",
      -1,
    );
    if (legacyThreshold >= 0) {
      const sensitivity = 1 - legacyThreshold / 128;
      return normalizeDetectorParams(
        { ...DEFAULT_THRESHOLD_PARAMS, id, sensitivity },
        id,
      );
    }

    return normalizeDetectorParams({ ...DEFAULT_THRESHOLD_PARAMS, id }, id);
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
