import BaseComponent from "../component/base-component.js";
import { querySelector } from "../component/component-utils.js";
import { AudioContextServiceContext } from "./audio-context-manager.js";

export default class AudioContextOverlay extends BaseComponent {
  constructor() {
    super();
    [this._getView, this._setView] = this.createSignalState({
      state: null,
      error: "",
    });

    this._audioService = null;
    this._audioChangedCleanup = null;
  }

  getTemplateUrl() {
    return new URL("./audio-context-overlay.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./audio-context-overlay.css", import.meta.url).href;
  }

  onMount() {
    const activateButton = querySelector(this, "[data-audio-overlay-activate]");
    const errorEl = querySelector(this, "[data-audio-overlay-error]");

    this.createEffect(() => {
      const { state, error } = this._getView();
      const isReady = state?.kind === "ready" || state?.kind === "input-ready";
      this.dataset.ready = isReady ? "true" : "false";

      if (error) {
        errorEl.textContent = error;
        return;
      }

      if (state?.kind === "fault") {
        errorEl.textContent = "Microphone access is required to continue.";
        return;
      }
      if (state?.kind === "unavailable") {
        errorEl.textContent = state.message;
        return;
      }
      errorEl.textContent = "";
    });

    this.listen(activateButton, "click", () => {
      void this._ensureAudioContext();
    });

    this.consumeContext(AudioContextServiceContext, (service) => {
      if (this._audioChangedCleanup) {
        this._audioChangedCleanup();
        this._audioChangedCleanup = null;
      }

      this._audioService = service;
      this._setView({ state: service?.getSnapshot?.() ?? null, error: "" });

      if (!service) {
        return;
      }

      this._audioChangedCleanup = this.listen(service, "changed", () => {
        this._setView({ state: service.getSnapshot(), error: "" });
      });
    });
  }

  async _ensureAudioContext() {
    if (!this._audioService) {
      this._setView({ state: null, error: "Audio service is not ready yet." });
      return;
    }

    this._setView({ state: this._audioService.getSnapshot(), error: "" });
    try {
      await this._audioService.ensureContext();
      this._setView({ state: this._audioService.getSnapshot(), error: "" });
    } catch {
      this._setView({
        state: this._audioService.getSnapshot(),
        error: "Microphone access is required to continue.",
      });
    }
  }
}

if (!customElements.get("audio-context-overlay")) {
  customElements.define("audio-context-overlay", AudioContextOverlay);
}
