import StorageManager from "../base/storage-manager.js";
import { createContext } from "../component/context.js";

const STORAGE_KEY_DEVICE = "tempoTrainer.micDeviceId";

/** @typedef {{ deviceId: string, label: string }} AudioDevice */
/**
 * @typedef {{
 *   kind: "uninitialized",
 *   selectedDeviceId: string,
 *   availableDevices: AudioDevice[],
 *   context: null,
 *   analyserNode: null,
 * }} AudioHardwareUninitializedState
 */
/**
 * @typedef {{
 *   kind: "ready",
 *   selectedDeviceId: string,
 *   availableDevices: AudioDevice[],
 *   context: AudioContext,
 *   analyserNode: null,
 * }} AudioHardwareReadyState
 */
/**
 * @typedef {{
 *   kind: "input-ready",
 *   selectedDeviceId: string,
 *   availableDevices: AudioDevice[],
 *   context: AudioContext,
 *   analyserNode: AnalyserNode,
 * }} AudioHardwareInputReadyState
 */
/**
 * @typedef {{
 *   kind: "unavailable",
 *   code: string,
 *   message: string,
 *   selectedDeviceId: string,
 *   availableDevices: AudioDevice[],
 *   context: null,
 *   analyserNode: null,
 * }} AudioHardwareUnavailableState
 */
/**
 * @typedef {{
 *   kind: "fault",
 *   code: string,
 *   error: unknown,
 *   selectedDeviceId: string,
 *   availableDevices: AudioDevice[],
 *   context: AudioContext|null,
 *   analyserNode: null,
 * }} AudioHardwareFaultState
 */
/**
 * @typedef {
 *   | AudioHardwareUninitializedState
 *   | AudioHardwareReadyState
 *   | AudioHardwareInputReadyState
 *   | AudioHardwareUnavailableState
 *   | AudioHardwareFaultState
 * } AudioHardwareState
 */

/**
 * @type {import('../component/context.js').Context<AudioContextManager|null>}
 */
export const AudioContextServiceContext = createContext(
  "audio-context-service",
  null,
);

/**
 * Browser audio runtime owner.
 *
 * Owns:
 * - shared AudioContext lifecycle
 * - selected input device state
 * - available device inventory
 * - microphone stream + analyser lifetime
 *
 * Event contract:
 * - "ready": first shared AudioContext became available
 * - "changed": coarse state machine transition { state, previousState }
 * - "fault": async browser/runtime failure { code, error, state }
 */
class AudioContextManager extends EventTarget {
  /**
   * @param {{
   *   get(key: string, def?: string|null): string|null,
   *   set(key: string, value: unknown): boolean,
   * }|null} [storage]
   */
  constructor(storage = null) {
    super();
    this._storage = storage ?? {
      get: (key, def = null) => StorageManager.get(key, def),
      set: (key, value) => StorageManager.set(key, value),
    };

    /** @type {MediaStream|null} */
    this._stream = null;
    /** @type {MediaStreamAudioSourceNode|null} */
    this._sourceNode = null;
    /** @type {{ fftSize: number, smoothingTimeConstant: number }} */
    this._lastInputConfig = {
      fftSize: 256,
      smoothingTimeConstant: 0,
    };

    const selectedDeviceId = this._storage.get(STORAGE_KEY_DEVICE, "") || "";

    /** @type {AudioHardwareState} */
    this._state = {
      kind: "uninitialized",
      selectedDeviceId,
      availableDevices: [],
      context: null,
      analyserNode: null,
    };
  }

  /** @returns {AudioHardwareState} */
  getSnapshot() {
    return this._state;
  }

  /** @returns {AudioContext|null} */
  getContext() {
    return this._state.context;
  }

  /** @returns {AnalyserNode|null} */
  get analyserNode() {
    return this._state.analyserNode;
  }

  /** @returns {AudioContext|null} */
  get audioContext() {
    return this._state.context;
  }

  /** @returns {string} */
  get selectedDeviceId() {
    return this._state.selectedDeviceId;
  }

  /**
   * Ensure the shared AudioContext exists and is resumed.
   * @returns {Promise<AudioContext>}
   */
  async ensureContext() {
    const existingContext = this._state.context;
    if (existingContext) {
      if (existingContext.state === "suspended") {
        await existingContext.resume();
      }
      if (this._state.kind !== "ready" && this._state.kind !== "input-ready") {
        this._setState({
          kind: "ready",
          context: existingContext,
          analyserNode: null,
          availableDevices: this._state.availableDevices,
          selectedDeviceId: this._state.selectedDeviceId,
        });
      }
      return existingContext;
    }

    try {
      const webkitWindow =
        /** @type {Window & { webkitAudioContext?: typeof AudioContext }} */ (
          globalThis
        );
      const AudioContextClass =
        globalThis.AudioContext || webkitWindow.webkitAudioContext;

      if (!AudioContextClass) {
        this._setState({
          kind: "unavailable",
          code: "web-audio-unavailable",
          message: "Web Audio API not available",
          selectedDeviceId: this._state.selectedDeviceId,
          availableDevices: this._state.availableDevices,
          context: null,
          analyserNode: null,
        });
        throw new Error("Web Audio API not available");
      }

      const context = new AudioContextClass();
      this._setState({
        kind: "ready",
        context,
        analyserNode: null,
        availableDevices: this._state.availableDevices,
        selectedDeviceId: this._state.selectedDeviceId,
      });
      this.dispatchEvent(new CustomEvent("ready", { detail: { context } }));
      return context;
    } catch (error) {
      this._emitFault("audio-context-create-failed", error, null);
      throw new Error("Web Audio API not available");
    }
  }

