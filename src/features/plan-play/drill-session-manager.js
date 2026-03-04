/**
 * DrillSessionManager manages the drill session lifecycle and coordinates
 * metronome, scorer, timeline, and drill plan during active sessions.
 */
class DrillSessionManager {
  /**
   * @param {Object} metronome - Metronome instance
   * @param {Object} scorer - Scorer instance
   * @param {Object} timeline - Timeline visualization component
   * @param {Object} drillPlan - DrillPlan visualization component
   * @param {Object} calibration - CalibrationDetector instance
   * @param {Object} micDetector - MicrophoneDetector instance
   */
  constructor(metronome, scorer, timeline, drillPlan, calibration, micDetector) {
    this.metronome = metronome;
    this.scorer = scorer;
    this.timeline = timeline;
    this.drillPlan = drillPlan;
    this.calibration = calibration;
    this.micDetector = micDetector;

    // Session state
    this.currentMeasureInTotal = 0;
    /** @type {number|null} */
    this.runStartedAt = null;
    this.runFinalized = false;
    this.isCompletingRun = false;
    /** @type {number|undefined} */
    this.completionTimeoutId = undefined;
    this.timelineRunStartAudioTime = 0;

    // Callbacks for UI updates
    /** @type {((beatNum: number, measureIndex: number, shouldShow: boolean) => void)|null} */
    this.beatUpdateCallback = null;
    /** @type {((overallScore: number, measureScores: number[]) => void)|null} */
    this.scoreUpdateCallback = null;
    /** @type {((measureIndex: number) => void)|null} */
    this.highlightUpdateCallback = null;
    /** @type {((sessionData: any) => void)|null} */
    this.sessionCompleteCallback = null;
    /** @type {((status: string) => void)|null} */
    this.statusUpdateCallback = null;

    // Setup internal callbacks
    this._setupMetronomeCallbacks();
    this._setupHitDetectorCallback();
  }

  /**
   * Registers callback for beat updates (for UI updates).
   * @param {(beatNum: number, measureIndex: number, shouldShow: boolean) => void} callback
   */
  onBeatUpdate(callback) {
    this.beatUpdateCallback = callback;
  }

  /**
   * Registers callback for highlighted measure updates.
   * @param {(measureIndex: number) => void} callback
   */
  onHighlightUpdate(callback) {
    this.highlightUpdateCallback = callback;
  }

  /**
   * Registers callback for score updates.
   * @param {(overallScore: number, measureScores: number[]) => void} callback
   */
  onScoreUpdate(callback) {
    this.scoreUpdateCallback = callback;
  }

  /**
   * Registers callback for session completion.
   * @param {(sessionData: any) => void} callback
   */
  onSessionComplete(callback) {
    this.sessionCompleteCallback = callback;
  }

  /**
   * Registers callback for status updates.
   * @param {(status: string) => void} callback
   */
  onStatusUpdate(callback) {
    this.statusUpdateCallback = callback;
  }

