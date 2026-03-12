/**
 * Scorer is the canonical live scoring engine for a single practice run.
 *
 * It owns:
 * - Hit registration: maps incoming beat positions to the nearest expected beat in a measure
 * - Measure finalization: computes a per-measure score (0–99) when the measure ends
 * - Session-level aggregation: overall score, all scores array
 * - The authoritative scoring formula (see static {@link Scorer.scoreFromErrorMs})
 *
 * Callers should snapshot {@link Scorer#getAllScores} and {@link Scorer#measureHits}
 * when finalizing a run and include them in SessionData so downstream consumers
 * (TrainingManager, PlanHistoryPane) can use the already-computed scores
 * rather than recomputing from raw hits.
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

  /**
   * Update the drill plan. Does NOT reset scores — call reset() explicitly
   * when starting a new session. This prevents a plan navigation event from
   * wiping scores from a just-completed session.
   * @param {Measure[]} plan
   */
  setDrillPlan(plan) {
    this.drillPlan = plan;
  }

  reset() {
    this.measureScores = Array.from(
      { length: this.drillPlan.length },
      (_unused, index) =>
        this.drillPlan[index]?.type === "click-in" ? null : 0,
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

    const hits = [...(this.measureHits[measureIndex] || [])].sort(
      (a, b) => a - b,
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
    return Scorer.scoreFromErrorMs(
      errorMs,
      this.bestFeasibleErrorMs,
      this.maxScorableErrorMs,
    );
  }

  /**
   * Canonical scoring function. Single authoritative implementation used by
   * both the live scorer and historical analysis (TrainingManager).
   * Returns a score 0–99 for a given timing error in milliseconds.
   *
   * @param {number} errorMs - Timing error in milliseconds (absolute value)
   * @param {number} [bestFeasibleErrorMs=18] - Errors below this threshold score 99
   * @param {number} [maxScorableErrorMs=220] - Errors above this threshold score 0
   * @returns {number} Score 0–99
   */
  static scoreFromErrorMs(
    errorMs,
    bestFeasibleErrorMs = 18,
    maxScorableErrorMs = 220,
  ) {
    const adjustedErrorMs = Math.max(0, errorMs - bestFeasibleErrorMs);
    // Divide by the scorable range so the boundary (maxScorableErrorMs) normalises to exactly 1 → score 0
    const range = maxScorableErrorMs - bestFeasibleErrorMs;
    const normalized = Math.min(1, adjustedErrorMs / range);
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
