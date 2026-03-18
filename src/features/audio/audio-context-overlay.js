import BaseComponent from "../component/base-component.js";
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

  /**
   * Handler for activate button click
   * @param {Event} event
   * @param {HTMLElement} element
   */
  handleActivateClick(event, element) {
    void this._ensureAudioContext();
  }

  onMount() {
    this.createEffect(() => {
      const { state, error } = this._getView();
      const isReady = state?.kind === "ready" || state?.kind === "input-ready";
      this.dataset.ready = isReady ? "true" : "false";

      if (error) {
        this.refs.errorEl.textContent = error;
        return;
      }

      if (state?.kind === "fault") {
        this.refs.errorEl.textContent =
          "Microphone access is required to continue.";
        return;
      }
      if (state?.kind === "unavailable") {
        this.refs.errorEl.textContent = state.message;
        return;
      }
      this.refs.errorEl.textContent = "";
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
