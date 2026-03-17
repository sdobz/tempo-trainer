import BaseComponent from "../component/base-component.js";
import { dispatchEvent, querySelector } from "../component/component-utils.js";
import { PlaybackState, PlaybackContext } from "./playback-state.js";
import { TimelineServiceContext } from "../music/timeline-service.js";
import "../visualizers/timeline-visualization.js";
import "../visualizers/plan-visualizer.js";
import "../base/app-notification.js";

export default class PlanPlayPane extends BaseComponent {
  constructor() {
    super();

    [this._getBpm, this._setBpm] = this.createSignalState(120);
    [this._getTimeSignature, this._setTimeSignature] =
      this.createSignalState("4/4");
    [this._getBeat, this._setBeat] = this.createSignalState(null);
    [this._getStatus, this._setStatus] = this.createSignalState("Ready.");
    [this._getOverallScore, this._setOverallScore] = this.createSignalState(0);
    [this._getIsPlaying, this._setIsPlaying] = this.createSignalState(false);

    this._subscriptionCleanups = [];
    this._playbackState = new PlaybackState();
    this._timelineService = null;

    this.timelineViz = null;
    this.bpmInput = null;
    this.timeSignatureSelect = null;
    this.beatIndicator = null;
    this.statusDiv = null;
    this.startBtn = null;
    this.stopBtn = null;
    this.overallScoreDisplay = null;
    this.viewResultsBtn = null;
    this.calibrationWarning = null;

    this.setBPM = this._setBpm;
    this.setTimeSignature = this._setTimeSignature;
    this.setPlaying = this._setIsPlaying;
  }

  getTemplateUrl() {
    return new URL("./plan-play-pane.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./plan-play-pane.css", import.meta.url).href;
  }

  onMount() {
    // TODO:
    this.bpmInput = querySelector(this, "[data-bpm-input]");
    this.timeSignatureSelect = querySelector(
      this,
      "[data-time-signature-select]",
    );
    this.beatIndicator = querySelector(this, "[data-beat-indicator]");
    this.statusDiv = querySelector(this, "[data-status]");
    this.startBtn = querySelector(this, "[data-start-btn]");
    this.stopBtn = querySelector(this, "[data-stop-btn]");
    this.overallScoreDisplay = querySelector(this, "[data-overall-score]");
    this.viewResultsBtn = querySelector(this, "[data-view-results-btn]");
    this.calibrationWarning = querySelector(this, "[data-calibration-warning]");
    this.timelineViz = this.querySelector("timeline-visualization");

    this.provideContext(PlaybackContext, () => this._playbackState);

    this.createEffect(() => {
      this.bpmInput.value = String(this._getBpm());
    });

    this.createEffect(() => {
      this.timeSignatureSelect.value = this._getTimeSignature();
    });

    this.createEffect(() => {
      const beat = this._getBeat();
      this.beatIndicator.className = "beat-indicator";
      if (!beat) {
        this.beatIndicator.textContent = "";
        return;
      }

      this.beatIndicator.textContent = String(beat.beatNum);
      if (beat.shouldShow) {
        this.beatIndicator.classList.add(
          beat.isDownbeat ? "downbeat" : "active",
        );
      }
    });

    this.createEffect(() => {
      this.statusDiv.textContent = this._getStatus();
    });

    this.createEffect(() => {
      const formattedScore = String(
        Math.round(this._getOverallScore()),
      ).padStart(2, "00");
      this.overallScoreDisplay.textContent = `Overall Score: ${formattedScore}`;
    });

    this.createEffect(() => {
      const isPlaying = this._getIsPlaying();
      this.startBtn.disabled = isPlaying;
      this.stopBtn.disabled = !isPlaying;
    });

    this._subscriptionCleanups.push(
      this._playbackState.subscribe((state) => {
        this._setBeat(state.beat);
        this._setStatus(state.status);
        this._setOverallScore(state.overallScore);
        this._setIsPlaying(state.isPlaying);
      }),
    );

    this.consumeContext(TimelineServiceContext, (timelineService) => {
      this._timelineService = timelineService;
      const snapshot = timelineService.getSnapshot();
      this._setBpm(snapshot.tempo);
      this._setTimeSignature(`${snapshot.beatsPerMeasure}/4`);

      const onTimelineChanged = (
        /** @type {CustomEvent<{field: string, value: unknown}>} */ event,
      ) => {
        if (event.detail.field === "tempo") {
          this._setBpm(/** @type {number} */ (event.detail.value));
        }
        if (event.detail.field === "beatsPerMeasure") {
          this._setTimeSignature(
            `${/** @type {number} */ (event.detail.value)}/4`,
          );
        }
      };

      timelineService.addEventListener("changed", onTimelineChanged);
      this._subscriptionCleanups.push(() => {
        timelineService.removeEventListener("changed", onTimelineChanged);
      });
    });

    this.listen(this.bpmInput, "input", () => {
      const bpm = parseInt(this.bpmInput.value, 10);
      if (!isNaN(bpm) && this._timelineService) {
        this._timelineService.setTempo(bpm);
      }
    });
    this.listen(this.timeSignatureSelect, "change", () => {
      const beatsPerMeasure = parseInt(
        this.timeSignatureSelect.value.split("/")[0],
        10,
      );
      if (!isNaN(beatsPerMeasure) && this._timelineService) {
        this._timelineService.setBeatsPerMeasure(beatsPerMeasure);
      }
    });

    this.listen(this.startBtn, "click", () => this._onStart());
    this.listen(this.stopBtn, "click", () => this._onStop());
    this.listen(this.viewResultsBtn, "click", () => this._onViewResults());
    this.listen(this.calibrationWarning, "notification-action", () =>
      this._onCalibrationWarningAction(),
    );
  }

