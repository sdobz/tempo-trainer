import AudioInputSource from "./audio-input-source.js";

/**
 * AdaptiveDetector — Spectral flux + entropy onset detection.
 *
 * Detects hits by requiring BOTH:
 *   1. Positive spectral flux above an adaptive threshold (median + k×MAD)
 *   2. Low spectral entropy (concentrated frequency content, not broadband noise)
 *
 * The adaptive threshold tracks the noise floor, so the refractory period and
 * sensitivity all self-adjust to the acoustic environment.
 *
 * Suitable for: cymbal hits, ghost notes, hi-hat edges.
 * Not suitable for: kick isolation without multi-band analysis (future Phase 2).
 *
 * Sensitivity (0–1) maps to the threshold coefficient k:
 *   sensitivity → k = 0.5 + (1 − sensitivity) × 4.0
 *   (high sensitivity = low k = triggers easily; low sensitivity = high k = hard to trigger)
 *
 * Delegate callbacks:
 *   onLevelChanged(level: 0–1)       — spectral flux (primary signal for this detector)
 *   onPeakChanged(peak: 0–1)         — flux peak-hold indicator
 *   onThresholdChanged(pos: 0–1)     — adaptive threshold line position
 *   onHit()                          — hit detected
 */
class AdaptiveDetector {
  /**
   * @param {AudioInputSource} audioInputSource
   * @param {import("./detector-params.js").DetectorParams} params
   * @param {Object} delegate
   */
  constructor(audioInputSource, params, delegate) {
    this._audioInput = audioInputSource;
    this.delegate = delegate;

    // --- Algorithm config (from params, with defaults) ---
    this._fftSize = 1024;
    this._historyWindowSize =
      typeof params.historyWindowSize === "number"
        ? params.historyWindowSize
        : 60;
    this._entropyThreshold =
      typeof params.entropyThreshold === "number"
        ? params.entropyThreshold
        : 0.65;

    // Refractory: base period scales inversely with BPM
    this._baseRefractoryMs = 250;
    this._baseRefractionBpm = 60;
    this._bpm =
      typeof params.bpm === "number" ? Math.max(40, Math.min(240, params.bpm)) : 120;

    // Timing constants (shared with ThresholdDetector)
    /** @private */ this._peakHoldMs = 180;
    /** @private */ this._peakFallPerSecond = 140;

    // --- Sensitivity (0–1) → coefficient (0.5–4.5) ---
    this._sensitivity =
      typeof params.sensitivity === "number"
        ? Math.max(0, Math.min(1, params.sensitivity))
        : 0.5;

    // --- Runtime state ---
    /** @private */ this._isRunning = false;
    /** @private */ this._frequencyData = null;
    /** @private */ this._previousFrequencyData = null;
    /** @private */ this._rafId = null;
    /** @private */ this._lastHitTime = 0;
    /** @private */ this._lastDetectTime = 0;
    /** @private */ this._lastLevel = -1;
    /** @private */ this._lastPeak = -1;
    /** @private */ this._lastThreshold = -1;
    /** @private */ this._peakHoldValue = 0;
    /** @private */ this._peakHoldUntil = 0;
    /** @private */ this._fluxHistory = [];
    /** @private */ this._entropyHistory = [];
    /** @private */ this._now = () => performance.now();

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
   * Update sensitivity. The next frame's adaptive threshold calculation will
   * use the new coefficient, visually repositioning the threshold line.
   * @param {number} value 0–1
   */
  setSensitivity(value) {
    this._sensitivity = Math.max(0, Math.min(1, value));
  }

  /**
   * Update the current BPM for refractory period scaling.
   * @param {number} bpm
   */
  setBpm(bpm) {
    this._bpm = Math.max(40, Math.min(240, bpm));
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
        fftSize: this._fftSize,
        smoothingTimeConstant: 0.3,
      });
      const binCount = analyserNode.frequencyBinCount;
      this._frequencyData = new Uint8Array(binCount);
      this._previousFrequencyData = new Uint8Array(binCount);
      this._frequencyData.fill(0);
      this._previousFrequencyData.fill(0);
      this._fluxHistory = [];
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
  // Private — detection loop
  // ---------------------------------------------------------------------------

  /** @private */
  _detectLoop() {
    const analyserNode = this._audioInput.analyserNode;
    if (!analyserNode || !this._frequencyData) {
      this._rafId = requestAnimationFrame(() => this._detectLoop());
      return;
    }

    const now = this._now();

    analyserNode.getByteFrequencyData(this._frequencyData);

    const flux = this._calculateSpectralFlux(
      this._frequencyData,
      this._previousFrequencyData,
    );
    const entropy = this._calculateSpectralEntropy(this._frequencyData);

    this._previousFrequencyData.set(this._frequencyData);

    this.processFeatureFrame(flux, entropy, {
      nowMs: now,
      audioTimeSeconds: this._audioInput.audioContext?.currentTime,
    });

    this._rafId = requestAnimationFrame(() => this._detectLoop());
  }

