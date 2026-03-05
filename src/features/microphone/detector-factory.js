import ThresholdDetector from "./threshold-detector.js";
import AdaptiveDetector from "./adaptive-detector.js";

/**
 * DetectorFactory — Creates beat detector instances by strategy type.
 *
 * Enables runtime selection of detection algorithm without coupling
 * upstream components (UI, calibration, drill) to specific detectors.
 *
 * Strategy names:
 * - "threshold" → ThresholdDetector (RMS amplitude threshold)
 * - "adaptive" → AdaptiveDetector (Spectral flux onset detection)
 *
 * Selection is persisted and restored on future instantiation.
 */
class DetectorFactory {
  static THRESHOLD = "threshold";
  static ADAPTIVE = "adaptive";

  /**
   * Retrieve the persisted detector type preference.
   * @param {Object} storageManager
   * @returns {string} "threshold" or "adaptive" (defaults to "threshold")
   */
  static getPreferredType(storageManager) {
    return (
      storageManager.get("tempoTrainer.detectorType") ||
      DetectorFactory.THRESHOLD
    );
  }

  /**
   * Save the detector type preference.
   * @param {Object} storageManager
   * @param {string} type "threshold" or "adaptive"
   */
  static setPreferredType(storageManager, type) {
    storageManager.set("tempoTrainer.detectorType", type);
  }

  /**
   * Create a beat detector instance by type.
   * @param {string} type - Detector type ("threshold" or "adaptive")
   * @param {Object} storageManager - Storage instance
   * @param {Object} delegate - Detector delegate for UI callbacks
   * @param {AudioContext|null} audioContext - Audio context (optional)
   * @returns {ThresholdDetector | AdaptiveDetector}
   * @throws {Error} if type is not recognized
   */
  static createDetector(type, storageManager, delegate, audioContext = null) {
    switch (type) {
      case DetectorFactory.THRESHOLD:
        return new ThresholdDetector(storageManager, delegate, audioContext);
      case DetectorFactory.ADAPTIVE:
        return new AdaptiveDetector(storageManager, delegate, audioContext);
      default:
        throw new Error(
          `Unknown detector type: "${type}". Use "threshold" or "adaptive".`,
        );
    }
  }

  /**
   * Create a detector using the persisted preference.
   * @param {Object} storageManager
   * @param {Object} delegate
   * @param {AudioContext|null} audioContext
   * @returns {ThresholdDetector | AdaptiveDetector}
   */
  static createPreferred(storageManager, delegate, audioContext = null) {
    const type = DetectorFactory.getPreferredType(storageManager);
    return DetectorFactory.createDetector(
      type,
      storageManager,
      delegate,
      audioContext,
    );
  }
}

export default DetectorFactory;
