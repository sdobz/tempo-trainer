import StorageManager from "../base/storage-manager.js";
import { createContext } from "../component/context.js";

/** @typedef {{ on: number, off: number, reps: number }} Segment */
/**
 * @typedef {{
 *   id?: string,
 *   name: string,
 *   description?: string,
 *   difficulty?: string,
 *   segments: Segment[],
 *   isBuiltIn?: boolean,
 *   tags?: string[],
 *   createdAt?: string,
 *   updatedAt?: string
 * }} Chart
 */

/**
 * @typedef {{
 *   totalMeasures: number,
 *   playingMeasures: number,
 *   restMeasures: number,
 *   segments: number
 * }} ChartStats
 */

/**
 * @typedef {{ get(key: string, def?: string|null): string|null, set(key: string, value: unknown): boolean }} StorageLike
 */

/**
 * Context token. Provided by main composition root; consumed by panes that need chart selection/manipulation.
 * @type {import('../component/context.js').Context<ChartService|null>}
 */
export const ChartServiceContext = createContext("chart-service", null);

/**
 * ChartService — canonical owner of selected chart and chart catalog.
 *
 * Event contract:
 *   - "chart-selected": { detail: { chart: Chart } }
 *   - "chart-saved": { detail: { chart: Chart } }
 *   - "chart-deleted": { detail: { chartId: string } }
 */
class ChartService extends EventTarget {
  /**
   * @param {StorageLike|null} [storage]
   */
  constructor(storage = null) {
    super();
    /** @type {StorageLike} */
    this.storage = storage ?? {
      get: (key, def = null) => StorageManager.get(key, def),
      set: (key, value) => StorageManager.set(key, value),
    };
    this.storageKey = "tempoTrainer.customPlans";
    /** @type {Chart[]} */
    this.builtInCharts = this._getBuiltInCharts();
    /** @type {Chart|null} */
    this._selectedChart = null;
  }

  /** @returns {Chart[]} */
  _getBuiltInCharts() {
    return [
      {
        id: "beginner-simple",
        name: "Beginner: Simple Pattern",
        description:
          "1 measure on, 1 measure off - perfect for getting started",
        difficulty: "Beginner",
        segments: [{ on: 1, off: 1, reps: 8 }],
        isBuiltIn: true,
        tags: ["beginner", "simple"],
      },
      {
        id: "beginner-extended",
        name: "Beginner: Extended Pattern",
        description: "2 measures on, 2 off - building endurance",
        difficulty: "Beginner",
        segments: [{ on: 2, off: 2, reps: 6 }],
        isBuiltIn: true,
        tags: ["beginner", "endurance"],
      },
      {
        id: "intermediate-pyramid",
        name: "Intermediate: Pyramid (1-4)",
        description: "Classic pyramid pattern building from 1 to 4 measures",
        difficulty: "Intermediate",
        segments: [
          { on: 1, off: 1, reps: 4 },
          { on: 2, off: 2, reps: 4 },
          { on: 3, off: 3, reps: 4 },
          { on: 4, off: 4, reps: 4 },
        ],
        isBuiltIn: true,
        tags: ["intermediate", "pyramid", "progression"],
      },
      {
        id: "intermediate-quick",
        name: "Intermediate: Quick Drill",
        description: "Short, intense practice session",
        difficulty: "Intermediate",
        segments: [{ on: 1, off: 1, reps: 1 }],
        isBuiltIn: true,
        tags: ["intermediate", "quick", "warm-up"],
      },
      {
        id: "advanced-pyramid",
        name: "Advanced: Extended Pyramid (1-8)",
        description: "Full pyramid pattern for advanced endurance training",
        difficulty: "Advanced",
        segments: [
          { on: 1, off: 1, reps: 2 },
          { on: 2, off: 2, reps: 2 },
          { on: 3, off: 3, reps: 2 },
          { on: 4, off: 4, reps: 2 },
          { on: 5, off: 5, reps: 2 },
          { on: 6, off: 6, reps: 2 },
          { on: 7, off: 7, reps: 2 },
          { on: 8, off: 8, reps: 2 },
        ],
        isBuiltIn: true,
        tags: ["advanced", "pyramid", "endurance"],
      },
      {
        id: "advanced-mixed",
        name: "Advanced: Mixed Intervals",
        description: "Varied rest periods to challenge your internal clock",
        difficulty: "Advanced",
        segments: [
          { on: 4, off: 2, reps: 2 },
          { on: 4, off: 4, reps: 2 },
          { on: 4, off: 8, reps: 2 },
          { on: 8, off: 4, reps: 2 },
        ],
        isBuiltIn: true,
        tags: ["advanced", "intervals", "challenging"],
      },
      {
        id: "expert-marathon",
        name: "Expert: Marathon Session",
        description: "Ultimate endurance challenge with long intervals",
        difficulty: "Expert",
        segments: [
          { on: 8, off: 8, reps: 4 },
          { on: 12, off: 4, reps: 2 },
        ],
        isBuiltIn: true,
        tags: ["expert", "marathon", "endurance"],
      },
      {
        id: "expert-precision",
        name: "Expert: Precision Challenge",
        description: "Short bursts requiring maximum focus and accuracy",
        difficulty: "Expert",
        segments: [
          { on: 1, off: 7, reps: 8 },
          { on: 2, off: 6, reps: 4 },
        ],
        isBuiltIn: true,
        tags: ["expert", "precision", "focus"],
      },
    ];
  }

