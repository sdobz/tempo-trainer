/**
 * DrillSessionManager manages the drill session lifecycle and coordinates
 * timeline, scorer, and drill plan during active sessions.
 */

class DrillSessionManager {
  /**
   * @param {import('../music/playback-service.js').default} playbackService
   * @param {Object} scorer - Scorer instance
   * @param {Object} micDetector - MicrophoneDetector / DetectorManager instance
   * @param {import('../music/chart-service.js').default} chartService
   * @param {import('./playback-state.js').PlaybackState} playbackState
   * @param {import('../music/timeline-service.js').default} [timelineService]
   */
  constructor(
    playbackService,
    scorer,
    micDetector,
    chartService,
    playbackState,
    timelineService,
  ) {
    this.playbackService = playbackService;
    this.scorer = scorer;
    this.micDetector = micDetector;
    this.chartService = chartService;
    this.playbackState = playbackState;
    this.timelineService = timelineService ?? null;

    /** @type {Object|null} */
    this.calibration = null;
    /** @type {Object|null} */
    this.timeline = null;

    /** @type {(hitAudioTime: number, runStartAudioTime: number, beatDuration: number) => number} */
    this._beatPositionMapper = (hitAudioTime, runStartAudioTime, beatDuration) =>
      Math.max(0, (hitAudioTime - runStartAudioTime) / beatDuration);

    /** @type {{ plan: Array<{type:string}>, segments: any[] }|null} */
    this._planData = null;
    /** @type {Array<{type: string}>} */
    this._plan = [];

    const selectedChart = this.chartService?.getSelectedChart?.();
    if (selectedChart) {
      this._updateLocalPlan(this.chartService.projectChart(selectedChart));
    }

    this.chartService?.addEventListener(
      "chart-selected",
      (/** @type {CustomEvent<{ chart: any }>} */ event) => {
        this._updateLocalPlan(
          this.chartService.projectChart(event.detail.chart),
        );
      },
    );

    this.currentMeasureInTotal = 0;

    this._tickListener = this._onTimelineTick.bind(this);
    this._measureCompleteListener = this._onMeasureComplete.bind(this);

    this._setupHitDetectorCallback();

    this._sessionStartHandler = null;
    this._sessionStopHandler = null;
    this._attachedPane = null;
  }

  /** @param {Object|null} visualizer */
  setVisualizer(visualizer) {
    this.timeline = visualizer;
  }

  /** @param {Object|null} calibration */
  setCalibration(calibration) {
    this.calibration = calibration;
  }

  /**
   * @param {(hitAudioTime: number, runStartAudioTime: number, beatDuration: number) => number} mapper
   */
  setBeatPositionMapper(mapper) {
    this._beatPositionMapper = mapper;
  }

  /**
   * Attach pane event handlers for session start/stop.
   * @param {EventTarget & { playbackState: import('./playback-state.js').PlaybackState }} planPlayPane
   * @param {{ audioContextService: { getContext(): AudioContext|null } }} deps
   */
  attach(planPlayPane, deps) {
    this.detach();

    this._attachedPane = planPlayPane;

    this._sessionStartHandler = async () => {
      try {
        const audioContext = deps.audioContextService.getContext();
        if (!audioContext) {
          alert("Microphone access is required before starting a session");
          return;
        }

        this.scorer.reset();
        await this.startSession(audioContext);
        planPlayPane.playbackState.update({ isPlaying: true });
      } catch (error) {
        console.error("Failed to start session:", error);
        alert("Web Audio API is not supported in this browser");
      }
    };

    this._sessionStopHandler = () => {
      this.stopSession();
      planPlayPane.playbackState.update({ isPlaying: false });
    };

    planPlayPane.addEventListener("session-start", this._sessionStartHandler);
    planPlayPane.addEventListener("session-stop", this._sessionStopHandler);
  }

  /** Remove pane event handlers for session start/stop. */
  detach() {
    if (!this._attachedPane) return;
    if (this._sessionStartHandler) {
      this._attachedPane.removeEventListener(
        "session-start",
        this._sessionStartHandler,
      );
    }
    if (this._sessionStopHandler) {
      this._attachedPane.removeEventListener(
        "session-stop",
        this._sessionStopHandler,
      );
    }
    this._attachedPane = null;
    this._sessionStartHandler = null;
    this._sessionStopHandler = null;
  }

