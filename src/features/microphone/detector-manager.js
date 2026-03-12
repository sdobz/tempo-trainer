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
 * DetectorManager — canonical owner of detector semantics.
 *
 * Owns:
 * - detector creation and hot-swapping
 * - persistent detector params
 * - hit timing stream
 * - stable delegate forwarding for detector visualization
 *
 * Depends on browser audio runtime for shared AudioContext and input/analyser source.
 */
class DetectorManager extends EventTarget {
  /**
   * @param {import('../audio/audio-context-manager.js').default} audioService
   * @param {Object} storageManager
   */
  constructor(audioService, storageManager) {
    super();
    this._audioService = audioService;
    this._storage = storageManager;

    /** @type {ThresholdDetector|AdaptiveDetector|null} */
    this._detector = null;

    /** @type {import("./detector-params.js").DetectorParams} */
    this._params = this._loadParams("default");

    /** @type {number} */
    this._sessionBpm = 120;

    /** @type {Object|null} */
    this._delegate = null;

    /** @type {((hitAudioTime: number) => void)|null} */
    this._onHitTimingCallback = null;

    /** @type {Set<(hitAudioTime: number) => void>} */
    this._hitListeners = new Set();

    this._rebuildDetector();
  }

  /**
   * Set the UI delegate that receives forwarded detector callbacks.
   * @param {Object|null} delegate
   */
  setDelegate(delegate) {
    this._delegate = delegate;
    delegate?.onThresholdChanged?.(this._params.sensitivity);
  }

  /** @returns {boolean} */
  get isRunning() {
    return this._detector?.isRunning ?? false;
  }

  /** @returns {number} */
  get sensitivity() {
    return this._params.sensitivity;
  }

  /**
   * @returns {import('./detector-params.js').DetectorParams}
   */
  getParams() {
    return { ...this._params };
  }

  /**
   * @returns {Promise<boolean>}
   */
  async start() {
    if (!this._detector) return false;
    try {
      const result = await this._detector.start();
      this.dispatchEvent(
        new CustomEvent("changed", {
          detail: { field: "running", value: true },
        }),
      );
      return result;
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent("fault", {
          detail: { code: "detector-start-failed", error },
        }),
      );
      return false;
    }
  }

  stop() {
    this._detector?.stop();
    this.dispatchEvent(
      new CustomEvent("changed", {
        detail: { field: "running", value: false },
      }),
    );
  }

  /**
   * @param {number} value
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

  /**
   * @param {(hitAudioTime: number) => void} callback
   */
  onHit(callback) {
    this._onHitTimingCallback = callback;
    this._detector?.onHit(callback);
  }

  /**
   * @param {(hitAudioTime: number) => void} listener
   * @returns {() => void}
   */
  addHitListener(listener) {
    this._hitListeners.add(listener);
    return () => this._hitListeners.delete(listener);
  }

  /**
   * @param {import('./detector-params.js').DetectorParamsUpdate} paramsOverride
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
    this._delegate?.onThresholdChanged?.(this._params.sensitivity);

    if (wasRunning) {
      void this._detector?.start();
    }
  }

  /** @param {number} level */
  onLevelChanged(level) {
    this._delegate?.onLevelChanged?.(level);
  }

  /** @param {number} peak */
  onPeakChanged(peak) {
    this._delegate?.onPeakChanged?.(peak);
  }

  /** @param {number} pos */
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
        : (this._audioService.getContext()?.currentTime ?? 0);

    this.dispatchEvent(
      new CustomEvent("hit", { detail: { time: resolvedHitTime } }),
    );

    this._hitListeners.forEach((listener) => {
      try {
        listener(resolvedHitTime);
      } catch {
        // ignore listener errors
      }
    });
  }

  /** @private */
  _rebuildDetector() {
    const params = this._params;
    const delegate = this._buildDetectorDelegate();

    switch (params.type) {
      case DETECTOR_TYPES.THRESHOLD:
        this._detector = new ThresholdDetector(
          this._audioService,
          params,
          delegate,
        );
        break;
      case DETECTOR_TYPES.ADAPTIVE:
        this._detector = new AdaptiveDetector(
          this._audioService,
          { ...params, bpm: this._sessionBpm },
          delegate,
        );
        break;
      default:
        this._detector = new ThresholdDetector(
          this._audioService,
          params,
          delegate,
        );
    }

    if (this._onHitTimingCallback) {
      this._detector.onHit(this._onHitTimingCallback);
    }
  }

  /** @private */
  _buildDetectorDelegate() {
    return {
      onLevelChanged: (value) => this.onLevelChanged(value),
      onPeakChanged: (value) => this.onPeakChanged(value),
      onThresholdChanged: (value) => this.onThresholdChanged(value),
      onHit: (hitAudioTime) => this.onHitFromDetector(hitAudioTime),
    };
  }

  /**
   * @param {string} id
   * @returns {import('./detector-params.js').DetectorParams}
   * @private
   */
  _loadParams(id) {
    const raw = this._storage.get(`tempoTrainer.detectorParams.${id}`);
    if (raw) {
      const parsed = deserializeParams(raw);
      if (parsed && parsed.type) return normalizeDetectorParams(parsed, id);
    }

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
   * @param {import('./detector-params.js').DetectorParams} params
   * @private
   */
  _saveParams(params) {
    this._storage.set(
      `tempoTrainer.detectorParams.${params.id}`,
      serializeParams(params),
    );
  }
}

export default DetectorManager;
