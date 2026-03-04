/// <reference lib="dom" />
import "../base/setup-dom.ts"; // Setup DOM environment first
import { assertEquals } from "../base/assert.ts";

// Dynamic import after mocks are set up
const { default: PlanPlayPane } = await import("./plan-play-pane.js");

/**
 * Helper to create a fresh component instance and wait for it to be ready
 */
async function createComponent() {
  const element = document.createElement("plan-play-pane") as InstanceType<
    typeof PlanPlayPane
  >;
  await element.componentReady;
  return element;
}

/**
 * Mock Timeline class
 */
class MockTimeline {
  attachToDOM(_viewport: HTMLElement, _track: HTMLElement) {}
  setBeatsPerMeasure(_beats: number) {}
  centerAt(_position: number) {}
  addDetection(_position: number) {}
  setDrillPlan(_plan: any[]) {}
}

/**
 * Mock DrillPlan class
 */
class MockDrillPlan {
  parse(_planString: string) {}
  setHighlight(_measureIndex: number) {}
  getMeasureType(_measureIndex: number): string {
    return "active";
  }
  getLength(): number {
    return 10;
  }
  onPlanChange(_callback: (plan: any[]) => void) {}
  onMeasureClick(_callback: (measureIndex: number) => void) {}
}

/**
 * Mock Scorer class
 */
class MockScorer {
  registerHit(_beatPosition: number) {}
  finalizeMeasure(_measureIndex: number) {}
  getOverallScore(): number {
    return 85;
  }
  setDrillPlan(_plan: any[]) {}
  setBeatsPerMeasure(_beats: number) {}
  setBeatDuration(_duration: number) {}
}

Deno.test("PlanPlayPane: should initialize with default state", async () => {
  const component = await createComponent();
  assertEquals(component.state.isPlaying, false);
  assertEquals(component.state.currentMeasure, 0);
  assertEquals(component.state.overallScore, 0);
});

Deno.test("PlanPlayPane: should have required template and style URLs", async () => {
  const component = await createComponent();
  assertEquals(typeof component.getTemplateUrl(), "string");
  assertEquals(typeof component.getStyleUrl(), "string");
  assertEquals(component.getTemplateUrl().includes("html"), true);
  assertEquals(component.getStyleUrl().includes("css"), true);
});

Deno.test("PlanPlayPane: should update state via setState()", async () => {
  const component = await createComponent();
  component.setState({ isPlaying: true, currentMeasure: 5 });
  assertEquals(component.state.isPlaying, true);
  assertEquals(component.state.currentMeasure, 5);
});

Deno.test("PlanPlayPane: should merge state updates, not replace", async () => {
  const component = await createComponent();
  component.setState({ isPlaying: true });
  assertEquals(component.state.isPlaying, true);
  assertEquals(component.state.currentMeasure, 0);
  component.setState({ currentMeasure: 3 });
  assertEquals(component.state.isPlaying, true);
  assertEquals(component.state.currentMeasure, 3);
});

Deno.test("PlanPlayPane: should call onStateChange hook when state updates", async () => {
  const component = await createComponent();
  let hookCalled = false;
  let oldState: any = null;
  let newState: any = null;

  component.onStateChange = (oldS, newS) => {
    hookCalled = true;
    oldState = oldS;
    newState = newS;
  };

  component.setState({ isPlaying: true });
  assertEquals(hookCalled, true);
  assertEquals(oldState?.isPlaying, false);
  assertEquals(newState?.isPlaying, true);
});

Deno.test("PlanPlayPane: should register as custom element", () => {
  const customElement = customElements.get("plan-play-pane");
  assertEquals(customElement !== undefined, true);
});

Deno.test("PlanPlayPane: setState should throw on invalid argument", async () => {
  const component = await createComponent();
  try {
    component.setState(null as any);
    assertEquals(true, false); // Should not reach here
  } catch (e) {
    assertEquals((e as Error).message, "setState requires an object");
  }
});

