/**
 * DrillPlanVisualization - Web component for displaying drill plan visualization
 *
 * Manages drill plan parsing, visualization, and measure tracking.
 */

import BaseComponent from "../base/base-component.js";
import { querySelector } from "../base/component-utils.js";

/** @typedef {{ type: string }} Measure */
/** @typedef {{ on: number, off: number, reps: number, startIndex: number }} DrillSegment */

/**
 * DrillPlanVisualization component - displays drill plan as colored measure blocks
 */
export default class DrillPlanVisualization extends BaseComponent {
  constructor() {
    super();

    /** @type {HTMLElement|null} */
    this.container = null;

    /** @type {Measure[]} */
    this.plan = [];

    /** @type {DrillSegment[]} */
    this.segments = [];

    this.currentMeasureIndex = 0;

    /** @type {((plan: Measure[]) => void)|null} */
    this.onPlanChangeCallback = null;

    /** @type {((measureIndex: number) => void)|null} */
    this.onMeasureClickCallback = null;
  }

  getTemplateUrl() {
    return "/src/features/plan-edit/drill-plan-visualization.html";
  }

  getStyleUrl() {
    return "/src/features/plan-edit/drill-plan-visualization.css";
  }

  onMount() {
    // Get the container element that we'll render the plan into
    this.container = querySelector(this, "[data-plan-visualization-container]");
  }

  /**
   * Registers a callback to be invoked when the plan changes.
   * @param {(plan: Measure[]) => void} callback - Function to call with new plan array
   */
  onPlanChange(callback) {
    this.onPlanChangeCallback = callback;
  }

  /**
   * Registers a callback to be invoked when a measure is clicked.
   * @param {(measureIndex: number) => void} callback - Function to call with measure index parameter
   */
  onMeasureClick(callback) {
    this.onMeasureClickCallback = callback;
  }

