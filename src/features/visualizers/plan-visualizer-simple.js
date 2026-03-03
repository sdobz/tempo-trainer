/**
 * PlanVisualizerSimple - Simple drill plan visualization
 *
 * Used in plan-edit pane. Displays plan structure only, no scores or navigation.
 */

import PlanVisualizerBase from "./plan-visualizer-base.js";

/**
 * Simple plan visualizer - displays measure blocks without scores or navigation
 */
export default class PlanVisualizerSimple extends PlanVisualizerBase {
  getTemplateUrl() {
    return "/src/features/visualizers/plan-visualizer.html";
  }

  getStyleUrl() {
    return "/src/features/visualizers/plan-visualizer.css";
  }

  /**
   * Renders the plan visualization without scores or navigation.
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

        const block = this._createMeasureBlock("click-in", 0, "▶");
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
          const block = this._createMeasureBlock("click", measureIndex);
          repLine.appendChild(block);
          measureIndex++;
        }

        // Off beats (silent)
        for (let i = 0; i < segment.off; i++) {
          const block = this._createMeasureBlock("silent", measureIndex);
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
   * No-op for simple visualizer (does not display scores).
   * @param {Array<number>} _scores - Scores (ignored)
   */
  updateAllScores(_scores) {
    // Simple visualizer does not display scores
  }
}

// Register custom element
if (!customElements.get("plan-visualizer-simple")) {
  customElements.define("plan-visualizer-simple", PlanVisualizerSimple);
}