  /** @returns {Chart[]} */
  getAllCharts() {
    return [...this.builtInCharts, ...this.getCustomCharts()];
  }

  /** @returns {Chart[]} */
  getCustomCharts() {
    const stored = this.storage.get(this.storageKey);
    if (!stored) return [];

    try {
      const charts = JSON.parse(stored);
      return Array.isArray(charts) ? charts : [];
    } catch (error) {
      console.error("Failed to parse custom charts:", error);
      return [];
    }
  }

  /** @param {string} chartId */
  getChartById(chartId) {
    return this.getAllCharts().find((chart) => chart.id === chartId) ?? null;
  }

  /** @returns {Chart|null} */
  getSelectedChart() {
    return this._selectedChart;
  }

  /** @param {Chart} chart */
  selectChart(chart) {
    this._selectedChart = chart;
    this.dispatchEvent(
      new CustomEvent("chart-selected", {
        detail: { chart },
      }),
    );
  }

  /**
   * @param {Chart} chart
   * @returns {Chart}
   */
  saveChart(chart) {
    if (!chart.name || !chart.segments || chart.segments.length === 0) {
      throw new Error("Chart must have a name and at least one segment");
    }

    const nextChart = {
      ...chart,
      id:
        chart.id ??
        `custom-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      isBuiltIn: false,
      createdAt: chart.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const customCharts = this.getCustomCharts();
    const existingIndex = customCharts.findIndex((c) => c.id === nextChart.id);
    if (existingIndex >= 0) {
      customCharts[existingIndex] = nextChart;
    } else {
      customCharts.push(nextChart);
    }

    this.storage.set(this.storageKey, JSON.stringify(customCharts));

    this.dispatchEvent(
      new CustomEvent("chart-saved", {
        detail: { chart: nextChart },
      }),
    );

    return nextChart;
  }

  /**
   * @param {string} chartId
   * @returns {boolean}
   */
  deleteChart(chartId) {
    const customCharts = this.getCustomCharts();
    const filtered = customCharts.filter((chart) => chart.id !== chartId);
    if (filtered.length === customCharts.length) {
      return false;
    }

    this.storage.set(this.storageKey, JSON.stringify(filtered));
    this.dispatchEvent(
      new CustomEvent("chart-deleted", {
        detail: { chartId },
      }),
    );
    return true;
  }

  /**
   * @param {string} sourceChartId
   * @param {string} [newName]
   * @returns {Chart}
   */
  cloneChart(sourceChartId, newName) {
    const source = this.getChartById(sourceChartId);
    if (!source) {
      throw new Error("Chart not found");
    }

    return this.saveChart({
      name: newName || `${source.name} (Copy)`,
      description: source.description || "",
      difficulty: source.difficulty || "",
      segments: JSON.parse(JSON.stringify(source.segments)),
      tags: [...(source.tags || [])],
    });
  }

  /**
   * @param {Segment[]} segments
   * @returns {string}
   */
  segmentsToString(segments) {
    return segments.map((seg) => `${seg.on},${seg.off},${seg.reps}`).join(";");
  }

  /**
   * @param {string} chartString
   * @returns {Segment[]}
   */
  stringToSegments(chartString) {
    /** @type {Segment[]} */
    const segments = [];
    const trimmed = chartString.trim();
    if (!trimmed) return segments;

    for (const step of trimmed.split(";")) {
      const parts = step
        .trim()
        .split(",")
        .map((value) => parseInt(value.trim(), 10));
      if (parts.length === 3 && !parts.some(Number.isNaN)) {
        const [on, off, reps] = parts;
        segments.push({ on, off, reps });
      }
    }

    return segments;
  }

  /**
   * @param {Segment[]} segments
   * @returns {ChartStats}
   */
  calculateStats(segments) {
    let totalMeasures = 0;
    let playingMeasures = 0;
    let restMeasures = 0;

    for (const seg of segments) {
      const measuresPerRep = seg.on + seg.off;
      const totalForSegment = measuresPerRep * seg.reps;
      totalMeasures += totalForSegment;
      playingMeasures += seg.on * seg.reps;
      restMeasures += seg.off * seg.reps;
    }

    return {
      totalMeasures,
      playingMeasures,
      restMeasures,
      segments: segments.length,
    };
  }

  /**
   * @param {Segment[]} segments
   * @param {number} bpm
   * @param {number} beatsPerMeasure
   * @returns {number}
   */
  estimateDuration(segments, bpm, beatsPerMeasure) {
    const stats = this.calculateStats(segments);
    const beatsPerSecond = bpm / 60;
    const totalBeats = (stats.totalMeasures + 1) * beatsPerMeasure;
    return Math.ceil(totalBeats / beatsPerSecond);
  }

  /**
   * @param {number} seconds
   * @returns {string}
   */
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  /**
   * Get chart with full projection: plan array (measures) and catalog segments.
   * @param {Chart|null|undefined} chart
   * @returns {{
   *   plan: Array<{on: number, off: number, reps: number}>,
   *   segments: Segment[]
   * }}
   */
  projectChart(chart) {
    if (!chart) {
      return { plan: [], segments: [] };
    }

    return {
      plan: chart.segments
        ? this.stringToSegments(this.segmentsToString(chart.segments))
        : [],
      segments: chart.segments || [],
    };
  }
}

export default ChartService;
