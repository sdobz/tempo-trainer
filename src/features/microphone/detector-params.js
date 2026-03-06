/**
 * DetectorParams — Serializable configuration for beat detectors.
 *
 * A plain-data object that fully describes a detector's identity and tuning.
 * Can be persisted to JSON and hydrated at runtime alongside injected services
 * (AudioInputSource, delegate). Designed to support future named per-instrument
 * configurations: e.g. { id: "snare", type: "adaptive", sensitivity: 0.7 }.
 *
 * @typedef {Object} DetectorParams
 * @property {string}  id          - Logical name, e.g. "default", "snare", "kick"
 * @property {string}  type        - "threshold" | "adaptive"
 * @property {number}  sensitivity - 0.0–1.0; higher = triggers more easily
 *
 * Optional algorithm hints (detectors supply internal defaults when absent):
 * @property {number} [historyWindowSize] - Adaptive: rolling window (default 60)
 * @property {number} [entropyThreshold]  - Adaptive: max entropy to accept (default 0.65)
 * @property {number} [bpm]               - Adaptive: BPM for refractory scaling (default 120)
 */

export const DETECTOR_TYPES = Object.freeze({
  THRESHOLD: "threshold",
  ADAPTIVE: "adaptive",
});

/**
 * Default params for the threshold detector.
 * sensitivity = 1 - (52 / 128) ≈ 0.594  (preserves the original default threshold of 52)
 */
export const DEFAULT_THRESHOLD_PARAMS = Object.freeze(
  /** @type {DetectorParams} */ ({
    id: "default",
    type: DETECTOR_TYPES.THRESHOLD,
    sensitivity: 0.594,
  }),
);

/**
 * Default params for the adaptive (spectral flux) detector.
 * sensitivity = 0.5 maps to thresholdCoefficient = 2.5 (see AdaptiveDetector).
 */
export const DEFAULT_ADAPTIVE_PARAMS = Object.freeze(
  /** @type {DetectorParams} */ ({
    id: "default",
    type: DETECTOR_TYPES.ADAPTIVE,
    sensitivity: 0.5,
    historyWindowSize: 60,
    entropyThreshold: 0.65,
    bpm: 120,
  }),
);

/**
 * Serialize DetectorParams to a JSON string for storage.
 * @param {DetectorParams} params
 * @returns {string}
 */
export function serializeParams(params) {
  return JSON.stringify(params);
}

/**
 * Deserialize a DetectorParams JSON string.
 * Returns null if the string is malformed.
 * @param {string} str
 * @returns {DetectorParams|null}
 */
export function deserializeParams(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
