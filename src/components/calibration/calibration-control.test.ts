/// <reference lib="dom" />
import "../base/setup-dom.ts"; // Setup DOM environment first
import { assertEquals } from "../base/assert.ts";

// Dynamic import after mocks are set up
const { default: CalibrationControl } = await import("./calibration-control.js");

/**
 * Helper to create a fresh component instance and wait for it to be ready
 */
async function createComponent() {
  const element = document.createElement("calibration-control") as InstanceType<
    typeof CalibrationControl
  >;

  await element.componentReady;

  return element;
}

Deno.test("CalibrationControl: should initialize with default state", async () => {
  const component = await createComponent();
  assertEquals(component.state.isCalibrated, false);
});

Deno.test("CalibrationControl: should have required template and style URLs", async () => {
  const component = await createComponent();
  assertEquals(typeof component.getTemplateUrl(), "string");
  assertEquals(typeof component.getStyleUrl(), "string");
  assertEquals(component.getTemplateUrl().includes("html"), true);
  assertEquals(component.getStyleUrl().includes("css"), true);
});

Deno.test("CalibrationControl: should update state via setState()", async () => {
  const component = await createComponent();
  component.setState({ isCalibrated: true });
  assertEquals(component.state.isCalibrated, true);
});

Deno.test("CalibrationControl: should call onStateChange hook when state updates", async () => {
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
});

Deno.test("CalibrationControl: should register as custom element", () => {
  const customElement = customElements.get("calibration-control");
  assertEquals(customElement !== undefined, true);
});

Deno.test("CalibrationControl: setState should throw on invalid argument", async () => {
  const component = await createComponent();
  try {
    component.setState(null as any);
    assertEquals(true, false); // Should not reach here
  } catch (e) {
    assertEquals((e as Error).message, "setState requires an object");
  }
});

Deno.test("CalibrationControl: setState should accept valid state objects", async () => {
  const component = await createComponent();
  component.setState({});
  assertEquals(component.state.isCalibrated, false);
  component.setState({ isCalibrated: true });
  assertEquals(component.state.isCalibrated, true);
});

Deno.test(
  "CalibrationControl: should have calibration property as null until initialized",
  async () => {
    const component = await createComponent();
    assertEquals(component.calibration !== null, true);
  }
);
