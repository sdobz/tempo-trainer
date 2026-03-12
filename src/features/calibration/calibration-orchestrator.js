/**
 * CalibrationOrchestrator owns onboarding calibration runtime wiring.
 */
class CalibrationOrchestrator {
  /**
   * @param {{
   *  onboardingPane: any,
   *  planTimeline: any,
   *  timelineService: import('../music/timeline-service.js').default,
   *  playbackService: import('../music/playback-service.js').default,
   *  audioContextService: { getContext(): AudioContext|null },
   *  detectorManager: { isRunning: boolean, start(): Promise<void>, stop(): void, addHitListener(listener: (hitAudioTime:number)=>void): () => void }
   * }} deps
   */
  constructor({
    onboardingPane,
    planTimeline,
    timelineService,
    playbackService,
    audioContextService,
    detectorManager,
  }) {
    this.onboardingPane = onboardingPane;
    this.planTimeline = planTimeline;
    this.timelineService = timelineService;
    this.playbackService = playbackService;
    this.audioContextService = audioContextService;
    this.detectorManager = detectorManager;

    this.CALIBRATION_TIMELINE_WINDOW_MEASURES = 64;
    this.CALIBRATION_TIMELINE_REBASE_MARGIN_MEASURES = 8;

    this._calibrationTimeline = null;
    this._calibrationTimelineWindowStartMeasure = 0;
    this._calibrationTimelineRunStartAudioTime = 0;
    this._calibrationTimelineActive = false;
    this._calibrationTimelineRafId = null;

    this._boundCalibrationStateChanged =
      this._onCalibrationStateChanged.bind(this);
    this._boundCalibrationStartRequest =
      this._onCalibrationStartRequest.bind(this);

    this.onboardingPane.addEventListener(
      "calibration-state-changed",
      this._boundCalibrationStateChanged,
    );
    this.onboardingPane.addEventListener(
      "calibration-start-request",
      this._boundCalibrationStartRequest,
    );

    this._removeHitListener = this.detectorManager.addHitListener(
      (hitAudioTime) => {
        const calibrationTimeline = this._resolveCalibrationTimeline();

        this.planTimeline?.flashNowLine?.();
        calibrationTimeline?.flashNowLine?.();

        if (!calibrationTimeline) return;

        if (!this._calibrationTimelineActive) {
          this.startCalibrationTimeline();
        }

        const beatPosition =
          this.getCalibrationBeatPositionFromAudioTime(hitAudioTime);
        this._maybeRebaseCalibrationTimeline(beatPosition);
        calibrationTimeline.addDetection(beatPosition);
      },
    );

    this._calibrationTickListener = (event) => {
      const calibration = this.getCalibration();
      if (!calibration || !calibration.isCalibrating) return;
      const { beatInMeasure, time } = event.detail;
      const freq = beatInMeasure === 0 ? 880.0 : 440.0;
      this.playbackService.renderClick(time, { frequency: freq });
      calibration.registerExpectedBeat(time);
    };
  }

  /** @returns {any|null} */
  getCalibration() {
    return this.onboardingPane.calibration;
  }

  /** @returns {boolean} */
  get isCalibrating() {
    return Boolean(this.getCalibration()?.isCalibrating);
  }

  /**
   * Enter onboarding runtime mode.
   * @returns {Promise<boolean>} false when audio context is unavailable
   */
  async enterOnboarding() {
    await this.onboardingPane.componentReady;
    this.onboardingPane.refreshSetupStatus();

    if (!this.audioContextService.getContext()) {
      return false;
    }

    if (!this.detectorManager.isRunning) {
      try {
        await this.detectorManager.start();
      } catch (err) {
        console.error("Failed to start microphone detector:", err);
      }
    }

    this.startCalibrationTimeline();
    return true;
  }

  /**
   * Leave onboarding runtime mode.
   * @param {{ stopDetector: boolean }} options
   */
  leaveOnboarding({ stopDetector }) {
    this.stopCalibrationTimeline();
    this.stopCalibrationMetronome();

    const calibration = this.getCalibration();
    if (
      stopDetector &&
      this.detectorManager.isRunning &&
      calibration &&
      !calibration.isCalibrating
    ) {
      this.detectorManager.stop();
    }
  }

  /** Tear down listeners and runtime loops. */
  dispose() {
    this.onboardingPane.removeEventListener(
      "calibration-state-changed",
      this._boundCalibrationStateChanged,
    );
    this.onboardingPane.removeEventListener(
      "calibration-start-request",
      this._boundCalibrationStartRequest,
    );
    this.timelineService.removeEventListener(
      "tick",
      this._calibrationTickListener,
    );
    this.stopCalibrationTimeline();
    this._removeHitListener?.();
  }

  /**
   * @param {number} audioTime
   * @returns {number}
   */
  getCalibrationBeatPositionFromAudioTime(audioTime) {
    const beatDuration = this.timelineService.beatDuration;
    return Math.max(
      0,
      (audioTime - this._calibrationTimelineRunStartAudioTime) / beatDuration,
    );
  }

  startCalibrationMetronome() {
    const calibration = this.getCalibration();
    if (!calibration) return;

    this.timelineService.removeEventListener(
      "tick",
      this._calibrationTickListener,
    );
    this.timelineService.addEventListener(
      "tick",
      this._calibrationTickListener,
    );

    this.timelineService.stop();
    this.timelineService.seekToDivision(0);
    this.timelineService.play();

    const audioContext = this.audioContextService.getContext();
    if (audioContext) {
      this._calibrationTimelineRunStartAudioTime = audioContext.currentTime;
    }
  }

