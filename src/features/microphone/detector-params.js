/**
 * DetectorParams — Serializable configuration for beat detectors.
 *
 * A plain-data object that fully describes a detector's identity and tuning.
 * Can be persisted to JSON and hydrated at runtime alongside injected services
 * (AudioInputSource, delegate). Designed to support future named per-instrument
 * configurations: e.g. { id: "snare", type: "adaptive", sensitivity: 0.7 }.
 *
 * @typedef {Object} ThresholdDetectorParams
 * @property {string} id - Logical name, e.g. "default", "snare", "kick"
 * @property {typeof DETECTOR_TYPES.THRESHOLD} type
 * @property {number} sensitivity - 0.0–1.0; higher = triggers more easily
 *
 * @typedef {Object} AdaptiveDetectorParams
 * @property {string} id - Logical name, e.g. "default", "snare", "kick"
 * @property {typeof DETECTOR_TYPES.ADAPTIVE} type
 * @property {number} sensitivity - 0.0–1.0; higher = triggers more easily
 * @property {number} historyWindowSize
 * @property {number} entropyThreshold
 * @property {number} bpm
 *
 * @typedef {ThresholdDetectorParams | AdaptiveDetectorParams} DetectorParams
 *
 * @typedef {Object} DetectorParamsUpdate
 * @property {string=} id
 * @property {typeof DETECTOR_TYPES.THRESHOLD | typeof DETECTOR_TYPES.ADAPTIVE=} type
 * @property {number=} sensitivity
 * @property {number=} historyWindowSize
 * @property {number=} entropyThreshold
 * @property {number=} bpm
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
  /** @type {AdaptiveDetectorParams} */ ({
    id: "default",
    type: DETECTOR_TYPES.ADAPTIVE,
    sensitivity: 0.2,
    historyWindowSize: 120,
    entropyThreshold: 0.992,
    bpm: 120,
  }),
);

/**
 * Normalize unknown persisted/override params into a fully-typed DetectorParams union.
 * @param {unknown} raw
 * @param {string} [fallbackId="default"]
 * @returns {DetectorParams}
 */
export function normalizeDetectorParams(raw, fallbackId = "default") {
  const source =
    raw && typeof raw === "object"
      ? /** @type {Record<string, unknown>} */ (raw)
      : {};

  const type =
    source.type === DETECTOR_TYPES.ADAPTIVE
      ? DETECTOR_TYPES.ADAPTIVE
      : source.type === DETECTOR_TYPES.THRESHOLD
        ? DETECTOR_TYPES.THRESHOLD
        : DETECTOR_TYPES.THRESHOLD;

  const id =
    typeof source.id === "string" && source.id.length > 0
      ? source.id
      : fallbackId;
  const sensitivity = clampNumber(source.sensitivity, 0, 1, 0.594);

  if (type === DETECTOR_TYPES.ADAPTIVE) {
    return {
      ...DEFAULT_ADAPTIVE_PARAMS,
      id,
      type,
      sensitivity,
      historyWindowSize: clampInt(
        source.historyWindowSize,
        8,
        512,
        DEFAULT_ADAPTIVE_PARAMS.historyWindowSize,
      ),
      entropyThreshold: clampNumber(
        source.entropyThreshold,
        0,
        1,
        DEFAULT_ADAPTIVE_PARAMS.entropyThreshold,
      ),
      bpm: clampInt(source.bpm, 40, 240, DEFAULT_ADAPTIVE_PARAMS.bpm),
    };
  }

  return {
    ...DEFAULT_THRESHOLD_PARAMS,
    id,
    type: DETECTOR_TYPES.THRESHOLD,
    sensitivity,
  };
}

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
    return normalizeDetectorParams(JSON.parse(str));
  } catch {
    return null;
  }
}

function clampNumber(value, min, max, fallback) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function clampInt(value, min, max, fallback) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  const intVal = Math.round(value);
  return Math.max(min, Math.min(max, intVal));
}
