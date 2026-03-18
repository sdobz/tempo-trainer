import BaseComponent from "../component/base-component.js";
import { querySelector } from "../component/component-utils.js";
import { PlaybackContext } from "../plan-play/playback-state.js";
import { ChartServiceContext } from "../music/chart-service.js";

export default class PlanVisualizer extends BaseComponent {
  constructor() {
    super();

    this.container = null;
    this._viz = null;

    [this._getPlan, this._setPlan] = this.createSignalState([]);
    [this._getSegments, this._setSegments] = this.createSignalState([]);
    [this._getScores, this._setScores] = this.createSignalState([]);
    [this._getHighlight, this._setHighlight] = this.createSignalState(-1);
    [this._getDelegate, this._setDelegate] = this.createSignalState(null);

    this.setDelegate = this._setDelegate;
    this.setHighlight = this._setHighlight;

    this._cleanupPlayback = null;
    this._cleanupChart = null;
  }

  getTemplateUrl() {
    return new URL("./plan-visualizer.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./plan-visualizer.css", import.meta.url).href;
  }

  onMount() {
    this.container = querySelector(this, "[data-plan-visualization-container]");
    this._viz = document.createElement("div");
    this._viz.id = "plan-visualization";
    this._viz.style.display = "flex";
    this._viz.style.flexDirection = "column";
    this._viz.style.gap = "0.8em";
    this._viz.style.borderRadius = "4px";
    this.container.appendChild(this._viz);

    // TODO: boilerplate, eliminate
    this.createEffect(() => {
      this._renderStructure(
        this._getPlan(),
        this._getSegments(),
        this._getDelegate(),
      );
    });

    this.createEffect(() => {
      this._applyScoresAndHighlight(
        this._getPlan(),
        this._getScores(),
        this._getHighlight(),
      );
    });

    this.consumeContext(ChartServiceContext, (chartService) => {
      const selected = chartService.getSelectedChart();
      if (selected) {
        this.setDrillPlan(chartService.projectChart(selected));
      }

      const onSelected = (
        /** @type {CustomEvent<{chart: Object}>} */ event,
      ) => {
        this.setDrillPlan(chartService.projectChart(event.detail.chart));
      };

      chartService.addEventListener("chart-selected", onSelected);
      this._cleanupChart = () => {
        chartService.removeEventListener("chart-selected", onSelected);
      };
    });

    this.consumeContext(PlaybackContext, (playbackState) => {
      this._cleanupPlayback = playbackState.subscribe((state) => {
        this._setScores(state.scores);
        this._setHighlight(state.highlight);
      });
    });
  }

  onUnmount() {
    if (this._cleanupPlayback) {
      this._cleanupPlayback();
      this._cleanupPlayback = null;
    }
    if (this._cleanupChart) {
      this._cleanupChart();
      this._cleanupChart = null;
    }
  }

  parse(planString) {
    const plan = [];
    const segments = [
      {
        isClickIn: true,
        on: 1,
        off: 0,
        reps: 1,
        startIndex: 0,
      },
    ];

    plan.push({ type: "click-in" });

    const trimmed = planString.trim();
    if (!trimmed) {
      const defaultSegment = { on: 64, off: 0, reps: 1, startIndex: 1 };
      for (let index = 0; index < 64; index++) {
        plan.push({ type: "click" });
      }
      segments.push(defaultSegment);
    } else {
      let currentIndex = 1;
      trimmed.split(";").forEach((step) => {
        const parts = step
          .trim()
          .split(",")
          .map((part) => parseInt(part.trim(), 10));

        if (parts.length !== 3 || parts.some(isNaN)) {
          return;
        }

        const [on, off, reps] = parts;
        segments.push({ on, off, reps, startIndex: currentIndex });

        for (let repetition = 0; repetition < reps; repetition++) {
          for (let onIndex = 0; onIndex < on; onIndex++) {
            plan.push({ type: "click" });
            currentIndex++;
          }
          for (let offIndex = 0; offIndex < off; offIndex++) {
            plan.push({ type: "silent" });
            currentIndex++;
          }
        }
      });
    }

    this._setPlan(plan);
    this._setSegments(segments);
    this._setScores([]);
    this._setHighlight(-1);
    this.emit("plan-change", { plan, segments });
    return plan;
  }

