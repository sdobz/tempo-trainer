/**
 * Practice Session Manager
 * Stores detailed practice session data with drummer-specific metrics and recommendations
 */
class PracticeSessionManager {
  constructor() {
    this.storageKey = "tempoTrainer.practiceSessions";
    this.maxSessions = 100;
  }

  /**
   * Save a completed practice session with rich data
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
   * Derive drummer-relevant metrics from session data
   */
  deriveMetrics(sessionData) {
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
   * DRIFT: Are hits consistently early or late?
   * This shows tempo control - if you're always 50ms late, you're rushing or dragging
   */
  calculateDrift(sessionData) {
    const { measureHits, drillPlan, timeSignature } = sessionData;
    const beatsPerMeasure = parseInt(timeSignature.split("/")[0], 10);

    const errors = []; // Timing errors in beats (positive = late, negative = early)

    measureHits.forEach((hits, measureIndex) => {
      if (drillPlan[measureIndex]?.type === "click-in") return;
      if (hits.length === 0) return;

      const expectedBeats = [];
      const measureStartBeat = measureIndex * beatsPerMeasure;

      for (let i = 0; i < beatsPerMeasure; i++) {
        expectedBeats.push(measureStartBeat + i);
      }

      // Match hits to expected beats
      hits.forEach((hitBeat) => {
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

  getDriftDescription(avgError) {
    const absError = Math.abs(avgError);
    const direction = avgError > 0 ? "late" : "early";

    if (absError < 0.05) return "Excellent tempo control";
    if (absError < 0.15) return `Consistently slightly ${direction}`;
    if (absError < 0.3) return `Noticeably ${direction} - focus on steadying tempo`;
    return `Significantly ${direction} - major tempo control issue`;
  }

  /**
   * MISSED: Which measures had no hits or very few hits?
   */
  calculateMissed(sessionData) {
    const { measureHits, drillPlan, timeSignature } = sessionData;
    const beatsPerMeasure = parseInt(timeSignature.split("/")[0], 10);

    const missedMeasures = [];
    const partialMeasures = [];

    measureHits.forEach((hits, measureIndex) => {
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
   * RHYTHM: How consistent are the hit times within measures?
   * Lower variance = better rhythm sense
   */
  calculateRhythm(sessionData) {
    const { measureHits } = sessionData;

    // Calculate inter-hit intervals
    const intervals = [];
    measureHits.forEach((hits) => {
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

  getRhythmDescription(coeffVar) {
    if (coeffVar < 0.1) return "Excellent rhythm consistency";
    if (coeffVar < 0.2) return "Good rhythm, minor timing variations";
    if (coeffVar < 0.35) return "Moderate timing variance - work on consistency";
    return "Poor rhythm consistency - focus on even spacing";
  }

  /**
   * WEAK SPOTS: Which measures scored lowest?
   */
  findWeakSpots(sessionData) {
    const { measureScores, drillPlan } = sessionData;

    const scoredMeasures = measureScores
      .map((score, index) => ({
        index,
        score: score === null ? -1 : score,
        type: drillPlan[index]?.type,
      }))
      .filter((m) => m.type !== "click-in" && m.score >= 0)
      .sort((a, b) => a.score - b.score);

    return {
      weakestMeasures: scoredMeasures.slice(0, 5),
      avgScore: Math.round(
        scoredMeasures.reduce((sum, m) => sum + m.score, 0) / scoredMeasures.length
      ),
    };
  }

  /**
   * CONSISTENCY: How variable are the scores across measures?
   */
  calculateConsistency(sessionData) {
    const { measureScores, drillPlan } = sessionData;

    const scores = measureScores.filter(
      (score, index) => score !== null && drillPlan[index]?.type !== "click-in"
    );

    if (scores.length === 0) return { variance: 0, consistency: "unknown" };

    const avg = scores.reduce((a, b) => a + b) / scores.length;
    const variance = scores.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / scores.length;
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
   * COMPLETION: What percentage of the plan was covered?
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
   * Get all sessions
   */
  getSessions() {
    try {
      const stored = StorageManager.get(this.storageKey, "[]");
      return JSON.parse(stored);
    } catch (_e) {
      return [];
    }
  }

  /**
   * Get sessions for a specific plan
   */
  getSessionsForPlan(planId) {
    return this.getSessions().filter((s) => s.plan.id === planId);
  }

  /**
   * Get stats across all sessions
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

  findMostPracticedPlan(sessions) {
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
   * Export session as JSON
   */
  exportSession(sessionId) {
    const sessions = this.getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    return session ? JSON.stringify(session, null, 2) : null;
  }

  /**
   * Clear all sessions
   */
  clearSessions() {
    StorageManager.set(this.storageKey, "[]");
  }
}
