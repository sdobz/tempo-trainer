/**
 * PlanVisualizerHistory - Drill plan visualization with navigation
 *
 * Used in plan-history pane. Displays plan with navigation callbacks for timeline scrolling.
 * No scores displayed.
 */

import PlanVisualizerBase from "./plan-visualizer-base.js";

/**
 * Plan visualizer for history - displays measures with navigation but no scores
 */
export default class PlanVisualizerHistory extends PlanVisualizerBase {
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
   * Renders the plan visualization with navigation but no scores.
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
}

// Register custom element
if (!customElements.get("plan-visualizer-history")) {
  customElements.define("plan-visualizer-history", PlanVisualizerHistory);
}