  setDrillPlan(planData) {
    let plan = this._getPlan();
    let segments = this._getSegments();

    if (planData && planData.plan && planData.segments) {
      plan = planData.plan;
      segments = planData.segments;
    } else if (Array.isArray(planData)) {
      plan = planData;
      segments = [{ on: planData.length, off: 0, reps: 1, startIndex: 0 }];
    } else if (planData && Array.isArray(planData.measures)) {
      plan = planData.measures;
      segments = [{ on: plan.length, off: 0, reps: 1, startIndex: 0 }];
    }

    this._setPlan(plan);
    this._setSegments(segments);
    this._setScores([]);
    this._setHighlight(-1);
  }

  setScore(measureIndex, score) {
    const scores = [...this._getScores()];
    scores[measureIndex] = score;
    this._setScores(scores);
  }

  setScores(scores) {
    this._setScores([...scores]);
  }

  getMeasureType(measureIndex) {
    return this._getPlan()[measureIndex]?.type || null;
  }

  getLength() {
    return this._getPlan().length;
  }

  getPlan() {
    return {
      plan: this._getPlan(),
      segments: this._getSegments(),
    };
  }

  _renderStructure(plan, segments, delegate) {
    if (!this._viz) {
      return;
    }

    this._viz.innerHTML = "";
    this._viz.classList.toggle("interactive", Boolean(delegate));

    if (plan.length === 0) {
      return;
    }

    let globalMeasureIndex = 0;
    segments.forEach((segment) => {
      const segmentContainer = document.createElement("div");
      segmentContainer.className = "segment-group";
      segmentContainer.style.display = "flex";
      segmentContainer.style.flexDirection = "column";
      segmentContainer.style.gap = "0.3em";

      for (let repetition = 0; repetition < segment.reps; repetition++) {
        const row = document.createElement("div");
        row.className = "segment-row";
        row.style.display = "flex";
        row.style.flexWrap = "wrap";
        row.style.gap = "0.3em";

        const totalBlocks = segment.on + segment.off;
        for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex++) {
          if (globalMeasureIndex >= plan.length) {
            break;
          }

          const measureIndex = globalMeasureIndex;
          const measure = plan[measureIndex];
          const block = document.createElement("div");
          block.className = `measure-block ${measure.type}`;
          block.dataset.measureIndex = String(measureIndex);
          block.addEventListener("click", () => {
            const currentDelegate = this._getDelegate();
            if (
              currentDelegate &&
              typeof currentDelegate.onMeasureClick === "function"
            ) {
              currentDelegate.onMeasureClick(measureIndex);
            }
          });
          row.appendChild(block);
          globalMeasureIndex++;
        }

        segmentContainer.appendChild(row);
      }

      this._viz.appendChild(segmentContainer);
    });
  }

  _applyScoresAndHighlight(plan, scores, highlight) {
    if (!this._viz) {
      return;
    }

    const blocks = this._viz.querySelectorAll(".measure-block");
    blocks.forEach((block, index) => {
      const blockElement = /** @type {HTMLElement} */ (block);
      const measureType = plan[index]?.type;
      const score = scores[index];

      blockElement.classList.toggle("current", index === highlight);
      blockElement.textContent = "";
      delete blockElement.dataset.score;

      if (measureType === "click-in" || score == null) {
        return;
      }

      const clampedScore = Math.max(0, Math.min(99, score));
      blockElement.textContent = String(clampedScore).padStart(2, "0");
      blockElement.dataset.score = String(clampedScore);
    });
  }
}

if (!customElements.get("plan-visualizer")) {
  customElements.define("plan-visualizer", PlanVisualizer);
}
