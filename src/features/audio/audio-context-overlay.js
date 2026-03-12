import BaseComponent from "../component/base-component.js";
import { querySelector } from "../component/component-utils.js";
import { AudioContextServiceContext } from "./audio-context-manager.js";

export default class AudioContextOverlay extends BaseComponent {
  getTemplateUrl() {
    return new URL("./audio-context-overlay.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./audio-context-overlay.css", import.meta.url).href;
  }

  onMount() {
    const activateButton = querySelector(this, "[data-audio-overlay-activate]");
    const errorEl = querySelector(this, "[data-audio-overlay-error]");

    /** @type {import("./audio-context-manager.js").default|null} */
    let audioService = null;

    const render = () => {
      const state = audioService?.getSnapshot?.();
      const isReady = state?.kind === "ready" || state?.kind === "input-ready";
      this.dataset.ready = isReady ? "true" : "false";
      if (state?.kind === "fault") {
        errorEl.textContent = "Microphone access is required to continue.";
        return;
      }
      if (state?.kind === "unavailable") {
        errorEl.textContent = state.message;
        return;
      }
      if (isReady) {
        errorEl.textContent = "";
      }
    };

    const ensureAudioContext = async () => {
      if (!audioService) {
        this.dataset.ready = "false";
        errorEl.textContent = "Audio service is not ready yet.";
        return;
      }

      errorEl.textContent = "";
      try {
        await audioService.ensureContext();
        render();
      } catch {
        this.dataset.ready = "false";
        errorEl.textContent = "Microphone access is required to continue.";
      }
    };

    this.listen(activateButton, "click", () => {
      void ensureAudioContext();
    });

    this.consumeContext(AudioContextServiceContext, (service) => {
      audioService = service;
      audioService?.addEventListener?.("changed", render);
      render();
    });

    render();
  }
}

if (!customElements.get("audio-context-overlay")) {
  customElements.define("audio-context-overlay", AudioContextOverlay);
}
