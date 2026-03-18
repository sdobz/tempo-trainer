/**
 * HistorySessionItem - Web component for a single practice session card
 * Handles header rendering, expand/collapse, and plan visualizer population
 * @module history-session-item
 */

import BaseComponent from "../component/base-component.js";
import { dispatchEvent } from "../component/component-utils.js";
import Scorer from "../plan-play/scorer.js";
import "../visualizers/plan-visualizer.js";
import "../visualizers/timeline-visualization.js";

/**
 * HistorySessionItem component - renders a single session card
 *
 * Events emitted (all bubble to parent):
 * - 'item-toggle': When header is clicked (data: { sessionId: string })
 * - 'retry-chart': When retry button clicked (data: { chart: SessionPlan })
 * - 'navigate': When select-plan button clicked (data: { pane: string })
 * - 'delete-session': When delete button clicked (data: { sessionId: string })
 *
 * @extends BaseComponent
 */
export default class HistorySessionItem extends BaseComponent {
  constructor() {
    super();

    [this._getSession, this._setSession] = this.createSignalState(null);
    [this._getExpanded, this._setExpanded] = this.createSignalState(false);

    /** Public setter for parent pane to toggle expansion */
    this.setExpanded = (v) => this._setExpanded(v);

    /** @type {boolean} Guard — viz is populated at most once */
    this._vizPopulated = false;
  }

  getTemplateUrl() {
    return new URL("./history-session-item.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./history-session-item.css", import.meta.url).href;
  }

  async onMount() {
    // Effect 1: render header text + dynamic details content
    this.createEffect(() => {
      const session = this._getSession();
      if (!session) return;

      this.refs.sessionInner.dataset.sessionId = session.id;
      this._renderHeader(session);
      this._renderDynamicContent(session);
    });

    // Effect 2: toggle expanded class; lazy-init visualizer on first expand
    this.createEffect(() => {
      const expanded = this._getExpanded();
      this.refs.sessionInner.classList.toggle("expanded", expanded);
      if (expanded && !this._vizPopulated) {
        this._populatePlanVisualizer();
      }
    });
  }

  /** @param {Event} event */
  handleHeaderClick(event) {
    const session = this._getSession();
    if (session) dispatchEvent(this, "item-toggle", { sessionId: session.id });
  }

  /** @param {Event} event */
  handleRetryClick(event) {
    event.stopPropagation();
    const session = this._getSession();
    if (session?.plan)
      dispatchEvent(this, "retry-chart", { chart: session.plan });
  }

  /** @param {Event} event */
  handleSelectPlanClick(event) {
    event.stopPropagation();
    dispatchEvent(this, "navigate", { pane: "plan-edit" });
  }

  /** @param {Event} event */
  handleDeleteClick(event) {
    event.stopPropagation();
    const session = this._getSession();
    if (session?.id)
      dispatchEvent(this, "delete-session", { sessionId: session.id });
  }

  // --- Private Render Helpers ---

  _renderHeader(session) {
    const { plan, overallScore, completed, timestamp } = session;
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

    this.refs.scoreEl.textContent = String(overallScore).padStart(2, "0");
    this.refs.planNameEl.textContent = plan.name;
    const statusEl = this.refs.statusEl;
    statusEl.textContent = statusText;
    statusEl.style.color = statusColor;
    this.refs.datetimeEl.textContent = `${dateStr} ${timeStr}`;
  }