  stopCalibrationMetronome() {
    this.timelineService.removeEventListener(
      "tick",
      this._calibrationTickListener,
    );
    this.timelineService.stop();
  }

  startCalibrationTimeline() {
    const calibrationTimeline = this._resolveCalibrationTimeline();
    if (!calibrationTimeline || this._calibrationTimelineActive) return;

    const audioContext = this.audioContextService.getContext();
    this._calibrationTimelineRunStartAudioTime = audioContext?.currentTime ?? 0;
    this._calibrationTimelineWindowStartMeasure = 0;
    this._calibrationTimelineActive = true;

    this._buildCalibrationTimelineWindow(
      this._calibrationTimelineWindowStartMeasure,
    );
    calibrationTimeline.clearDetections();

    this._calibrationTimelineRafId = requestAnimationFrame(() =>
      this._calibrationTimelineLoop(),
    );
  }

  stopCalibrationTimeline() {
    this._calibrationTimelineActive = false;
    if (this._calibrationTimelineRafId) {
      cancelAnimationFrame(this._calibrationTimelineRafId);
      this._calibrationTimelineRafId = null;
    }
  }

  _onCalibrationStateChanged() {
    const calibration = this.getCalibration();
    if (calibration?.isCalibrating) {
      this._resolveCalibrationTimeline()?.clearDetections?.();
      this.startCalibrationMetronome();
    } else {
      this.stopCalibrationMetronome();
    }

    if (!this._calibrationTimeline || !this._calibrationTimelineActive) return;
    this._buildCalibrationTimelineWindow(
      this._calibrationTimelineWindowStartMeasure,
    );
  }

  async _onCalibrationStartRequest(/** @type {CustomEvent} */ event) {
    const calibration = this.getCalibration();
    if (calibration && calibration.isCalibrating) return;

    if (!this.audioContextService.getContext()) {
      alert("Microphone access is required before calibration");
      event.preventDefault();
      return;
    }

    try {
      if (!this.detectorManager.isRunning) {
        await this.detectorManager.start();
      }
    } catch {
      alert("Web Audio API is not supported in this browser");
      event.preventDefault();
    }
  }

  _calibrationTimelineLoop() {
    if (!this._calibrationTimelineActive) return;

    const audioContext = this.audioContextService.getContext();
    const calibrationTimeline = this._resolveCalibrationTimeline();
    if (audioContext && calibrationTimeline) {
      const beatPosition = this.getCalibrationBeatPositionFromAudioTime(
        audioContext.currentTime,
      );
      this._maybeRebaseCalibrationTimeline(beatPosition);
      calibrationTimeline.centerAt(beatPosition);
    }

    this._calibrationTimelineRafId = requestAnimationFrame(() =>
      this._calibrationTimelineLoop(),
    );
  }

  /** @param {number} startMeasure */
  _buildCalibrationTimelineWindow(startMeasure) {
    const calibrationTimeline = this._resolveCalibrationTimeline();
    if (!calibrationTimeline) return;

    const beatsPerMeasure = this.timelineService.beatsPerMeasure;
    const measureType = this.getCalibration()?.isCalibrating
      ? "click"
      : "silent";
    const plan = Array.from(
      { length: this.CALIBRATION_TIMELINE_WINDOW_MEASURES },
      () => ({ type: measureType }),
    );

    calibrationTimeline.setBeatsPerMeasure(beatsPerMeasure);
    calibrationTimeline.setDisplayStartBeat(startMeasure * beatsPerMeasure);
    calibrationTimeline.setDrillPlan(plan);
  }

  /** @param {number} absoluteBeatPosition */
  _maybeRebaseCalibrationTimeline(absoluteBeatPosition) {
    if (!this._resolveCalibrationTimeline()) return;

    const beatsPerMeasure = this.timelineService.beatsPerMeasure;
    const currentMeasure = Math.floor(absoluteBeatPosition / beatsPerMeasure);
    const minVisibleMeasure =
      this._calibrationTimelineWindowStartMeasure +
      this.CALIBRATION_TIMELINE_REBASE_MARGIN_MEASURES;
    const maxVisibleMeasure =
      this._calibrationTimelineWindowStartMeasure +
      this.CALIBRATION_TIMELINE_WINDOW_MEASURES -
      this.CALIBRATION_TIMELINE_REBASE_MARGIN_MEASURES;

    if (
      currentMeasure >= minVisibleMeasure &&
      currentMeasure <= maxVisibleMeasure
    ) {
      return;
    }

    const nextWindowStartMeasure = Math.max(
      0,
      currentMeasure -
        Math.floor(this.CALIBRATION_TIMELINE_WINDOW_MEASURES / 2),
    );

    if (
      nextWindowStartMeasure === this._calibrationTimelineWindowStartMeasure
    ) {
      return;
    }

    this._calibrationTimelineWindowStartMeasure = nextWindowStartMeasure;
    this._buildCalibrationTimelineWindow(
      this._calibrationTimelineWindowStartMeasure,
    );
  }

  _resolveCalibrationTimeline() {
    if (this._calibrationTimeline && this._calibrationTimeline.isConnected) {
      return this._calibrationTimeline;
    }

    this._calibrationTimeline = this.onboardingPane.querySelector(
      "[data-calibration-timeline]",
    );

    if (!this._calibrationTimeline && this.onboardingPane.calibrationControl) {
      this._calibrationTimeline =
        this.onboardingPane.calibrationControl.querySelector(
          "[data-calibration-timeline]",
        );
    }

    return this._calibrationTimeline;
  }
}

export default CalibrationOrchestrator;
