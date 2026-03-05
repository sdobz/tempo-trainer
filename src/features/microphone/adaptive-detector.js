/**
 * Delegate interface for UI updates from adaptive detector.
 * Extends base BeatDetectorDelegate with adaptive-specific callbacks.
 * @typedef {BeatDetectorDelegate & {
 *   onDevicesChanged?: (devices: Array, selectedDeviceId: string) => void,
 *   onFluxChanged?: (fluxMagnitude: number) => void
 * }} AdaptiveDetectorDelegate
 */

/**
 * AdaptiveDetector — Spectral flux + entropy onset detection using FFT analysis.
 *
 * Phase 1 implementation: Detects hits by requiring BOTH:
 * 1. Positive spectral flux (magnitude spectrum frame-to-frame change)
 * 2. Low spectral entropy (concentrated frequency content, not broadband noise)
 *
 * Adaptive threshold (median + k×MAD) responds to changing noise floor.
 * Tempo-scaled refractory period prevents double-triggering.
 *
 * Suitable for:
 * - Sustained hi-hat wash rejection (high entropy = noise)
 * - Cymbal hits (concentrated high-frequency content = low entropy)
 * - Ghost notes (transient with defined pitch)
 *
 * Not suitable for:
 * - Phase 1 AudioWorklet migration (runs on main thread)
 * - Kick drum isolation without multi-band analysis (Phase 2)
 *
 * Implements BeatDetector contract: onHit(), start(), stop(), isRunning getter.
 */
class AdaptiveDetector {
  /**
   * @param {Object} storageManager - Storage instance for persisting settings
   * @param {AdaptiveDetectorDelegate} delegate - Delegate for behavioral updates
   * @param {AudioContext|null} [audioContext] - Optional audio context
   */
  constructor(storageManager, delegate, audioContext = null) {
    this.storageManager = storageManager;
    this.delegate = delegate;
    this.audioContext = audioContext;

    // Configuration
    this.fftSize = 1024;
    this.historyWindowSize = 60; // Rolling median window size
    this.peakHoldMs = 180;
    this.peakFallPerSecond = 140;
    this.storageKeys = {
      device: "tempoTrainer.micDeviceId",
    };

    // Adaptive threshold coefficient (k * MAD)
    // Higher = less sensitive; typically 1.5–2.5
    this.thresholdCoefficient = 2.0;

    // Spectral entropy threshold for noise rejection
    // Entropy > this = broadband noise (reject)
    // Entropy < this = concentrated/tonal (accept)
    // Range: 0.0 (pure tone) to 1.0 (white noise)
    // 0.65 = good balance for cymbal hits (low entropy) vs. random mic noise (high entropy)
    this.entropyThreshold = 0.65;

    // Base refractory period (ms) when BPM is 60
    this.baseRefractoryMs = 250;
    this.baseRefractionBpm = 60;

    // State
    this._isRunning = false;
    this.stream = null;
    this.analyserNode = null;
    this.frequencyData = null;
    this.previousFrequencyData = null;
    this.rafId = null;
    this.lastHitTime = 0;
    this.lastDetectTime = 0;
    this.lastLevel = 0;
    this.lastPeak = 0;
    this.lastFlux = 0;
    this.peakHoldValue = 0;
    this.peakHoldUntil = 0;
    this.selectedDeviceId = "";

    // Flux history for adaptive threshold
    this.fluxHistory = [];

    // Entropy history for dynamic threshold
    this.entropyHistory = [];

    // Callbacks
    /** @type {((hitAudioTime: number) => void)|null} */
    this.onHitCallback = null;

    // For demo/visualization: current target BPM (used for refractory period)
    this.bpm = 120;

    this._loadSettings();
  }

  /** @type {boolean} */
  get isRunning() {
    return this._isRunning;
  }

  /** @param {(hitAudioTime: number) => void} callback */
  onHit(callback) {
    this.onHitCallback = callback;
  }

  _loadSettings() {
    this.selectedDeviceId =
      this.storageManager.get(this.storageKeys.device, "") || "";
  }

  /**
   * Set BPM (affects refractory period).
   * @param {number} bpm
   */
  setBpm(bpm) {
    this.bpm = Math.max(40, Math.min(240, bpm));
  }