  /**
   * Updates the local plan model from the plan data object.
   * @param {{ plan: Array<{type: string}>, segments: any[] }|null} planData
   * @private
   */
  _updateLocalPlan(planData) {
    if (planData && planData.plan && Array.isArray(planData.plan)) {
      this._plan = planData.plan;
      this._planData = planData;
    } else if (Array.isArray(planData)) {
      this._plan = planData;
      this._planData = { plan: planData, segments: [] };
    } else {
      this._plan = [];
      this._planData = null;
    }
  }

  /**
   * Returns the measure type at the given index from the local model.
   * @param {number} index
   * @returns {string|null}
   */
  _getMeasureType(index) {
    return this._plan[index]?.type ?? null;
  }

  /**
   * Returns the total number of measures in the current plan.
   * @returns {number}
   */
  _getPlanLength() {
    return this._plan.length;
  }

  /**
   * Registers callback for session completion.
   * @param {(sessionData: any) => void} callback
   */
  onSessionComplete(callback) {
    this.sessionCompleteCallback = callback;
  }

  /**
   * Handles timeline tick events - processes beats and emits clicks.
   * @private
   */
  _onTimelineTick(event) {
    const { beatInMeasure, time, timeUntilBeat } = event.detail;
    const measureType = this._getMeasureType(this.currentMeasureInTotal);

    if (measureType === "silent") {
      return;
    }

    const clickInFreq = 660.0;
    const downbeatFreq = 880.0;
    const beatFreq = 440.0;
    const freq =
      measureType === "click-in"
        ? clickInFreq
        : beatInMeasure === 0
          ? downbeatFreq
          : beatFreq;

    this.playbackService.renderClick(time, { frequency: freq });

    const beatsPerMeasure = this.timelineService?.beatsPerMeasure ?? 4;
    const beatNumber = (beatInMeasure % beatsPerMeasure) + 1;
    const shouldShowBeat = measureType !== "silent";

    setTimeout(() => {
      if (
        !this.timelineService ||
        this.timelineService.transportState === "stopped"
      ) {
        return;
      }
      this.playbackState.update({
        beat: {
          beatNum: beatNumber,
          isDownbeat: beatInMeasure === 0,
          shouldShow: shouldShowBeat,
        },
      });
    }, timeUntilBeat * 1000);
  }

  /**
   * Handles timeline measure-complete event - advances scoring.
   * @private
   */
  _onMeasureComplete(_event) {
    if (this.isCompletingRun) return;

    this.currentMeasureInTotal++;
    this.playbackState.update({ highlight: this.currentMeasureInTotal });

    const finalizedWithLagMeasureIndex = this.currentMeasureInTotal - 2;
    this.scorer.finalizeMeasure(finalizedWithLagMeasureIndex);
    this._updateScoreDisplay();

    if (this.currentMeasureInTotal >= this._getPlanLength()) {
      this._handleDrillComplete();
    }
  }

  /**
   * Sets up microphone detector callback for hit routing.
   */
  _setupHitDetectorCallback() {
    if (!this.micDetector) return;

    this.micDetector.onHit((/** @type {number} */ hitAudioTime) => {
      const isPlaying = this.timelineService?.transportState === "playing";
      if (isPlaying || this.isCompletingRun) {
        const beatDuration = this.timelineService?.beatDuration ?? 0.5;
        const detectedBeatPosition = this._beatPositionMapper(
          hitAudioTime,
          this.timelineRunStartAudioTime,
          beatDuration,
        );

        this.timeline?.addDetection?.(detectedBeatPosition);
        this.scorer.registerHit(detectedBeatPosition);
      }

      if (this.calibration?.isCalibrating) {
        this.calibration.registerHit(hitAudioTime);
      }
    });
  }

  /**
   * Starts a new drill session.
   * Reads current BPM and beatsPerMeasure from TimelineService.
   * @param {AudioContext} audioContext - Web Audio API context
   * @returns {Promise<void>}
   */
  async startSession(audioContext) {
    const bpm = this.timelineService?.tempo ?? 120;
    const beatsPerMeasure = this.timelineService?.beatsPerMeasure ?? 4;

    if (this.calibration?.isCalibrating) {
      this.calibration.stop("Calibration stopped: drill start requested.");
    }

    if (this.micDetector && !this.micDetector.isRunning) {
      await this.micDetector.start();
    }

    this.scorer.setBeatsPerMeasure(beatsPerMeasure);
    this.scorer.setBeatDuration(60.0 / bpm);
    this.timeline?.setBeatsPerMeasure?.(beatsPerMeasure);

    if (this.timelineService) {
      this.timelineService.addEventListener("tick", this._tickListener);
      this.timelineService.addEventListener(
        "measure-complete",
        this._measureCompleteListener,
      );
    }

    this.scorer.reset();
    this.currentMeasureInTotal = 0;
    this.runStartedAt = Date.now();
    this.runFinalized = false;
    this.isCompletingRun = false;
    this.timelineRunStartAudioTime = audioContext.currentTime;
    this.timelineService?.seekToDivision(0);

    this.playbackState.update({ highlight: 0 });
    this.timeline?.centerAt?.(0);

    this.timelineService?.play();

    this.playbackState.update({ status: "Running..." });
  }