  // todo: subscription cleanup boilerplate, eliminate through base class or context
  onUnmount() {
    this._subscriptionCleanups.forEach((cleanup) => cleanup());
    this._subscriptionCleanups = [];
  }

  getBPM() {
    return parseInt(this.bpmInput.value, 10);
  }

  getBeatsPerMeasure() {
    return parseInt(this.timeSignatureSelect.value.split("/")[0], 10);
  }

  get playbackState() {
    return this._playbackState;
  }

  // TODO: never called?
  setStartDisabled(disabled) {
    this.startBtn.disabled = disabled;
  }

  setStopDisabled(disabled) {
    this.stopBtn.disabled = disabled;
  }

  reset() {
    this._playbackState.update({
      beat: null,
      status: "Ready.",
      scores: [],
      overallScore: 0,
      highlight: -1,
      isPlaying: false,
    });

    // TODO: Eliminate guards if type system can guarantee timelineViz is always present when this is called
    if (this.timelineViz) {
      if (typeof this.timelineViz.clearDetections === "function") {
        this.timelineViz.clearDetections();
      }
      if (typeof this.timelineViz.centerAt === "function") {
        this.timelineViz.centerAt(0);
      }
    }
  }

  setCalibrationWarningVisible(shouldShow) {
    if (!this.calibrationWarning) return;

    if (shouldShow) {
      this.calibrationWarning.show({
        type: "warning",
        message:
          "Microphone offset is not calibrated. Timing feedback may be inaccurate.",
        actionLabel: "Calibrate Now",
        actionDetail: { pane: "onboarding", params: { target: "calibration" } },
      });
      return;
    }

    this.calibrationWarning.hide();
  }

  _onStart() {
    dispatchEvent(this, "session-start", {
      bpm: this.getBPM(),
      beatsPerMeasure: this.getBeatsPerMeasure(),
    });
  }

  _onStop() {
    dispatchEvent(this, "session-stop", {});
  }

  _onViewResults() {
    dispatchEvent(this, "navigate", { pane: "plan-history" });
  }

  _onCalibrationWarningAction() {
    dispatchEvent(this, "navigate", {
      pane: "onboarding",
      params: { target: "calibration" },
    });
  }
}

customElements.define("plan-play-pane", PlanPlayPane);
