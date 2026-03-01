// Microphone-based hit detection
class MicrophoneDetector {
  constructor(audioContext, elements) {
    this.audioContext = audioContext;
    this.elements = elements; // { level, levelBar, peakHold, thresholdLine, thresholdLabel, hitsList, select }

    // Configuration
    this.hitCooldown = 100; // ms
    this.maxVisibleHits = 6;
    this.peakHoldMs = 180;
    this.peakFallPerSecond = 140;
    this.storageKeys = {
      threshold: "tempoTrainer.hitThreshold",
      device: "tempoTrainer.micDeviceId",
    };

    // State
    this.isRunning = false;
    this.stream = null;
    this.analyserNode = null;
    this.dataArray = null;
    this.lastHitTime = 0;
    this.rafId = null;
    this.threshold = 52;
    this.isAdjustingThreshold = false;
    this.peakHoldValue = 0;
    this.peakHoldUntil = 0;
    this.lastDetectTime = 0;
    this.selectedDeviceId = "";

    // Callbacks
    this.onHitCallback = null;

    this._loadSettings();
    this._setupEventListeners();
  }

  onHit(callback) {
    this.onHitCallback = callback;
  }

  _loadSettings() {
    this.threshold = StorageManager.getInt(this.storageKeys.threshold, 52);
    this.threshold = Math.max(0, Math.min(128, this.threshold));

    this.selectedDeviceId = StorageManager.get(this.storageKeys.device, "");

    this._updateThresholdUI();
  }

  _setupEventListeners() {
    if (this.elements.level) {
      this.elements.level.addEventListener("pointerdown", (event) => {
        this.isAdjustingThreshold = true;
        this._setThresholdFromPointer(event.clientX);
        if (this.elements.level.setPointerCapture) {
          this.elements.level.setPointerCapture(event.pointerId);
        }
      });

      this.elements.level.addEventListener("pointermove", (event) => {
        if (!this.isAdjustingThreshold) return;
        this._setThresholdFromPointer(event.clientX);
      });

      window.addEventListener("pointerup", () => {
        this.isAdjustingThreshold = false;
      });
    }

    if (this.elements.select) {
      this.elements.select.addEventListener("change", () => {
        this._onDeviceSelectionChanged();
      });
    }
  }

  async start() {
    try {
      this._stopCurrentStream();

      const audioConstraints = this.selectedDeviceId
        ? { deviceId: { exact: this.selectedDeviceId } }
        : true;

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      this.isRunning = true;
      if (this.elements.hitsList) {
        this.elements.hitsList.innerHTML = "";
      }

      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0;

      this.dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

      source.connect(this.analyserNode);

      await this.populateDevices();
      const activeTrack = this.stream.getAudioTracks()[0];
      if (activeTrack && activeTrack.getSettings) {
        const settings = activeTrack.getSettings();
        if (settings.deviceId) {
          this.selectedDeviceId = settings.deviceId;
          if (this.elements.select) {
            this.elements.select.value = this.selectedDeviceId;
          }
          StorageManager.set(this.storageKeys.device, this.selectedDeviceId);
        }
      }

      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => this._detectLoop());
      }

      return true;
    } catch (err) {
      if (this.elements.hitsList) {
        this.elements.hitsList.textContent = `Mic unavailable: ${err.message}`;
      }
      return false;
    }
  }

  stop() {
    this._stopCurrentStream();
    this.isRunning = false;

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

  async populateDevices() {
    if (!this.elements.select || !navigator.mediaDevices?.enumerateDevices)
      return;

    let devices;
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch (_err) {
      return;
    }

    const inputDevices = devices.filter(
      (device) => device.kind === "audioinput",
    );
    const previousValue = this.elements.select.value;
    this.elements.select.innerHTML = "";

    if (inputDevices.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No microphone found";
      this.elements.select.appendChild(option);
      this.elements.select.disabled = true;
      return;
    }

    this.elements.select.disabled = false;
    inputDevices.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${index + 1}`;
      this.elements.select.appendChild(option);
    });

    const candidateId =
      this.selectedDeviceId || previousValue || inputDevices[0].deviceId;
    const exists = inputDevices.some(
      (device) => device.deviceId === candidateId,
    );
    this.elements.select.value = exists
      ? candidateId
      : inputDevices[0].deviceId;
    this.selectedDeviceId = this.elements.select.value;
    StorageManager.set(this.storageKeys.device, this.selectedDeviceId);
  }

  async _onDeviceSelectionChanged() {
    if (!this.elements.select) return;
    this.selectedDeviceId = this.elements.select.value;
    StorageManager.set(this.storageKeys.device, this.selectedDeviceId);

    if (this.isRunning) {
      await this.start();
    }
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

    // Update level bar
    if (this.elements.levelBar) {
      const micLevelPercent = (maxVal / 128) * 100;
      this.elements.levelBar.style.width = `${micLevelPercent}%`;
    }

    // Update peak hold
    if (maxVal >= this.peakHoldValue) {
      this.peakHoldValue = maxVal;
      this.peakHoldUntil = now + this.peakHoldMs;
    } else if (now > this.peakHoldUntil) {
      this.peakHoldValue = Math.max(
        maxVal,
        this.peakHoldValue - this.peakFallPerSecond * deltaSeconds,
      );
    }

    if (this.elements.peakHold) {
      this.elements.peakHold.style.left = `${(this.peakHoldValue / 128) * 100}%`;
    }

    // Update threshold indicator
    if (this.elements.level) {
      this.elements.level.classList.toggle(
        "over-threshold",
        maxVal >= this.threshold,
      );
    }

    // Detect hit
    if (maxVal >= this.threshold && now - this.lastHitTime > this.hitCooldown) {
      this.lastHitTime = now;
      this._handleHit();
    }

    this.rafId = requestAnimationFrame(() => this._detectLoop());
  }

  _handleHit() {
    // Visual feedback
    if (this.elements.hitsList) {
      const hitElement = document.createElement("div");
      hitElement.className = "hit-entry";
      hitElement.setAttribute("aria-label", "Hit detected");
      hitElement.title = "Hit detected";
      this.elements.hitsList.appendChild(hitElement);

      while (this.elements.hitsList.children.length > this.maxVisibleHits) {
        this.elements.hitsList.removeChild(
          this.elements.hitsList.firstElementChild,
        );
      }

      setTimeout(() => {
        hitElement.remove();
      }, 2400);
    }

    // Callback
    if (this.onHitCallback) {
      this.onHitCallback(this.audioContext.currentTime);
    }
  }

  _updateThresholdUI() {
    if (this.elements.thresholdLine) {
      const thresholdPercent = (this.threshold / 128) * 100;
      this.elements.thresholdLine.style.left = `${thresholdPercent}%`;
    }

    if (this.elements.thresholdLabel) {
      this.elements.thresholdLabel.textContent = `Threshold: ${this.threshold}`;
    }
  }

  _setThresholdFromPointer(clientX) {
    if (!this.elements.level) return;

    const rect = this.elements.level.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    this.threshold = Math.round(ratio * 128);
    StorageManager.set(this.storageKeys.threshold, this.threshold);
    this._updateThresholdUI();
  }
}
