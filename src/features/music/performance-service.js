import { createContext } from "../component/context.js";
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
 * PerformanceService — canonical owner of persisted session history.
 *
 * [Phase 1] This service establishes performance as an explicit domain boundary.
 * Internal implementation details remain private.
 *
 * Event contract:
 *   - "session-saved": { detail: { session: Object } }
 *   - "session-deleted": { detail: { sessionId: string } }
 *
 * Usage (in app orchestrator and panes):
 *   const performanceService = new PerformanceService();
 *   performanceService.addEventListener("session-saved", (e) => { ... });
 *   performanceService.saveSession(sessionData);
 *   performanceService.getSessions();
 */
class PerformanceService extends EventTarget {
  constructor() {
    super();
    /** @type {PracticeSessionManager} */
    this._sessionManager = new PracticeSessionManager();
  }

  /**
   * Persist a completed session.
   * Emits "session-saved" with the saved session record.
   * @param {Object} sessionData Session object with plan, bpm, timeSignature, measureHits, etc.
   * @returns {Object}
   */
  saveSession(sessionData) {
    const saved = this._sessionManager.saveSession(sessionData);
    this.dispatchEvent(
      new CustomEvent("session-saved", {
        detail: { session: saved },
      }),
    );
    return saved;
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
    const deleted = this._sessionManager.deleteSession(sessionId);
    if (deleted) {
      this.dispatchEvent(
        new CustomEvent("session-deleted", {
          detail: { sessionId },
        }),
      );
    }
    return deleted;
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