  /**
   * Process precomputed spectral features for one frame.
   *
   * This is used by the live analyser loop and by deterministic offline tests.
   * @param {number} flux
   * @param {number} entropy
   * @param {{ nowMs?: number, audioTimeSeconds?: number }} [options]
   * @returns {{ level: number, peak: number, threshold: number, hit: boolean }}
   */
  processFeatureFrame(flux, entropy, options = {}) {
    const now = typeof options.nowMs === "number" ? options.nowMs : this._now();
    let deltaSeconds = 0;
    if (this._lastDetectTime) {
      deltaSeconds = (now - this._lastDetectTime) / 1000;
    }
    this._lastDetectTime = now;

    // Rolling flux history for adaptive threshold
    this._fluxHistory.push(flux);
    if (this._fluxHistory.length > this._historyWindowSize) {
      this._fluxHistory.shift();
    }

    // Spectral flux as the "level" signal (0–1); flux range is typically 0–20
    const level = Math.min(1, flux / 20);
    if (level !== this._lastLevel) {
      this._lastLevel = level;
      this.delegate?.onLevelChanged?.(level);
    }

    // Adaptive threshold
    const thresholdCoefficient = 0.5 + (1 - this._sensitivity) * 4.0;
    const adaptiveThreshold = this._calculateAdaptiveThreshold(thresholdCoefficient);
    const thresholdPos = Math.min(1, adaptiveThreshold / 20);
    if (thresholdPos !== this._lastThreshold) {
      this._lastThreshold = thresholdPos;
      this.delegate?.onThresholdChanged?.(thresholdPos);
    }

    // Peak hold on flux
    if (flux >= this._peakHoldValue) {
      this._peakHoldValue = flux;
      this._peakHoldUntil = now + this._peakHoldMs;
    } else if (now > this._peakHoldUntil) {
      this._peakHoldValue = Math.max(
        0,
        this._peakHoldValue - this._peakFallPerSecond * deltaSeconds,
      );
    }

    const peak = Math.min(1, this._peakHoldValue / 20);
    if (peak !== this._lastPeak) {
      this._lastPeak = peak;
      this.delegate?.onPeakChanged?.(peak);
    }

    // Spectral entropy for noise rejection
    this._entropyHistory.push(entropy);
    if (this._entropyHistory.length > this._historyWindowSize) {
      this._entropyHistory.shift();
    }

    const refractoryMs = (this._baseRefractoryMs * this._baseRefractionBpm) / this._bpm;

    let hit = false;
    if (
      flux >= adaptiveThreshold &&
      entropy < this._entropyThreshold &&
      now - this._lastHitTime > refractoryMs
    ) {
      this._lastHitTime = now;
      hit = true;
      this._handleHit(options.audioTimeSeconds);
    }

    return {
      level,
      peak,
      threshold: thresholdPos,
      hit,
    };
  }

  /** @private */
  _handleHit(hitAudioTime) {
    this.delegate?.onHit?.();
    if (!this.onHitCallback) return;
    if (typeof hitAudioTime === "number") {
      this.onHitCallback(hitAudioTime);
      return;
    }
    if (this._audioInput.audioContext) {
      this.onHitCallback(this._audioInput.audioContext.currentTime);
    }
  }

  // ---------------------------------------------------------------------------
  // Private — spectral analysis
  // ---------------------------------------------------------------------------

  /**
   * Positive spectral flux across the 1kHz–12kHz range, normalized by bin count.
   * Typical steady-state range: 0–20; transients may reach higher.
   * @private
   * @param {Uint8Array} current
   * @param {Uint8Array} previous
   * @returns {number}
   */
  _calculateSpectralFlux(current, previous) {
    const startBin = Math.max(1, Math.floor(23 * (this._fftSize / 1024)));
    const endBin = Math.min(
      current.length,
      Math.floor(280 * (this._fftSize / 1024)),
    );
    let flux = 0;
    for (let i = startBin; i < endBin; i++) {
      const diff = current[i] - previous[i];
      if (diff > 0) flux += diff;
    }
    return flux / Math.max(1, endBin - startBin);
  }

  /**
   * Shannon entropy of the frequency distribution in the 1kHz–12kHz range.
   * 0.0 = pure tone (accept), 1.0 = white noise (reject).
   * @private
   * @param {Uint8Array} magnitudes
   * @returns {number}
   */
  _calculateSpectralEntropy(magnitudes) {
    const startBin = Math.max(1, Math.floor(23 * (this._fftSize / 1024)));
    const endBin = Math.min(
      magnitudes.length,
      Math.floor(280 * (this._fftSize / 1024)),
    );
    let sum = 0;
    for (let i = startBin; i < endBin; i++) sum += magnitudes[i];
    if (sum === 0) return 0;

    let entropy = 0;
    for (let i = startBin; i < endBin; i++) {
      const p = magnitudes[i] / sum;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    const maxEntropy = Math.log2(endBin - startBin);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  /**
   * Adaptive threshold: median(history) + coefficient × MAD(history).
   * Returns a conservative default before enough history is collected.
   * @private
   * @param {number} coefficient
   * @returns {number}
   */
  _calculateAdaptiveThreshold(coefficient) {
    if (this._fluxHistory.length < 5) return 5;
    const med = this._median(this._fluxHistory);
    const madValue = this._mad(this._fluxHistory);
    return med + coefficient * madValue;
  }

  /** @private */
  _median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /** @private */
  _mad(arr) {
    if (arr.length === 0) return 0;
    const med = this._median(arr);
    return this._median(arr.map((x) => Math.abs(x - med)));
  }
}

export default AdaptiveDetector;
