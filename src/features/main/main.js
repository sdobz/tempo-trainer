import BaseComponent from "../component/base-component.js";
import { SessionStateContext } from "../base/session-state.js";
import { DetectorManagerContext } from "../microphone/detector-manager.js";
import AudioContextManager, {
  AudioContextServiceContext,
} from "../audio/audio-context-manager.js";

/** @typedef {import("../base/session-state.js").default} SessionState */
/** @typedef {import("../microphone/detector-manager.js").default} DetectorManager */

class MainComponent extends BaseComponent {
  constructor() {
    super();
    /** @type {SessionState|null} */
    this._sessionState = null;
    /** @type {DetectorManager|null} */
    this._detectorManager = null;
    this._audioContextService = new AudioContextManager();
  }

  getTemplateUrl() {
    return new URL("./main.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./main.css", import.meta.url).href;
  }

  onMount() {
    this.provideContext(SessionStateContext, () => this._sessionState);
    this.provideContext(DetectorManagerContext, () => this._detectorManager);
    this.provideContext(
      AudioContextServiceContext,
      () => this._audioContextService,
    );

    this.listen(this._audioContextService, "ready", () => {
      this.notifyContext(AudioContextServiceContext);
    });
  }

  get audioContextService() {
    return this._audioContextService;
  }

  /**
   * @param {{ sessionState: SessionState, detectorManager: DetectorManager }} services
   */
  setServices({ sessionState, detectorManager }) {
    this._sessionState = sessionState;
    this._detectorManager = detectorManager;
    this.notifyContext(SessionStateContext);
    this.notifyContext(DetectorManagerContext);
  }
}

if (!customElements.get("tempo-trainer-main")) {
  customElements.define("tempo-trainer-main", MainComponent);
}

export default MainComponent;