  /**
   * Sets up metronome callbacks for beat and measure coordination.
   */
  _setupMetronomeCallbacks() {
    this.metronome.onBeat(
      (
        /** @type {number} */ beatInMeasure,
        /** @type {number} */ time,
        /** @type {number} */ timeUntilBeat
      ) => {
        const measureType = this.drillPlan.getMeasureType(this.currentMeasureInTotal);

        if (measureType === "silent") {
          return false;
        }

        const clickInFreq = 660.0;
        const downbeatFreq = 880.0;
        const beatFreq = 440.0;
        const freq =
          measureType === "click-in" ? clickInFreq : beatInMeasure === 0 ? downbeatFreq : beatFreq;

        this.metronome.scheduleClick(time, freq);

        const beatNumber = (beatInMeasure % this.metronome.beatsPerMeasure) + 1;
        const shouldShowBeat = measureType !== "silent";

        setTimeout(() => {
          if (!this.metronome.isRunning) return;
          if (this.beatUpdateCallback) {
            this.beatUpdateCallback(beatNumber, this.currentMeasureInTotal, shouldShowBeat);
          }
        }, timeUntilBeat * 1000);

        return true;
      }
    );

    this.metronome.onMeasureComplete(() => {
      if (this.isCompletingRun) return;

      this.currentMeasureInTotal++;
      this.drillPlan.setHighlight(this.currentMeasureInTotal);
      if (this.highlightUpdateCallback) {
        this.highlightUpdateCallback(this.currentMeasureInTotal);
      }

      const finalizedWithLagMeasureIndex = this.currentMeasureInTotal - 2;
      this.scorer.finalizeMeasure(finalizedWithLagMeasureIndex);
      this._updateScoreDisplay();

      if (this.currentMeasureInTotal >= this.drillPlan.getLength()) {
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
          const detectedBeatPosition = this.calibration.getCalibratedBeatPosition(
            hitAudioTime,
            this.timelineRunStartAudioTime,
            this.metronome.beatDuration
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
   * @param {number} bpm - Beats per minute
   * @param {number} beatsPerMeasure - Time signature (beats per measure)
   * @param {AudioContext} audioContext - Web Audio API context
   * @returns {Promise<void>}
   */
  async startSession(bpm, beatsPerMeasure, audioContext) {
    // Stop calibration if running
    if (this.calibration && this.calibration.isCalibrating) {
      this.calibration.stop("Calibration stopped: drill start requested.");
    }

    // Start microphone if not running
    if (this.micDetector && !this.micDetector.isRunning) {
      await this.micDetector.start();
    }

    // Configure all components
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
    this.drillPlan.setScores(this.scorer.getAllScores().map((score) => score ?? 0));
    this.currentMeasureInTotal = 0;
    this.runStartedAt = Date.now();
    this.runFinalized = false;
    this.isCompletingRun = false;
    this.timelineRunStartAudioTime = audioContext.currentTime;

    // Reset UI
    this.drillPlan.setHighlight(0);
    if (this.highlightUpdateCallback) this.highlightUpdateCallback(0);
    this.timeline.centerAt(0);

    // Start metronome
    this.metronome.start();

    // Update status
    if (this.statusUpdateCallback) {
      this.statusUpdateCallback("Running...");
    }
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
    this.drillPlan.setHighlight(-1);
    if (this.highlightUpdateCallback) this.highlightUpdateCallback(-1);

    if (this.statusUpdateCallback) {
      this.statusUpdateCallback("Stopped.");
    }
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
        (this.scorer.lateHitAssignmentWindowBeats + 0.5) * this.metronome.beatDuration * 1000
      )
    );

    if (this.statusUpdateCallback) {
      this.statusUpdateCallback("Drill complete. Capturing final hits...");
    }

    this.completionTimeoutId = globalThis.setTimeout(() => {
      this.scorer.finalizeMeasure(this.drillPlan.getLength() - 2);
      this.scorer.finalizeMeasure(this.drillPlan.getLength() - 1);
      this._updateScoreDisplay();
      this._finalizeRun(true);

      this.isCompletingRun = false;
      this.completionTimeoutId = undefined;
      this.drillPlan.setHighlight(-1);
      if (this.highlightUpdateCallback) {
        this.highlightUpdateCallback(-1);
      }

      if (this.statusUpdateCallback) {
        this.statusUpdateCallback("Drill complete!");
      }
    }, finalHitGraceMs);
  }

  /**
   * Finalizes the run and returns session data.
   * @param {boolean} completed - Whether the drill was completed or stopped early
   * @returns {Object|null} Session data object or null if already finalized
   * @private
   */
  _finalizeRun(completed) {
    if (this.runFinalized || this.drillPlan.getLength() === 0) return null;

    // Finalize all measures
    for (let index = 0; index < this.drillPlan.getLength(); index++) {
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
      drillPlan: this.drillPlan.getPlan(),
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
    this.drillPlan.setScores(this.scorer.getAllScores().map((score) => score ?? 0));
    if (this.scoreUpdateCallback) {
      this.scoreUpdateCallback(
        this.scorer.getOverallScore(),
        this.scorer.getAllScores().map((score) => score ?? 0)
      );
    }
  }

  /**
   * Updates timeline scroll position during playback.
   * Should be called in animation frame loop.
   * @param {AudioContext} audioContext - Web Audio API context
   */
  updateTimelineScroll(audioContext) {
    if ((this.metronome.isRunning || this.isCompletingRun) && audioContext && this.calibration) {
      const beatPosition = this.calibration.getCalibratedBeatPosition(
        audioContext.currentTime,
        this.timelineRunStartAudioTime,
        this.metronome.beatDuration
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