  /** @returns {Promise<void>} */
  async resume() {
    const context = this.getContext();
    if (context && context.state === "suspended") {
      try {
        await context.resume();
        if (this._state.kind === "fault") {
          this._setState({
            kind: "ready",
            context,
            analyserNode: null,
            availableDevices: this._state.availableDevices,
            selectedDeviceId: this._state.selectedDeviceId,
          });
        }
      } catch (error) {
        this._emitFault("audio-context-resume-failed", error, context);
        throw error;
      }
    }
  }

  /**
   * Refresh browser device inventory.
   * @returns {Promise<AudioDevice[]>}
   */
  async getAvailableDevices() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        this._setAvailableDevices([]);
        return [];
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }));
      this._setAvailableDevices(audioDevices);
      return audioDevices;
    } catch (error) {
      this._emitFault("device-enumeration-failed", error, this.getContext());
      return [];
    }
  }

  /**
   * Update selected browser audio input device.
   * Reopens active input stream if one exists.
   * @param {string} deviceId
   * @returns {Promise<void>}
   */
  async selectDevice(deviceId) {
    if (deviceId === this._state.selectedDeviceId) return;

    this._storage.set(STORAGE_KEY_DEVICE, deviceId);
    this._setState({
      ...this._state,
      selectedDeviceId: deviceId,
    });

    if (this._state.kind === "input-ready") {
      await this.start(this._lastInputConfig);
    }
  }

  /**
   * Open the microphone input stream and expose an analyser node.
   * This preserves the old AudioInputSource contract for detector consumers.
   * @param {{ fftSize?: number, smoothingTimeConstant?: number }} [options]
   * @returns {Promise<AnalyserNode>}
   */
  async start({ fftSize = 256, smoothingTimeConstant = 0 } = {}) {
    this._lastInputConfig = { fftSize, smoothingTimeConstant };
    const context = await this.ensureContext();
    this._releaseInput();

    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };

    if (this._state.selectedDeviceId) {
      audioConstraints.deviceId = { exact: this._state.selectedDeviceId };
    }

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      this._sourceNode = context.createMediaStreamSource(this._stream);
      const analyserNode = context.createAnalyser();
      analyserNode.fftSize = fftSize;
      analyserNode.smoothingTimeConstant = smoothingTimeConstant;
      this._sourceNode.connect(analyserNode);

      const activeTrack = this._stream.getAudioTracks()[0];
      const settings = activeTrack?.getSettings?.();
      const selectedDeviceId =
        typeof settings?.deviceId === "string"
          ? settings.deviceId
          : this._state.selectedDeviceId;
      if (selectedDeviceId) {
        this._storage.set(STORAGE_KEY_DEVICE, selectedDeviceId);
      }

      const availableDevices = await this.getAvailableDevices();
      this._setState({
        kind: "input-ready",
        context,
        analyserNode,
        availableDevices,
        selectedDeviceId,
      });
      return analyserNode;
    } catch (error) {
      this._releaseInput();
      this._emitFault("input-open-failed", error, context);
      throw error;
    }
  }

  /**
   * Release the active microphone input stream while keeping the shared AudioContext.
   */
  stop() {
    const context = this.getContext();
    const availableDevices = this._state.availableDevices;
    const selectedDeviceId = this._state.selectedDeviceId;
    this._releaseInput();

    if (context) {
      this._setState({
        kind: "ready",
        context,
        analyserNode: null,
        availableDevices,
        selectedDeviceId,
      });
    }
  }

  /** @private */
  _releaseInput() {
    if (this._sourceNode) {
      this._sourceNode.disconnect();
      this._sourceNode = null;
    }
    if (this._state.analyserNode) {
      this._state.analyserNode.disconnect();
    }
    if (this._stream) {
      this._stream.getTracks().forEach((track) => track.stop());
      this._stream = null;
    }
  }

  /**
   * @param {AudioDevice[]} availableDevices
   * @private
   */
  _setAvailableDevices(availableDevices) {
    if (
      this._state.availableDevices.length === availableDevices.length &&
      this._state.availableDevices.every(
        (device, index) =>
          device.deviceId === availableDevices[index]?.deviceId &&
          device.label === availableDevices[index]?.label,
      )
    ) {
      return;
    }

    this._setState({
      ...this._state,
      availableDevices,
    });
  }

  /**
   * @param {AudioHardwareState} nextState
   * @private
   */
  _setState(nextState) {
    const previousState = this._state;
    this._state = nextState;
    this.dispatchEvent(
      new CustomEvent("changed", {
        detail: {
          state: nextState,
          previousState,
        },
      }),
    );
  }

  /**
   * @param {string} code
   * @param {unknown} error
   * @param {AudioContext|null} context
   * @private
   */
  _emitFault(code, error, context) {
    const faultState = {
      kind: "fault",
      code,
      error,
      context,
      analyserNode: null,
      selectedDeviceId: this._state.selectedDeviceId,
      availableDevices: this._state.availableDevices,
    };
    this._setState(faultState);
    this.dispatchEvent(
      new CustomEvent("fault", {
        detail: {
          code,
          error,
          state: faultState,
        },
      }),
    );
  }
}

export default AudioContextManager;
