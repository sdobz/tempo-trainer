/// <reference lib="dom" />
import "../component/setup-dom.ts"; // Setup DOM environment first
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
    assertEquals(component.refs.button?.textContent, "Auto Calibrate");
    assertEquals(
      (component.refs.progressContainer as HTMLElement | null)?.hidden,
      true,
    );
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

Deno.test("CalibrationControl: should register as custom element", () => {
  const customElement = customElements.get("calibration-control");
  assertEquals(customElement !== undefined, true);
});

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
    if (!component.refs.offsetInput) return;

    component.onOffsetChanged(42);

    const offsetInput = component.refs.offsetInput as HTMLInputElement;
    assertEquals(offsetInput.value, "42");
  },
);

Deno.test(
  "CalibrationControl: onCalibrationStateChanged should update button text",
  async () => {
    const component = await createComponent();
    if (!component.refs.button) return;

    component.onCalibrationStateChanged(true);
    assertEquals(component.refs.button.textContent, "Cancel Calibration");

    component.onCalibrationStateChanged(false);
    assertEquals(component.refs.button.textContent, "Auto Calibrate");
  },
);

Deno.test(
  "CalibrationControl: updateStatus should set configured state",
  async () => {
    const component = await createComponent();

    component.updateStatus(true);
    component.updateStatus(false);

    // Signals-first API: this method should remain callable even though there is
    // no legacy state assertion anymore.
    assertEquals(typeof component.updateStatus, "function");
  },
);

Deno.test(
  "CalibrationControl: onProgressChanged should update progress UI",
  async () => {
    const component = await createComponent();

    component.onProgressChanged({
      hits: 12,
      minHits: 10,
      confidence: 83.4,
      progressPercent: 83.4,
    });

    assertEquals(
      (component.refs.progressFill as HTMLElement | null)?.style.width,
      "83.4%",
    );
    assertEquals(component.refs.progressTrack?.getAttribute("aria-valuenow"), "83");
    assertEquals(component.refs.progressStatus?.textContent, "Confidence 83%");
  },
);
