/**
 * TimelineVisualization - Web component for displaying training timeline
 *
 * Provides beat-by-beat visualization with scrolling display.
 */

import BaseComponent from "../component/base-component.js";
import { querySelector } from "../component/component-utils.js";
import { ChartServiceContext } from "../music/chart-service.js";
import { TimelineServiceContext } from "../music/timeline-service.js";

/** @typedef {{ type: string }} Measure */

/**
 * TimelineVisualization component - displays training timeline with beats and expectations
 */
export default class TimelineVisualization extends BaseComponent {
  constructor() {
    super();

    this.viewport = null;
    this.track = null;
    this.nowLine = null;

    this.pxPerBeat = 18;
    this.tailBeats = 1;

    [this._getDrillPlan, this._setDrillPlan] = this.createSignalState([]);
    [this._getBeatsPerMeasure, this._setBeatsPerMeasure] =
      this.createSignalState(4);
    [this._getDisplayStartBeat, this._setDisplayStartBeat] =
      this.createSignalState(0);
    [this._getBuildVersion, this._setBuildVersion] =
      this.createSignalState(0);
    [this._getLastBeatPosition, this._setLastBeatPosition] =
      this.createSignalState(0);

    this.setBeatsPerMeasure = this._setBeatsPerMeasure;
    this.setDrillPlan = this._setDrillPlan;
    this.getLastBeatPosition = this._getLastBeatPosition;

    this._cleanupChart = null;
    this._cleanupTimeline = null;
    this._deferBuildRafId = null;
    this._deferBuildCount = 0;
    this._deferCenterRafId = null;
    this._deferCenterCount = 0;
  }

  getTemplateUrl() {
    return new URL("./timeline-visualization.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./timeline-visualization.css", import.meta.url).href;
  }

  onMount() {
    this.viewport = querySelector(this, "[data-timeline-viewport]");
    this.track = querySelector(this, "[data-timeline-track]");
    this.nowLine = querySelector(this, "[data-timeline-now-line]");

    this.createEffect(() => {
      this._renderTimeline(
        this._getDrillPlan(),
        this._getBeatsPerMeasure(),
        this._getBuildVersion(),
      );
    });

    if (this.hasAttribute("data-local-plan-only")) {
      return;
    }

    this.consumeContext(ChartServiceContext, (chartService) => {
      const selected = chartService.getSelectedChart();
      if (selected) {
        this._setDrillPlan(chartService.projectChart(selected).plan);
      }

      const onSelected = (
        /** @type {CustomEvent<{ chart: Object }>} */ event,
      ) => {
        this._setDrillPlan(chartService.projectChart(event.detail.chart).plan);
      };

      chartService.addEventListener("chart-selected", onSelected);
      this._cleanupChart = () => {
        chartService.removeEventListener("chart-selected", onSelected);
      };
    });

    // [Phase 2] Consume TimelineService for canonical meter ownership.
    this.consumeContext(TimelineServiceContext, (timelineService) => {
      this._setBeatsPerMeasure(timelineService.beatsPerMeasure);

      const onChanged = (
        /** @type {CustomEvent<{field: string, value: unknown}>} */ event,
      ) => {
        if (event.detail.field !== "beatsPerMeasure") return;
        this._setBeatsPerMeasure(/** @type {number} */ (event.detail.value));
      };

      timelineService.addEventListener("changed", onChanged);
      this._cleanupTimeline = () => {
        timelineService.removeEventListener("changed", onChanged);
      };
    });
  }

  onUnmount() {
    if (this._cleanupChart) {
      this._cleanupChart();
      this._cleanupChart = null;
    }
    if (this._cleanupTimeline) {
      this._cleanupTimeline();
      this._cleanupTimeline = null;
    }
    if (this._deferBuildRafId !== null) {
      cancelAnimationFrame(this._deferBuildRafId);
      this._deferBuildRafId = null;
    }
    if (this._deferCenterRafId !== null) {
      cancelAnimationFrame(this._deferCenterRafId);
      this._deferCenterRafId = null;
    }
  }

  /**
   * Set the absolute beat offset represented by local beat 0 in this timeline.
   * @param {number} beat
   */
  setDisplayStartBeat(beat) {
    const next = Math.max(0, Math.floor(beat));
    if (next === this._getDisplayStartBeat()) return;
    this._setDisplayStartBeat(next);
  }

  build() {
    this._setBuildVersion(this._getBuildVersion() + 1);
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
  _renderTimeline(plan, beatsPerMeasure, _buildVersion) {
    if (!this.track || !this.viewport) return;

    this.track.innerHTML = "";

    if (!plan || plan.length === 0) return;

    const viewportWidth = this.viewport.clientWidth;

    if (viewportWidth === 0) {
      if (!this.isConnected) return;
      if (this._deferBuildCount > 5 || this._deferBuildRafId !== null) return;
      this._deferBuildCount += 1;
      this._deferBuildRafId = requestAnimationFrame(() => {
        this._deferBuildRafId = null;
        this._setBuildVersion(this._getBuildVersion() + 1);
      });
      return;
    }
    this._deferBuildCount = 0;

    const totalBeats =
      plan.length * beatsPerMeasure + this.tailBeats;
    const contentWidth = totalBeats * this.pxPerBeat;
    const paddingWidth = viewportWidth;
    const totalWidth = paddingWidth + contentWidth + paddingWidth;

    this.track.style.width = `${totalWidth}px`;

    const groupsLayer = document.createElement("div");
    groupsLayer.className = "timeline-layer timeline-groups";

    const gridLayer = document.createElement("div");
    gridLayer.className = "timeline-layer timeline-grid";

    const expectationsLayer = document.createElement("div");
    expectationsLayer.className = "timeline-layer timeline-expectations";

    const detectionsLayer = document.createElement("div");
    detectionsLayer.className = "timeline-layer timeline-detections";

    const offsetX = paddingWidth;

    plan.forEach((measure, measureIndex) => {
      const startBeat = measureIndex * beatsPerMeasure;
      const endBeat = startBeat + beatsPerMeasure;
      const colorClass = measure.type;

      const groupElement = document.createElement("div");
      groupElement.className = `timeline-group timeline-group-${colorClass}`;
      groupElement.style.left = `${offsetX + startBeat * this.pxPerBeat}px`;
      groupElement.style.width = `${beatsPerMeasure * this.pxPerBeat}px`;
      groupsLayer.appendChild(groupElement);

      const gridLine = document.createElement("div");
      gridLine.className = "timeline-grid-line";
      gridLine.style.left = `${offsetX + startBeat * this.pxPerBeat}px`;
      gridLayer.appendChild(gridLine);

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

    this._setLastBeatPosition(beatPosition);
    const viewportWidth = this.viewport.clientWidth;
    const trackWidth = this.track.offsetWidth;

    if (viewportWidth === 0 || trackWidth === 0) {
      if (this._deferCenterCount > 5 || this._deferCenterRafId !== null) return;
      this._deferCenterCount += 1;
      this._deferCenterRafId = requestAnimationFrame(() => {
        this._deferCenterRafId = null;
        this.centerAt(beatPosition);
      });
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
    const localBeat = beatPosition - this._getDisplayStartBeat();
    return offsetX + localBeat * this.pxPerBeat;
  }

}

// Register custom element
if (!customElements.get("timeline-visualization")) {
  customElements.define("timeline-visualization", TimelineVisualization);
}
