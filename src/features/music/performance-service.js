import { createContext } from "../component/context.js";
import Scorer from "../plan-play/scorer.js";
import PracticeSessionManager from "../plan-history/practice-session-manager.js";

/**
 * Context token. Provided by main composition root; consumed by panes during playback + history viewing.
 * @type {import('../component/context.js').Context<PerformanceService|null>}
 */
export const PerformanceServiceContext = createContext(
  "performance-service",
  null,
);

/**
 * PerformanceService — canonical owner of live scoring and session persistence.
 *
 * Composes:
 *   - Scorer: live hit registration and measure scoring
 *   - PracticeSessionManager: session recording, retrieval, and metrics derivation
 *
 * [Phase 1] This service establishes performance as an explicit domain boundary.
 * Internal implementation details (Scorer, PracticeSessionManager) remain private.
 * Consumers call only the public service API, not the internal components directly.
 *
 * Event contract:
 *   - "hit": { detail: { beatPosition: number } }
 *   - "measure-finalized": { detail: { measureIndex: number, score: number } }
 *   - "session-ended": { detail: { sessionData: Object } }
 *
 * Usage (in app orchestrator and panes):
 *   const performanceService = new PerformanceService();
 *   performanceService.addEventListener("hit", (e) => { ... });
 *   performanceService.registerHit(0.5);  // Register hit at 0.5 beats offset
 *   performanceService.getScores();       // Get all measure scores
 *   performanceService.recordSession(sessionData); // Save and derive metrics
 */
class PerformanceService extends EventTarget {
  constructor() {
    super();
    /** @type {Scorer} */
    this._scorer = new Scorer(4, 0.5); // default 4/4, 120 BPM
    /** @type {PracticeSessionManager} */
    this._sessionManager = new PracticeSessionManager();
  }

  /**
   * Configure the scorer for a session.
   * @param {number} beatsPerMeasure Time signature numerator (e.g., 4 for 4/4).
   * @param {number} beatDuration Seconds per beat (60/BPM).
   */
  configure(beatsPerMeasure, beatDuration) {
    this._scorer = new Scorer(beatsPerMeasure, beatDuration);
  }

  /**
   * Set the drill plan structure.
   * @param {Array<{type: "click-in"|"silent"|"playing"}>} measures Plan array.
   */
  setDrillPlan(measures) {
    this._scorer.setDrillPlan(measures);
  }

  /**
   * Register a hit during playback.
   * Emits "hit" event.
   * @param {number} beatPosition Time in beats from measure start (e.g., 0.5 for half beat).
   */
  registerHit(beatPosition) {
    this._scorer.registerHit(beatPosition);
    this.dispatchEvent(
      new CustomEvent("hit", {
        detail: { beatPosition },
      }),
    );
  }

  /**
   * Finalize a measure and compute its score.
   * Emits "measure-finalized" event with the score.
   * @param {number} measureIndex Index of the measure to finalize.
   */
  finalizeMeasure(measureIndex) {
    // Score is computed internally by Scorer.finalizeMeasure()
    this._scorer.finalizeMeasure(measureIndex);
    const score = this._scorer.getMeasureScore(measureIndex);
    this.dispatchEvent(
      new CustomEvent("measure-finalized", {
        detail: { measureIndex, score },
      }),
    );
  }

  /**
   * Get all measure scores.
   * @returns {number[]} Array of scores (0–99 per measure).
   */
  getScores() {
    return this._scorer.getAllScores();
  }

  /**
   * Get a single measure score.
   * @param {number} measureIndex Measure index.
   * @returns {number} Score 0–99.
   */
  getScore(measureIndex) {
    return this._scorer.getMeasureScore(measureIndex);
  }

  /**
   * Get the overall session score.
   * Averaged across all non-"click-in" measures.
   * @returns {number} Score 0–99.
   */
  getOverallScore() {
    return this._scorer.getOverallScore();
  }

  /**
   * Reset scoring state (typically at session start).
   */
  reset() {
    this._scorer.reset();
  }

  /**
   * Record a completed session.
   * Derives metrics (drift, missed, rhythm, etc.) and persists to storage.
   * Emits "session-ended" event.
   * @param {Object} sessionData Session object with plan, bpm, timeSignature, measureHits, etc.
   */
  recordSession(sessionData) {
    // Ensure this session's overall score is set from scorer
    sessionData.overallScore = this.getOverallScore();
    this._sessionManager.saveSession(sessionData);
    this.dispatchEvent(
      new CustomEvent("session-ended", {
        detail: { sessionData },
      }),
    );
  }

  /**
   * Retrieve all session records (newest first).
   * @returns {Object[]} Array of session records with derived metrics.
   */
  getSessions() {
    return this._sessionManager.getSessions();
  }

  /**
   * Get all sessions for a specific chart/plan.
   * @param {string} chartId Chart/plan ID.
   * @returns {Object[]} Sessions for that chart.
   */
  getSessionsForChart(chartId) {
    return this._sessionManager.getSessionsForPlan(chartId);
  }

  /**
   * Get a single session by ID.
   * @param {string} sessionId Session ID.
   * @returns {Object|null} Session record or null.
   */
  getSession(sessionId) {
    const sessions = this._sessionManager.getSessions();
    return sessions.find((s) => s.id === sessionId) || null;
  }

  /**
   * Delete a session record.
   * @param {string} sessionId Session ID to delete.
   */
  deleteSession(sessionId) {
    this._sessionManager.deleteSession(sessionId);
  }

  /**
   * Get aggregate statistics across all sessions.
   * @returns {Object} Overall stats (e.g., total sessions, avg score).
   */
  getOverallStats() {
    return this._sessionManager.getOverallStats();
  }

  /**
   * Clear all session records.
   */
  clearAllSessions() {
    this._sessionManager.clearAllSessions();
  }
}

export default PerformanceService;
