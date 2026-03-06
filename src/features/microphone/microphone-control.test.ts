/// <reference lib="dom" />
import "../base/setup-dom.ts";
import { assertEquals } from "../base/assert.ts";
import { DetectorManagerContext } from "./detector-manager.js";

// Must import after DOM setup
const { default: MicrophoneControl } = await import("./microphone-control.js");

// ---------------------------------------------------------------------------
// MockDetectorManager — minimal interface expected by MicrophoneControl
// ---------------------------------------------------------------------------

class MockDetectorManager {
  delegate: any = null;
  sensitivity = 0.594;
  isRunning = false;
  _audioInput = { selectedDeviceId: "" };
  _params = { type: "threshold", sensitivity: 0.594, id: "default" };

  setDelegate(d: any) {
    this.delegate = d;
    // Push initial sensitivity to the delegate (mirrors real DetectorManager)
    d?.onThresholdChanged?.(this.sensitivity);
  }

  setSensitivity(v: number) {
    this.sensitivity = v;
    this.delegate?.onThresholdChanged?.(v);
  }

  getParams() {
    return { ...this._params };
  }

  async start(): Promise<boolean> {
    this.isRunning = true;
    return true;
  }
  stop() {
    this.isRunning = false;
  }

  async getAvailableDevices(): Promise<any[]> {
    return [];
  }
  selectDevice(_id: string) {}
  onHit(_cb: Function) {}
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let mockManager: MockDetectorManager;

// Provide DetectorManagerContext at document root for all test components.
document.documentElement.addEventListener("context-request", (event: any) => {
  if (event.context !== DetectorManagerContext) return;
  event.stopPropagation();
  event.callback(mockManager);
});

async function createComponent() {
  mockManager = new MockDetectorManager();

  const element = document.createElement("microphone-control") as InstanceType<
    typeof MicrophoneControl
  >;
  document.body.appendChild(element);
  await element.componentReady;
  return element;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test(
  "MicrophoneControl: should initialize with default state",
  async () => {
    const component = await createComponent();
    assertEquals(component.state.isConfigured, false);
  },
);

Deno.test(
  "MicrophoneControl: should have required template and style URLs",
  async () => {
    const component = await createComponent();
    assertEquals(component.getTemplateUrl().includes("html"), true);
    assertEquals(component.getStyleUrl().includes("css"), true);
  },
);

Deno.test(
  "MicrophoneControl: should register delegate with DetectorManager on mount",
  async () => {
    const component = await createComponent();
    assertEquals(mockManager.delegate, component);
  },
);

Deno.test("MicrophoneControl: should have state management", async () => {
  const component = await createComponent();
  let callCount = 0;
  const original = component.onStateChange.bind(component);
  component.onStateChange = function (o: any, n: any) {
    callCount++;
    original(o, n);
  };
  component.setState({ isConfigured: true });
  assertEquals(callCount, 1);
  assertEquals(component.state.isConfigured, true);
});

Deno.test("MicrophoneControl: should register as custom element", async () => {
  const component = await createComponent();
  assertEquals(component.constructor.name, "MicrophoneControl");
});

Deno.test("MicrophoneControl: updateStatus should update UI", async () => {
  const component = await createComponent();

  component.updateStatus(true);
  assertEquals(component.state.isConfigured, true);
  assertEquals(component.statusIndicator?.textContent, "✓ Configured");
  assertEquals(component.statusIndicator?.classList.contains("complete"), true);

  component.updateStatus(false);
  assertEquals(component.state.isConfigured, false);
  assertEquals(component.statusIndicator?.textContent, "⚠️ Not configured");
  assertEquals(
    component.statusIndicator?.classList.contains("complete"),
    false,
  );
});

Deno.test(
  "MicrophoneControl: delegate should handle level updates (0–1 → 0–100%)",
  async () => {
    const component = await createComponent();
    if (!component.levelBar) return;

    mockManager.delegate.onLevelChanged(0.5);
    assertEquals((component.levelBar as HTMLElement).style.width, "50%");
  },
);

Deno.test(
  "MicrophoneControl: delegate should handle peak updates (0–1 → 0–100%)",
  async () => {
    const component = await createComponent();
    if (!component.peakHold) return;

    mockManager.delegate.onPeakChanged(0.75);
    assertEquals((component.peakHold as HTMLElement).style.left, "75%");
  },
);

Deno.test(
  "MicrophoneControl: delegate should handle threshold/sensitivity updates",
  async () => {
    const component = await createComponent();
    if (!component.sensitivityLine || !component.sensitivityLabel) return;

    mockManager.delegate.onThresholdChanged(0.64);
    assertEquals((component.sensitivityLine as HTMLElement).style.left, "64%");
    assertEquals(
      (component.sensitivityLabel as HTMLElement).textContent,
      "Sensitivity: 64%",
    );
  },
);

Deno.test(
  "MicrophoneControl: initial sensitivity pushed by setDelegate",
  async () => {
    const component = await createComponent();
    if (!component.sensitivityLine) return;
    // MockDetectorManager pushes 0.594 on setDelegate → 59% position
    assertEquals(
      (component.sensitivityLine as HTMLElement).style.left,
      "59.4%",
    );
  },
);

Deno.test(
  "MicrophoneControl: delegate onHit should add hit entry",
  async () => {
    const component = await createComponent();
    if (!component.hitsList) return;

    const before = component.hitsList.children.length;
    mockManager.delegate.onHit();
    assertEquals(component.hitsList.children.length, before + 1);

    // Clear pending removal timers to avoid leak detection
    component.onUnmount();
  },
);

Deno.test(
  "MicrophoneControl: delegate onDevicesChanged should render options",
  async () => {
    const component = await createComponent();
    if (!component.select) return;

    mockManager.delegate.onDevicesChanged(
      [
        { deviceId: "dev1", label: "Mic A" },
        { deviceId: "dev2", label: "Mic B" },
      ],
      "dev1",
    );

    const select = component.select as HTMLSelectElement;
    assertEquals(select.options.length, 2);
    assertEquals(select.value, "dev1");
  },
);

Deno.test(
  "MicrophoneControl: should have element references after mount",
  async () => {
    const component = await createComponent();
    assertEquals(component.statusIndicator !== null, true);
    assertEquals(component.select !== null, true);
    assertEquals(component.level !== null, true);
    assertEquals(component.levelBar !== null, true);
    assertEquals(component.peakHold !== null, true);
    assertEquals(component.sensitivityLine !== null, true);
    assertEquals(component.sensitivityLabel !== null, true);
    assertEquals(component.hitsList !== null, true);
  },
);

Deno.test(
  "MicrophoneControl: onUnmount should clear delegate from DetectorManager",
  async () => {
    const component = await createComponent();
    assertEquals(mockManager.delegate, component);
    component.onUnmount();
    assertEquals(mockManager.delegate, null);
  },
);
