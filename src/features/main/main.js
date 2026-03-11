import BaseComponent from "../component/base-component.js";
import { SessionStateContext } from "../base/session-state.js";
import { DetectorManagerContext } from "../microphone/detector-manager.js";
import { ChartServiceContext } from "../music/chart-service.js";
import { PerformanceServiceContext } from "../music/performance-service.js";
import { TimelineServiceContext } from "../music/timeline-service.js";
import { PlaybackServiceContext } from "../music/playback-service.js";
import AudioContextManager, {
  AudioContextServiceContext,
} from "../audio/audio-context-manager.js";

/** @typedef {import("../base/session-state.js").default} SessionState */
/** @typedef {import("../microphone/detector-manager.js").default} DetectorManager */
/** @typedef {import("../music/chart-service.js").default} ChartService */
/** @typedef {import("../music/performance-service.js").default} PerformanceService */
/** @typedef {import("../music/timeline-service.js").default} TimelineService */
/** @typedef {import("../music/playback-service.js").default} PlaybackService */

class MainComponent extends BaseComponent {
  constructor() {
    super();
    /** @type {SessionState|null} */
    this._sessionState = null;
    /** @type {DetectorManager|null} */
    this._detectorManager = null;
    /** @type {ChartService|null} */
    this._chartService = null;
    /** @type {PerformanceService|null} */
    this._performanceService = null;
    /** @type {TimelineService|null} */
    this._timelineService = null;
    /** @type {PlaybackService|null} */
    this._playbackService = null;
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
    this.provideContext(ChartServiceContext, () => this._chartService);
    this.provideContext(
      PerformanceServiceContext,
      () => this._performanceService,
    );
    this.provideContext(TimelineServiceContext, () => this._timelineService);
    this.provideContext(PlaybackServiceContext, () => this._playbackService);
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
   * @param {{
   *   sessionState: SessionState,
   *   detectorManager: DetectorManager,
   *   chartService?: ChartService,
   *   performanceService?: PerformanceService,
   *   timelineService?: TimelineService,
   *   playbackService?: PlaybackService
   * }} services
   */
  setServices({
    sessionState,
    detectorManager,
    chartService,
    performanceService,
    timelineService,
    playbackService,
  }) {
    this._sessionState = sessionState;
    this._detectorManager = detectorManager;
    if (chartService) this._chartService = chartService;
    if (performanceService) this._performanceService = performanceService;
    if (timelineService) this._timelineService = timelineService;
    if (playbackService) this._playbackService = playbackService;
    this.notifyContext(SessionStateContext);
    this.notifyContext(DetectorManagerContext);
    if (chartService) this.notifyContext(ChartServiceContext);
    if (performanceService) this.notifyContext(PerformanceServiceContext);
    if (timelineService) this.notifyContext(TimelineServiceContext);
    if (playbackService) this.notifyContext(PlaybackServiceContext);
  }
}

if (!customElements.get("tempo-trainer-main")) {
  customElements.define("tempo-trainer-main", MainComponent);
}

export default MainComponent;