  async start() {
    try {
      const audioContext = this.audioContext;
      if (!audioContext) {
        return false;
      }

      this._stopCurrentStream();

      const audioConstraints = this.selectedDeviceId
        ? { deviceId: { exact: this.selectedDeviceId } }
        : true;

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      this._isRunning = true;

      const source = audioContext.createMediaStreamSource(this.stream);
      this.analyserNode = audioContext.createAnalyser();
      this.analyserNode.fftSize = this.fftSize;
      this.analyserNode.smoothingTimeConstant = 0.3;

      this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.previousFrequencyData = new Uint8Array(
        this.analyserNode.frequencyBinCount,
      );
      this.frequencyData.fill(0);
      this.previousFrequencyData.fill(0);

      source.connect(this.analyserNode);

      // Enumerate devices and update selected
      const devices = await this._enumerateDevices();
      if (devices.length > 0) {
        const activeTrack = this.stream.getAudioTracks()[0];
        if (activeTrack && activeTrack.getSettings) {
          const settings = activeTrack.getSettings();
          if (settings.deviceId) {
            this.selectedDeviceId = settings.deviceId;
            this.storageManager.set(
              this.storageKeys.device,
              this.selectedDeviceId,
            );
          }
        }
      }

      if (this.delegate?.onDevicesChanged) {
        this.delegate.onDevicesChanged(devices, this.selectedDeviceId);
      }

      // Initialize flux history
      this.fluxHistory = [];

      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => this._detectLoop());
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  stop() {
    this._stopCurrentStream();
    this._isRunning = false;

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _stopCurrentStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  /**
   * Get available audio input devices
   * @returns {Promise<Array<{deviceId: string, label: string}>>}
   */
  async getAvailableDevices() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Enumerate devices (internal)
   * @private
   * @returns {Promise<Array<{deviceId: string, label: string}>>}
   */
  async _enumerateDevices() {
    return this.getAvailableDevices();
  }

  /**
   * Set selected device by ID
   * @param {string} deviceId
   */
  selectDevice(deviceId) {
    this.selectedDeviceId = deviceId;
    this.storageManager.set(this.storageKeys.device, deviceId);
  }

  /**
   * Calculate spectral entropy: measures concentration of frequency content.
   * High entropy = broadband noise (bad)
   * Low entropy = concentrated/tonal content (good)
   *
   * Shannon entropy: H = -sum(p(i) * log2(p(i)))
   * where p(i) = magnitude[i] / sum(magnitudes)
   *
   * @private
   * @param {Uint8Array} magnitudes
   * @returns {number} entropy in range [0.0, 1.0]
   */
  _calculateSpectralEntropy(magnitudes) {
    // Only analyze mid-to-high frequencies (where hits occur)
    const startBin = Math.max(1, Math.floor(23 * (this.fftSize / 1024)));
    const endBin = Math.min(
      magnitudes.length,
      Math.floor(280 * (this.fftSize / 1024)),
    );

    // Sum magnitudes in the frequency range
    let sum = 0;
    for (let i = startBin; i < endBin; i++) {
      sum += magnitudes[i];
    }

    if (sum === 0) return 0;

    // Calculate normalized probabilities and entropy
    let entropy = 0;
    for (let i = startBin; i < endBin; i++) {
      const p = magnitudes[i] / sum;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // Normalize to [0, 1] range
    // Maximum entropy occurs with uniform distribution
    const numBins = endBin - startBin;
    const maxEntropy = Math.log2(numBins);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  /**
   * Calculate positive spectral flux between two magnitude spectra.
   * Focus on mid-to-high frequencies (1kHz+) where hits occur.
   * Ignore low rumble (below ~200Hz) and ultrasonic noise.
   *
   * Normalized by bin count to reduce bias from FFT size.
   * Flux = mean(max(0, magnitude[i] - previousMagnitude[i]))
   *
   * For a 1024-point FFT at 44.1kHz:
   * - bin i corresponds to i * (44100 / 1024) ≈ 43 Hz per bin
   * - 200 Hz ≈ bin 5, 1000 Hz ≈ bin 23, 5000 Hz ≈ bin 116
   *
   * @private
   * @param {Uint8Array} current
   * @param {Uint8Array} previous
   * @returns {number}
   */
  _calculateSpectralFlux(current, previous) {
    let flux = 0;
    // Skip low frequencies (rumble) and very high frequencies (sensor noise)
    // Start at ~1kHz (bin 23), stop at ~12kHz (bin 280)
    const startBin = Math.max(1, Math.floor(23 * (this.fftSize / 1024)));
    const endBin = Math.min(
      current.length,
      Math.floor(280 * (this.fftSize / 1024)),
    );

    for (let i = startBin; i < endBin; i++) {
      const diff = current[i] - previous[i];
      if (diff > 0) {
        flux += diff;
      }
    }

    // Normalize by bin count to handle different FFT sizes
    const binCount = Math.max(1, endBin - startBin);
    return flux / binCount;
  }

  /**
   * Calculate median of an array.
   * @private
   * @param {number[]} arr
   * @returns {number}
   */
  _median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Calculate Median Absolute Deviation (MAD).
   * MAD = median(|x - median(x)|)
   * @private
   * @param {number[]} arr
   * @returns {number}
   */
  _mad(arr) {
    if (arr.length === 0) return 0;
    const med = this._median(arr);
    const deviations = arr.map((x) => Math.abs(x - med));
    return this._median(deviations);
  }

  /**
   * Calculate adaptive threshold: median + k * MAD
   * @private
   * @returns {number}
   */
  _calculateAdaptiveThreshold() {
    if (this.fluxHistory.length < 5) {
      // Not enough samples yet — use a conservative default
      return 5;
    }
    const med = this._median(this.fluxHistory);
    const madValue = this._mad(this.fluxHistory);
    return med + this.thresholdCoefficient * madValue;
  }

  /**
   * Calculate refractory period based on current BPM.
   * @private
   * @returns {number} ms
   */
  _getRefractoryPeriodMs() {
    // Tempo-scale: at 120 BPM, use base refractory; scale inversely with BPM
    const ratio = this.baseRefractionBpm / this.bpm;
    return this.baseRefractoryMs * ratio;
  }

  _detectLoop() {
    if (!this.analyserNode || !this.frequencyData) {
      this.rafId = requestAnimationFrame(() => this._detectLoop());
      return;
    }

    const now = performance.now();
    if (!this.lastDetectTime) {
      this.lastDetectTime = now;
    }
    const deltaSeconds = (now - this.lastDetectTime) / 1000;
    this.lastDetectTime = now;

    // Get frequency data
    this.analyserNode.getByteFrequencyData(this.frequencyData);

    // Calculate spectral flux
    const flux = this._calculateSpectralFlux(
      this.frequencyData,
      this.previousFrequencyData,
    );

    // Add to history (keep rolling window)
    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > this.historyWindowSize) {
      this.fluxHistory.shift();
    }

    // Copy current to previous for next frame
    this.previousFrequencyData.set(this.frequencyData);

    // Calculate level (RMS of frequency data for visualization)
    let sum = 0;
    for (let i = 0; i < this.frequencyData.length; i++) {
      sum += this.frequencyData[i] * this.frequencyData[i];
    }
    const rms = Math.sqrt(sum / this.frequencyData.length);
    const level = (rms / 128) * 100; // Scale to 0-100

    if (level !== this.lastLevel) {
      this.lastLevel = level;
      if (this.delegate?.onLevelChanged) {
        this.delegate.onLevelChanged(level);
      }
    }

    // Update flux visualization (0-100 scale)
    // Normalized flux uses mean across bins, so 0-20 is typical range
    const fluxScaled = Math.min(100, flux * 5); // Scale for visualization
    if (fluxScaled !== this.lastFlux) {
      this.lastFlux = fluxScaled;
      if (this.delegate?.onFluxChanged) {
        this.delegate.onFluxChanged(fluxScaled);
      }
    }

    // Update peak hold
    if (fluxScaled >= this.peakHoldValue) {
      this.peakHoldValue = fluxScaled;
      this.peakHoldUntil = now + this.peakHoldMs;
    } else if (now > this.peakHoldUntil) {
      this.peakHoldValue = Math.max(
        0,
        this.peakHoldValue - this.peakFallPerSecond * deltaSeconds,
      );
    }

    const peak = this.peakHoldValue;
    if (peak !== this.lastPeak) {
      this.lastPeak = peak;
      if (this.delegate?.onPeakChanged) {
        this.delegate.onPeakChanged(peak);
      }
    }

    // Detect hit based on BOTH flux AND entropy criteria
    // Flux must exceed threshold AND entropy must be below threshold
    // This rejects broadband noise while accepting instrument hits
    const adaptiveThreshold = this._calculateAdaptiveThreshold();

    // Calculate spectral entropy (measure of noise vs. tonal content)
    const entropy = this._calculateSpectralEntropy(this.frequencyData);
    this.entropyHistory.push(entropy);
    if (this.entropyHistory.length > this.historyWindowSize) {
      this.entropyHistory.shift();
    }

    const refractoryMs = this._getRefractoryPeriodMs();

    if (
      flux >= adaptiveThreshold &&
      entropy < this.entropyThreshold &&
      now - this.lastHitTime > refractoryMs
    ) {
      this.lastHitTime = now;
      this._handleHit();
    }

    this.rafId = requestAnimationFrame(() => this._detectLoop());
  }

  _handleHit() {
    // Notify delegate of hit
    if (this.delegate?.onHit) {
      this.delegate.onHit();
    }

    // Callback for hit audio time
    if (this.onHitCallback && this.audioContext) {
      this.onHitCallback(this.audioContext.currentTime);
    }
  }
}

export default AdaptiveDetector;
