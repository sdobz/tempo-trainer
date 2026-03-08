/**
 * PlanVisualizer - Single component for drill plan visualizations
 *
 * Renders the structure of a drill plan, and can optionally render scores and
 * handle navigation events via a delegate.
 */

import BaseComponent from "../base/base-component.js";
import { querySelector } from "../base/component-utils.js";
import { PlaybackContext } from "../plan-play/playback-state.js";
import { SessionStateContext } from "../base/session-state.js";

/** @typedef {{ type: string }} Measure */
/** @typedef {{ on: number, off: number, reps: number, startIndex: number }} DrillSegment */

/**
 * Single component for drill plan visualizations
 */
export default class PlanVisualizer extends BaseComponent {
  constructor() {
    super();

    /** @type {HTMLElement|null} */
    this.container = null;

    /** @type {Measure[]} */
    this.plan = [];

    /** @type {DrillSegment[]} */
    this.segments = [];

    this.currentMeasureIndex = 0;

    /** @type {any} */
    this.delegate = null;

    /** @type {(() => void)|null} */
    this._cleanupPlayback = null;
    /** @type {(() => void)|null} */
    this._cleanupSession = null;
  }

  getTemplateUrl() {
    return new URL("./plan-visualizer.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./plan-visualizer.css", import.meta.url).href;
  }

  onMount() {
    this.container = querySelector(this, "[data-plan-visualization-container]");

    // Create elements container explicitly here
    const viz = document.createElement("div");
    viz.id = "plan-visualization";
    viz.style.display = "flex";
    viz.style.flexDirection = "column";
    viz.style.gap = "0.8em";
    viz.style.borderRadius = "4px";
    this.container.appendChild(viz);

    this.updateInteractiveState();
    this.render();

    // Consume SessionStateContext for authoritative plan data
    this.consumeContext(SessionStateContext, (ss) => {
      if (ss.plan) this.setDrillPlan(ss.plan);
      this._cleanupSession = ss.subscribe({
        onPlanChange: (planData) => {
          if (planData) this.setDrillPlan(planData);
        },
      });
    });

    // Consume PlaybackContext for runtime scores/highlight overlay
    this.consumeContext(PlaybackContext, (ps) => {
      this._cleanupPlayback = ps.subscribe((state) => {
        this.setScores(state.scores);
        this.setHighlight(state.highlight);
      });
    });
  }

  onUnmount() {
    if (this._cleanupPlayback) {
      this._cleanupPlayback();
      this._cleanupPlayback = null;
    }
    if (this._cleanupSession) {
      this._cleanupSession();
      this._cleanupSession = null;
    }
  }

  /**
   * Sets the delegate for this visualizer (handles navigation).
   * @param {any} delegate
   */
  setDelegate(delegate) {
    this.delegate = delegate;
    this.updateInteractiveState();
  }

  updateInteractiveState() {
    if (!this.container) return;
    const viz = this.container.querySelector("#plan-visualization");
    if (viz) {
      if (this.delegate) {
        viz.classList.add("interactive");
      } else {
        viz.classList.remove("interactive");
      }
    }
  }

  /**
   * Parses a plan string into measures and renders visualization.
   * Format: "on,off,reps;on,off,reps;..." (separated by semicolons)
   * @param {string} planString - Plan string to parse
   * @returns {Measure[]}
   */
  parse(planString) {
    this.plan = [];
    this.segments = [];

    // Always add click-in first as its own segment
    this.segments.push({
      isClickIn: true,
      on: 1,
      off: 0,
      reps: 1,
      startIndex: 0,
    });
    this.plan.push({ type: "click-in" });

    const trimmed = planString.trim();
    if (!trimmed) {
      const defaultSegment = { on: 64, off: 0, reps: 1, startIndex: 1 };
      for (let i = 0; i < 64; i++) {
        this.plan.push({ type: "click" });
      }
      this.segments.push(defaultSegment);
    } else {
      let currentIndex = 1;
      const steps = trimmed.split(";");
      steps.forEach((step) => {
        const parts = step
          .trim()
          .split(",")
          .map((p) => parseInt(p.trim(), 10));

        if (parts.length === 3 && !parts.some(isNaN)) {
          const [on, off, reps] = parts;
          const segment = { on, off, reps, startIndex: currentIndex };

          for (let rep = 0; rep < reps; rep++) {
            for (let i = 0; i < on; i++) {
              this.plan.push({ type: "click" });
              currentIndex++;
            }
            for (let i = 0; i < off; i++) {
              this.plan.push({ type: "silent" });
              currentIndex++;
            }
          }
          this.segments.push(segment);
        }
      });
    }

    this.render();

    // Notify ancestors that the plan changed (e.g. plan-edit-pane updates sessionState)
    this.emit("plan-change", { plan: this.plan, segments: this.segments });

    return this.plan;
  }

