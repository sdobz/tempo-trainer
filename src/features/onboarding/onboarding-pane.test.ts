/// <reference lib="dom" />
import "../component/setup-dom.ts"; // Setup DOM environment first
import { assertEquals } from "../base/assert.ts";
import { DetectorManagerContext } from "../microphone/detector-manager.js";
import { AudioContextServiceContext } from "../audio/audio-context-manager.js";

// A single shared mock is sufficient since onboarding-pane only reads getParams() on mount.
const mockDetectorManager = {
  delegate: null as any,
  sensitivity: 0.594,
  isRunning: false,
  _audioInput: { selectedDeviceId: "" },
  _params: { type: "threshold", sensitivity: 0.594, id: "default" },
  setDelegate(d: any) {
    this.delegate = d;
    d?.onThresholdChanged?.(this.sensitivity);
  },
  setSensitivity(v: number) {
    this.sensitivity = v;
  },
  getParams() {
    return { ...this._params };
  },
  async start() {
    return true;
  },
  stop() {},
  async getAvailableDevices() {
    return [];
  },
  selectDevice(_id: string) {},
  onHit(_cb: Function) {},
};

const mockAudioService = {
  getSnapshot() {
    return {
      kind: "ready",
      selectedDeviceId: "",
      availableDevices: [],
      context: null,
      analyserNode: null,
    };
  },
  async getAvailableDevices() {
    return [];
  },
  addEventListener() {},
  removeEventListener() {},
};

// Dynamic import after mocks are set up
const { default: OnboardingPane } = await import("./onboarding-pane.js");

/**
 * Helper to create a fresh component instance and wait for it to be ready
 */
async function createComponent() {
  const element = document.createElement("onboarding-pane") as InstanceType<
    typeof OnboardingPane
  >;

  element.addEventListener("context-request", (event: any) => {
    if (event.context === DetectorManagerContext) {
      event.stopPropagation();
      event.callback(mockDetectorManager);
      return;
    }
    if (event.context === AudioContextServiceContext) {
      event.stopPropagation();
      event.callback(mockAudioService);
    }
  });
  await element.componentReady;

  return element;
}

Deno.test("OnboardingPane: should initialize with default state", async () => {
  const component = await createComponent();
  assertEquals(component.state.micConfigured, false);
  assertEquals(component.state.calibrated, false);
});

Deno.test(
  "OnboardingPane: should have required template and style URLs",
  async () => {
    const component = await createComponent();
    assertEquals(typeof component.getTemplateUrl(), "string");
    assertEquals(typeof component.getStyleUrl(), "string");
    assertEquals(component.getTemplateUrl().includes("html"), true);
    assertEquals(component.getStyleUrl().includes("css"), true);
  },
);

Deno.test("OnboardingPane: should update state via setState()", async () => {
  const component = await createComponent();
  component.setState({ micConfigured: true, calibrated: false });
  assertEquals(component.state.micConfigured, true);
  assertEquals(component.state.calibrated, false);
});

Deno.test(
  "OnboardingPane: should merge state updates, not replace",
  async () => {
    const component = await createComponent();
    component.setState({ micConfigured: true });
    assertEquals(component.state.micConfigured, true);
    assertEquals(component.state.calibrated, false);
    component.setState({ calibrated: true });
    assertEquals(component.state.micConfigured, true);
    assertEquals(component.state.calibrated, true);
  },
);

Deno.test(
  "OnboardingPane: should call onStateChange hook when state updates",
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

    component.setState({ micConfigured: true });
    assertEquals(hookCalled, true);
    assertEquals(oldState?.micConfigured, false);
    assertEquals(newState?.micConfigured, true);
  },
);

Deno.test("OnboardingPane: should register as custom element", () => {
  const customElement = customElements.get("onboarding-pane");
  assertEquals(customElement !== undefined, true);
});

Deno.test(
  "OnboardingPane: setState should throw on invalid argument",
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
  "OnboardingPane: setState should accept valid state objects",
  async () => {
    const component = await createComponent();
    component.setState({});
    assertEquals(component.state.micConfigured, false);
    component.setState({ micConfigured: true, calibrated: true });
    assertEquals(component.state.micConfigured, true);
    assertEquals(component.state.calibrated, true);
  },
);
