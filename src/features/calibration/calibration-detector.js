/**
 * Delegate interface for UI updates from CalibrationDetector.
 * @typedef {Object} CalibrationDetectorDelegate
 * @property {(message: string) => void} [onStatusChanged] - Status message changed
 * @property {(offsetMs: number) => void} [onOffsetChanged] - Offset value changed
 * @property {(started: boolean) => void} [onCalibrationStateChanged] - Calibration started/stopped
 */

/**
 * CalibrationDetector - Pure domain logic for automatic latency calibration.
 * Detects audio latency by measuring the offset between expected and actual hit times.
 * Does not interact with DOM. Uses delegate pattern for behavioral updates.
 * @typedef {{ time: number, matched: boolean }} ExpectedBeat
 */
class CalibrationDetector {
  /**
   * @param {Object} storageManager - Storage instance for persisting settings
   * @param {CalibrationDetectorDelegate} delegate - Delegate for behavioral updates
   * @param {AudioContext|null} [audioContext] - Optional audio context
   */
  constructor(storageManager, delegate, audioContext = null) {
    this.storageManager = storageManager;
    this.delegate = delegate;
    this.audioContext = audioContext;

    // Configuration
    this.lookahead = 25.0; // ms
    this.scheduleAheadTime = 0.1; // seconds
    this.minHits = 10;
    this.windowSize = 12;
    this.requiredStableWindows = 4;
    this.minHitsRelaxed = 18;
    this.confidenceTarget = 100;
    this.confidenceRelaxedTarget = 65;
    this.maxDurationMs = 120000;
    this.earlyWindowMs = 180;
    this.lateWindowMs = 420;
    this.madThresholdMs = 26;
    this.driftThresholdMs = 10;
    this.madRelaxedThresholdMs = 36;
    this.driftRelaxedThresholdMs = 18;
    this.storageKey = "tempoTrainer.calibrationOffsetMs";
    this.legacyStorageKeys = [
      "tempoTrainer.calibrationOffset",
      "tempoTrainer.offsetMs",
    ];

    // State
    this.isCalibrating = false;
    this.schedulerIntervalID = null;
    this.nextNoteTime = 0;
    this.beatInMeasure = 0;
    /** @type {ExpectedBeat[]} */
    this.expectedBeats = [];
    /** @type {number[]} */
    this.offsetsMs = [];
    this.goodHits = 0;
    this.stableWindows = 0;
    this.confidence = 0;
    this.startedAt = 0;
    this.offsetMs = 0;
    this.hasSavedCalibration = false;
    this.beatsPerMeasure = 4;
    this.beatDuration = 0.5;

    // Callbacks
    this.onStopCallback = null;

    this._loadSettings();
  }

  /**
   * Set callback fired when calibration stops
   * @param {Function} callback - Called with no arguments
   */
  onStop(callback) {
    this.onStopCallback = callback;
  }

  /**
   * Set beats per measure for click pattern
   * @param {number} beatsPerMeasure - Number of beats per measure
   */
  setBeatsPerMeasure(beatsPerMeasure) {
    this.beatsPerMeasure = beatsPerMeasure;
  }

  /**
   * Set beat duration in seconds
   * @param {number} beatDuration - Duration of one beat
   */
  setBeatDuration(beatDuration) {
    this.beatDuration = beatDuration;
  }

  _loadSettings() {
    const rawPrimary = this.storageManager.get(this.storageKey, null);
    let rawValue = rawPrimary;
    let loadedFromLegacyKey = null;

    if (rawValue === null) {
      for (const key of this.legacyStorageKeys) {
        const candidate = this.storageManager.get(key, null);
        if (candidate !== null) {
          rawValue = candidate;
          loadedFromLegacyKey = key;
          break;
        }
      }
    }

    if (rawValue !== null) {
      const parsed = parseFloat(rawValue);
      if (!Number.isNaN(parsed)) {
        this.offsetMs = parsed;
        this.hasSavedCalibration = true;

        if (loadedFromLegacyKey) {
          this.storageManager.set(this.storageKey, this.offsetMs);
        }
        return;
      }
    }

    this.offsetMs = 0;
    this.hasSavedCalibration = false;
  }

  /**
   * Toggle calibration on/off
   */
  toggle() {
    if (this.isCalibrating) {
      this.stop("Calibration stopped by user.");
    } else {
      this.start();
    }
  }

