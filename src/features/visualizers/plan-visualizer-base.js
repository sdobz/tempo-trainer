/**
 * PlanVisualizerBase - Base class for drill plan visualizations
 *
 * Shared functionality for parsing and basic rendering of drill plans.
 * Subclasses can extend to add features like scores, navigation, etc.
 */

import BaseComponent from "../base/base-component.js";
import { querySelector } from "../base/component-utils.js";

/** @typedef {{ type: string }} Measure */
/** @typedef {{ on: number, off: number, reps: number, startIndex: number }} DrillSegment */

/**
 * Base class for drill plan visualizations
 */
export default class PlanVisualizerBase extends BaseComponent {
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
  }

  onMount() {
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
   * Parses a plan string into measures and renders visualization.
   * Format: "on,off,reps;on,off,reps;..." (separated by semicolons)
   * @param {string} planString - Plan string to parse
   * @returns {Measure[]} Array of measure objects with type (click, silent, or click-in)
   */
  parse(planString) {
    this.plan = [];
    this.segments = [];

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
   * Renders the plan visualization. Override in subclasses.
   */
  render() {
    // Subclasses override this
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

  /**
   * Helper to create a measure block element
   * @param {string} measureType - Type of measure (click, silent, click-in)
   * @param {number} measureIndex - Index of this measure
   * @param {string} [content] - Optional text content
   * @returns {HTMLElement} The created block element
   */
  _createMeasureBlock(measureType, measureIndex, content = "") {
    const block = document.createElement("div");
    block.className = `measure-block ${measureType}`;
    block.dataset.measureIndex = String(measureIndex);
    if (content) {
      block.textContent = content;
    }
    return block;
  }

  /**
   * Highlight a measure by index
   * @param {number} measureIndex - Index of the measure to highlight
   */
  setHighlight(measureIndex) {
    if (!this.container) return;

    this.currentMeasureIndex = measureIndex;
    const blocks = this.container.querySelectorAll(".measure-block");

    blocks.forEach((block, index) => {
      if (index === measureIndex) {
        block.classList.add("current");
      } else {
        block.classList.remove("current");
      }
    });
  }
}
