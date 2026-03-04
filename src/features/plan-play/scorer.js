/**
 * Scorer manages the scoring system for measuring hit accuracy against expected beats.
 */
/** @typedef {{ type: string }} Measure */
class Scorer {
  /**
   * @param {number} beatsPerMeasure
   * @param {number} beatDuration
   */
  constructor(beatsPerMeasure, beatDuration) {
    this.beatsPerMeasure = beatsPerMeasure;
    this.beatDuration = beatDuration;

    // Scoring parameters
    this.bestFeasibleErrorMs = 18;
    this.maxScorableErrorMs = 220;
    this.lateHitAssignmentWindowBeats = 0.65;

    // State
    /** @type {(number|null)[]} */
    this.measureScores = [];
    /** @type {number[][]} */
    this.measureHits = [];
    /** @type {boolean[]} */
    this.finalizedMeasures = [];
    /** @type {Measure[]} */
    this.drillPlan = [];
  }

  /** @param {number} beatsPerMeasure */
  setBeatsPerMeasure(beatsPerMeasure) {
    this.beatsPerMeasure = beatsPerMeasure;
  }

  /** @param {number} beatDuration */
  setBeatDuration(beatDuration) {
    this.beatDuration = beatDuration;
  }

  /** @param {Measure[]} plan */
  setDrillPlan(plan) {
    this.drillPlan = plan;
    this.reset();
  }

  reset() {
    this.measureScores = Array.from(
      { length: this.drillPlan.length },
      (_unused, index) => this.drillPlan[index]?.type === "click-in" ? null : 0,
    );
    this.measureHits = Array.from({ length: this.drillPlan.length }, () => []);
    this.finalizedMeasures = Array.from(
      { length: this.drillPlan.length },
      () => false,
    );
  }

  /** @param {number} beatPosition */
  registerHit(beatPosition) {
    const measureIndex = this._findClosestScoringMeasure(beatPosition);
    if (measureIndex >= 0) {
      this.measureHits[measureIndex].push(beatPosition);
      return measureIndex;
    }
    return -1;
  }

  /** @param {number} measureIndex */
  finalizeMeasure(measureIndex) {
    if (measureIndex < 0 || measureIndex >= this.drillPlan.length) return;
    if (this.finalizedMeasures[measureIndex]) return;

    const measureType = this.drillPlan[measureIndex]?.type;

    if (measureType === "click-in") {
      this.measureScores[measureIndex] = null;
      this.finalizedMeasures[measureIndex] = true;
      return;
    }

    const hits = [...(this.measureHits[measureIndex] || [])].sort((a, b) =>
      a - b
    );

    if (hits.length === 0) {
      this.measureScores[measureIndex] = 0;
      this.finalizedMeasures[measureIndex] = true;
      return;
    }

    /** @type {number[]} */
    const expectedBeats = [];
    const measureStartBeat = measureIndex * this.beatsPerMeasure;
    for (let beatOffset = 0; beatOffset < this.beatsPerMeasure; beatOffset++) {
      expectedBeats.push(measureStartBeat + beatOffset);
    }

    const usedHitIndices = new Set();
    let scoreSum = 0;

    expectedBeats.forEach((expectedBeat) => {
      let bestHitIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;

      hits.forEach((hitBeat, hitIndex) => {
        if (usedHitIndices.has(hitIndex)) return;
        const distance = Math.abs(hitBeat - expectedBeat);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestHitIndex = hitIndex;
        }
      });

      if (bestHitIndex === -1) {
        return;
      }

      usedHitIndices.add(bestHitIndex);
      const errorMs = bestDistance * this.beatDuration * 1000;
      scoreSum += this._scoreFromErrorMs(errorMs);
    });

    this.measureScores[measureIndex] = Math.max(
      0,
      Math.min(99, Math.round(scoreSum / this.beatsPerMeasure)),
    );
    this.finalizedMeasures[measureIndex] = true;
  }

  /** @param {number} measureIndex */
  getMeasureScore(measureIndex) {
    return this.measureScores[measureIndex];
  }

  getAllScores() {
    return [...this.measureScores];
  }

  getOverallScore() {
    if (this.drillPlan.length === 0) return 0;

    let total = 0;
    let count = 0;

    this.drillPlan.forEach((measure, index) => {
      if (measure.type === "click-in") return;
      total += this.measureScores[index] ?? 0;
      count++;
    });

    if (count === 0) return 0;
    return Math.max(0, Math.min(99, Math.round(total / count)));
  }

  /** @param {number} errorMs */
  _scoreFromErrorMs(errorMs) {
    const adjustedErrorMs = Math.max(0, errorMs - this.bestFeasibleErrorMs);
    const normalized = Math.min(1, adjustedErrorMs / this.maxScorableErrorMs);
    const curved = Math.pow(normalized, 0.85);
    return Math.max(0, Math.min(99, Math.round((1 - curved) * 99)));
  }

  /** @param {number} beatPosition */
  _findClosestScoringMeasure(beatPosition) {
    const roughIndex = Math.floor(beatPosition / this.beatsPerMeasure);
    const candidates = [roughIndex - 1, roughIndex, roughIndex + 1];
    let bestMeasureIndex = -1;
    let bestBeatDistance = Number.POSITIVE_INFINITY;

    candidates.forEach((measureIndex) => {
      if (measureIndex < 0 || measureIndex >= this.drillPlan.length) return;
      if (this.drillPlan[measureIndex]?.type === "click-in") return;

      const measureStartBeat = measureIndex * this.beatsPerMeasure;
      for (
        let beatOffset = 0;
        beatOffset < this.beatsPerMeasure;
        beatOffset++
      ) {
        const expectedBeat = measureStartBeat + beatOffset;
        const distance = Math.abs(beatPosition - expectedBeat);
        if (distance < bestBeatDistance) {
          bestBeatDistance = distance;
          bestMeasureIndex = measureIndex;
        }
      }
    });

    if (bestBeatDistance > this.lateHitAssignmentWindowBeats) {
      return -1;
    }

    return bestMeasureIndex;
  }
}

export default Scorer;
