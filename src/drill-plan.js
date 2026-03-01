// Manages drill plan parsing and visualization
class DrillPlan {
  constructor(container) {
    this.container = container;
    this.plan = [];
    this.currentMeasureIndex = 0;
    this.onPlanChangeCallback = null;
    this.onMeasureClickCallback = null;
  }

  onPlanChange(callback) {
    this.onPlanChangeCallback = callback;
  }

  onMeasureClick(callback) {
    this.onMeasureClickCallback = callback;
  }

  parse(planString) {
    this.plan = [];

    // Always add click-in first
    this.plan.push({ type: "click-in" });

    const trimmed = planString.trim();
    if (!trimmed) {
      // Default: 64 continuous clicks
      for (let i = 0; i < 64; i++) {
        this.plan.push({ type: "click" });
      }
    } else {
      const steps = trimmed.split(";");
      steps.forEach((step) => {
        const parts = step
          .trim()
          .split(",")
          .map((p) => parseInt(p.trim(), 10));

        if (parts.length === 3 && !parts.some(isNaN)) {
          const [on, off, reps] = parts;
          for (let rep = 0; rep < reps; rep++) {
            for (let i = 0; i < on; i++) {
              this.plan.push({ type: "click" });
            }
            for (let i = 0; i < off; i++) {
              this.plan.push({ type: "silent" });
            }
          }
        }
      });
    }

    this.render();

    if (this.onPlanChangeCallback) {
      this.onPlanChangeCallback(this.plan);
    }

    return this.plan;
  }

  render() {
    // Remove old visualization
    const oldViz = this.container.querySelector("#plan-visualization");
    if (oldViz) oldViz.remove();

    if (this.plan.length === 0) return;

    const viz = document.createElement("div");
    viz.id = "plan-visualization";

    this.plan.forEach((measure, index) => {
      const block = document.createElement("div");
      block.className = `measure-block ${measure.type}`;
      block.dataset.measureIndex = String(index);
      block.textContent = measure.type === "click-in" ? "" : "00";

      block.addEventListener("click", (event) => {
        const measureIndex = parseInt(
          event.currentTarget.dataset.measureIndex || "",
          10,
        );
        if (!Number.isNaN(measureIndex) && this.onMeasureClickCallback) {
          this.onMeasureClickCallback(measureIndex);
        }
      });

      viz.appendChild(block);
    });

    this.container.appendChild(viz);
  }

  updateMeasureScore(measureIndex, score) {
    const blocks = this.container.querySelectorAll(
      "#plan-visualization .measure-block",
    );
    if (measureIndex >= 0 && measureIndex < blocks.length) {
      const block = blocks[measureIndex];
      const measureType = this.plan[measureIndex]?.type;

      if (measureType === "click-in") {
        block.textContent = "";
        delete block.dataset.score;
      } else {
        const clampedScore = Math.max(0, Math.min(99, score ?? 0));
        block.textContent = String(clampedScore).padStart(2, "0");
        block.dataset.score = String(clampedScore);
      }
    }
  }

  updateAllScores(scores) {
    scores.forEach((score, index) => {
      this.updateMeasureScore(index, score);
    });
  }

  setHighlight(measureIndex) {
    this.currentMeasureIndex = measureIndex;
    const blocks = this.container.querySelectorAll(
      "#plan-visualization .measure-block",
    );

    blocks.forEach((block, index) => {
      if (index === measureIndex) {
        block.classList.add("current");
      } else {
        block.classList.remove("current");
      }
    });
  }

  getMeasureType(measureIndex) {
    return this.plan[measureIndex]?.type || null;
  }

  getLength() {
    return this.plan.length;
  }

  getPlan() {
    return this.plan;
  }
}
