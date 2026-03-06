import AudioInputSource from "./audio-input-source.js";

/**
 * ThresholdDetector — RMS amplitude onset detection.
 *
 * Triggers a hit when the peak amplitude in a time-domain frame exceeds the
 * sensitivity-derived threshold. Simple and responsive; suitable for clear
 * single-hit instruments (drum pads, rimshots).
 *
 * Receives an AudioInputSource for hardware access and a DetectorParams object
 * for configuration. All emitted values are normalized to [0, 1].
 *
 * Delegate callbacks:
 *   onLevelChanged(level: 0–1)       — current signal level (bar width)
 *   onPeakChanged(peak: 0–1)         — peak-hold indicator position
 *   onThresholdChanged(pos: 0–1)     — threshold line position (= sensitivity)
 *   onHit()                          — hit detected
 */
class ThresholdDetector {
  /**
   * @param {AudioInputSource} audioInputSource
   * @param {import("./detector-params.js").DetectorParams} params
   * @param {Object} delegate
   */
  constructor(audioInputSource, params, delegate) {
    this._audioInput = audioInputSource;
    this.delegate = delegate;

    // --- Timing constants ---
    /** @private */ this._hitCooldownMs = 100;
    /** @private */ this._peakHoldMs = 180;
    /** @private */ this._peakFallPerSecond = 140;

    // --- Sensitivity (0–1); maps inversely to internal threshold ---
    // Higher sensitivity = lower threshold = triggers more easily
    this._sensitivity =
      typeof params.sensitivity === "number"
        ? Math.max(0, Math.min(1, params.sensitivity))
        : 0.594;

    // --- Runtime state ---
    /** @private */ this._isRunning = false;
    /** @private */ this._bufferData = null;
    /** @private */ this._lastHitTime = 0;
    /** @private */ this._rafId = null;
    /** @private */ this._peakHoldValue = 0;
    /** @private */ this._peakHoldUntil = 0;
    /** @private */ this._lastDetectTime = 0;
    /** @private */ this._lastLevel = -1;
    /** @private */ this._lastPeak = -1;

    /** @type {((hitAudioTime: number) => void)|null} */
    this.onHitCallback = null;
  }

  /** @returns {boolean} */
  get isRunning() {
    return this._isRunning;
  }

  /** @returns {number} Current sensitivity (0–1) */
  get sensitivity() {
    return this._sensitivity;
  }

  /**
   * Update sensitivity and notify the delegate so the threshold line repositions.
   * @param {number} value 0–1
   */
  setSensitivity(value) {
    this._sensitivity = Math.max(0, Math.min(1, value));
    this.delegate?.onThresholdChanged?.(this._sensitivity);
  }

  /**
   * Register a timing callback invoked on every hit with the audio clock timestamp.
   * @param {(hitAudioTime: number) => void} callback
   */
  onHit(callback) {
    this.onHitCallback = callback;
  }

  /**
   * Open the microphone stream and begin detection.
   * @returns {Promise<boolean>} false if audio is unavailable
   */
  async start() {
    try {
      const analyserNode = await this._audioInput.start({
        fftSize: 256,
        smoothingTimeConstant: 0,
      });
      this._bufferData = new Uint8Array(analyserNode.frequencyBinCount);
      this._isRunning = true;
      if (!this._rafId) {
        this._rafId = requestAnimationFrame(() => this._detectLoop());
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stop detection and release the microphone stream.
   */
  stop() {
    this._audioInput.stop();
    this._isRunning = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** @private */
  _detectLoop() {
    const analyserNode = this._audioInput.analyserNode;
    if (!analyserNode || !this._bufferData) {
      this._rafId = requestAnimationFrame(() => this._detectLoop());
      return;
    }

    const now = performance.now();
    if (!this._lastDetectTime) this._lastDetectTime = now;
    const deltaSeconds = (now - this._lastDetectTime) / 1000;
    this._lastDetectTime = now;

    analyserNode.getByteTimeDomainData(this._bufferData);

    // Peak absolute deviation from center (128)
    let maxVal = 0;
    for (let i = 0; i < this._bufferData.length; i++) {
      const val = Math.abs(this._bufferData[i] - 128);
      if (val > maxVal) maxVal = val;
    }

    // Emit level: 0–1
    const level = maxVal / 128;
    if (level !== this._lastLevel) {
      this._lastLevel = level;
      this.delegate?.onLevelChanged?.(level);
    }

    // Internal threshold derived from sensitivity (inverted: more sensitive = lower threshold)
    const threshold = (1 - this._sensitivity) * 128;

    // Peak hold
    if (maxVal >= this._peakHoldValue) {
      this._peakHoldValue = maxVal;
      this._peakHoldUntil = now + this._peakHoldMs;
    } else if (now > this._peakHoldUntil) {
      this._peakHoldValue = Math.max(
        maxVal,
        this._peakHoldValue - this._peakFallPerSecond * deltaSeconds,
      );
    }

    const peak = this._peakHoldValue / 128;
    if (peak !== this._lastPeak) {
      this._lastPeak = peak;
      this.delegate?.onPeakChanged?.(peak);
    }

    // Hit detection
    if (maxVal >= threshold && now - this._lastHitTime > this._hitCooldownMs) {
      this._lastHitTime = now;
      this._handleHit();
    }

    this._rafId = requestAnimationFrame(() => this._detectLoop());
  }

  /** @private */
  _handleHit() {
    this.delegate?.onHit?.();
    if (this.onHitCallback && this._audioInput.audioContext) {
      this.onHitCallback(this._audioInput.audioContext.currentTime);
    }
  }
}

export default ThresholdDetector;
