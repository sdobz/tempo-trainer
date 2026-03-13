import BaseComponent from "../component/base-component.js";
import { DetectorManagerContext } from "./detector-manager.js";
import { querySelector } from "../component/component-utils.js";
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

    this.statusIndicator = null;
    this.select = null;
    this.level = null;
    this.levelBar = null;
    this.peakHold = null;
    this.sensitivityLine = null;
    this.sensitivityLabel = null;

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
    this.statusIndicator = querySelector(
      this,
      "[data-microphone-status-indicator]",
    );
    this.select = querySelector(this, "[data-microphone-select]");
    this.level = querySelector(this, "[data-microphone-level]");
    this.levelBar = querySelector(this, "[data-microphone-level-bar]");
    this.peakHold = querySelector(this, "[data-microphone-peak-hold]");
    this.sensitivityLine = querySelector(
      this,
      "[data-microphone-threshold-line]",
    );
    this.sensitivityLabel = querySelector(
      this,
      "[data-microphone-threshold-label]",
    );

    this.createEffect(() => {
      this.levelBar.style.width = `${Math.round(this._getLevel() * 1000) / 10}%`;
    });

    this.createEffect(() => {
      this.peakHold.style.left = `${Math.round(this._getPeak() * 1000) / 10}%`;
    });

    this.createEffect(() => {
      const pos = this._getSensitivity();
      this.sensitivityLine.style.left = `${Math.round((1 - pos) * 1000) / 10}%`;
      this.sensitivityLabel.textContent = `Sensitivity: ${Math.round(pos * 100)}%`;
    });

    this.createEffect(() => {
      const isConfigured = this._getIsConfigured();
      if (isConfigured) {
        this.statusIndicator.textContent = "✓ Configured";
        this.statusIndicator.classList.add("complete");
      } else {
        this.statusIndicator.textContent = "⚠️ Not configured";
        this.statusIndicator.classList.remove("complete");
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
      this._setupUIEventListeners(dm);
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

  _setupUIEventListeners(detectorManager) {
    this.listen(this.level, "pointerdown", (e) =>
      this._onSensitivityPointerDown(e, detectorManager),
    );
    this.listen(this.level, "pointermove", (e) =>
      this._onSensitivityPointerMove(e, detectorManager),
    );
    this.listen(window, "pointerup", () => {
      this._isAdjustingSensitivity = false;
    });
    this.listen(this.select, "change", () =>
      this._onDeviceSelected(detectorManager),
    );
  }

  _renderHardwareState(state) {
    this._setDevices(state.availableDevices ?? []);
    this._setSelectedDeviceId(state.selectedDeviceId ?? "");
  }

  _renderDeviceOptions(devices, selectedDeviceId) {
    this.select.innerHTML = "";
    if (devices.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No microphone found";
      this.select.appendChild(option);
      this.select.disabled = true;
      return;
    }
    this.select.disabled = false;
    devices.forEach((device) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label;
      this.select.appendChild(option);
    });
    this.select.value = selectedDeviceId || devices[0]?.deviceId || "";
  }

  _onDeviceSelected(_detectorManager) {
    const deviceId = this.select.value;
    if (deviceId) {
      void this._audioService?.selectDevice(deviceId);
    }
  }

  _onSensitivityPointerDown(event, detectorManager) {
    this._isAdjustingSensitivity = true;
    this._setSensitivityFromPointer(event.clientX, detectorManager);
    this.level.setPointerCapture?.(event.pointerId);
  }

  _onSensitivityPointerMove(event, detectorManager) {
    if (!this._isAdjustingSensitivity) return;
    this._setSensitivityFromPointer(event.clientX, detectorManager);
  }

  _setSensitivityFromPointer(clientX, detectorManager) {
    const rect = this.level.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    detectorManager.setSensitivity(1 - ratio);
  }
}

if (!customElements.get("microphone-control")) {
  customElements.define("microphone-control", MicrophoneControl);
}
