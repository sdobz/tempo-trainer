/** @typedef {{ on: number, off: number, reps: number }} Segment */
/** @typedef {{ id: string, name: string, description: string, difficulty: string, segments: Segment[] }} SessionPlan */
/** @typedef {{ description: string, severity: string, direction: string, avgErrorBeats: number }} DriftMetrics */
/** @typedef {{ description: string, completelMissed: number, partialMissed: number }} MissedMetrics */
/** @typedef {{ consistency: string }} RhythmMetrics */
/** @typedef {{ stdDeviation?: number, consistency: string, range?: number }} ConsistencyMetrics */
/** @typedef {{ completed: boolean, percentage: number }} CompletionMetrics */
/** @typedef {{ drift: DriftMetrics, missed: MissedMetrics, rhythm: RhythmMetrics, consistency: ConsistencyMetrics, completion: CompletionMetrics }} SessionMetrics */
/** @typedef {{ id: string, bpm: number, overallScore: number, completed: boolean, timestamp: string, durationSeconds: number, plan: SessionPlan, metrics: SessionMetrics, measureScores?: number[] }} Session */
/** @typedef {{ selectPlanByObject: (plan: SessionPlan) => void }} PlanEditorUI */
/** @typedef {{ navigate: (paneName: string) => void }} PaneManager */
/** @typedef {{ category: string, priority: string, suggestion: string, action: string }} Recommendation */

/**
 * HistoryDisplayUI manages the display of practice session history with detailed metrics and recommendations.
 * Consolidates historical review, performance analysis, and learning suggestions.
 */
class HistoryDisplayUI {
  /**
   * Creates a new HistoryDisplayUI instance.
   * @param {HTMLElement} listContainer - Container element for session list
   * @param {PlanEditorUI} planEditorUI - Reference to plan editor for retry functionality
   * @param {PaneManager} paneManager - Reference to pane manager for navigation
   */
  constructor(listContainer, planEditorUI, paneManager) {
    this.listContainer = listContainer;
    this.planEditorUI = planEditorUI;
    this.paneManager = paneManager;
    this.expandedSessionId = null;
  }

