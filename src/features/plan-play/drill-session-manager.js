/**
 * DrillSessionManager manages the drill session lifecycle and coordinates
 * metronome, scorer, timeline, and drill plan during active sessions.
 */

class DrillSessionManager {
  /**
   * @param {Object} metronome - Metronome instance
   * @param {Object} scorer - Scorer instance
   * @param {Object} timeline - Timeline visualization component
   * @param {Object} calibration - CalibrationDetector instance
   * @param {Object} micDetector - MicrophoneDetector / DetectorManager instance
   * @param {import('../base/session-state.js').default} sessionState
   * @param {import('./playback-state.js').PlaybackState} playbackState
   * @param {import('../music/timeline-service.js').default} [timelineService]
   */
  constructor(
    metronome,
    scorer,
    timeline,
    calibration,
    micDetector,
    sessionState,
    playbackState,
    timelineService,
  ) {
    this.metronome = metronome;
    this.scorer = scorer;
    this.timeline = timeline;
    this.calibration = calibration;
    this.micDetector = micDetector;
    this.sessionState = sessionState;
    this.playbackState = playbackState;
    this.timelineService = timelineService ?? null;

    // Local plan model — kept in sync with sessionState.plan
    /** @type {Array<{type: string}>} */
    this._plan = [];
    /** @type {{ plan: Array<{type:string}>, segments: any[] }|null} */
    this._planData = null;

    // Initialise from current sessionState plan if already set
    if (this.sessionState.plan) {
      this._updateLocalPlan(this.sessionState.plan);
    }

    // Keep local model in sync when plan changes
    this.sessionState.subscribe({
      onPlanChange: (planData) => this._updateLocalPlan(planData),
    });

    // Session state
    this.currentMeasureInTotal = 0;

    // Setup internal callbacks
    this._setupMetronomeCallbacks();
    this._setupHitDetectorCallback();
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
   * Sets up metronome callbacks for beat and measure coordination.
   */
  _setupMetronomeCallbacks() {
    this.metronome.onBeat(
      (
        /** @type {number} */ beatInMeasure,
        /** @type {number} */ time,
        /** @type {number} */ timeUntilBeat,
      ) => {
        const measureType = this._getMeasureType(this.currentMeasureInTotal);

        if (measureType === "silent") {
          return false;
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

        this.metronome.scheduleClick(time, freq);

        const beatNumber = (beatInMeasure % this.metronome.beatsPerMeasure) + 1;
        const shouldShowBeat = measureType !== "silent";

        setTimeout(() => {
          if (!this.metronome.isRunning) return;
          this.playbackState.update({
            beat: {
              beatNum: beatNumber,
              isDownbeat: beatInMeasure === 0,
              shouldShow: shouldShowBeat,
            },
          });
        }, timeUntilBeat * 1000);

        return true;
      },
    );

    this.metronome.onMeasureComplete(() => {
      if (this.isCompletingRun) return;

      this.currentMeasureInTotal++;
      this.playbackState.update({ highlight: this.currentMeasureInTotal });

      const finalizedWithLagMeasureIndex = this.currentMeasureInTotal - 2;
      this.scorer.finalizeMeasure(finalizedWithLagMeasureIndex);
      this._updateScoreDisplay();

      if (this.currentMeasureInTotal >= this._getPlanLength()) {
        this._handleDrillComplete();
      }
    });
  }

  /**
   * Sets up microphone detector callback for hit routing.
   */
  _setupHitDetectorCallback() {
    if (this.micDetector) {
      this.micDetector.onHit((/** @type {number} */ hitAudioTime) => {
        // Accept hits during normal run or during completion grace period
        if (this.metronome.isRunning || this.isCompletingRun) {
          const detectedBeatPosition =
            this.calibration.getCalibratedBeatPosition(
              hitAudioTime,
              this.timelineRunStartAudioTime,
              this.metronome.beatDuration,
            );

          this.timeline.addDetection(detectedBeatPosition);
          this.scorer.registerHit(detectedBeatPosition);
        }

        if (this.calibration.isCalibrating) {
          this.calibration.registerHit(hitAudioTime);
        }
      });
    }
  }

  /**
   * Starts a new drill session.
   * Reads current BPM and beatsPerMeasure from TimelineService when available.
   * SessionState is only a compatibility fallback.
   * @param {AudioContext} audioContext - Web Audio API context
   * @returns {Promise<void>}
   */
  async startSession(audioContext) {
    const bpm = this.timelineService?.tempo ?? this.sessionState.bpm;
    const beatsPerMeasure =
      this.timelineService?.beatsPerMeasure ??
      this.sessionState.beatsPerMeasure;

    // Stop calibration if running
    if (this.calibration && this.calibration.isCalibrating) {
      this.calibration.stop("Calibration stopped: drill start requested.");
    }

    // Start microphone if not running
    if (this.micDetector && !this.micDetector.isRunning) {
      await this.micDetector.start();
    }

    // Configure all components from session state
    this.metronome.setBPM(bpm);
    this.metronome.setTimeSignature(beatsPerMeasure);
    this.scorer.setBeatsPerMeasure(beatsPerMeasure);
    this.scorer.setBeatDuration(60.0 / bpm);
    this.timeline.setBeatsPerMeasure(beatsPerMeasure);
    if (this.calibration) {
      this.calibration.setBeatsPerMeasure(beatsPerMeasure);
      this.calibration.setBeatDuration(60.0 / bpm);
    }

    // Reset session state
    this.scorer.reset();
    this.currentMeasureInTotal = 0;
    this.runStartedAt = Date.now();
    this.runFinalized = false;
    this.isCompletingRun = false;
    this.timelineRunStartAudioTime = audioContext.currentTime;

    // Reset UI
    this.playbackState.update({ highlight: 0 });
    this.timeline.centerAt(0);

    // Start metronome
    this.metronome.start();

    // Update status
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

    this.isCompletingRun = false;
    this._finalizeRun(false);

    this.metronome.stop();

    // Clear UI
    this.playbackState.update({ highlight: -1 });

    this.playbackState.update({ status: "Stopped." });
  }

  /**
   * Handles drill completion (all measures played).
   * @private
   */
  _handleDrillComplete() {
    this.isCompletingRun = true;
    this.metronome.stop();

    // Give extra time for final hits - need full late window plus some margin
    const finalHitGraceMs = Math.max(
      300,
      Math.round(
        (this.scorer.lateHitAssignmentWindowBeats + 0.5) *
          this.metronome.beatDuration *
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

    // Finalize all measures
    for (let index = 0; index < this._getPlanLength(); index++) {
      this.scorer.finalizeMeasure(index);
    }
    this._updateScoreDisplay();

    // Calculate session duration
    const elapsedSeconds = this.runStartedAt
      ? Math.max(0, Math.round((Date.now() - this.runStartedAt) / 1000))
      : 0;

    // Build session data object
    // NOTE: Only store hits and plan; scores are recomputed on display
    const sessionData = {
      completed,
      durationSeconds: elapsedSeconds,
      measureHits: this.scorer.measureHits,
      drillPlan: this._planData,
      overallScore: this.scorer.getOverallScore(),
    };

    this.runFinalized = true;

    // Notify completion callback
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
    if (
      (this.metronome.isRunning || this.isCompletingRun) &&
      audioContext &&
      this.calibration
    ) {
      const beatPosition = this.calibration.getCalibratedBeatPosition(
        audioContext.currentTime,
        this.timelineRunStartAudioTime,
        this.metronome.beatDuration,
      );
      this.timeline.centerAt(beatPosition);
    }
  }

  /**
   * Checks if a session is currently active.
   * @returns {boolean}
   */
  isSessionActive() {
    return this.metronome.isRunning || this.isCompletingRun;
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
