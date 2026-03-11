import BaseComponent from "../component/base-component.js";
import StorageManager from "../base/storage-manager.js";
import { SessionStateContext } from "../base/session-state.js";
import { DetectorManagerContext } from "../microphone/detector-manager.js";
import { ChartServiceContext } from "../music/chart-service.js";
import { PerformanceServiceContext } from "../music/performance-service.js";
import { TimelineServiceContext } from "../music/timeline-service.js";
import { PlaybackServiceContext } from "../music/playback-service.js";
import SessionState from "../base/session-state.js";
import DetectorManager from "../microphone/detector-manager.js";
import ChartService from "../music/chart-service.js";
import PerformanceService from "../music/performance-service.js";
import TimelineService from "../music/timeline-service.js";
import PlaybackService from "../music/playback-service.js";
import Metronome from "../plan-play/metronome.js";
import Scorer from "../plan-play/scorer.js";
import PracticeSessionManager from "../plan-history/practice-session-manager.js";
import PlanLibrary from "../plan-edit/plan-library.js";
import PaneManager from "../base/pane-manager.js";
import AudioContextManager, {
  AudioContextServiceContext,
} from "../audio/audio-context-manager.js";

class MainComponent extends BaseComponent {
  constructor() {
    super();

    // Root composition: instantiate canonical services here.
    this._audioContextService = new AudioContextManager();

    this._sessionState = new SessionState();
    this._timelineService = new TimelineService({
      tempo: this._sessionState.bpm,
      beatsPerMeasure: this._sessionState.beatsPerMeasure,
    });
    this._chartService = new ChartService();
    this._performanceService = new PerformanceService();
    this._playbackService = new PlaybackService();
    this._detectorManager = new DetectorManager(StorageManager);
    this._detectorManager.setSessionBpm(this._timelineService.tempo);

    // Runtime dependencies consumed by orchestrator.
    this._planLibrary = new PlanLibrary();
    this._metronome = new Metronome(
      /** @type {AudioContext} */ (/** @type {unknown} */ (null)),
      this._playbackService,
    );
    this._calibrationMetronome = new Metronome(
      /** @type {AudioContext} */ (/** @type {unknown} */ (null)),
      this._playbackService,
    );
    this._scorer = new Scorer(4, 0.5);
    this._practiceSessionManager = new PracticeSessionManager();
    this._paneManager = new PaneManager();
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
   * Return orchestrator-facing runtime dependencies.
   */
  getRuntime() {
    return {
      sessionState: this._sessionState,
      detectorManager: this._detectorManager,
      chartService: this._chartService,
      performanceService: this._performanceService,
      timelineService: this._timelineService,
      playbackService: this._playbackService,
      planLibrary: this._planLibrary,
      metronome: this._metronome,
      calibrationMetronome: this._calibrationMetronome,
      scorer: this._scorer,
      practiceSessionManager: this._practiceSessionManager,
      paneManager: this._paneManager,
      audioContextService: this._audioContextService,
    };
  }

  /**
   * [Compat] Allow external overrides for selected services during migration.
   * @param {Partial<ReturnType<MainComponent['getRuntime']>>} services
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
