import BaseComponent from "../component/base-component.js";
import { querySelector } from "../component/component-utils.js";
import { AudioContextServiceContext } from "./audio-context-manager.js";

export default class AudioContextOverlay extends BaseComponent {
	constructor() {
		super();
		this.dom = {};
		this._audioService = null;
	}

	getTemplateUrl() {
		return new URL("./audio-context-overlay.html", import.meta.url).href;
	}

	getStyleUrl() {
		return new URL("./audio-context-overlay.css", import.meta.url).href;
	}

	onMount() {
		this.dom.activateButton = querySelector(
			this,
			"[data-audio-overlay-activate]",
		);
		this.dom.error = querySelector(this, "[data-audio-overlay-error]");

		this.listen(this.dom.activateButton, "click", () => {
			void this._ensureAudioContext();
		});

		this.consumeContext(AudioContextServiceContext, (service) => {
			this._audioService = service;
			this._syncFromService();
		});
	}

	async _ensureAudioContext() {
		if (!this._audioService) return;
		this.dom.error.textContent = "";
		try {
			await this._audioService.ensureContext();
			this._syncFromService();
		} catch {
			this.dataset.ready = "false";
			this.dom.error.textContent =
				"Microphone access is required to continue.";
		}
	}

	_syncFromService() {
		const hasContext = Boolean(this._audioService?.getContext?.());
		this.dataset.ready = hasContext ? "true" : "false";
		if (hasContext) {
			this.dom.error.textContent = "";
		}
	}
}

if (!customElements.get("audio-context-overlay")) {
	customElements.define("audio-context-overlay", AudioContextOverlay);
}
