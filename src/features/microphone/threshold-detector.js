/**
 * Delegate interface for UI updates from threshold detector.
 * Extends base BeatDetectorDelegate with threshold-specific callbacks.
 * @typedef {BeatDetectorDelegate & {
 *   onThresholdChanged?: (threshold: number) => void,
 *   onDevicesChanged?: (devices: Array, selectedDeviceId: string) => void
 * }} ThresholdDetectorDelegate
 */

/**
 * ThresholdDetector — RMS-based hit detection using amplitude threshold.
 *
 * Simple, responsive detection: hit is triggered when the maximum absolute deviation
 * from center (128) exceeds a user-set threshold. Suitable for single-hit clarity
 * (drum kit context) with predictable false-positive rate on high-amplitude instruments.
 *
 * Implements BeatDetector contract: onHit(), start(), stop(), isRunning getter.
 * Emits delegate callbacks for level, peak, and hit visualization.
 */
class ThresholdDetector {
  /**
   * @param {Object} storageManager - Storage instance for persisting settings
   * @param {ThresholdDetectorDelegate} delegate - Delegate for behavioral updates
   * @param {AudioContext|null} [audioContext] - Optional audio context
   */
  constructor(storageManager, delegate, audioContext = null) {
    this.storageManager = storageManager;
    this.delegate = delegate;
    this.audioContext = audioContext;

    // Configuration
    this.hitCooldown = 100; // ms
    this.peakHoldMs = 180;
    this.peakFallPerSecond = 140;
    this.storageKeys = {
      threshold: "tempoTrainer.hitThreshold",
      device: "tempoTrainer.micDeviceId",
    };

    // State
    this._isRunning = false;
    this.stream = null;
    this.analyserNode = null;
    this.dataArray = null;
    this.lastHitTime = 0;
    this.rafId = null;
    this.threshold = 52;
    this.peakHoldValue = 0;
    this.peakHoldUntil = 0;
    this.lastDetectTime = 0;
    this.lastLevel = 0;
    this.lastPeak = 0;
    this.lastOverThreshold = false;
    this.selectedDeviceId = "";

    // Callbacks
    /** @type {((hitAudioTime: number) => void)|null} */
    this.onHitCallback = null;

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
    this.threshold = this.storageManager.getInt(this.storageKeys.threshold, 52);
    this.threshold = Math.max(0, Math.min(128, this.threshold));

    this.selectedDeviceId =
      this.storageManager.get(this.storageKeys.device, "") || "";
  }

  /**
   * Set threshold value and notify delegate
   * @param {number} value Threshold 0-128
   */
  setThreshold(value) {
    this.threshold = Math.max(0, Math.min(128, value));
    this.storageManager.set(this.storageKeys.threshold, this.threshold);
    if (this.delegate?.onThresholdChanged) {
      this.delegate.onThresholdChanged(this.threshold);
    }
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
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0;

      this.dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

      source.connect(this.analyserNode);

      // Populate devices and update selected device
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
   * Enumerate and return devices (internal - no DOM side effects)
   * @private
   * @returns {Promise<Array<{deviceId: string, label: string}>>}
   */
  async _enumerateDevices() {
    return this.getAvailableDevices();
  }

  /**
   * Set selected device by ID
   * @param {string} deviceId Device ID to select
   */
  selectDevice(deviceId) {
    this.selectedDeviceId = deviceId;
    this.storageManager.set(this.storageKeys.device, deviceId);
  }

  _detectLoop() {
    if (!this.analyserNode || !this.dataArray) {
      this.rafId = requestAnimationFrame(() => this._detectLoop());
      return;
    }

    const now = performance.now();
    if (!this.lastDetectTime) {
      this.lastDetectTime = now;
    }
    const deltaSeconds = (now - this.lastDetectTime) / 1000;
    this.lastDetectTime = now;

    this.analyserNode.getByteTimeDomainData(this.dataArray);

    let maxVal = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const val = Math.abs(this.dataArray[i] - 128);
      if (val > maxVal) {
        maxVal = val;
      }
    }

    // Convert to 0-100 scale for level
    const level = (maxVal / 128) * 100;
    if (level !== this.lastLevel) {
      this.lastLevel = level;
      if (this.delegate?.onLevelChanged) {
        this.delegate.onLevelChanged(level);
      }
    }

    // Update peak hold
    const wasOverThreshold = this.lastOverThreshold;
    const isOverThreshold = maxVal >= this.threshold;
    if (isOverThreshold !== wasOverThreshold) {
      this.lastOverThreshold = isOverThreshold;
      if (this.delegate?.onOverThreshold) {
        this.delegate.onOverThreshold(isOverThreshold);
      }
    }

    if (maxVal >= this.peakHoldValue) {
      this.peakHoldValue = maxVal;
      this.peakHoldUntil = now + this.peakHoldMs;
    } else if (now > this.peakHoldUntil) {
      this.peakHoldValue = Math.max(
        maxVal,
        this.peakHoldValue - this.peakFallPerSecond * deltaSeconds,
      );
    }

    const peak = (this.peakHoldValue / 128) * 100;
    if (peak !== this.lastPeak) {
      this.lastPeak = peak;
      if (this.delegate?.onPeakChanged) {
        this.delegate.onPeakChanged(peak);
      }
    }

    // Detect hit
    if (maxVal >= this.threshold && now - this.lastHitTime > this.hitCooldown) {
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

export default ThresholdDetector;
