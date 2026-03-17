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
  assertEquals(component.setupStatus?.textContent, "⚠️ Setup incomplete");
  assertEquals(
    (component.completeBtn as HTMLButtonElement | null)?.disabled,
    true,
  );
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

Deno.test("OnboardingPane: should register as custom element", () => {
  const customElement = customElements.get("onboarding-pane");
  assertEquals(customElement !== undefined, true);
});

Deno.test(
  "OnboardingPane: refreshSetupStatus should update setup UI",
  async () => {
    const component = await createComponent();
    mockDetectorManager.sensitivity = 0.8;
    component.hasCalibrationData = () => true;

    component.refreshSetupStatus();

    assertEquals(component.setupStatus?.textContent, "✓ Setup ready");
    assertEquals(component.setupStatus?.classList.contains("complete"), true);
    assertEquals(
      (component.completeBtn as HTMLButtonElement | null)?.disabled,
      false,
    );
  },
);
