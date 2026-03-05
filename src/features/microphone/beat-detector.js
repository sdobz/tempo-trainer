/**
 * Delegate interface for UI updates from beat detectors.
 * All beat detection strategies must emit these callbacks.
 *
 * @typedef {Object} BeatDetectorDelegate
 * @property {(level: number) => void} [onLevelChanged] - Current audio level (0-100 scale)
 * @property {(peak: number) => void} [onPeakChanged] - Peak hold indicator (0-100 scale)
 * @property {() => void} [onHit] - Beat/hit detected, visual feedback
 */

/**
 * BeatDetector contract — all hit/beat detection strategies must implement:
 *
 * @typedef {Object} BeatDetector
 * @property {(callback: (hitAudioTime: number) => void) => void} onHit - Register hit callback
 * @property {() => Promise<boolean>} start - Start detection (request microphone, begin analysis)
 * @property {() => void} stop - Stop detection (release microphone, stop analysis)
 * @property {boolean} isRunning - Read-only: whether detector is currently running
 *
 * Detectors do not manage device selection; the UI instantiates with a device ID
 * and re-instantiates when the device changes.
 */

export const BeatDetectorContract = {
  onHit: "function",
  start: "function",
  stop: "function",
  isRunning: "boolean",
};

