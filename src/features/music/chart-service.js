import { createContext } from "../component/context.js";
import PlanLibrary from "../plan-edit/plan-library.js";

/**
 * Context token. Provided by script.js; consumed by panes that need chart selection/manipulation.
 * @type {import('../component/context.js').Context<ChartService|null>}
 */
export const ChartServiceContext = createContext("chart-service", null);

/**
 * ChartService — canonical owner of selected chart and chart catalog.
 *
 * Extracts chart ownership from SessionState + PlanLibrary.
 * Provides chart CRUD operations and event contracts for consumers.
 *
 * [Phase 1] This service is created to establish chart as an explicit domain boundary.
 * PlanLibrary remains an internal dependency for persistence and CRUD.
 * By Phase X, chart-service may also handle chart projections (e.g., beat rendering).
 *
 * Event contract:
 *   - "chart-selected": { detail: { chart: ChartObject } }
 *   - "chart-saved": { detail: { chart: ChartObject } }
 *   - "chart-deleted": { detail: { chartId: string } }
 *
 * Usage (in script.js):
 *   const chartService = new ChartService();
 *   chartService.addEventListener("chart-selected", (e) => { ... });
 *   chartService.selectChart(builtInChart);
 */
class ChartService extends EventTarget {
  constructor() {
    super();
    /** @type {PlanLibrary} */
    this._planLibrary = new PlanLibrary();
    /** @type {Object|null} */
    this._selectedChart = null;
  }

  /**
   * Get all available charts (built-in + custom).
   * @returns {Object[]} Array of chart objects with id, name, segments, etc.
   */
  getAllCharts() {
    return this._planLibrary.getAllPlans();
  }

  /**
   * Get custom (user-created) charts only.
   * @returns {Object[]} Array of custom chart objects.
   */
  getCustomCharts() {
    return this._planLibrary.getCustomPlans();
  }

  /**
   * Retrieve a single chart by ID.
   * @param {string} chartId
   * @returns {Object|null} Chart object or null if not found.
   */
  getChartById(chartId) {
    return this._planLibrary.getPlanById(chartId);
  }

  /**
   * Get the currently selected chart.
   * @returns {Object|null} Selected chart or null if none.
   */
  getSelectedChart() {
    return this._selectedChart;
  }

  /**
   * Select a chart as the active one.
   * Emits "chart-selected" event.
   * @param {Object} chart Chart object to select.
   */
  selectChart(chart) {
    this._selectedChart = chart;
    this.dispatchEvent(
      new CustomEvent("chart-selected", {
        detail: { chart },
      }),
    );
  }

  /**
   * Save a chart (create or update).
   * Emits "chart-saved" event.
   * @param {Object} chart Chart object to save.
   * @returns {Object} Saved chart (may have updated id/timestamp).
   */
  saveChart(chart) {
    const saved = this._planLibrary.savePlan(chart);
    this.dispatchEvent(
      new CustomEvent("chart-saved", {
        detail: { chart: saved },
      }),
    );
    return saved;
  }

  /**
   * Delete a chart by ID.
   * Emits "chart-deleted" event.
   * @param {string} chartId Chart ID to delete.
   */
  deleteChart(chartId) {
    this._planLibrary.deletePlan(chartId);
    this.dispatchEvent(
      new CustomEvent("chart-deleted", {
        detail: { chartId },
      }),
    );
  }

  /**
   * Clone (duplicate) a chart with a new name.
   * @param {string} sourceChartId ID of chart to clone.
   * @param {string} newName Name for the new chart.
   * @returns {Object} The cloned chart.
   */
  cloneChart(sourceChartId, newName) {
    return this._planLibrary.clonePlan(sourceChartId, newName);
  }

  /**
   * Get chart with full projection: plan array (measures) and catalog segments.
   * Used for playback bootstrap and display.
   * @param {Object} chart Chart object.
   * @returns {{
   *   plan: Array<{type: "click-in"|"silent"|"playing"}>,
   *   segments: Array<{on: number, off: number, reps: number}>
   * }} Projected chart data.
   */
  projectChart(chart) {
    if (!chart) {
      return { plan: [], segments: [] };
    }
    return {
      plan: chart.segments
        ? this._planLibrary.stringToSegments(
            this._planLibrary.segmentsToString(chart.segments),
          )
        : [],
      segments: chart.segments || [],
    };
  }
}

export default ChartService;