  /**
   * Start calibration process
   * @returns {Promise<boolean>} True if started successfully
   */
  async start() {
    try {
      if (!this.audioContext) {
        if (this.delegate?.onStatusChanged) {
          this.delegate.onStatusChanged(
            "Calibration failed to start: audio context not available. Try starting a drill first.",
          );
        }
        return false;
      }

      await this.audioContext.resume();

      this.isCalibrating = true;
      this.goodHits = 0;
      this.stableWindows = 0;
      this.confidence = 0;
      this.offsetsMs = [];
      this.expectedBeats = [];
      this.beatInMeasure = 0;
      this.nextNoteTime = this.audioContext.currentTime + 0.1;
      this.startedAt = Date.now();

      if (this.delegate?.onCalibrationStateChanged) {
        this.delegate.onCalibrationStateChanged(true);
      }

      if (this.delegate?.onStatusChanged) {
        this.delegate.onStatusChanged(
          "Calibration running: play along with clicks. Needs ≥10 hits, then confidence builds until stable.",
        );
      }

      this.schedulerIntervalID = setInterval(
        () => this._scheduler(),
        this.lookahead,
      );

      return true;
    } catch {
      if (this.delegate?.onStatusChanged) {
        this.delegate.onStatusChanged(
          "Calibration failed to start: microphone or audio unavailable.",
        );
      }
      return false;
    }
  }

  /**
   * Stop calibration
   * @param {string} message - Status message to display
   */
  stop(message) {
    if (this.schedulerIntervalID) {
      clearInterval(this.schedulerIntervalID);
      this.schedulerIntervalID = null;
    }

    this.isCalibrating = false;

    if (this.delegate?.onCalibrationStateChanged) {
      this.delegate.onCalibrationStateChanged(false);
    }

    if (this.delegate?.onStatusChanged) {
      this.delegate.onStatusChanged(message);
    }

    if (this.delegate?.onOffsetChanged) {
      this.delegate.onOffsetChanged(this.offsetMs);
    }

    if (this.onStopCallback) {
      this.onStopCallback();
    }
  }

  /**
   * Register a drum hit during calibration
   * @param {number} hitAudioTime - Audio context time of the hit
   */
  registerHit(hitAudioTime) {
    if (!this.isCalibrating) return;

    let bestIndex = -1;
    let bestDistanceMs = Number.POSITIVE_INFINITY;
    let bestOffsetMs = 0;

    this.expectedBeats.forEach((entry, index) => {
      if (entry.matched) return;
      const offsetMs = (hitAudioTime - entry.time) * 1000;
      if (offsetMs < -this.earlyWindowMs || offsetMs > this.lateWindowMs) {
        return;
      }

      const distanceMs = Math.abs(offsetMs);
      if (distanceMs < bestDistanceMs) {
        bestDistanceMs = distanceMs;
        bestIndex = index;
        bestOffsetMs = offsetMs;
      }
    });

    if (bestIndex === -1) {
      return;
    }

    this.expectedBeats[bestIndex].matched = true;
    this.offsetsMs.push(bestOffsetMs);
    this.goodHits++;
    this._maybeFinish();
  }

  /**
   * Get the current calibrated offset in milliseconds
   * @returns {number} Offset in milliseconds
   */
  getOffsetMs() {
    return this.offsetMs;
  }

  /**
   * Whether calibration data exists in storage (offset may legitimately be 0 ms).
   * @returns {boolean}
   */
  hasCalibrationData() {
    return this.hasSavedCalibration;
  }

  /**
   * Get calibrated beat position accounting for latency
   * @param {number} audioTime - Current audio context time
   * @param {number} runStartAudioTime - Audio time when run started
   * @param {number} beatDuration - Duration of one beat in seconds
   * @returns {number} Calibrated beat position
   */
  getCalibratedBeatPosition(audioTime, runStartAudioTime, beatDuration) {
    const rawBeatPosition = (audioTime - runStartAudioTime) / beatDuration;
    const offsetBeats = this.offsetMs / (beatDuration * 1000);
    return Math.max(0, rawBeatPosition - offsetBeats);
  }