  _renderDynamicContent(session) {
    const { plan, metrics, durationSeconds } = session;
    const dynamicContent = this.refs.dynamicContent;
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    const recommendations = this._generateRecommendations(session, metrics);

    const measureScores = session.measureScores?.length
      ? session.measureScores
      : this._computeScoresFromHits(
          session.measureHits,
          session.drillPlan,
          session.bpm,
          session.timeSignature,
        );

    dynamicContent.innerHTML = `
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

      ${
        measureScores?.length > 0
          ? `<div class="details-row">
              <div class="detail-section">
                <div class="detail-title">📊 Performance Trends</div>
                <div class="detail-content">${this._renderPerformanceTrends(measureScores)}</div>
              </div>
            </div>`
          : ""
      }

      ${
        recommendations.length > 0
          ? `<div class="details-row">
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
                    </p>`,
                    )
                    .join("")}
                </div>
              </div>
            </div>`
          : `<div class="details-row">
              <div class="detail-section">
                <div class="detail-title">✨ Performance</div>
                <div class="detail-content"><p>Excellent session! Keep up the great work.</p></div>
              </div>
            </div>`
      }
    `;
  }

  async _populatePlanVisualizer() {
    const session = this._getSession();
    if (!session?.drillPlan) return;

    try {
      const vizEl = this.refs.planViz;
      if (!vizEl || !vizEl.setDrillPlan) return;

      if (vizEl.componentReady) await vizEl.componentReady;

      vizEl.setDrillPlan(session.drillPlan);
      vizEl.setDelegate({
        onMeasureClick: (measureIndex) => this._showTimeline(measureIndex),
      });

      const scores = session.measureScores?.length
        ? session.measureScores
        : this._computeScoresFromHits(
            session.measureHits,
            session.drillPlan,
            session.bpm,
            session.timeSignature,
          );
      if (scores?.length && vizEl.setScores) vizEl.setScores(scores);

      this._vizPopulated = true;
    } catch (_e) {
      // Visualizer component may not be available in tests
    }
  }

  _showTimeline(measureIndex) {
    const session = this._getSession();
    if (!session?.drillPlan) return;

    const wrapper = this.refs.timelineWrapper;
    const timelineComponent = this.refs.sessionTimeline;
    if (!wrapper || !timelineComponent) return;

    wrapper.style.display = "block";

    try {
      let measures = [];
      if (Array.isArray(session.drillPlan)) {
        measures = session.drillPlan;
      } else if (session.drillPlan.plan) {
        measures = session.drillPlan.plan;
      } else if (session.drillPlan.measures) {
        measures = session.drillPlan.measures;
      }

      timelineComponent.setDrillPlan(measures);

      if (typeof timelineComponent.clearDetections === "function") {
        timelineComponent.clearDetections();
      }

      const flatHits = Array.isArray(session.measureHits)
        ? session.measureHits.flat().filter((hit) => Number.isFinite(hit))
        : [];
      if (typeof timelineComponent.addDetection === "function") {
        flatHits.forEach((hit) => timelineComponent.addDetection(hit));
      }

      setTimeout(() => {
        const beatsPerMeasure = session.timeSignature
          ? parseInt(session.timeSignature.split("/")[0], 10) || 4
          : 4;
        timelineComponent.centerAt(measureIndex * beatsPerMeasure);
      }, 50);
    } catch (e) {
      console.error("Failed to show history timeline:", e);
    }
  }

  // --- Analysis Methods (moved from PlanHistoryPane) ---

  _generateRecommendations(_session, metrics) {
    /** @type {Array<{category: string, priority: string, suggestion: string, action: string}>} */
    const recommendations = [];

    if (metrics.drift.severity === "high") {
      recommendations.push({
        category: "Tempo",
        priority: "high",
        suggestion: `Tempo control needed: You're consistently ${metrics.drift.direction} by ~${Math.abs(
          metrics.drift.avgErrorBeats * 500,
        )}ms. Focus on steady internal clock.`,
        action:
          "Slow down and count in your head. Try the calibration exercise again.",
      });
    } else if (metrics.drift.severity === "medium") {
      recommendations.push({
        category: "Tempo",
        priority: "medium",
        suggestion: `Minor tempo drift detected (${metrics.drift.direction}). Your timing is mostly good but could be tighter.`,
        action: "Use a metronome between drills to build tempo awareness.",
      });
    }

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
        action:
          "Work on the weak measures separately. Slow down and focus on each beat.",
      });
    }

    if (
      metrics.rhythm.consistency === "variable" ||
      metrics.rhythm.consistency === "unknown"
    ) {
      recommendations.push({
        category: "Rhythm",
        priority: "medium",
        suggestion: `Timing between hits is inconsistent. Your rhythm sense needs work.`,
        action:
          "Practice with a metronome. Feel the pulse, don't just hit randomly.",
      });
    }

    if (metrics.consistency.consistency === "inconsistent") {
      recommendations.push({
        category: "Performance",
        priority: "high",
        suggestion: `Your scores vary wildly (${metrics.consistency.range} point range). Some measures are much weaker.`,
        action:
          "Focus on the weakest measures. Identify when you perform best and replicate that.",
      });
    } else if (metrics.consistency.consistency === "variable") {
      recommendations.push({
        category: "Performance",
        priority: "low",
        suggestion: `Minor score variation. Keep practicing to build consistency.`,
        action: "Track your progress. Small improvements add up.",
      });
    }

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

  _renderPerformanceTrends(measureScores) {
    if (!measureScores || measureScores.length === 0) return "";
    const scores = measureScores.filter((s) => typeof s === "number");
    if (scores.length === 0) return "";

    const trend = this._analyzeTrend(scores);

    return `
      <div style="display: flex; flex-direction: column; gap: 0.8em;">
        <p style="margin: 0; color: #ddd;"><strong>${trend.primary}</strong></p>
        <p style="margin: 0; color: #aaa; font-size: 0.9em;">${trend.secondary}</p>
        ${
          trend.insight
            ? `<p style="margin: 0; color: #999; font-size: 0.85em; font-style: italic;">💡 ${trend.insight}</p>`
            : ""
        }
      </div>
    `;
  }

  _analyzeTrend(scores) {
    const len = scores.length;
    if (len === 0) return { primary: "No data", secondary: "" };

    const firstHalf = scores.slice(0, Math.floor(len / 2));
    const secondHalf = scores.slice(Math.floor(len / 2));

    const avgFirst = Math.round(
      firstHalf.reduce((a, b) => a + b) / firstHalf.length,
    );
    const avgSecond = Math.round(
      secondHalf.reduce((a, b) => a + b) / secondHalf.length,
    );
    const avgOverall = Math.round(
      scores.reduce((a, b) => a + b) / scores.length,
    );

    const variance = (arr) => {
      const mean = arr.reduce((a, b) => a + b) / arr.length;
      const sq = arr.map((x) => Math.pow(x - mean, 2));
      return Math.sqrt(sq.reduce((a, b) => a + b) / sq.length);
    };
    const stdDev = Math.round(variance(scores) * 10) / 10;

    const improvement = avgSecond - avgFirst;
    const improvementPercent = Math.round((improvement / avgFirst) * 100);
    const pattern = this._detectPattern(scores);

    let primary = "";
    let secondary = "";
    let insight = "";

    if (stdDev < 8) {
      primary = "✓ Steady Performance";
      secondary = `Consistent playing style (±${stdDev}). Average: ${avgOverall}`;
    } else {
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

    if (pattern) insight = pattern;

    return { primary, secondary, insight };
  }

  _detectPattern(scores) {
    if (scores.length < 4) return null;

    const len = scores.length;
    const quarters = [
      scores.slice(0, Math.floor(len / 4)),
      scores.slice(Math.floor(len / 4), Math.floor(len / 2)),
      scores.slice(Math.floor(len / 2), Math.floor((3 * len) / 4)),
      scores.slice(Math.floor((3 * len) / 4)),
    ];

    const quarterlyAvg = quarters.map((q) =>
      q.length > 0 ? Math.round(q.reduce((a, b) => a + b) / q.length) : 0,
    );

    if (
      quarterlyAvg[1] < quarterlyAvg[0] - 5 ||
      quarterlyAvg[2] < quarterlyAvg[0] - 5
    ) {
      return "Middle section dip detected—focus on maintaining energy through the middle.";
    }

    if (quarterlyAvg[0] > quarterlyAvg[3] + 10) {
      return "Strong start but faded—work on pacing to maintain energy throughout.";
    }

    if (
      quarterlyAvg[0] < quarterlyAvg[1] &&
      quarterlyAvg[1] < quarterlyAvg[3]
    ) {
      return "Slow warm-up, then steady improvement—good learning curve.";
    }

    const firstThird = scores.slice(0, Math.floor(len / 3));
    const lastThird = scores.slice(Math.floor((2 * len) / 3));
    const driftAmount = Math.round(
      lastThird.reduce((a, b) => a + b) / lastThird.length -
        firstThird.reduce((a, b) => a + b) / firstThird.length,
    );

    if (driftAmount > 8) return "Accelerating improvement across the session.";
    if (driftAmount < -8)
      return "Declining performance—focus on technique consistency.";

    return null;
  }

  /**
   * Legacy fallback: re-derive per-measure scores from raw hits.
   * Used only for sessions stored before measureScores was persisted.
   * @param {number[][]|undefined} measureHits
   * @param {any} drillPlan
   * @param {number} bpm
   * @param {string} [timeSignature]
   * @returns {(number|null)[]}
   */
  _computeScoresFromHits(measureHits, drillPlan, bpm, timeSignature) {
    if (!measureHits || !drillPlan) return [];

    let measures = [];
    if (Array.isArray(drillPlan)) {
      measures = drillPlan;
    } else if (drillPlan.plan && Array.isArray(drillPlan.plan)) {
      measures = drillPlan.plan;
    }

    if (measures.length === 0) return [];

    const beatDuration = 60.0 / (bpm || 120);
    const beatsPerMeasure = timeSignature
      ? parseInt(timeSignature.split("/")[0], 10)
      : 4;

    const scores = [];

    for (let measureIndex = 0; measureIndex < measures.length; measureIndex++) {
      const measure = measures[measureIndex];
      if (measure.type === "click-in") {
        scores.push(null);
        continue;
      }

      const hits = measureHits[measureIndex] || [];
      if (hits.length === 0) {
        scores.push(0);
        continue;
      }

      let scoreSum = 0;
      const measureStartBeat = measureIndex * beatsPerMeasure;

      for (let beatOffset = 0; beatOffset < beatsPerMeasure; beatOffset++) {
        const expectedBeat = measureStartBeat + beatOffset;
        let minDistance = Infinity;
        for (const hitBeat of hits) {
          const distance = Math.abs(hitBeat - expectedBeat);
          if (distance < minDistance) minDistance = distance;
        }
        scoreSum += Scorer.scoreFromErrorMs(minDistance * beatDuration * 1000);
      }

      scores.push(
        Math.max(0, Math.min(99, Math.round(scoreSum / beatsPerMeasure))),
      );
    }

    return scores;
  }
}

// Register the component
customElements.define("history-session-item", HistorySessionItem);
