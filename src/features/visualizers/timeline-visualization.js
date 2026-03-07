/**
 * TimelineVisualization - Web component for displaying training timeline
 *
 * Provides beat-by-beat visualization with scrolling display.
 */

import BaseComponent from "../base/base-component.js";
import { querySelector } from "../base/component-utils.js";
import { SessionStateContext } from "../base/session-state.js";

/** @typedef {{ type: string }} Measure */

/**
 * TimelineVisualization component - displays training timeline with beats and expectations
 */
export default class TimelineVisualization extends BaseComponent {
  constructor() {
    super();

    /** @type {HTMLElement|null} */
    this.viewport = null;

    /** @type {HTMLElement|null} */
    this.track = null;

    /** @type {HTMLElement|null} */
    this.nowLine = null;

    // Configuration
    this.pxPerBeat = 18;
    this.tailBeats = 1;

    // State
    /** @type {Measure[]} */
    this.drillPlan = [];
    this.beatsPerMeasure = 4;
    this.displayStartBeat = 0;
    /** @type {(() => void)|null} */
    this._cleanupSession = null;
  }

  getTemplateUrl() {
    return "/src/features/visualizers/timeline-visualization.html";
  }

  getStyleUrl() {
    return "/src/features/visualizers/timeline-visualization.css";
  }

  onMount() {
    // Get the viewport and track elements
    this.viewport = querySelector(this, "[data-timeline-viewport]");
    this.track = querySelector(this, "[data-timeline-track]");
    this.nowLine = querySelector(this, "[data-timeline-now-line]");

    if (this.hasAttribute("data-local-plan-only")) {
      this.build();
      return;
    }

    // Consume SessionStateContext for plan and beatsPerMeasure
    this.consumeContext(SessionStateContext, (ss) => {
      if (ss.plan?.plan) {
        this.drillPlan = ss.plan.plan;
      }
      this.beatsPerMeasure = ss.beatsPerMeasure;
      this.build();
      this._cleanupSession = ss.subscribe({
        onPlanChange: (planData) => {
          if (planData?.plan) {
            this.drillPlan = planData.plan;
          }
          this.build();
        },
        onBeatsPerMeasureChange: (n) => {
          this.beatsPerMeasure = n;
          this.build();
        },
      });
    });
  }

  onUnmount() {
    if (this._cleanupSession) {
      this._cleanupSession();
      this._cleanupSession = null;
    }
  }

  /**
   * Sets the beats per measure for timeline calculations.
   * @param {number} beatsPerMeasure - Number of beats in a measure
   */
  setBeatsPerMeasure(beatsPerMeasure) {
    this.beatsPerMeasure = beatsPerMeasure;
    this.build();
  }

  /**
   * Sets the drill plan and triggers a rebuild of the timeline visualization.
   * @param {Measure[]} plan - Array of measure objects with type property
   */
  setDrillPlan(plan) {
    this.drillPlan = plan;
    this.build();
  }

  /**
   * Set the absolute beat offset represented by local beat 0 in this timeline.
   * @param {number} beat
   */
  setDisplayStartBeat(beat) {
    const next = Math.max(0, Math.floor(beat));
    if (next === this.displayStartBeat) return;
    this.displayStartBeat = next;
    this.build();
  }

  /**
   * Flash the center "now" line to indicate an incoming hit.
   */
  flashNowLine() {
    if (!this.nowLine) return;
    this.nowLine.classList.remove("timeline-now-line-flash");
    this.nowLine.getBoundingClientRect();
    this.nowLine.classList.add("timeline-now-line-flash");
  }

