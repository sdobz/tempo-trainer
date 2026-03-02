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
    this.segments = []; // Store segment structure for visualization

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

  render() {
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

    // Click-in measure (always first, show alone)
    if (this.plan[0]?.type === "click-in") {
      const clickInLine = document.createElement("div");
      clickInLine.style.display = "flex";
      clickInLine.style.gap = "0.4em";
      clickInLine.style.marginBottom = "0.4em";

      const block = document.createElement("div");
      block.className = "measure-block click-in";
      block.dataset.measureIndex = "0";
      block.textContent = "▶";
      block.style.minWidth = "2.5em";
      block.style.textAlign = "center";
      block.style.fontWeight = "bold";

      block.addEventListener("click", (event) => {
        const idx = parseInt(
          event.currentTarget.dataset.measureIndex || "",
          10,
        );
        if (!Number.isNaN(idx) && this.onMeasureClickCallback) {
          this.onMeasureClickCallback(idx);
        }
      });

      clickInLine.appendChild(block);
      viz.appendChild(clickInLine);
      measureIndex = 1;
    }

    // Render each segment with its repetitions grouped
    this.segments.forEach((segment) => {
      const segmentContainer = document.createElement("div");
      segmentContainer.style.border = "1px solid #2a2a2a";
      segmentContainer.style.borderRadius = "3px";
      segmentContainer.style.padding = "0.3em";
      segmentContainer.style.display = "flex";
      segmentContainer.style.flexDirection = "column";
      segmentContainer.style.gap = "0.2em";

      // Render each repetition as a line
      for (let rep = 0; rep < segment.reps; rep++) {
        const repLine = document.createElement("div");
        repLine.style.display = "flex";
        repLine.style.gap = "0.3em";
        repLine.style.alignItems = "center";

        // On beats
        for (let i = 0; i < segment.on; i++) {
          const block = document.createElement("div");
          block.className = "measure-block click";
          block.dataset.measureIndex = String(measureIndex);
          block.textContent = "00";

          block.addEventListener("click", (event) => {
            const idx = parseInt(
              event.currentTarget.dataset.measureIndex || "",
              10,
            );
            if (!Number.isNaN(idx) && this.onMeasureClickCallback) {
              this.onMeasureClickCallback(idx);
            }
          });

          repLine.appendChild(block);
          measureIndex++;
        }

        // Off beats (silent)
        for (let i = 0; i < segment.off; i++) {
          const block = document.createElement("div");
          block.className = "measure-block silent";
          block.dataset.measureIndex = String(measureIndex);
          block.textContent = "··";
          block.style.opacity = "0.4";

          block.addEventListener("click", (event) => {
            const idx = parseInt(
              event.currentTarget.dataset.measureIndex || "",
              10,
            );
            if (!Number.isNaN(idx) && this.onMeasureClickCallback) {
              this.onMeasureClickCallback(idx);
            }
          });

          repLine.appendChild(block);
          measureIndex++;
        }

        segmentContainer.appendChild(repLine);
      }

      viz.appendChild(segmentContainer);
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