  _scheduler() {
    while (
      this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime
    ) {
      this._scheduleClick(this.nextNoteTime);
      this.nextNoteTime += this.beatDuration;
    }

    const staleBefore = this.audioContext.currentTime - 1.5;
    this.expectedBeats = this.expectedBeats.filter(
      (entry) => entry.time >= staleBefore || !entry.matched,
    );

    if (Date.now() - this.startedAt > this.maxDurationMs) {
      this.stop(
        this.goodHits >= this.minHits
          ? "Calibration ended on time limit with best estimate."
          : "Calibration timed out before enough consistent hits.",
      );
    }
  }

  /**
   * @param {number} time - AudioContext currentTime
   */
  _scheduleClick(time) {
    const isDownbeat = this.beatInMeasure === 0;
    const freq = isDownbeat ? 880.0 : 440.0;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.00001, time + 0.05);
    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.start(time);
    osc.stop(time + 0.05);

    this.expectedBeats.push({ time, matched: false });
    this.beatInMeasure = (this.beatInMeasure + 1) % this.beatsPerMeasure;
  }

  _maybeFinish() {
    let message = "";

    if (this.goodHits < this.minHits) {
      message =
        `Calibration: hits ${this.goodHits}/${this.minHits} | learning timing pattern...`;
      if (this.delegate?.onStatusChanged) {
        this.delegate.onStatusChanged(message);
      }
      return;
    }

    const recentOffsets = this.offsetsMs.slice(-this.windowSize);
    if (recentOffsets.length < 8) {
      return;
    }

    const recentMedian = this._median(recentOffsets);
    const recentMad = this._computeMad(recentOffsets, recentMedian);
    const previousOffsets = this.offsetsMs.slice(
      -this.windowSize * 2,
      -this.windowSize,
    );
    const previousMean = previousOffsets.length > 0
      ? this._mean(previousOffsets)
      : recentMedian;
    const driftMs = Math.abs(recentMedian - previousMean);

    const strictStable = recentMad <= this.madThresholdMs &&
      driftMs <= this.driftThresholdMs;
    const relaxedStable = recentMad <= this.madRelaxedThresholdMs &&
      driftMs <= this.driftRelaxedThresholdMs;

    if (strictStable) {
      this.stableWindows++;
      this.confidence = Math.min(this.confidenceTarget, this.confidence + 14);
    } else if (relaxedStable) {
      this.stableWindows = Math.max(0, this.stableWindows - 1);
      this.confidence = Math.min(this.confidenceTarget, this.confidence + 7);
    } else {
      this.stableWindows = Math.max(0, this.stableWindows - 1);
      this.confidence = Math.max(0, this.confidence - 4);
    }

    this.offsetMs = recentMedian;
    this.storageManager.set(this.storageKey, this.offsetMs);
    this.hasSavedCalibration = true;

    const stabilityPercent = Math.round(this.confidence);

    message = `Calibration: hits ${this.goodHits}/${this.minHits}+ | median ${
      Math.round(recentMedian)
    } ms | spread ${
      Math.round(recentMad)
    } ms | confidence ${stabilityPercent}%`;
    if (this.delegate?.onStatusChanged) {
      this.delegate.onStatusChanged(message);
    }

    const strictDone = this.stableWindows >= this.requiredStableWindows &&
      this.confidence >= this.confidenceTarget;
    const relaxedDone = this.goodHits >= this.minHitsRelaxed &&
      this.confidence >= this.confidenceRelaxedTarget;

    if (strictDone || relaxedDone) {
      this.stop("Calibration complete: stable offset acquired.");
    }
  }

  /**
   * @param {number[]} values - Array of values
   * @returns {number}
   */
  _median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
  }

  /**
   * @param {number[]} values - Array of values
   * @returns {number}
   */
  _mean(values) {
    if (values.length === 0) return 0;
    return (
      values.reduce(
        (/** @type {number} */ sum, /** @type {number} */ value) => sum + value,
        0,
      ) /
      values.length
    );
  }

  /**
   * @param {number[]} values - Array of values
   * @param {number} medianValue - The median value
   * @returns {number}
   */
  _computeMad(values, medianValue) {
    if (values.length === 0) return 0;
    const absDeviations = values.map((/** @type {number} */ value) =>
      Math.abs(value - medianValue)
    );
    return this._median(absDeviations);
  }
}

export default CalibrationDetector;