  /**
   * Stops the current drill session.
   */
  stopSession() {
    if (this.completionTimeoutId) {
      globalThis.clearTimeout(this.completionTimeoutId);
      this.completionTimeoutId = undefined;
    }

    if (this.timelineService) {
      this.timelineService.removeEventListener("tick", this._tickListener);
      this.timelineService.removeEventListener(
        "measure-complete",
        this._measureCompleteListener,
      );
    }

    this.isCompletingRun = false;
    this._finalizeRun(false);
    this.timelineService?.stop();

    this.playbackState.update({ highlight: -1 });
    this.playbackState.update({ status: "Stopped." });
  }

  /**
   * Handles drill completion (all measures played).
   * @private
   */
  _handleDrillComplete() {
    this.isCompletingRun = true;
    this.timelineService?.stop();

    if (this.timelineService) {
      this.timelineService.removeEventListener("tick", this._tickListener);
      this.timelineService.removeEventListener(
        "measure-complete",
        this._measureCompleteListener,
      );
    }

    const finalHitGraceMs = Math.max(
      300,
      Math.round(
        (this.scorer.lateHitAssignmentWindowBeats + 0.5) *
          (this.timelineService?.beatDuration ?? 0.5) *
          1000,
      ),
    );

    this.playbackState.update({
      status: "Drill complete. Capturing final hits...",
    });

    this.completionTimeoutId = globalThis.setTimeout(() => {
      this.scorer.finalizeMeasure(this._getPlanLength() - 2);
      this.scorer.finalizeMeasure(this._getPlanLength() - 1);
      this._updateScoreDisplay();
      this._finalizeRun(true);

      this.isCompletingRun = false;
      this.completionTimeoutId = undefined;
      this.playbackState.update({ highlight: -1 });

      this.playbackState.update({ status: "Drill complete!" });
    }, finalHitGraceMs);
  }

  /**
   * Finalizes the run and returns session data.
   * @param {boolean} completed - Whether the drill was completed or stopped early
   * @returns {Object|null} Session data object or null if already finalized
   * @private
   */
  _finalizeRun(completed) {
    if (this.runFinalized || this._getPlanLength() === 0) return null;

    for (let index = 0; index < this._getPlanLength(); index++) {
      this.scorer.finalizeMeasure(index);
    }
    this._updateScoreDisplay();

    const elapsedSeconds = this.runStartedAt
      ? Math.max(0, Math.round((Date.now() - this.runStartedAt) / 1000))
      : 0;

    const sessionData = {
      completed,
      durationSeconds: elapsedSeconds,
      measureHits: this.scorer.measureHits,
      drillPlan: this._planData,
      overallScore: this.scorer.getOverallScore(),
    };

    this.runFinalized = true;

    if (this.sessionCompleteCallback) {
      this.sessionCompleteCallback(sessionData);
    }

    return sessionData;
  }

  /**
   * Updates score display via callbacks.
   * @private
   */
  _updateScoreDisplay() {
    this.playbackState.update({
      overallScore: this.scorer.getOverallScore(),
      scores: this.scorer.getAllScores().map((score) => score ?? 0),
    });
  }

  /**
   * Updates timeline scroll position during playback.
   * Should be called in animation frame loop.
   * @param {AudioContext} audioContext - Web Audio API context
   */
  updateTimelineScroll(audioContext) {
    const isPlaying = this.timelineService?.transportState === "playing";
    if ((isPlaying || this.isCompletingRun) && audioContext) {
      const beatPosition = this._beatPositionMapper(
        audioContext.currentTime,
        this.timelineRunStartAudioTime,
        this.timelineService?.beatDuration ?? 0.5,
      );
      this.timeline?.centerAt?.(beatPosition);
    }
  }

  /**
   * Checks if a session is currently active.
   * @returns {boolean}
   */
  isSessionActive() {
    return (
      this.timelineService?.transportState === "playing" || this.isCompletingRun
    );
  }

  /**
   * Gets the current measure index.
   * @returns {number}
   */
  getCurrentMeasure() {
    return this.currentMeasureInTotal;
  }
}

export default DrillSessionManager;
