// Core metronome functionality: BPM, time signatures, beat scheduling, and audio
class Metronome {
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

  setBPM(bpm) {
    this.bpm = bpm;
    this.beatDuration = 60.0 / bpm;
  }

  setTimeSignature(beatsPerMeasure) {
    this.beatsPerMeasure = beatsPerMeasure;
  }

  onBeat(callback) {
    this.onBeatCallback = callback;
  }

  onMeasureComplete(callback) {
    this.onMeasureCompleteCallback = callback;
  }

  start() {
    if (this.isRunning) return false;
    if (!this.audioContext) return false;

    this.audioContext.resume();
    this.isRunning = true;
    this.nextNoteTime = this.audioContext.currentTime + 0.1;
    this.currentBeatInMeasure = 0;

    this.schedulerIntervalID = window.setInterval(
      () => this._scheduler(),
      this.lookahead,
    );

    return true;
  }

  stop() {
    if (!this.isRunning) return false;

    if (this.schedulerIntervalID) {
      window.clearInterval(this.schedulerIntervalID);
      this.schedulerIntervalID = null;
    }

    this.isRunning = false;
    return true;
  }

  getCurrentTime() {
    return this.audioContext ? this.audioContext.currentTime : 0;
  }

  _scheduler() {
    if (!this.audioContext) return;
    
    while (
      this.nextNoteTime <
      this.audioContext.currentTime + this.scheduleAheadTime
    ) {
      this._scheduleNote(this.nextNoteTime);
      this._updateBeat();
    }
  }

  _scheduleNote(time) {
    if (!this.audioContext) return;
    
    // Check if we should play a sound via callback
    if (this.onBeatCallback) {
      const shouldPlay = this.onBeatCallback(
        this.currentBeatInMeasure,
        time,
        this.nextNoteTime - this.audioContext.currentTime,
      );

      if (shouldPlay === false) {
        return; // Skip this beat
      }
    }
  }

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

  reset() {
    this.currentBeatInMeasure = 0;
    this.nextNoteTime = 0;
  }
}
