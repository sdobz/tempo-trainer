// Timeline visualization and interaction
class Timeline {
  constructor(viewportElement, trackElement) {
    this.viewport = viewportElement;
    this.track = trackElement;

    // Configuration
    this.pxPerBeat = 18;
    this.tailBeats = 1;

    // State
    this.drillPlan = [];
    this.beatsPerMeasure = 4;
    this.lastBeatPosition = 0;
  }

  setBeatsPerMeasure(beatsPerMeasure) {
    this.beatsPerMeasure = beatsPerMeasure;
  }

  setDrillPlan(plan) {
    this.drillPlan = plan;
    this.build();
  }

  build() {
    this.track.innerHTML = "";

    if (this.drillPlan.length === 0) return;

    const viewportWidth = this.viewport.clientWidth;
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

  addDetection(beatPosition) {
    const detectionsLayer = this.track.querySelector(".timeline-detections");
    if (!detectionsLayer) return;

    const dot = document.createElement("div");
    dot.className = "timeline-detection";
    dot.style.left = `${this._beatToX(beatPosition)}px`;
    detectionsLayer.appendChild(dot);
  }

  centerAt(beatPosition) {
    this.lastBeatPosition = beatPosition;
    const viewportWidth = this.viewport.clientWidth;
    const trackWidth = this.track.offsetWidth;
    const targetX = this._beatToX(beatPosition);

    let left = viewportWidth / 2 - targetX;
    const minLeft = Math.min(0, viewportWidth - trackWidth);
    left = Math.max(minLeft, Math.min(0, left));

    this.track.style.transform = `translateX(${left}px)`;
  }

  _beatToX(beatPosition) {
    const viewportWidth = this.viewport.clientWidth;
    const offsetX = viewportWidth;
    return offsetX + beatPosition * this.pxPerBeat;
  }

  getLastBeatPosition() {
    return this.lastBeatPosition;
  }
}
