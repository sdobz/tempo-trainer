/// <reference lib="dom" />
import "../base/setup-dom.ts"; // Setup DOM environment first
import { assertEquals } from "../base/assert.ts";

// Import after setup
const { default: MicrophoneControl } = await import("./microphone-control.js");

/**
 * MockMicrophoneDetector for testing without real audio processing
 */
class MockMicrophoneDetector {
  delegate: any = null;
  isRunning = false;
  threshold = 52;
  selectedDeviceId = "";

  constructor(delegate: any = null) {
    this.delegate = delegate;
  }

  setThreshold(value: number): void {}
  selectDevice(deviceId: string): void {}
  onHit(callback: Function): void {}
  async getAvailableDevices(): Promise<any[]> {
    return [];
  }
  async start(): Promise<boolean> {
    return false;
  }
  stop(): void {
    this.isRunning = false;
  }
}

/**
 * Test suite for MicrophoneControl - UI integration tests.
 * Tests DOM manipulation, user interactions, and component lifecycle.
 */

async function createComponent() {
  const element = document.createElement("microphone-control") as InstanceType<
    typeof MicrophoneControl
  >;

  // Wait for component to be ready
  await element.componentReady;

  const detector = new MockMicrophoneDetector(element);
  element.setDetector(detector as any);

  return element;
}

Deno.test("MicrophoneControl: should initialize with default state", async () => {
  const component = await createComponent();
  assertEquals(component.state.isConfigured, false);
});

Deno.test("MicrophoneControl: should have required template and style URLs", async () => {
  const component = await createComponent();
  assertEquals(typeof component.getTemplateUrl(), "string");
  assertEquals(typeof component.getStyleUrl(), "string");
  assertEquals(component.getTemplateUrl().includes("html"), true);
  assertEquals(component.getStyleUrl().includes("css"), true);
});

Deno.test("MicrophoneControl: should initialize detector with delegate", async () => {
  const component = await createComponent();
  assertEquals(component.micDetector !== null, true);
  if (component.micDetector) {
    assertEquals(component.micDetector.delegate !== null, true);
  }
});

Deno.test("MicrophoneControl: should have state management", async () => {
  const component = await createComponent();
  let onStateChangeCallCount = 0;

  const original = component.onStateChange;
  component.onStateChange = function (old, neu) {
    onStateChangeCallCount++;
    original.call(this, old, neu);
  };

  component.setState({ isConfigured: true });

  assertEquals(onStateChangeCallCount, 1);
  assertEquals(component.state.isConfigured, true);
});

Deno.test("MicrophoneControl: should register as custom element", async () => {
  const element = await createComponent();
  assertEquals(element.constructor.name, "MicrophoneControl");
});

Deno.test("MicrophoneControl: updateStatus should set configured state and update UI", async () => {
  const component = await createComponent();

  component.updateStatus(true);
  assertEquals(component.state.isConfigured, true);
  if (component.statusIndicator) {
    assertEquals(component.statusIndicator.textContent, "✓ Configured");
    assertEquals(component.statusIndicator.classList.contains("complete"), true);
  }

  component.updateStatus(false);
  assertEquals(component.state.isConfigured, false);
  if (component.statusIndicator) {
    assertEquals(component.statusIndicator.textContent, "⚠️ Not configured");
    assertEquals(component.statusIndicator.classList.contains("complete"), false);
  }
});

Deno.test("MicrophoneControl: should accept delegate callbacks from detector", async () => {
  const component = await createComponent();
  if (!component.micDetector) return;

  const delegate = component.micDetector.delegate;

  assertEquals(typeof delegate?.onLevelChanged, "function");
  assertEquals(typeof delegate?.onPeakChanged, "function");
  assertEquals(typeof delegate?.onOverThreshold, "function");
  assertEquals(typeof delegate?.onHit, "function");
  assertEquals(typeof delegate?.onThresholdChanged, "function");
});

Deno.test("MicrophoneControl: delegate should handle level updates", async () => {
  const component = await createComponent();
  if (!component.micDetector || !component.levelBar) return;

  const delegate = component.micDetector.delegate;
  if (!delegate?.onLevelChanged) return;

  // Call delegate callback
  delegate.onLevelChanged(50);

  // Check that level bar width was updated
  const levelBar = component.levelBar as HTMLElement;
  assertEquals(levelBar.style.width, "50%");
});

Deno.test("MicrophoneControl: delegate should handle peak updates", async () => {
  const component = await createComponent();
  if (!component.micDetector || !component.peakHold) return;

  const delegate = component.micDetector.delegate;
  if (!delegate?.onPeakChanged) return;

  delegate.onPeakChanged(75);

  const peakHold = component.peakHold as HTMLElement;
  assertEquals(peakHold.style.left, "75%");
});

Deno.test("MicrophoneControl: delegate should handle threshold state changes", async () => {
  const component = await createComponent();
  if (!component.micDetector || !component.level) return;

  const delegate = component.micDetector.delegate;
  if (!delegate?.onOverThreshold) return;

  delegate.onOverThreshold(true);
  assertEquals(component.level.classList.contains("over-threshold"), true);

  delegate.onOverThreshold(false);
  assertEquals(component.level.classList.contains("over-threshold"), false);
});

Deno.test("MicrophoneControl: delegate should handle threshold display updates", async () => {
  const component = await createComponent();
  if (!component.micDetector || !component.thresholdLine || !component.thresholdLabel) return;

  const delegate = component.micDetector.delegate;
  if (!delegate?.onThresholdChanged) return;

  delegate.onThresholdChanged(64);

  const thresholdLine = component.thresholdLine as HTMLElement;
  const thresholdLabel = component.thresholdLabel as HTMLElement;
  assertEquals(thresholdLine.style.left, "50%");
  assertEquals(thresholdLabel.textContent, "Threshold: 64");
});

Deno.test("MicrophoneControl: should have element references after mount", async () => {
  const component = await createComponent();

  assertEquals(component.statusIndicator !== null, true);
  assertEquals(component.select !== null, true);
  assertEquals(component.level !== null, true);
  assertEquals(component.levelBar !== null, true);
  assertEquals(component.peakHold !== null, true);
  assertEquals(component.thresholdLine !== null, true);
  assertEquals(component.thresholdLabel !== null, true);
  assertEquals(component.hitsList !== null, true);
});

Deno.test("MicrophoneControl: should stop detector on unmount", async () => {
  const component = await createComponent();
  if (!component.micDetector) return;

  component.micDetector.isRunning = true;

  component.onUnmount();

  assertEquals(component.micDetector.isRunning, false);
});
