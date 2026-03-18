import BaseComponent from "../component/base-component.js";
import { DetectorManagerContext } from "./detector-manager.js";
import { AudioContextServiceContext } from "../audio/audio-context-manager.js";

export default class MicrophoneControl extends BaseComponent {
  constructor() {
    super();
    [this._getIsConfigured, this._setIsConfigured] =
      this.createSignalState(false);
    [this._getLevel, this._setLevel] = this.createSignalState(0);
    [this._getPeak, this._setPeak] = this.createSignalState(0);
    [this._getSensitivity, this._setSensitivity] = this.createSignalState(0.46);
    [this._getDevices, this._setDevices] = this.createSignalState([]);
    [this._getSelectedDeviceId, this._setSelectedDeviceId] =
      this.createSignalState("");

    // Delegate contract from DetectorManager maps directly to signal setters.
    this.onLevelChanged = this._setLevel;
    this.onPeakChanged = this._setPeak;
    this.onThresholdChanged = this._setSensitivity;
    this.updateStatus = this._setIsConfigured;
    this.onHit = () => {};

    this._isAdjustingSensitivity = false;
    this._detectorManager = null;
    this._audioService = null;
    this._audioChangedCleanup = null;
  }

  getTemplateUrl() {
    return new URL("./microphone-control.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./microphone-control.css", import.meta.url).href;
  }

  async onMount() {
    this.createEffect(() => {
      this.refs.levelBar.style.width = `${Math.round(this._getLevel() * 1000) / 10}%`;
    });

    this.createEffect(() => {
      this.refs.peakHold.style.left = `${Math.round(this._getPeak() * 1000) / 10}%`;
    });

    this.createEffect(() => {
      const pos = this._getSensitivity();
      this.refs.sensitivityLine.style.left = `${Math.round((1 - pos) * 1000) / 10}%`;
      this.refs.sensitivityLabel.textContent = `Sensitivity: ${Math.round(pos * 100)}%`;
    });

    this.createEffect(() => {
      const isConfigured = this._getIsConfigured();
      if (isConfigured) {
        this.refs.statusIndicator.textContent = "✓ Configured";
        this.refs.statusIndicator.classList.add("complete");
      } else {
        this.refs.statusIndicator.textContent = "⚠️ Not configured";
        this.refs.statusIndicator.classList.remove("complete");
      }
    });

    this.createEffect(() => {
      this._renderDeviceOptions(
        this._getDevices(),
        this._getSelectedDeviceId(),
      );
    });

    this.consumeContext(DetectorManagerContext, (dm) => {
      this._detectorManager = dm;
      dm.setDelegate(this);
      // Window-level pointerup cleanup handled via this.listen()
      this.listen(window, "pointerup", () => {
        this._isAdjustingSensitivity = false;
      });
    });

    this.consumeContext(AudioContextServiceContext, (audioService) => {
      if (this._audioChangedCleanup) {
        this._audioChangedCleanup();
        this._audioChangedCleanup = null;
      }

      this._audioService = audioService;
      if (!audioService) {
        this._setDevices([]);
        this._setSelectedDeviceId("");
        return;
      }

      const onChanged = () =>
        this._renderHardwareState(audioService.getSnapshot());
      audioService.addEventListener("changed", onChanged);
      this._audioChangedCleanup = () => {
        audioService.removeEventListener("changed", onChanged);
      };

      this._renderHardwareState(audioService.getSnapshot());
      void audioService.getAvailableDevices();
    });
  }

  onUnmount() {
    if (this._detectorManager) {
      this._detectorManager.setDelegate(null);
    }
    if (this._audioChangedCleanup) {
      this._audioChangedCleanup();
      this._audioChangedCleanup = null;
    }
  }



  _renderHardwareState(state) {
    this._setDevices(state.availableDevices ?? []);
    this._setSelectedDeviceId(state.selectedDeviceId ?? "");
  }

  _renderDeviceOptions(devices, selectedDeviceId) {
    this.refs.select.innerHTML = "";
    if (devices.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No microphone found";
      this.refs.select.appendChild(option);
      this.refs.select.disabled = true;
      return;
    }
    this.refs.select.disabled = false;
    devices.forEach((device) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label;
      this.refs.select.appendChild(option);
    });
    this.refs.select.value = selectedDeviceId || devices[0]?.deviceId || "";
  }

  handleDeviceSelected(event, element) {
    const deviceId = this.refs.select.value;
    if (deviceId) {
      void this._audioService?.selectDevice(deviceId);
    }
  }

  handleSensitivityPointerDown(event, element) {
    this._isAdjustingSensitivity = true;
    this._setSensitivityFromPointer(event.clientX);
    this.refs.level.setPointerCapture?.(event.pointerId);
  }

  handleSensitivityPointerMove(event, element) {
    if (!this._isAdjustingSensitivity) return;
    this._setSensitivityFromPointer(event.clientX);
  }

  _setSensitivityFromPointer(clientX) {
    if (!this._detectorManager) return;
    const rect = this.refs.level.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    this._detectorManager.setSensitivity(1 - ratio);
  }
}

if (!customElements.get("microphone-control")) {
  customElements.define("microphone-control", MicrophoneControl);
}
