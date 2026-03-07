/// <reference lib="dom" />
import "../base/setup-dom.ts"; // Setup DOM environment first
import { assertEquals } from "../base/assert.ts";

// Dynamic import after mocks are set up
const { default: CalibrationControl } =
  await import("./calibration-control.js");

/**
 * MockCalibrationDetector for testing without real audio processing
 */
class MockCalibrationDetector {
  isCalibrating = false;
  offsetMs = 0;

  setBeatsPerMeasure(beatsPerMeasure: number): void {}
  setBeatDuration(beatDuration: number): void {}
  getOffsetMs(): number {
    return this.offsetMs;
  }
  getCalibratedBeatPosition(
    audioTime: number,
    runStartAudioTime: number,
    beatDuration: number,
  ): number {
    return audioTime - runStartAudioTime;
  }
  toggle(): void {
    this.isCalibrating = !this.isCalibrating;
  }
  async start(): Promise<boolean> {
    return false;
  }
  stop(message: string): void {}
  registerHit(hitAudioTime: number): void {}
  onStop(callback: Function): void {}
  onStatusChanged(message: string): void {}
  onOffsetChanged(offsetMs: number): void {}
  onCalibrationStateChanged(isStarted: boolean): void {}
}

/**
 * Helper to create a fresh component instance with injected detector
 */
async function createComponent() {
  const element = document.createElement("calibration-control") as InstanceType<
    typeof CalibrationControl
  >;

  await element.componentReady;

  // Inject a mock detector (normally done by wiring layer)
  const detector = new MockCalibrationDetector();
  element.setDetector(detector as any);

  return element;
}

Deno.test(
  "CalibrationControl: should initialize with default state",
  async () => {
    const component = await createComponent();
    assertEquals(component.state.isCalibrated, false);
  },
);

Deno.test(
  "CalibrationControl: should have required template and style URLs",
  async () => {
    const component = await createComponent();
    assertEquals(typeof component.getTemplateUrl(), "string");
    assertEquals(typeof component.getStyleUrl(), "string");
    assertEquals(component.getTemplateUrl().includes("html"), true);
    assertEquals(component.getStyleUrl().includes("css"), true);
  },
);

Deno.test(
  "CalibrationControl: should update state via setState()",
  async () => {
    const component = await createComponent();
    component.setState({ isCalibrated: true });
    assertEquals(component.state.isCalibrated, true);
  },
);

Deno.test(
  "CalibrationControl: should call onStateChange hook when state updates",
  async () => {
    const component = await createComponent();
    let hookCalled = false;
    let oldState: any = null;
    let newState: any = null;

    component.onStateChange = (oldS, newS) => {
      hookCalled = true;
      oldState = oldS;
      newState = newS;
    };

    component.setState({ isCalibrated: true });
    assertEquals(hookCalled, true);
    assertEquals(oldState?.isCalibrated, false);
    assertEquals(newState?.isCalibrated, true);
  },
);

Deno.test("CalibrationControl: should register as custom element", () => {
  const customElement = customElements.get("calibration-control");
  assertEquals(customElement !== undefined, true);
});

Deno.test(
  "CalibrationControl: setState should throw on invalid argument",
  async () => {
    const component = await createComponent();
    try {
      component.setState(null as any);
      assertEquals(true, false); // Should not reach here
    } catch (e) {
      assertEquals((e as Error).message, "setState requires an object");
    }
  },
);

Deno.test(
  "CalibrationControl: setState should accept valid state objects",
  async () => {
    const component = await createComponent();
    component.setState({});
    assertEquals(component.state.isCalibrated, false);
    component.setState({ isCalibrated: true });
    assertEquals(component.state.isCalibrated, true);
  },
);

Deno.test(
  "CalibrationControl: should have calibration property initialized",
  async () => {
    const component = await createComponent();
    assertEquals(component.calibration !== null, true);
  },
);

Deno.test(
  "CalibrationControl: should implement delegate interface methods",
  async () => {
    const component = await createComponent();
    assertEquals(typeof component.onStatusChanged, "function");
    assertEquals(typeof component.onOffsetChanged, "function");
    assertEquals(typeof component.onCalibrationStateChanged, "function");
  },
);

Deno.test(
  "CalibrationControl: onStatusChanged should be safe to call",
  async () => {
    const component = await createComponent();
    component.onStatusChanged("Test status message");
    assertEquals(true, true);
  },
);

Deno.test(
  "CalibrationControl: onOffsetChanged should update offset input",
  async () => {
    const component = await createComponent();
    if (!component.offsetInput) return;

    component.onOffsetChanged(42);

    const offsetInput = component.offsetInput as HTMLInputElement;
    assertEquals(offsetInput.value, "42");
  },
);

Deno.test(
  "CalibrationControl: onCalibrationStateChanged should update button text",
  async () => {
    const component = await createComponent();
    if (!component.button) return;

    component.onCalibrationStateChanged(true);
    assertEquals(component.button.textContent, "Cancel Calibration");

    component.onCalibrationStateChanged(false);
    assertEquals(component.button.textContent, "Auto Calibrate");
  },
);

Deno.test(
  "CalibrationControl: updateStatus should set configured state",
  async () => {
    const component = await createComponent();

    component.updateStatus(true);
    assertEquals(component.state.isCalibrated, true);

    component.updateStatus(false);
    assertEquals(component.state.isCalibrated, false);
  },
);