  /**
   * Builds the timeline visualization with measure groups, grid, expectations, and detections layers.
   * Defers operation if viewport is not yet visible.
   */
  build() {
    if (!this.track || !this.viewport) return;

    this.track.innerHTML = "";

    if (!this.drillPlan || this.drillPlan.length === 0) return;

    const viewportWidth = this.viewport.clientWidth;

    // Defer build if viewport doesn't have dimensions (is hidden)
    if (viewportWidth === 0) {
      if (this._deferBuildCount > 5) return; // Prevent infinite loop in testing
      this._deferBuildCount = (this._deferBuildCount || 0) + 1;
      requestAnimationFrame(() => this.build());
      return;
    }
    this._deferBuildCount = 0;

    const totalBeats =
      this.drillPlan.length * this.beatsPerMeasure + this.tailBeats;
    const contentWidth = totalBeats * this.pxPerBeat;
    const paddingWidth = viewportWidth;
    const totalWidth = paddingWidth + contentWidth + paddingWidth;

    this.track.style.width = `${totalWidth}px`;

    // Create 4 layers
    const groupsLayer = document.createElement("div");
    groupsLayer.className = "timeline-layer timeline-groups";

    const gridLayer = document.createElement("div");
    gridLayer.className = "timeline-layer timeline-grid";

    const expectationsLayer = document.createElement("div");
    expectationsLayer.className = "timeline-layer timeline-expectations";

    const detectionsLayer = document.createElement("div");
    detectionsLayer.className = "timeline-layer timeline-detections";

    const offsetX = paddingWidth;

    // Render groups and grid
    this.drillPlan.forEach((measure, measureIndex) => {
      const startBeat = measureIndex * this.beatsPerMeasure;
      const endBeat = startBeat + this.beatsPerMeasure;
      const colorClass = measure.type;

      // Group background
      const groupElement = document.createElement("div");
      groupElement.className = `timeline-group timeline-group-${colorClass}`;
      groupElement.style.left = `${offsetX + startBeat * this.pxPerBeat}px`;
      groupElement.style.width = `${this.beatsPerMeasure * this.pxPerBeat}px`;
      groupsLayer.appendChild(groupElement);

      // Grid line at start of measure
      const gridLine = document.createElement("div");
      gridLine.className = "timeline-grid-line";
      gridLine.style.left = `${offsetX + startBeat * this.pxPerBeat}px`;
      gridLayer.appendChild(gridLine);

      // Expectation circles for each beat
      for (let beat = startBeat; beat < endBeat; beat++) {
        const circle = document.createElement("div");
        circle.className =
          measure.type === "click-in"
            ? "timeline-expectation timeline-expectation-filled"
            : "timeline-expectation";
        circle.style.left = `${offsetX + beat * this.pxPerBeat}px`;
        expectationsLayer.appendChild(circle);
      }
    });

    this.track.appendChild(groupsLayer);
    this.track.appendChild(gridLayer);
    this.track.appendChild(expectationsLayer);
    this.track.appendChild(detectionsLayer);
  }

  /**
   * Adds a detection dot to the timeline visualization.
   * @param {number} beatPosition - Beat position for the detection marker
   * @returns {boolean} True when a dot was appended
   */
  addDetection(beatPosition) {
    if (!this.track) return false;

    /** @type {HTMLElement|null} */
    let detectionsLayer = this.track.querySelector(".timeline-detections");
    if (!detectionsLayer) {
      this.build();
      detectionsLayer = this.track.querySelector(".timeline-detections");
    }
    if (!detectionsLayer) return false;

    const x = this._beatToX(beatPosition);
    if (!Number.isFinite(x)) return false;

    const dot = document.createElement("div");
    dot.className = "timeline-detection";
    dot.style.left = `${x}px`;
    detectionsLayer.appendChild(dot);
    return true;
  }

  /**
   * Clears all detection dots from the timeline.
   */
  clearDetections() {
    if (!this.track) return;

    const detectionsLayer = this.track.querySelector(".timeline-detections");
    if (!detectionsLayer) return;

    detectionsLayer.innerHTML = "";
  }

  /**
   * Centers the timeline view on a specific beat position.
   * Handles deferred scrolling if viewport dimensions not yet available.
   * @param {number} beatPosition - Beat position to center on
   */
  centerAt(beatPosition) {
    if (!this.viewport || !this.track) return;

    this.lastBeatPosition = beatPosition;
    const viewportWidth = this.viewport.clientWidth;
    const trackWidth = this.track.offsetWidth;

    // Ensure viewport has dimensions before attempting to scroll
    if (viewportWidth === 0 || trackWidth === 0) {
      if (this._deferCenterCount > 5) return; // Prevent infinite loop in testing
      this._deferCenterCount = (this._deferCenterCount || 0) + 1;
      // Defer until viewport is visible
      requestAnimationFrame(() => this.centerAt(beatPosition));
      return;
    }
    this._deferCenterCount = 0;

    const targetX = this._beatToX(beatPosition);

    let left = viewportWidth / 2 - targetX;
    const minLeft = Math.min(0, viewportWidth - trackWidth);
    left = Math.max(minLeft, Math.min(0, left));

    this.track.style.transform = `translateX(${left}px)`;
  }

  /**
   * Converts a beat position to a pixel position on the timeline.
   * @param {number} beatPosition - The beat position
   * @returns {number} The pixel position relative to the track
   */
  _beatToX(beatPosition) {
    if (!this.viewport) return 0;

    const viewportWidth = this.viewport.clientWidth;
    const offsetX = viewportWidth;
    const localBeat = beatPosition - this.displayStartBeat;
    return offsetX + localBeat * this.pxPerBeat;
  }

  /**
   * Gets the last beat position that was centered on.
   * @returns {number} The beat position
   */
  getLastBeatPosition() {
    return this.lastBeatPosition;
  }
}

// Register custom element
if (!customElements.get("timeline-visualization")) {
  customElements.define("timeline-visualization", TimelineVisualization);
}