Deno.test("PlanPlayPane: should initialize dependencies via init()", async () => {
  const component = await createComponent();
  const mockDrillPlan = new MockDrillPlan();
  const mockScorer = new MockScorer();

  component.init(mockDrillPlan, mockScorer);

  assertEquals(component.drillPlan, mockDrillPlan);
  assertEquals(component.scorer, mockScorer);
});

Deno.test("PlanPlayPane: getBPM should return BPM value as number", async () => {
  const component = await createComponent();
  (component.bpmInput as HTMLInputElement).value = "120";
  assertEquals(component.getBPM(), 120);
});

Deno.test("PlanPlayPane: setBPM should set BPM value", async () => {
  const component = await createComponent();
  component.setBPM(140);
  assertEquals((component.bpmInput as HTMLInputElement).value, "140");
});

Deno.test("PlanPlayPane: getBeatsPerMeasure should parse time signature", async () => {
  const component = await createComponent();
  (component.timeSignatureSelect as HTMLSelectElement).value = "4/4";
  assertEquals(component.getBeatsPerMeasure(), 4);
  (component.timeSignatureSelect as HTMLSelectElement).value = "3/4";
  assertEquals(component.getBeatsPerMeasure(), 3);
});

Deno.test("PlanPlayPane: setTimeSignature should set time signature value", async () => {
  const component = await createComponent();
  component.setTimeSignature("6/8");
  assertEquals(
    (component.timeSignatureSelect as HTMLSelectElement).value,
    "6/8",
  );
});

Deno.test("PlanPlayPane: updateBeatIndicator should update display", async () => {
  const component = await createComponent();
  const beatIndicator = component.beatIndicator as HTMLElement;

  component.updateBeatIndicator(1, true, true);
  assertEquals(beatIndicator.textContent, "1");
  assertEquals(beatIndicator.classList.contains("downbeat"), true);

  component.updateBeatIndicator(2, false, true);
  assertEquals(beatIndicator.textContent, "2");
  assertEquals(beatIndicator.classList.contains("active"), true);
  assertEquals(beatIndicator.classList.contains("downbeat"), false);
});

Deno.test(
  "PlanPlayPane: updateBeatIndicator should not show beat when shouldShow is false",
  async () => {
    const component = await createComponent();
    const beatIndicator = component.beatIndicator as HTMLElement;

    component.updateBeatIndicator(3, false, false);
    assertEquals(beatIndicator.textContent, "3");
    assertEquals(beatIndicator.classList.contains("active"), false);
    assertEquals(beatIndicator.classList.contains("downbeat"), false);
  },
);

Deno.test("PlanPlayPane: clearBeatIndicator should clear display", async () => {
  const component = await createComponent();
  const beatIndicator = component.beatIndicator as HTMLElement;

  component.updateBeatIndicator(4, false, true);
  assertEquals(beatIndicator.textContent, "4");

  component.clearBeatIndicator();
  assertEquals(beatIndicator.textContent, "");
  assertEquals(beatIndicator.className, "beat-indicator");
});

Deno.test("PlanPlayPane: setStatus should update status message", async () => {
  const component = await createComponent();
  const statusDiv = component.statusDiv as HTMLElement;

  component.setStatus("Running...");
  assertEquals(statusDiv.textContent, "Running...");

  component.setStatus("Completed!");
  assertEquals(statusDiv.textContent, "Completed!");
});

Deno.test("PlanPlayPane: updateScore should update score display", async () => {
  const component = await createComponent();
  const scoreDisplay = component.overallScoreDisplay as HTMLElement;

  component.updateScore(75);
  assertEquals(component.state.overallScore, 75);
  assertEquals(scoreDisplay.textContent, "Overall Score: 75");

  component.updateScore(5);
  assertEquals(component.state.overallScore, 5);
  assertEquals(scoreDisplay.textContent, "Overall Score: 05");
});

