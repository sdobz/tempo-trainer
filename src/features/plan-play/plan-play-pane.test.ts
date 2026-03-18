/// <reference lib="dom" />
import "../component/setup-dom.ts";
import { assertEquals } from "../base/assert.ts";

const { default: PlanPlayPane } = await import("./plan-play-pane.js");

async function createComponent() {
  const element = document.createElement("plan-play-pane") as InstanceType<
    typeof PlanPlayPane
  >;
  await element.componentReady;
  return element;
}

Deno.test(
  "PlanPlayPane: should initialize with default DOM state",
  async () => {
    const component = await createComponent();
    assertEquals((component.refs.statusDiv as HTMLElement).textContent, "");
    assertEquals(
      (component.refs.overallScoreDisplay as HTMLElement).textContent,
      "Overall Score: 00",
    );
    assertEquals((component.refs.startBtn as HTMLButtonElement).disabled, false);
    assertEquals((component.refs.stopBtn as HTMLButtonElement).disabled, true);
  },
);

Deno.test(
  "PlanPlayPane: should have required template and style URLs",
  async () => {
    const component = await createComponent();
    assertEquals(typeof component.getTemplateUrl(), "string");
    assertEquals(typeof component.getStyleUrl(), "string");
    assertEquals(component.getTemplateUrl().includes("html"), true);
    assertEquals(component.getStyleUrl().includes("css"), true);
  },
);

Deno.test("PlanPlayPane: should register as custom element", () => {
  const customElement = customElements.get("plan-play-pane");
  assertEquals(customElement !== undefined, true);
});

Deno.test("PlanPlayPane: should expose playbackState getter", async () => {
  const component = await createComponent();
  const playbackState = component.playbackState;
  assertEquals(typeof playbackState.subscribe, "function");
  assertEquals(typeof playbackState.update, "function");
  assertEquals(playbackState.state.isPlaying, false);
});

Deno.test(
  "PlanPlayPane: playbackState.update should reflect status in DOM",
  async () => {
    const component = await createComponent();
    component.playbackState.update({ status: "Running..." });
    assertEquals(
      (component.refs.statusDiv as HTMLElement).textContent,
      "Running...",
    );
  },
);

Deno.test(
  "PlanPlayPane: playbackState.update beat should update beat indicator",
  async () => {
    const component = await createComponent();
    component.playbackState.update({
      beat: { beatNum: 2, isDownbeat: false, shouldShow: true },
    });
    const indicator = component.refs.beatIndicator as HTMLElement;
    assertEquals(indicator.textContent, "2");
    assertEquals(indicator.classList.contains("active"), true);
  },
);

Deno.test(
  "PlanPlayPane: playbackState.update score should update score display",
  async () => {
    const component = await createComponent();
    component.playbackState.update({ overallScore: 75 });
    assertEquals(
      (component.refs.overallScoreDisplay as HTMLElement).textContent,
      "Overall Score: 75",
    );
  },
);

Deno.test("PlanPlayPane: setBPM should update the BPM input", async () => {
  const component = await createComponent();
  component.setBPM(140);
  assertEquals((component.refs.bpmInput as HTMLInputElement).value, "140");
  assertEquals(component.getBPM(), 140);
});

Deno.test(
  "PlanPlayPane: setTimeSignature should update the time signature input",
  async () => {
    const component = await createComponent();
    component.setTimeSignature("3/4");
    assertEquals(
      (component.refs.timeSignatureSelect as HTMLSelectElement).value,
      "3/4",
    );
    assertEquals(component.getBeatsPerMeasure(), 3);
  },
);

Deno.test(
  "PlanPlayPane: setStartDisabled should enable and disable the start button",
  async () => {
    const component = await createComponent();
    const startButton = component.refs.startBtn as HTMLButtonElement;
    component.setStartDisabled(true);
    assertEquals(startButton.disabled, true);
    component.setStartDisabled(false);
    assertEquals(startButton.disabled, false);
  },
);

Deno.test(
  "PlanPlayPane: setStopDisabled should enable and disable the stop button",
  async () => {
    const component = await createComponent();
    const stopButton = component.refs.stopBtn as HTMLButtonElement;
    component.setStopDisabled(true);
    assertEquals(stopButton.disabled, true);
    component.setStopDisabled(false);
    assertEquals(stopButton.disabled, false);
  },
);

Deno.test("PlanPlayPane: setPlaying should update button states", async () => {
  const component = await createComponent();
  const startButton = component.refs.startBtn as HTMLButtonElement;
  const stopButton = component.refs.stopBtn as HTMLButtonElement;

  component.setPlaying(true);
  assertEquals(startButton.disabled, true);
  assertEquals(stopButton.disabled, false);

  component.setPlaying(false);
  assertEquals(startButton.disabled, false);
  assertEquals(stopButton.disabled, true);
});

Deno.test(
  "PlanPlayPane: reset should reset rendered playback state",
  async () => {
    const component = await createComponent();
    component.playbackState.update({
      beat: { beatNum: 3, isDownbeat: false, shouldShow: true },
      status: "Running...",
      overallScore: 75,
      isPlaying: true,
    });

    component.reset();

    assertEquals((component.refs.beatIndicator as HTMLElement).textContent, "");
    assertEquals((component.refs.statusDiv as HTMLElement).textContent, "Ready.");
    assertEquals(
      (component.refs.overallScoreDisplay as HTMLElement).textContent,
      "Overall Score: 00",
    );
    assertEquals((component.refs.startBtn as HTMLButtonElement).disabled, false);
    assertEquals((component.refs.stopBtn as HTMLButtonElement).disabled, true);
  },
);

Deno.test(
  "PlanPlayPane: start button should emit session-start event",
  async () => {
    const component = await createComponent();
    let eventFired = false;
    let eventData: any = null;

    component.addEventListener("session-start", ((event: CustomEvent) => {
      eventFired = true;
      eventData = event.detail;
    }) as EventListener);

    component.setBPM(120);
    component.setTimeSignature("4/4");
    (component.refs.startBtn as HTMLButtonElement).click();

    assertEquals(eventFired, true);
    assertEquals(eventData.bpm, 120);
    assertEquals(eventData.beatsPerMeasure, 4);
  },
);

Deno.test(
  "PlanPlayPane: stop button should emit session-stop event",
  async () => {
    const component = await createComponent();
    let eventFired = false;

    component.addEventListener("session-stop", () => {
      eventFired = true;
    });

    component.setStopDisabled(false);
    (component.refs.stopBtn as HTMLButtonElement).click();
    assertEquals(eventFired, true);
  },
);

Deno.test(
  "PlanPlayPane: view results button should emit navigate event",
  async () => {
    const component = await createComponent();
    let eventFired = false;
    let eventData: any = null;

    component.addEventListener("navigate", ((event: CustomEvent) => {
      eventFired = true;
      eventData = event.detail;
    }) as EventListener);

    (component.refs.viewResultsBtn as HTMLButtonElement).click();

    assertEquals(eventFired, true);
    assertEquals(eventData.pane, "plan-history");
  },
);