  /**
   * Sets the drill plan structure and renders.
   * @param {Object|Array} planData - Drill plan structure or fallback array
   */
  setDrillPlan(planData) {
    if (planData && planData.plan && planData.segments) {
      this.plan = planData.plan;
      this.segments = planData.segments;
    } else if (Array.isArray(planData)) {
      this.plan = planData;
      this.segments = [{ on: planData.length, off: 0, reps: 1, startIndex: 0 }];
    } else if (planData && Array.isArray(planData.measures)) {
      this.plan = planData.measures;
      this.segments = [
        {
          on: this.plan.length,
          off: 0,
          reps: 1,
          startIndex: 0,
        },
      ];
    }
    this.render();
  }

  /**
   * Renders the plan visualization grouping by segments.
   */
  render() {
    if (!this.container) return;

    const viz = this.container.querySelector("#plan-visualization");
    if (!viz) return;

    viz.innerHTML = ""; // Clear existing

    if (this.plan.length === 0) return;

    let globalMeasureIndex = 0;

    // Lay out blocks according to segments
    this.segments.forEach((segment) => {
      const segContainer = document.createElement("div");
      segContainer.className = "segment-group";
      segContainer.style.display = "flex";
      segContainer.style.flexDirection = "column";
      segContainer.style.gap = "0.3em";

      for (let rep = 0; rep < segment.reps; rep++) {
        const row = document.createElement("div");
        row.className = "segment-row";
        row.style.display = "flex";
        row.style.flexWrap = "wrap";
        row.style.gap = "0.3em";

        const totalBlocksInRep = segment.on + segment.off;
        for (let i = 0; i < totalBlocksInRep; i++) {
          if (globalMeasureIndex < this.plan.length) {
            const measure = this.plan[globalMeasureIndex];
            const block = document.createElement("div");
            block.className = `measure-block ${measure.type}`;
            block.dataset.measureIndex = String(globalMeasureIndex);

            const capturedIndex = globalMeasureIndex;
            block.addEventListener("click", () => {
              if (
                this.delegate &&
                typeof this.delegate.onMeasureClick === "function"
              ) {
                this.delegate.onMeasureClick(capturedIndex);
              }
            });

            row.appendChild(block);
            globalMeasureIndex++;
          }
        }
        segContainer.appendChild(row);
      }
      viz.appendChild(segContainer);
    });
  }

  /**
   * Sets the score for a specific measure.
   * @param {number} measureIndex
   * @param {number} score
   */
  setScore(measureIndex, score) {
    if (!this.container) return;

    const viz = this.container.querySelector("#plan-visualization");
    if (!viz) return;

    const blocks = viz.querySelectorAll(".measure-block");
    if (measureIndex >= 0 && measureIndex < blocks.length) {
      const blockEl = /** @type {HTMLElement} */ (blocks[measureIndex]);
      const measureType = this.plan[measureIndex]?.type;

      if (measureType !== "click-in") {
        const clampedScore = Math.max(0, Math.min(99, score ?? 0));
        blockEl.textContent = String(clampedScore).padStart(2, "0");
        blockEl.dataset.score = String(clampedScore);
      }
    }
  }

  /**
   * Updates scores for all measures.
   * @param {Array<number>} scores
   */
  setScores(scores) {
    scores.forEach((score, index) => {
      this.setScore(index, score);
    });
  }

  /**
   * Highlight a measure by index
   * @param {number} measureIndex
   */
  setHighlight(measureIndex) {
    if (!this.container) return;

    this.currentMeasureIndex = measureIndex;
    const viz = this.container.querySelector("#plan-visualization");
    if (!viz) return;

    const blocks = viz.querySelectorAll(".measure-block");
    blocks.forEach((block, index) => {
      if (index === measureIndex) {
        block.classList.add("current");
      } else {
        block.classList.remove("current");
      }
    });
  }

  getMeasureType(measureIndex) {
    return this.plan[measureIndex]?.type || null;
  }

  getLength() {
    return this.plan.length;
  }

  getPlan() {
    return { plan: this.plan, segments: this.segments };
  }
}

// Register custom element
if (!customElements.get("plan-visualizer")) {
  customElements.define("plan-visualizer", PlanVisualizer);
}
