import StorageManager from "./storage-manager.js";

/** @typedef {any} SessionData */
/** @typedef {any} SessionRecord */

/**
 * PracticeSessionManager handles persistent storage and analysis of practice sessions.
 * Derives drummer-specific metrics including timing consistency, hit accuracy, and recommendations.
 */
class PracticeSessionManager {
  /**
   * Creates a new PracticeSessionManager instance.
   * Manages up to 100 stored practice sessions in browser storage.
   */
  constructor() {
    this.storageKey = "tempoTrainer.practiceSessions";
    this.maxSessions = 100;
  }

  /**
   * Saves a completed practice session with rich drummer metrics.
   * Automatically derives metrics from session data and stores the session.
   * @param {Object} sessionData - Session data including plan, BPM, hits, and scores
   * @param {Object} sessionData.plan - The practice plan used ({id, name, difficulty, segments})
   * @param {number} sessionData.bpm - Beats per minute used in session
   * @param {string} sessionData.timeSignature - Time signature (e.g., "4/4")
   * @param {boolean} sessionData.completed - Whether session was fully completed
   * @param {number} sessionData.durationSeconds - Total session duration in seconds
   * @param {Array<Array<number>>} sessionData.measureHits - Hit beat times per measure
   * @param {Array<number>} sessionData.measureScores - Score for each measure
   * @param {Array<any>} sessionData.drillPlan - The parsed drill plan structure
   * @param {number} sessionData.overallScore - Overall session score
   * @returns {SessionRecord|null} The saved session with derived metrics, or null if save failed
   */
  saveSession(sessionData) {
    const session = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      plan: sessionData.plan, // { id, name, difficulty, segments }
      bpm: sessionData.bpm,
      timeSignature: sessionData.timeSignature,
      completed: sessionData.completed,
      durationSeconds: sessionData.durationSeconds,

      // Raw hit data
      measureHits: sessionData.measureHits, // Array of hit times per measure
      measureScores: sessionData.measureScores, // Score for each measure
      drillPlan: sessionData.drillPlan, // The actual plan structure
      overallScore: sessionData.overallScore,

      // Derived metrics (calculated on save)
      metrics: this.deriveMetrics(sessionData),
    };

    let sessions = this.getSessions();
    sessions.unshift(session);

    if (sessions.length > this.maxSessions) {
      sessions = sessions.slice(0, this.maxSessions);
    }

