/**
 * Metronome class manages beat scheduling, BPM, time signatures, and audio timing.
 * Provides callbacks for beat detection and measure completion in drum training.
 */
class Metronome {
  /**
   * Creates a new Metronome instance.
   * @param {AudioContext} audioContext - The Web Audio API AudioContext for scheduling sounds
   */
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.lookahead = 25.0; // ms
    this.scheduleAheadTime = 0.1; // seconds

    // State
    this.isRunning = false;
    this.schedulerIntervalID = null;
    this.nextNoteTime = 0.0;
    this.currentBeatInMeasure = 0;
    this.beatsPerMeasure = 4;
    this.beatDuration = 0.5; // seconds per beat
    this.bpm = 120;

    // Callbacks
    this.onBeatCallback = null;
    this.onMeasureCompleteCallback = null;
  }

  /**
   * Sets the tempo in beats per minute.
   * @param {number} bpm - Beats per minute
   */
  setBPM(bpm) {
    this.bpm = bpm;
    this.beatDuration = 60.0 / bpm;
  }

  /**
   * Sets the time signature (beats per measure).
   * @param {number} beatsPerMeasure - Number of beats in each measure
   */
  setTimeSignature(beatsPerMeasure) {
    this.beatsPerMeasure = beatsPerMeasure;
  }

  /**
   * Registers a callback to be invoked on each beat.
   * @param {Function} callback - Callback function invoked with (beatIndex, scheduledTime, timeUntilBeat)
   */
  onBeat(callback) {
    this.onBeatCallback = callback;
  }

  /**
   * Registers a callback to be invoked when a measure completes.
   * @param {Function} callback - Callback function invoked with no parameters
   */
  onMeasureComplete(callback) {
    this.onMeasureCompleteCallback = callback;
  }

  /**
   * Starts the metronome and begins scheduling beats.
   * @returns {boolean} True if successfully started, false if already running or no AudioContext
   */
  start() {
    if (this.isRunning) return false;
    if (!this.audioContext) return false;

    this.audioContext.resume();
    this.isRunning = true;
    this.nextNoteTime = this.audioContext.currentTime + 0.1;
    this.currentBeatInMeasure = 0;

    this.schedulerIntervalID = setInterval(() => this._scheduler(), this.lookahead);

    return true;
  }

  /**
   * Stops the metronome and halts beat scheduling.
   * @returns {boolean} True if successfully stopped, false if not running
   */
  stop() {
    if (!this.isRunning) return false;

    if (this.schedulerIntervalID) {
      clearInterval(this.schedulerIntervalID);
      this.schedulerIntervalID = null;
    }

    this.isRunning = false;
    return true;
  }

  /**
   * Gets the current time from the AudioContext.
   * @returns {number} Current time in seconds
   */
  getCurrentTime() {
    return this.audioContext ? this.audioContext.currentTime : 0;
  }

  /**
   * Schedules an audio click at a specified time and frequency.
   * @param {number} time - Scheduled time in seconds
   * @param {number} frequency - Frequency in Hz
   */
  scheduleClick(time, frequency) {
    if (!this.audioContext) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.00001, time + 0.05);
    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.start(time);
    osc.stop(time + 0.05);
  }

  /**
   * Resets the metronome state to the beginning.
   */
  reset() {
    this.currentBeatInMeasure = 0;
    this.nextNoteTime = 0;
  }

  /**
   * Scheduler loop that processes and schedules upcoming beats.
   * @private
   */
  _scheduler() {
    if (!this.audioContext) return;

    while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
      this._scheduleNote(this.nextNoteTime);
      this._updateBeat();
    }
  }

  /**
   * Schedules a note at a specific time, invoking the onBeat callback.
   * @private
   * @param {number} time - Scheduled time in seconds
   */
  _scheduleNote(time) {
    if (!this.audioContext) return;

    // Check if we should play a sound via callback
    if (this.onBeatCallback) {
      const shouldPlay = this.onBeatCallback(
        this.currentBeatInMeasure,
        time,
        this.nextNoteTime - this.audioContext.currentTime
      );

      if (shouldPlay === false) {
        return; // Skip this beat
      }
    }
  }

  /**
   * Updates the metronome beat position and checks for measure completion.
   * @private
   */
  _updateBeat() {
    this.nextNoteTime += this.beatDuration;
    this.currentBeatInMeasure++;

    if (this.currentBeatInMeasure >= this.beatsPerMeasure) {
      this.currentBeatInMeasure = 0;

      if (this.onMeasureCompleteCallback) {
        this.onMeasureCompleteCallback();
      }
    }
  }
}

export default Metronome;