  /**
   * Displays all practice sessions with detailed metrics and options.
   * @param {Array<Session>} sessions - Array of session objects to display
   * @param {string|null} [expandSessionId=null] - Optional session ID to expand, defaults to first session
   */
  displaySessions(sessions, expandSessionId = null) {
    if (!this.listContainer) return;

    this.listContainer.innerHTML = "";

    if (sessions.length === 0) {
      this.listContainer.innerHTML = `
        <div class="empty-history">
          <p>No practice sessions yet. Start a drill to see your progress!</p>
        </div>
      `;
      return;
    }

    sessions.forEach((session, index) => {
      const isExpanded = expandSessionId ? session.id === expandSessionId : index === 0;
      const sessionEl = this.renderSession(session, isExpanded);
      this.listContainer.appendChild(sessionEl);
    });

    // Set up click handlers for expanding/collapsing
    this.listContainer.querySelectorAll(".history-session-header").forEach((header) => {
      const headerEl = /** @type {HTMLElement} */ (header);
      header.addEventListener("click", (_e) => {
        const sessionId = headerEl.dataset.sessionId || "";
        this.toggleSessionExpanded(sessionId);
      });
    });

    // Set up action button handlers
    this.listContainer.querySelectorAll(".retry-session-btn").forEach((btn) => {
      const btnEl = /** @type {HTMLElement} */ (btn);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const sessionId = btnEl.dataset.sessionId;
        const session = sessions.find((s) => s.id === sessionId);
        if (session && session.plan) {
          this.planEditorUI.selectPlanByObject(session.plan);
          this.paneManager.navigate("plan-play");
        }
      });
    });

    this.listContainer.querySelectorAll(".select-plan-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.paneManager.navigate("plan-edit");
      });
    });
  }

  /**
   * Renders a single session element with collapsible details.
   * @param {Session} session - Session object containing plan, score, timestamps, and metrics
   * @param {boolean} [isExpanded=false] - Whether to show session details initially expanded
   * @returns {HTMLElement} The rendered session element
   */
  renderSession(session, isExpanded = false) {
    const { plan, overallScore, completed, timestamp, metrics, durationSeconds } = session;
    const date = new Date(timestamp);
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const statusColor = completed ? "#4ade80" : "#f87171";
    const statusText = completed ? "✓ Completed" : "⊙ Stopped";

    const container = document.createElement("div");
    container.className = `history-session ${isExpanded ? "expanded" : ""}`;
    container.dataset.sessionId = session.id;

    container.innerHTML = `
      <div class="history-session-header" data-session-id="${session.id}">
        <div class="session-header-left">
          <div class="session-chevron">▼</div>
          <div class="session-score" title="Overall score">${String(overallScore).padStart(2, "0")}</div>
          <div class="session-plan">${plan.name}</div>
        </div>
        <div class="session-header-right">
          <div class="session-status" style="color: ${statusColor};">${statusText}</div>
          <div class="session-datetime">${dateStr} ${timeStr}</div>
        </div>
      </div>

      ${this.renderSessionDetails(session, plan, metrics, durationSeconds)}
    `;

    return container;
  }

  /**
   * Renders detailed session information with analysis, metrics, and recommendations.
   * @param {Session} session - Session object with all timing and scoring data
   * @param {SessionPlan} plan - The practice plan used in the session
   * @param {SessionMetrics} metrics - Analyzed metrics object (drift, accuracy, rhythm, consistency)
   * @param {number} duration - Session duration in seconds
   * @returns {string} HTML string with detailed session information
   */
  renderSessionDetails(session, plan, metrics, duration) {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const recommendations = this.generateRecommendations(session, metrics);

    return `
      <div class="session-details">
        <!-- Plan Details & Metrics Summary -->
        <div class="details-row">
          <div class="detail-section">
            <div class="detail-title">Plan Details</div>
            <div class="detail-content">
              <p><strong>Name:</strong> ${plan.name}</p>
              <p><strong>Difficulty:</strong> ${plan.difficulty || "N/A"}</p>
              <p><strong>BPM:</strong> ${session.bpm}</p>
              <p><strong>Duration:</strong> ${minutes}m ${seconds}s</p>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-title">Metrics</div>
            <div class="detail-metrics">
              <div class="metric-item">
                <span class="metric-name">Tempo Control:</span>
                <span class="metric-value">${metrics.drift.description}</span>
              </div>
              <div class="metric-item">
                <span class="metric-name">Accuracy:</span>
                <span class="metric-value">${metrics.missed.description}</span>
              </div>
              <div class="metric-item">
                <span class="metric-name">Rhythm:</span>
                <span class="metric-value">${metrics.rhythm.consistency}</span>
              </div>
              <div class="metric-item">
                <span class="metric-name">Consistency:</span>
                <span class="metric-value">±${metrics.consistency.stdDeviation}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Performance Trends Analysis -->
        ${
          session.measureScores && session.measureScores.length > 0
            ? `
          <div class="details-row">
            <div class="detail-section">
              <div class="detail-title">📊 Performance Trends</div>
              <div class="detail-content">
                ${this.renderPerformanceTrends(session.measureScores)}
              </div>
            </div>
          </div>
        `
            : ""
        }

        <!-- Recommendations -->
        ${
          recommendations.length > 0
            ? `
          <div class="details-row">
            <div class="detail-section">
              <div class="detail-title">💡 Recommendations</div>
              <div class="detail-content">
                ${recommendations
                  .slice(0, 3)
                  .map(
                    (r) => `
                    <p style="margin-bottom: 0.6em; padding-bottom: 0.6em; border-bottom: 1px solid #3a3a3a;">
                      <strong style="color: #60a5fa;">${r.category} (${r.priority})</strong><br>
                      <span style="color: #aaa; font-size: 0.9em;">${r.suggestion}</span><br>
                      <span style="color: #888; font-size: 0.85em; font-style: italic;">→ ${r.action}</span>
                    </p>
                  `
                  )
                  .join("")}
              </div>
            </div>
          </div>
        `
            : `
          <div class="details-row">
            <div class="detail-section">
              <div class="detail-title">✨ Performance</div>
              <div class="detail-content">
                <p>Excellent session! Keep up the great work.</p>
              </div>
            </div>
          </div>
        `
        }

        <!-- Actions -->
        <div class="session-actions">
          <button class="retry-session-btn" data-session-id="${session.id}">
            🔄 Retry This Plan
          </button>
          <button class="select-plan-btn" data-session-id="${session.id}">
            📋 Select Different Plan
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Generates personalized recommendations based on session performance metrics.
   * @param {Session} session - Session object with overall score and completion status
   * @param {SessionMetrics} metrics - Analyzed metrics object with drift, accuracy, rhythm data
   * @returns {Recommendation[]} Array of recommendation objects with category, priority, suggestion, and action
   */
  generateRecommendations(session, metrics) {
    /** @type {Recommendation[]} */
    const recommendations = [];

    // Drift recommendations
    if (metrics.drift.severity === "high") {
      recommendations.push({
        category: "Tempo",
        priority: "high",
        suggestion: `Tempo control needed: You're consistently ${metrics.drift.direction} by ~${Math.abs(metrics.drift.avgErrorBeats * 500)}ms. Focus on steady internal clock.`,
        action: "Slow down and count in your head. Try the calibration exercise again.",
      });
    } else if (metrics.drift.severity === "medium") {
      recommendations.push({
        category: "Tempo",
        priority: "medium",
        suggestion: `Minor tempo drift detected (${metrics.drift.direction}). Your timing is mostly good but could be tighter.`,
        action: "Use a metronome between drills to build tempo awareness.",
      });
    }

    // Missed recommendations
    if (metrics.missed.completelMissed > 0) {
      recommendations.push({
        category: "Focus",
        priority: "high",
        suggestion: `${metrics.missed.completelMissed} measure(s) were completely missed - concentration issue?`,
        action:
          "Try shorter, more focused practice sessions. Stop and reset if you lose concentration.",
      });
    }

    if (metrics.missed.partialMissed > 2) {
      recommendations.push({
        category: "Accuracy",
        priority: "medium",
        suggestion: `Several measures had incomplete hits. Clean up your technique.`,
        action: "Work on the weak measures separately. Slow down and focus on each beat.",
      });
    }

    // Rhythm recommendations
    if (metrics.rhythm.consistency === "variable" || metrics.rhythm.consistency === "unknown") {
      recommendations.push({
        category: "Rhythm",
        priority: "medium",
        suggestion: `Timing between hits is inconsistent. Your rhythm sense needs work.`,
        action: "Practice with a metronome. Feel the pulse, don't just hit randomly.",
      });
    }

    // Consistency recommendations
    if (metrics.consistency.consistency === "inconsistent") {
      recommendations.push({
        category: "Performance",
        priority: "high",
        suggestion: `Your scores vary wildly (${metrics.consistency.range} point range). Some measures are much weaker.`,
        action: "Focus on the weakest measures. Identify when you perform best and replicate that.",
      });
    } else if (metrics.consistency.consistency === "variable") {
      recommendations.push({
        category: "Performance",
        priority: "low",
        suggestion: `Minor score variation. Keep practicing to build consistency.`,
        action: "Track your progress. Small improvements add up.",
      });
    }

    // Early completion
    if (!metrics.completion.completed) {
      recommendations.push({
        category: "Endurance",
        priority: "medium",
        suggestion: `Session stopped at ${metrics.completion.percentage}%. Building endurance is important.`,
        action:
          "Try to complete the full session next time. It's okay to slow down rather than stop.",
      });
    }

    return recommendations;
  }

  /**
   * Renders HTML visualization of performance trends over the session.
   * Analyzes measure scores to detect patterns and improvements.
   * @param {Array<number>} measureScores - Array of individual measure scores
   * @returns {string} HTML string with trend analysis and insights
   */
  renderPerformanceTrends(measureScores) {
    if (!measureScores || measureScores.length === 0) return "";

    const scores = measureScores.filter((s) => typeof s === "number");
    if (scores.length === 0) return "";

    const trend = this.analyzeTrend(scores);

    return `
      <div style="display: flex; flex-direction: column; gap: 0.8em;">
        <p style="margin: 0; color: #ddd;">
          <strong>${trend.primary}</strong>
        </p>
        <p style="margin: 0; color: #aaa; font-size: 0.9em;">
          ${trend.secondary}
        </p>
        ${trend.insight ? `<p style="margin: 0; color: #999; font-size: 0.85em; font-style: italic;">💡 ${trend.insight}</p>` : ""}
      </div>
    `;
  }

  /**
   * Analyzes measure scores for meaningful performance patterns and trends.
   * @param {Array<number>} scores - Array of measure scores
   * @returns {{ primary: string, secondary: string, insight?: string }} Object with primary, secondary, and insight trend descriptions
   */
  analyzeTrend(scores) {
    const len = scores.length;
    if (len === 0) return { primary: "No data", secondary: "" };

    const firstHalf = scores.slice(0, Math.floor(len / 2));
    const secondHalf = scores.slice(Math.floor(len / 2));

    const avgFirst = Math.round(firstHalf.reduce((a, b) => a + b) / firstHalf.length);
    const avgSecond = Math.round(secondHalf.reduce((a, b) => a + b) / secondHalf.length);
    const avgOverall = Math.round(scores.reduce((a, b) => a + b) / scores.length);

    // Calculate variance to detect consistency
    /** @param {number[]} arr */
    const variance = (arr) => {
      const mean = arr.reduce((a, b) => a + b) / arr.length;
      const sq = arr.map((x) => Math.pow(x - mean, 2));
      return Math.sqrt(sq.reduce((a, b) => a + b) / sq.length);
    };
    const stdDev = Math.round(variance(scores) * 10) / 10;

    // Detect improvement or decline
    const improvement = avgSecond - avgFirst;
    const improvementPercent = Math.round((improvement / avgFirst) * 100);

    // Find patterns
    let pattern = this.detectPattern(scores);

    // Build response
    let primary = "";
    let secondary = "";
    let insight = "";

    if (stdDev < 8) {
      primary = "✓ Steady Performance";
      secondary = `Consistent playing style (±${stdDev}). Average: ${avgOverall}`;
    } else {
      // Check for improvement/decline pattern
      if (improvement > 3) {
        primary = "📈 Improving Trend";
        secondary = `Started at ${avgFirst}, improved to ${avgSecond} (+${improvementPercent}%). Building momentum.`;
      } else if (improvement < -3) {
        primary = "📉 Fatigue Pattern";
        secondary = `Started strong at ${avgFirst}, declined to ${avgSecond} (${improvementPercent}%). Endurance challenge.`;
      } else {
        primary = "↔️ Variable Performance";
        secondary = `Score range: ${Math.min(...scores)}-${Math.max(...scores)}. Average: ${avgOverall}`;
      }
    }

    // Add pattern-specific insight
    if (pattern) {
      insight = pattern;
    }

    return { primary, secondary, insight };
  }

  /**
   * Detects specific performance patterns present in the measure sequence.
   * Identifies issues like middle slump, warm-up patterns, or fatigue.
   * @param {Array<number>} scores - Array of measure scores
   * @returns {string|null} Pattern description string or null if no pattern detected
   */
  detectPattern(scores) {
    if (scores.length < 4) return null;

    const len = scores.length;
    const quarters = [
      scores.slice(0, Math.floor(len / 4)),
      scores.slice(Math.floor(len / 4), Math.floor(len / 2)),
      scores.slice(Math.floor(len / 2), Math.floor((3 * len) / 4)),
      scores.slice(Math.floor((3 * len) / 4)),
    ];

    const quarterlyAvg = quarters.map((q) =>
      q.length > 0 ? Math.round(q.reduce((a, b) => a + b) / q.length) : 0
    );

    // Detect middle slump (weak middle section)
    if (quarterlyAvg[1] < quarterlyAvg[0] - 5 || quarterlyAvg[2] < quarterlyAvg[0] - 5) {
      return "Middle section dip detected—focus on maintaining energy through the middle.";
    }

    // Detect strong start, weak finish
    if (quarterlyAvg[0] > quarterlyAvg[3] + 10) {
      return "Strong start but faded—work on pacing to maintain energy throughout.";
    }

    // Detect slow warm-up then improvement
    if (quarterlyAvg[0] < quarterlyAvg[1] && quarterlyAvg[1] < quarterlyAvg[3]) {
      return "Slow warm-up, then steady improvement—good learning curve.";
    }

    // Detect overall drift
    const firstThird = scores.slice(0, Math.floor(len / 3));
    const lastThird = scores.slice(Math.floor((2 * len) / 3));
    const driftAmount = Math.round(
      lastThird.reduce((a, b) => a + b) / lastThird.length -
        firstThird.reduce((a, b) => a + b) / firstThird.length
    );

    if (driftAmount > 8) {
      return "Accelerating improvement across the session.";
    } else if (driftAmount < -8) {
      return "Declining performance—focus on technique consistency.";
    }

    return null;
  }

  /**
   * Toggles the expanded/collapsed state of a session in the history list.
   * @param {string} sessionId - The ID of the session to toggle
   */
  toggleSessionExpanded(sessionId) {
    const sessionElement = this.listContainer.querySelector(
      `.history-session[data-session-id="${sessionId}"]`
    );
    if (!sessionElement) return;

    const isCurrentlyExpanded = sessionElement.classList.contains("expanded");

    // Collapse all other sessions
    this.listContainer.querySelectorAll(".history-session").forEach((el) => {
      el.classList.remove("expanded");
    });

    // Toggle current session
    if (!isCurrentlyExpanded) {
      sessionElement.classList.add("expanded");

      // Re-render with details
      const detailsContainer = sessionElement.querySelector(".session-details");
      if (!detailsContainer) {
        // Need to re-render - find the session data and re-render
        this.expandedSessionId = sessionId;
      }
    } else {
      this.expandedSessionId = null;
    }
  }
}

export default HistoryDisplayUI;