    try {
      StorageManager.set(this.storageKey, JSON.stringify(sessions));
      return session;
    } catch (e) {
      console.error("Failed to save practice session:", e);
      return null;
    }
  }

  /**
   * Derives drummer-specific metrics from session data.
   * Calculates drift (tempo control), missed measures, rhythm consistency, and weak spots.
   * @param {SessionData} sessionData - Raw session data to analyze
   * @returns {any} Metrics object with drift, missed, rhythm, weakSpots, consistency, completion
   */
  deriveMetrics(sessionData) {
    /** @type {any} */
    const metrics = {};

    // 1. DRIFT - Tempo consistency (early vs late hits)
    metrics.drift = this.calculateDrift(sessionData);

    // 2. MISSED - Measures with few/no hits
    metrics.missed = this.calculateMissed(sessionData);

    // 3. RHYTHM - Consistency of hit timing
    metrics.rhythm = this.calculateRhythm(sessionData);

    // 4. WEAK SPOTS - Measures with lowest scores
    metrics.weakSpots = this.findWeakSpots(sessionData);

    // 5. CONSISTENCY - Score variance
    metrics.consistency = this.calculateConsistency(sessionData);

    // 6. COMPLETION - How much of the plan was completed
    metrics.completion = this.calculateCompletion(sessionData);

    return metrics;
  }

  /**
   * Calculates tempo drift - whether hits are consistently early or late.
   * Shows tempo control: positive = hitting late/dragging, negative = hitting early/rushing
   * @param {SessionData} sessionData - Session data with measureHits and drillPlan
   * @returns {any} Drift metrics with avgErrorBeats, direction, severity, and description
   */
  calculateDrift(sessionData) {
    const { measureHits, drillPlan, timeSignature } = sessionData;
    const beatsPerMeasure = parseInt(timeSignature.split("/")[0], 10);

    /** @type {number[]} */
    const errors = []; // Timing errors in beats (positive = late, negative = early)

    measureHits.forEach((/** @type {number[]} */ hits, /** @type {number} */ measureIndex) => {
      if (drillPlan[measureIndex]?.type === "click-in") return;
      if (hits.length === 0) return;

      /** @type {number[]} */
      const expectedBeats = [];
      const measureStartBeat = measureIndex * beatsPerMeasure;

      for (let i = 0; i < beatsPerMeasure; i++) {
        expectedBeats.push(measureStartBeat + i);
      }

      // Match hits to expected beats
      hits.forEach((/** @type {number} */ hitBeat) => {
        const closest = expectedBeats.reduce((prev, curr) =>
          Math.abs(curr - hitBeat) < Math.abs(prev - hitBeat) ? curr : prev
        );
        errors.push(hitBeat - closest); // Negative = early, positive = late
      });
    });

    if (errors.length === 0) {
      return {
        avgErrorBeats: 0,
        direction: "balanced",
        severity: "none",
        description: "No hits detected",
      };
    }

    const avgError = errors.reduce((a, b) => a + b) / errors.length;
    const absAvgError = Math.abs(avgError);

    return {
      avgErrorBeats: Math.round(avgError * 100) / 100,
      direction: avgError > 0.05 ? "late" : avgError < -0.05 ? "early" : "balanced",
      severity: absAvgError > 0.3 ? "high" : absAvgError > 0.15 ? "medium" : "low",
      count: errors.length,
      description: this.getDriftDescription(avgError),
    };
  }

  /** @param {number} avgError */
  getDriftDescription(avgError) {
    const absError = Math.abs(avgError);
    const direction = avgError > 0 ? "late" : "early";

    if (absError < 0.05) return "Excellent tempo control";
    if (absError < 0.15) return `Consistently slightly ${direction}`;
    if (absError < 0.3) return `Noticeably ${direction} - focus on steadying tempo`;
    return `Significantly ${direction} - major tempo control issue`;
  }

  /**
   * Calculates missed measures - which measures had no hits or few hits.
   * Indicates focus/concentration issues or technical breakdowns during practice.
   * @param {SessionData} sessionData - Session data with measureHits and drillPlan
   * @returns {any} Missed metrics with counts, indices, and description
   */
  calculateMissed(sessionData) {
    const { measureHits, drillPlan, timeSignature } = sessionData;
    const beatsPerMeasure = parseInt(timeSignature.split("/")[0], 10);

    /** @type {number[]} */
    const missedMeasures = [];
    /** @type {{ measureIndex: number, hits: number, expected: number, missing: number }[]} */
    const partialMeasures = [];

    measureHits.forEach((/** @type {number[]} */ hits, /** @type {number} */ measureIndex) => {
      if (drillPlan[measureIndex]?.type === "click-in") return;

      const expectedHits = beatsPerMeasure;
      const hitCount = hits.length;

      if (hitCount === 0) {
        missedMeasures.push(measureIndex);
      } else if (hitCount < expectedHits) {
        partialMeasures.push({
          measureIndex,
          hits: hitCount,
          expected: expectedHits,
          missing: expectedHits - hitCount,
        });
      }
    });

    return {
      completelMissed: missedMeasures.length,
      partialMissed: partialMeasures.length,
      missedMeasures,
      partialMeasures,
      description: this.getMissedDescription(missedMeasures, partialMeasures),
    };
  }

  /**
   * @param {number[]} missed
   * @param {{ measureIndex: number, hits: number, expected: number, missing: number }[]} partial
   */
  getMissedDescription(missed, partial) {
    if (missed.length === 0 && partial.length === 0) {
      return "All measures attempted";
    }
    if (missed.length > 0) {
      return `${missed.length} measures completely missed`;
    }
    return `${partial.length} measures with incomplete hits`;
  }

  /**
   * Calculates rhythm consistency - how even are the intervals between hits.
   * Lower variance indicates better rhythm sense and control.
   * @param {SessionData} sessionData - Session data with measureHits array
   * @returns {any} Rhythm metrics with variance, consistency level, and description
   */
  calculateRhythm(sessionData) {
    const { measureHits } = sessionData;

    // Calculate inter-hit intervals
    /** @type {number[]} */
    const intervals = [];
    measureHits.forEach((/** @type {number[]} */ hits) => {
      if (hits.length < 2) return;
      for (let i = 0; i < hits.length - 1; i++) {
        intervals.push(hits[i + 1] - hits[i]);
      }
    });

    if (intervals.length === 0) {
      return {
        variance: 0,
        consistency: "unknown",
        description: "Insufficient data",
      };
    }

    const avg = intervals.reduce((a, b) => a + b) / intervals.length;
    const variance =
      intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coeffVar = stdDev / avg; // Coefficient of variation

    return {
      avgInterval: Math.round(avg * 100) / 100,
      variance: Math.round(coeffVar * 100),
      consistency: coeffVar < 0.1 ? "excellent" : coeffVar < 0.2 ? "good" : "variable",
      description: this.getRhythmDescription(coeffVar),
    };
  }

  /** @param {number} coeffVar */
  getRhythmDescription(coeffVar) {
    if (coeffVar < 0.1) return "Excellent rhythm consistency";
    if (coeffVar < 0.2) return "Good rhythm, minor timing variations";
    if (coeffVar < 0.35) return "Moderate timing variance - work on consistency";
    return "Poor rhythm consistency - focus on even spacing";
  }

  /**
   * Finds weak spots - measures with the lowest scores in the session.
   * Identifies technical problem areas for focused practice.
   * @param {SessionData} sessionData - Session data with measureScores and drillPlan
   * @returns {any} Weak spots with weakestMeasures array and average score
   */
  findWeakSpots(sessionData) {
    const { measureScores, drillPlan } = sessionData;

    const scoredMeasures = measureScores
      .map((/** @type {number|null} */ score, /** @type {number} */ index) => ({
        index,
        score: score === null ? -1 : score,
        type: drillPlan[index]?.type,
      }))
      .filter(
        (/** @type {{ index: number, score: number, type: string }} */ m) =>
          m.type !== "click-in" && m.score >= 0
      )
      .sort(
        (/** @type {{ score: number }} */ a, /** @type {{ score: number }} */ b) =>
          a.score - b.score
      );

    return {
      weakestMeasures: scoredMeasures.slice(0, 5),
      avgScore: Math.round(
        scoredMeasures.reduce(
          (/** @type {number} */ sum, /** @type {{ score: number }} */ m) => sum + m.score,
          0
        ) / scoredMeasures.length
      ),
    };
  }

  /**
   * Calculates consistency - how variable are the measure scores.
   * High standard deviation indicates inconsistent performance across measures.
   * @param {SessionData} sessionData - Session data with measureScores and drillPlan
   * @returns {any} Consistency metrics with stdDeviation, range, and consistency level
   */
  calculateConsistency(sessionData) {
    const { measureScores, drillPlan } = sessionData;

    const scores = measureScores.filter(
      (/** @type {number|null} */ score, /** @type {number} */ index) =>
        score !== null && drillPlan[index]?.type !== "click-in"
    );

    if (scores.length === 0) return { variance: 0, consistency: "unknown" };

    const avg =
      scores.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce(
        (/** @type {number} */ sum, /** @type {number} */ val) => sum + Math.pow(val - avg, 2),
        0
      ) / scores.length;
    const stdDev = Math.sqrt(variance);

    return {
      stdDeviation: Math.round(stdDev),
      consistency: stdDev < 8 ? "steady" : stdDev < 15 ? "variable" : "inconsistent",
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      range: Math.max(...scores) - Math.min(...scores),
    };
  }

  /**
   * Calculates completion - what percentage of the plan was covered.
   * @param {SessionData} sessionData - Session data with completed flag and durationSeconds
   * @returns {any} Completion metrics with percentage and completion status
   */
  calculateCompletion(sessionData) {
    const { drillPlan, completed, durationSeconds } = sessionData;

    const totalMeasures = drillPlan.length;
    const percentage = completed
      ? 100
      : Math.round((durationSeconds / (totalMeasures * 0.5)) * 100);

    return {
      completed,
      percentage: Math.min(100, percentage),
      description: completed ? "Full session completed" : "Session stopped early",
    };
  }

  /**
   * Retrieves all stored practice sessions, sorted by most recent first.
   * @returns {SessionRecord[]} Array of session objects
   */
  getSessions() {
    try {
      const stored = StorageManager.get(this.storageKey, "[]");
      return JSON.parse(stored || "[]");
    } catch {
      return [];
    }
  }

  /**
   * Retrieves all sessions for a specific practice plan.
   * @param {string} planId - The plan ID to filter by
   * @returns {SessionRecord[]} Array of sessions for that plan
   */
  getSessionsForPlan(planId) {
    return this.getSessions().filter((s) => s.plan.id === planId);
  }

  /**
   * Calculates aggregate statistics across all stored practice sessions.
   * @returns {any|null} Aggregate stats with totals, averages, and best score, or null if no sessions
   */
  getOverallStats() {
    const sessions = this.getSessions();
    if (sessions.length === 0) return null;

    const completedSessions = sessions.filter((s) => s.completed);
    const avgScore = sessions.reduce((sum, s) => sum + s.overallScore, 0) / sessions.length;

    return {
      totalSessions: sessions.length,
      completedSessions: completedSessions.length,
      completionRate: Math.round((completedSessions.length / sessions.length) * 100),
      averageScore: Math.round(avgScore),
      bestScore: Math.max(...sessions.map((s) => s.overallScore)),
      mostPracticedPlan: this.findMostPracticedPlan(sessions),
    };
  }

  /** @param {SessionRecord[]} sessions */
  findMostPracticedPlan(sessions) {
    /** @type {Record<string, number>} */
    const planCounts = {};
    sessions.forEach((s) => {
      const key = s.plan.id;
      planCounts[key] = (planCounts[key] || 0) + 1;
    });

    const mostUsed = Object.entries(planCounts).sort(([, a], [, b]) => b - a)[0];

    if (!mostUsed) return null;

    const [planId, count] = mostUsed;
    const session = sessions.find((s) => s.plan.id === planId);

    return {
      planId,
      planName: session.plan.name,
      sessions: count,
    };
  }

  /**
   * Exports a practice session as a JSON string for download or sharing.
   * @param {string} sessionId - The ID of the session to export
   * @returns {string|null} JSON string of the session or null if not found
   */
  exportSession(sessionId) {
    const sessions = this.getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    return session ? JSON.stringify(session, null, 2) : null;
  }

  /**
   * Clears all stored practice sessions from storage.
   * Use with caution - this action cannot be undone.
   */
  clearSessions() {
    StorageManager.set(this.storageKey, "[]");
  }
}

export default PracticeSessionManager;