  /**
   * Parses a plan string into measures and renders visualization.
   * Format: "on,off,reps;on,off,reps;..." (separated by semicolons)
   * @param {string} planString - Plan string to parse
   * @returns {Measure[]} Array of measure objects with type (click, silent, or click-in)
   */
  parse(planString) {
    this.plan = [];
    this.segments = []; // Store segment structure for visualization

    // Always add click-in first
    this.plan.push({ type: "click-in" });

    const trimmed = planString.trim();
    if (!trimmed) {
      // Default: 64 continuous clicks (single segment)
      const defaultSegment = { on: 64, off: 0, reps: 1, startIndex: 1 };
      for (let i = 0; i < 64; i++) {
        this.plan.push({ type: "click" });
      }
      this.segments.push(defaultSegment);
    } else {
      let currentIndex = 1; // After click-in
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

    if (this.onPlanChangeCallback) {
      this.onPlanChangeCallback(this.plan);
    }

    return this.plan;
  }

  /**
   * Renders the plan visualization in the container as measure blocks.
   * Creates visual representations of click, silent, and click-in measures.
   */
  render() {
    if (!this.container) return;

    // Remove old visualization
    const oldViz = this.container.querySelector("#plan-visualization");
    if (oldViz) oldViz.remove();

    if (this.plan.length === 0) return;

    const viz = document.createElement("div");
    viz.id = "plan-visualization";
    viz.style.display = "flex";
    viz.style.flexDirection = "column";
    viz.style.gap = "0.8em";

    let measureIndex = 0;
    let isFirstSegment = true;

    // Render each segment with its repetitions grouped
    this.segments.forEach((segment) => {
      const segmentContainer = document.createElement("div");
      segmentContainer.style.border = "1px solid #2a2a2a";
      segmentContainer.style.borderRadius = "3px";
      segmentContainer.style.padding = "0.3em";
      segmentContainer.style.display = "flex";
      segmentContainer.style.flexDirection = "column";
      segmentContainer.style.gap = "0.2em";

      // First segment: add click-in row at the top
      if (isFirstSegment && this.plan[0]?.type === "click-in") {
        const clickInLine = document.createElement("div");
        clickInLine.style.display = "flex";
        clickInLine.style.gap = "0.3em";
        clickInLine.style.alignItems = "center";

        const block = document.createElement("div");
        block.className = "measure-block click-in";
        block.dataset.measureIndex = "0";
        block.textContent = "▶";

        block.addEventListener("click", (event) => {
          const target = /** @type {HTMLElement} */ (event.currentTarget);
          const idx = parseInt(target.dataset.measureIndex || "", 10);
          if (!Number.isNaN(idx) && this.onMeasureClickCallback) {
            this.onMeasureClickCallback(idx);
          }
        });

        clickInLine.appendChild(block);
        segmentContainer.appendChild(clickInLine);
        measureIndex = 1;
        isFirstSegment = false;
      }

      // Render each repetition as a line
      for (let rep = 0; rep < segment.reps; rep++) {
        const repLine = document.createElement("div");
        repLine.style.display = "flex";
        repLine.style.gap = "0.3em";
        repLine.style.alignItems = "center";

        // On beats
        for (let i = 0; i < segment.on; i++) {
          const block = document.createElement("div");
          block.className = "measure-block click";
          block.dataset.measureIndex = String(measureIndex);

          block.addEventListener("click", (event) => {
            const target = /** @type {HTMLElement} */ (event.currentTarget);
            const idx = parseInt(target.dataset.measureIndex || "", 10);
            if (!Number.isNaN(idx) && this.onMeasureClickCallback) {
              this.onMeasureClickCallback(idx);
            }
          });

          repLine.appendChild(block);
          measureIndex++;
        }

        // Off beats (silent)
        for (let i = 0; i < segment.off; i++) {
          const block = document.createElement("div");
          block.className = "measure-block silent";
          block.dataset.measureIndex = String(measureIndex);

          block.addEventListener("click", (event) => {
            const target = /** @type {HTMLElement} */ (event.currentTarget);
            const idx = parseInt(target.dataset.measureIndex || "", 10);
            if (!Number.isNaN(idx) && this.onMeasureClickCallback) {
              this.onMeasureClickCallback(idx);
            }
          });

          repLine.appendChild(block);
          measureIndex++;
        }

        segmentContainer.appendChild(repLine);
      }

      viz.appendChild(segmentContainer);
    });

    this.container.appendChild(viz);
  }

  /**
   * Updates the displayed score for a single measure.
   * @param {number} measureIndex - Index of the measure to update
   * @param {number} [score] - Score value (0-99, clamped), undefined clears the score
   */
  updateMeasureScore(measureIndex, score) {
    if (!this.container) return;

    const blocks = this.container.querySelectorAll("#plan-visualization .measure-block");
    if (measureIndex >= 0 && measureIndex < blocks.length) {
      const block = blocks[measureIndex];
      const blockEl = /** @type {HTMLElement} */ (block);
      const measureType = this.plan[measureIndex]?.type;

      if (measureType === "click-in") {
        blockEl.textContent = "";
        delete blockEl.dataset.score;
      } else {
        const clampedScore = Math.max(0, Math.min(99, score ?? 0));
        blockEl.textContent = String(clampedScore).padStart(2, "0");
        blockEl.dataset.score = String(clampedScore);
      }
    }
  }

  /**
   * Updates scores for all measures.
   * @param {Array<number>} scores - Array of score values to apply to measures in order
   */
  updateAllScores(scores) {
    scores.forEach((score, index) => {
      this.updateMeasureScore(index, score);
    });
  }

  /**
   * Highlights the current beat measure by adding CSS class.
   * @param {number} measureIndex - Index of the measure to highlight
   */
  setHighlight(measureIndex) {
    if (!this.container) return;

    this.currentMeasureIndex = measureIndex;
    const blocks = this.container.querySelectorAll("#plan-visualization .measure-block");

    blocks.forEach((block, index) => {
      if (index === measureIndex) {
        block.classList.add("current");
      } else {
        block.classList.remove("current");
      }
    });
  }

  /**
   * Gets the type of a measure.
   * @param {number} measureIndex - Index of the measure
   * @returns {string|null} Measure type: "click-in", "click", "silent", or null if out of bounds
   */
  getMeasureType(measureIndex) {
    return this.plan[measureIndex]?.type || null;
  }

  /**
   * Gets the total number of measures in the plan.
   * @returns {number} The length of the plan array
   */
  getLength() {
    return this.plan.length;
  }

  /**
   * Gets the entire parsed plan array.
   * @returns {Measure[]} Array of measure objects
   */
  getPlan() {
    return this.plan;
  }
}

// Register custom element
if (!customElements.get("drill-plan-visualization")) {
  customElements.define("drill-plan-visualization", DrillPlanVisualization);
}