Deno.test("PlanPlayPane: setStartDisabled should enable/disable start button", async () => {
  const component = await createComponent();
  const startBtn = component.startBtn as HTMLButtonElement;

  component.setStartDisabled(true);
  assertEquals(startBtn.disabled, true);

  component.setStartDisabled(false);
  assertEquals(startBtn.disabled, false);
});

Deno.test("PlanPlayPane: setStopDisabled should enable/disable stop button", async () => {
  const component = await createComponent();
  const stopBtn = component.stopBtn as HTMLButtonElement;

  component.setStopDisabled(true);
  assertEquals(stopBtn.disabled, true);

  component.setStopDisabled(false);
  assertEquals(stopBtn.disabled, false);
});

Deno.test("PlanPlayPane: setPlaying should update state and button states", async () => {
  const component = await createComponent();
  const startBtn = component.startBtn as HTMLButtonElement;
  const stopBtn = component.stopBtn as HTMLButtonElement;

  component.setPlaying(true);
  assertEquals(component.state.isPlaying, true);
  assertEquals(startBtn.disabled, true);
  assertEquals(stopBtn.disabled, false);

  component.setPlaying(false);
  assertEquals(component.state.isPlaying, false);
  assertEquals(startBtn.disabled, false);
  assertEquals(stopBtn.disabled, true);
});

Deno.test("PlanPlayPane: reset should reset to initial state", async () => {
  const component = await createComponent();

  // Set some state
  component.updateBeatIndicator(3, false, true);
  component.setStatus("Running...");
  component.updateScore(75);
  component.setPlaying(true);
  component.setState({ currentMeasure: 5 });

  // Reset
  component.reset();

  const beatIndicator = component.beatIndicator as HTMLElement;
  const statusDiv = component.statusDiv as HTMLElement;
  const startBtn = component.startBtn as HTMLButtonElement;
  const stopBtn = component.stopBtn as HTMLButtonElement;

  assertEquals(beatIndicator.textContent, "");
  assertEquals(statusDiv.textContent, "Ready.");
  assertEquals(component.state.overallScore, 0);
  assertEquals(component.state.isPlaying, false);
  assertEquals(startBtn.disabled, false);
  assertEquals(stopBtn.disabled, true);
  assertEquals(component.state.currentMeasure, 0);
});

Deno.test("PlanPlayPane: start button should emit session-start event", async () => {
  const component = await createComponent();
  let eventFired = false;
  let eventData: any = null;

  component.addEventListener(
    "session-start",
    ((e: CustomEvent) => {
      eventFired = true;
      eventData = e.detail;
    }) as EventListener,
  );

  (component.bpmInput as HTMLInputElement).value = "120";
  (component.timeSignatureSelect as HTMLSelectElement).value = "4/4";
  (component.startBtn as HTMLButtonElement).click();

  assertEquals(eventFired, true);
  assertEquals(eventData.bpm, 120);
  assertEquals(eventData.beatsPerMeasure, 4);
});

Deno.test("PlanPlayPane: stop button should emit session-stop event", async () => {
  const component = await createComponent();
  let eventFired = false;

  component.addEventListener("session-stop", () => {
    eventFired = true;
  });

  // Enable stop button (normally disabled when not playing)
  component.setStopDisabled(false);
  (component.stopBtn as HTMLButtonElement).click();
  assertEquals(eventFired, true);
});

Deno.test("PlanPlayPane: view results button should emit navigate event", async () => {
  const component = await createComponent();
  let eventFired = false;
  let eventData: any = null;

  component.addEventListener(
    "navigate",
    ((e: CustomEvent) => {
      eventFired = true;
      eventData = e.detail;
    }) as EventListener,
  );

  (component.viewResultsBtn as HTMLButtonElement).click();

  assertEquals(eventFired, true);
  assertEquals(eventData.pane, "plan-history");
});
