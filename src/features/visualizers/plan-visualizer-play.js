/**
 * PlanVisualizerPlay - Drill plan visualization with scores
 *
 * Used in plan-play pane during training. Displays plan with realtime score updates
 * and navigation callbacks for timeline scrolling.
 */

import PlanVisualizerBase from "./plan-visualizer-base.js";

/**
 * Plan visualizer for playback - displays measures with scores and navigation
 */
export default class PlanVisualizerPlay extends PlanVisualizerBase {
  constructor() {
    super();

    /** @type {((measureIndex: number) => void)|null} */
    this.onMeasureClickCallback = null;
  }

  getTemplateUrl() {
    return "/src/features/visualizers/plan-visualizer.html";
  }

  getStyleUrl() {
    return "/src/features/visualizers/plan-visualizer.css";
  }

  /**
   * Sets the drill plan and triggers a render.
   * @param {Array} plan - Array of measure objects
   */
  setDrillPlan(plan) {
    this.plan = plan;
    // Don't try to rebuild segments - just render directly
    this.render();
  }

  /**
   * Registers a callback to be invoked when a measure is clicked.
   * @param {(measureIndex: number) => void} callback - Function to call with measure index parameter
   */
  onMeasureClick(callback) {
    this.onMeasureClickCallback = callback;
  }

  /**
   * Renders the plan visualization with scores and navigation.
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
    viz.style.flexWrap = "wrap";
    viz.style.gap = "0.3em";
    viz.style.padding = "0.5em";
    viz.style.backgroundColor = "#2a2a2a";
    viz.style.borderRadius = "4px";

    // Render each measure directly without worrying about segments
    this.plan.forEach((measure, measureIndex) => {
      const block = this._createMeasureBlock(measure.type, measureIndex);
      block.style.cursor = "pointer";
      block.addEventListener("click", (event) => {
        const target = /** @type {HTMLElement} */ (event.currentTarget);
        const idx = parseInt(target.dataset.measureIndex || "", 10);
        if (!Number.isNaN(idx) && this.onMeasureClickCallback) {
          this.onMeasureClickCallback(idx);
        }
      });
      viz.appendChild(block);
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
}

// Register custom element
if (!customElements.get("plan-visualizer-play")) {
  customElements.define("plan-visualizer-play", PlanVisualizerPlay);
}
