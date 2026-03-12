import { DEFAULT_ADAPTIVE_PARAMS } from "./detector-params.js";

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
 *   onThresholdChanged(pos: 0–1)     — sensitivity line position (= sensitivity)
 *   onHit()                          — hit detected
 */
class AdaptiveDetector {
  /**
   * @param {{
   *   start(options?: { fftSize?: number, smoothingTimeConstant?: number }): Promise<AnalyserNode>,
   *   stop(): void,
   *   analyserNode: AnalyserNode|null,
   *   audioContext: AudioContext|null,
   * }} audioInputSource
   * @param {import("./detector-params.js").AdaptiveDetectorParams} params
   * @param {Object} delegate
   */
  constructor(audioInputSource, params, delegate) {
    this._audioInput = audioInputSource;
    this.delegate = delegate;

    // --- Algorithm config (from params, with defaults) ---
    this._fftSize = 1024;
    this._historyWindowSize =
      params.historyWindowSize ?? DEFAULT_ADAPTIVE_PARAMS.historyWindowSize;
    this._entropyThreshold =
      params.entropyThreshold ?? DEFAULT_ADAPTIVE_PARAMS.entropyThreshold;

    // Refractory: base period scales inversely with BPM
    this._baseRefractoryMs = 360;
    this._baseRefractionBpm = 60;
    this._minRefractoryMs = 170;
    this._bpm = params.bpm ?? DEFAULT_ADAPTIVE_PARAMS.bpm;

    // Threshold and hit-gating tuning
    this._thresholdBootstrap = 6;
    this._thresholdFloor = 3;
    this._thresholdWarmupFrames = 6;
    this._thresholdRiseAttack = 0.35;
    this._thresholdFallRelease = 0.02;
    this._fluxResetFactor = 0.4;
    this._requiredProminenceMin = 0.4;
    this._requiredProminenceScale = 0.1;
    this._absoluteFluxFloor = 4.0;
    this._amplitudeGateThreshold = 12;
    this._minHistoryFramesForDetection = 8;
    this._longGapMs = 700;
    this._longGapProminence = 2.5;
    this._veryLongGapMs = 1500;
    this._veryLongGapProminence = 5;

    // Timing constants (shared with ThresholdDetector)
    /** @private */ this._peakHoldMs = 180;
    /** @private */ this._peakFallPerSecond = 140;
    /** @private */ this._hitTimeCompensationSeconds = 0.02;

    // --- Sensitivity (0–1) → coefficient (0.5–4.5) ---
    this._sensitivity =
      typeof params.sensitivity === "number"
        ? Math.max(0, Math.min(1, params.sensitivity))
        : 0.5;

    this._applySensitivityProfile();

    // --- Runtime state ---
    /** @private */ this._isRunning = false;
    /** @private */ this._frequencyData = null;
    /** @private */ this._previousFrequencyData = null;
    /** @private */ this._timeDomainData = null;
    /** @private */ this._rafId = null;
    /** @private */ this._lastHitTime = 0;
    /** @private */ this._lastDetectTime = 0;
    /** @private */ this._lastLevel = -1;
    /** @private */ this._lastPeak = -1;
    /** @private */ this._peakHoldValue = 0;
    /** @private */ this._peakHoldUntil = 0;
    /** @private */ this._fluxHistory = [];
    /** @private */ this._entropyHistory = [];
    /** @private */ this._warmupFramesRemaining = 0;
    /** @private */ this._previousFlux = 0;
    /** @private */ this._smoothedThreshold = 7;
    /** @private */ this._isArmed = true;
    /** @private */ this._hitsDetected = 0;
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
    this._applySensitivityProfile();
    this.delegate?.onThresholdChanged?.(this._sensitivity);
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
        smoothingTimeConstant: 0,
      });
      const binCount = analyserNode.frequencyBinCount;
      this._frequencyData = new Uint8Array(binCount);
      this._previousFrequencyData = new Uint8Array(binCount);
      this._timeDomainData = new Uint8Array(analyserNode.fftSize);
      this._frequencyData.fill(0);
      this._previousFrequencyData.fill(0);
      this._timeDomainData.fill(128);
      this._fluxHistory = [];
      this._entropyHistory = [];
      this._warmupFramesRemaining = this._thresholdWarmupFrames;
      this._previousFlux = 0;
      this._smoothedThreshold = this._thresholdBootstrap;
      this._isArmed = true;
      this._hitsDetected = 0;
      this._lastHitTime = this._now();
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
    this._hitsDetected = 0;
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
    if (!analyserNode || !this._frequencyData || !this._timeDomainData) {
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
    analyserNode.getByteTimeDomainData(this._timeDomainData);
    const maxAmplitude = this._calculateTimeDomainPeak(this._timeDomainData);

    this._previousFrequencyData.set(this._frequencyData);

    this.processFeatureFrame(flux, entropy, {
      nowMs: now,
      audioTimeSeconds: this._audioInput.audioContext?.currentTime,
      maxAmplitude,
    });

    this._rafId = requestAnimationFrame(() => this._detectLoop());
  }

  /**
   * Process precomputed spectral features for one frame.
   *
   * This is used by the live analyser loop and by deterministic offline tests.
   * @param {number} flux
   * @param {number} entropy
   * @param {{ nowMs?: number, audioTimeSeconds?: number, maxAmplitude?: number }} [options]
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
    const rawAdaptiveThreshold =
      this._calculateAdaptiveThreshold(thresholdCoefficient);
    if (rawAdaptiveThreshold >= this._smoothedThreshold) {
      this._smoothedThreshold =
        this._smoothedThreshold * (1 - this._thresholdRiseAttack) +
        rawAdaptiveThreshold * this._thresholdRiseAttack;
    } else {
      this._smoothedThreshold =
        this._smoothedThreshold * (1 - this._thresholdFallRelease) +
        rawAdaptiveThreshold * this._thresholdFallRelease;
    }
    const adaptiveThreshold = this._smoothedThreshold;
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

    const refractoryMs = Math.max(
      this._minRefractoryMs,
      (this._baseRefractoryMs * this._baseRefractionBpm) / this._bpm,
    );
    const amplitudeGate =
      (options.maxAmplitude ?? 0) >= this._amplitudeGateThreshold;
    const fluxResetThreshold = adaptiveThreshold * this._fluxResetFactor;
    const risingEdge = flux > this._previousFlux;
    const requiredProminence = Math.max(
      this._requiredProminenceMin,
      adaptiveThreshold * this._requiredProminenceScale,
    );
    const absoluteFluxFloor = this._absoluteFluxFloor;
    const fluxGate =
      flux >= adaptiveThreshold &&
      flux >= absoluteFluxFloor &&
      flux - adaptiveThreshold >= requiredProminence &&
      risingEdge;
    const entropyGate = entropy < this._entropyThreshold;
    const historyReady =
      this._fluxHistory.length >=
      Math.min(this._minHistoryFramesForDetection, this._historyWindowSize);
    const timeSinceLastHit = now - this._lastHitTime;
    const longGapMs = this._longGapMs;
    const veryLongGapMs = this._veryLongGapMs;
    const longGapProminence = this._longGapProminence;
    const veryLongGapProminence = this._veryLongGapProminence;
    const prominence = flux - adaptiveThreshold;
    const longGapGate =
      this._hitsDetected === 0
        ? true
        : timeSinceLastHit > veryLongGapMs
          ? prominence >= veryLongGapProminence
          : timeSinceLastHit > longGapMs
            ? prominence >= longGapProminence
            : true;

    if (!this._isArmed && flux <= fluxResetThreshold) {
      this._isArmed = true;
    }

    const msSinceLastHit = now - this._lastHitTime;

    let hit = false;
    if (
      this._warmupFramesRemaining === 0 &&
      historyReady &&
      this._isArmed &&
      amplitudeGate &&
      fluxGate &&
      entropyGate &&
      longGapGate &&
      now - this._lastHitTime > refractoryMs
    ) {
      this._lastHitTime = now;
      this._hitsDetected += 1;
      this._isArmed = false;
      hit = true;
      const compensatedHitTime =
        typeof options.audioTimeSeconds === "number"
          ? Math.max(
              0,
              options.audioTimeSeconds - this._hitTimeCompensationSeconds,
            )
          : undefined;
      this._handleHit(compensatedHitTime);
    }

    if (this._warmupFramesRemaining > 0) {
      this._warmupFramesRemaining -= 1;
    }

    this._previousFlux = flux;

    return {
      level,
      peak,
      threshold: this._sensitivity,
      hit,
    };
  }

  /** @private */
  _handleHit(hitAudioTime) {
    const resolvedHitAudioTime =
      typeof hitAudioTime === "number"
        ? hitAudioTime
        : this._audioInput.audioContext?.currentTime;
    this.delegate?.onHit?.(resolvedHitAudioTime);
    if (!this.onHitCallback) return;
    if (typeof resolvedHitAudioTime === "number") {
      this.onHitCallback(resolvedHitAudioTime);
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
    if (this._fluxHistory.length < 8) return this._thresholdBootstrap;
    const med = this._median(this._fluxHistory);
    const madValue = this._mad(this._fluxHistory);
    return Math.max(this._thresholdFloor, med + coefficient * madValue);
  }

  /** @private */
  _applySensitivityProfile() {
    const strictness = 1 - this._sensitivity;

    this._requiredProminenceMin = lerp(0.25, 0.7, strictness);
    this._requiredProminenceScale = lerp(0.06, 0.16, strictness);
    this._absoluteFluxFloor = lerp(2.5, 5.5, strictness);
    this._amplitudeGateThreshold = lerp(8, 18, strictness);
    this._fluxResetFactor = lerp(0.5, 0.3, strictness);
    this._longGapProminence = lerp(1.2, 3.2, strictness);
    this._veryLongGapProminence = lerp(3.2, 6.2, strictness);
    this._hitTimeCompensationSeconds = lerp(0.012, 0.028, strictness);
    this._thresholdWarmupFrames = Math.round(lerp(4, 12, strictness));
  }

  /** @private */
  _calculateTimeDomainPeak(buffer) {
    let maxVal = 0;
    for (let i = 0; i < buffer.length; i++) {
      const val = Math.abs(buffer[i] - 128);
      if (val > maxVal) maxVal = val;
    }
    return maxVal;
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

function lerp(min, max, t) {
  return min + (max - min) * t;
}

export default AdaptiveDetector;
