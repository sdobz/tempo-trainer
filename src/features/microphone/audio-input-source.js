/**
 * AudioInputSource — Manages microphone hardware access.
 *
 * Owns the getUserMedia stream, AnalyserNode, and device enumeration.
 * Shared by all detector instances so hardware is never duplicated.
 *
 * Detectors receive the AnalyserNode from start() and read it each frame,
 * but do not own or manage the stream lifecycle.
 *
 * @typedef {{ deviceId: string, label: string }} AudioDevice
 */

const STORAGE_KEY_DEVICE = "tempoTrainer.micDeviceId";

class AudioInputSource {
  /**
   * @param {AudioContext|null} audioContext
   */
  constructor(audioContext = null) {
    /** @type {AudioContext|null} */
    this.audioContext = audioContext;

    /** @type {MediaStream|null} */
    this._stream = null;

    /** @type {AnalyserNode|null} */
    this.analyserNode = null;

    /** @type {string} */
    this.selectedDeviceId = "";

    /**
     * Optional delegate: called after start() enumerates devices
     * @type {{ onDevicesChanged?: (devices: AudioDevice[], selectedId: string) => void }|null}
     */
    this.delegate = null;
  }

  /**
   * Load previously persisted device selection from storage.
   * @param {Object} storageManager
   * @returns {this}
   */
  loadDevice(storageManager) {
    this.selectedDeviceId =
      storageManager.get(STORAGE_KEY_DEVICE, "") || "";
    return this;
  }

  /**
   * Persist device selection to storage.
   * @param {Object} storageManager
   * @param {string} deviceId
   */
  saveDevice(storageManager, deviceId) {
    this.selectedDeviceId = deviceId;
    storageManager.set(STORAGE_KEY_DEVICE, deviceId);
  }

  /**
   * Acquire microphone access and create an AnalyserNode.
   * Returns the configured node for use by the detector's detect loop.
   *
   * @param {Object} [options]
   * @param {number} [options.fftSize=256]
   * @param {number} [options.smoothingTimeConstant=0]
   * @returns {Promise<AnalyserNode>}
   */
  async start({ fftSize = 256, smoothingTimeConstant = 0 } = {}) {
    if (!this.audioContext) {
      throw new Error("AudioInputSource: audioContext is not set");
    }

    // Stop any existing stream before acquiring a new one
    this._releaseStream();

    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };

    if (this.selectedDeviceId) {
      audioConstraints.deviceId = { exact: this.selectedDeviceId };
    }

    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false,
    });

    const source = this.audioContext.createMediaStreamSource(this._stream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = fftSize;
    this.analyserNode.smoothingTimeConstant = smoothingTimeConstant;
    source.connect(this.analyserNode);

    // Resolve the actual device that was granted
    const activeTrack = this._stream.getAudioTracks()[0];
    if (activeTrack?.getSettings) {
      const settings = activeTrack.getSettings();
      if (settings.deviceId) {
        this.selectedDeviceId = settings.deviceId;
      }
    }

    // Notify delegate with updated device list
    const devices = await this.getAvailableDevices();
    if (this.delegate?.onDevicesChanged) {
      this.delegate.onDevicesChanged(devices, this.selectedDeviceId);
    }

    return this.analyserNode;
  }

  /**
   * Stop the current stream and release the AnalyserNode.
   */
  stop() {
    this._releaseStream();
  }

  /**
   * Select a different input device by ID.
   * The change takes effect on the next call to start().
   * @param {string} deviceId
   */
  selectDevice(deviceId) {
    this.selectedDeviceId = deviceId;
  }

  /**
   * Enumerate available audio input devices.
   * @returns {Promise<AudioDevice[]>}
   */
  async getAvailableDevices() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }));
    } catch {
      return [];
    }
  }

  /** @private */
  _releaseStream() {
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
  }
}

export default AudioInputSource;
