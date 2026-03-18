import BaseComponent from "../component/base-component.js";
import { dispatchEvent } from "../component/component-utils.js";
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
    this.timelineViz = this.refs.timelineViz;
    this.provideContext(PlaybackContext, () => this._playbackState);

    this.createEffect(() => {
      this.refs.bpmInput.value = String(this._getBpm());
    });

    this.createEffect(() => {
      this.refs.timeSignatureSelect.value = this._getTimeSignature();
    });

    this.createEffect(() => {
      const beat = this._getBeat();
      this.refs.beatIndicator.className = "beat-indicator";
      if (!beat) {
        this.refs.beatIndicator.textContent = "";
        return;
      }

      this.refs.beatIndicator.textContent = String(beat.beatNum);
      if (beat.shouldShow) {
        this.refs.beatIndicator.classList.add(
          beat.isDownbeat ? "downbeat" : "active",
        );
      }
    });

    this.createEffect(() => {
      this.refs.statusDiv.textContent = this._getStatus();
    });

    this.createEffect(() => {
      const formattedScore = String(
        Math.round(this._getOverallScore()),
      ).padStart(2, "00");
      this.refs.overallScoreDisplay.textContent = `Overall Score: ${formattedScore}`;
    });

    this.createEffect(() => {
      const isPlaying = this._getIsPlaying();
      this.refs.startBtn.disabled = isPlaying;
      this.refs.stopBtn.disabled = !isPlaying;
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
  }

  /**
   * Handle BPM input change
   * @param {Event} event
   * @param {HTMLElement} element
   */
  handleBpmInput(event, element) {
    const bpm = parseInt(this.refs.bpmInput.value, 10);
    if (!isNaN(bpm) && this._timelineService) {
      this._timelineService.setTempo(bpm);
    }
  }

  /**
   * Handle time signature selection change
   * @param {Event} event
   * @param {HTMLElement} element
   */
  handleTimeSignatureChange(event, element) {
    const beatsPerMeasure = parseInt(
      this.refs.timeSignatureSelect.value.split("/")[0],
      10,
    );
    if (!isNaN(beatsPerMeasure) && this._timelineService) {
      this._timelineService.setBeatsPerMeasure(beatsPerMeasure);
    }
  }

  // todo: subscription cleanup boilerplate, eliminate through base class or context
  onUnmount() {
    this._subscriptionCleanups.forEach((cleanup) => cleanup());
    this._subscriptionCleanups = [];
  }

  getBPM() {
    return parseInt(this.refs.bpmInput.value, 10);
  }

  getBeatsPerMeasure() {
    return parseInt(this.refs.timeSignatureSelect.value.split("/")[0], 10);
  }

  get playbackState() {
    return this._playbackState;
  }

  // TODO: never called?
  setStartDisabled(disabled) {
    this.refs.startBtn.disabled = disabled;
  }

  setStopDisabled(disabled) {
    this.refs.stopBtn.disabled = disabled;
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
    }
  }

  setCalibrationWarningVisible(shouldShow) {
    if (!this.refs.calibrationWarning) return;

    if (shouldShow) {
      this.refs.calibrationWarning.show({
        type: "warning",
        message:
          "Microphone offset is not calibrated. Timing feedback may be inaccurate.",
        actionLabel: "Calibrate Now",
        actionDetail: { pane: "onboarding", params: { target: "calibration" } },
      });
      return;
    }

    this.refs.calibrationWarning.hide();
  }

  handleStartClick() {
    dispatchEvent(this, "session-start", {
      bpm: this.getBPM(),
      beatsPerMeasure: this.getBeatsPerMeasure(),
    });
  }

  handleStopClick() {
    dispatchEvent(this, "session-stop", {});
  }

  handleViewResultsClick() {
    dispatchEvent(this, "navigate", { pane: "plan-history" });
  }

  handleCalibrationWarningAction() {
    dispatchEvent(this, "navigate", {
      pane: "onboarding",
      params: { target: "calibration" },
    });
  }
}

customElements.define("plan-play-pane", PlanPlayPane);
