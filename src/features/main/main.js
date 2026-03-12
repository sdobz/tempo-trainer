import BaseComponent from "../component/base-component.js";
import StorageManager from "../base/storage-manager.js";
import { DetectorManagerContext } from "../microphone/detector-manager.js";
import { ChartServiceContext } from "../music/chart-service.js";
import { PerformanceServiceContext } from "../music/performance-service.js";
import { TimelineServiceContext } from "../music/timeline-service.js";
import { PlaybackServiceContext } from "../music/playback-service.js";
import DetectorManager from "../microphone/detector-manager.js";
import ChartService from "../music/chart-service.js";
import PerformanceService from "../music/performance-service.js";
import TimelineService from "../music/timeline-service.js";
import PlaybackService from "../music/playback-service.js";
import Scorer from "../plan-play/scorer.js";
import PaneManager from "../base/pane-manager.js";
import AudioContextManager, {
  AudioContextServiceContext,
} from "../audio/audio-context-manager.js";

class MainComponent extends BaseComponent {
  constructor() {
    super();

    // Root composition: instantiate canonical services here.
    this._audioContextService = new AudioContextManager();

    this._timelineService = new TimelineService({
      tempo: 120,
      beatsPerMeasure: 4,
    });
    this._chartService = new ChartService();
    this._performanceService = new PerformanceService();
    this._playbackService = new PlaybackService();
    this._detectorManager = new DetectorManager(
      this._audioContextService,
      StorageManager,
    );

    // Runtime dependencies consumed by orchestrator.
    this._scorer = new Scorer(
      this._timelineService.beatsPerMeasure,
      this._timelineService.beatDuration,
    );
    this._scorer.setBeatDuration(this._timelineService.beatDuration);
    this._scorer.setBeatsPerMeasure(this._timelineService.beatsPerMeasure);
    this._detectorManager.setSessionBpm(this._timelineService.tempo);
    this._paneManager = new PaneManager();
  }

  getTemplateUrl() {
    return new URL("./main.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./main.css", import.meta.url).href;
  }

  onMount() {
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
      const ctx = this._audioContextService.getContext();
      if (ctx) {
        this._playbackService.audioContext = ctx;
        this._timelineService.setAudioContext(ctx);
      }
      this.notifyContext(AudioContextServiceContext);
    });

    this.listen(this._timelineService, "changed", (event) => {
      const { field, value } = /** @type {CustomEvent} */ (event).detail;
      if (field === "tempo") {
        const bpm = /** @type {number} */ (value);
        this._scorer.setBeatDuration(60.0 / bpm);
        this._detectorManager.setSessionBpm(bpm);
      }
      if (field === "beatsPerMeasure") {
        const n = /** @type {number} */ (value);
        this._scorer.setBeatsPerMeasure(n);
      }
    });
  }

  get audioContextService() {
    return this._audioContextService;
  }

  /**
   * Return orchestrator-facing runtime dependencies.
   */
  getRuntime() {
    return {
      detectorManager: this._detectorManager,
      chartService: this._chartService,
      performanceService: this._performanceService,
      timelineService: this._timelineService,
      playbackService: this._playbackService,
      scorer: this._scorer,
      paneManager: this._paneManager,
      audioContextService: this._audioContextService,
    };
  }
}

if (!customElements.get("tempo-trainer-main")) {
  customElements.define("tempo-trainer-main", MainComponent);
}

export default MainComponent;
