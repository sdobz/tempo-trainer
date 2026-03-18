/// <reference lib="dom" />
import "../component/setup-dom.ts";
import { assertEquals } from "../base/assert.ts";
import { DetectorManagerContext } from "./detector-manager.js";
import { AudioContextServiceContext } from "../audio/audio-context-manager.js";

// Must import after DOM setup
const { default: MicrophoneControl } = await import("./microphone-control.js");

// ---------------------------------------------------------------------------
// MockDetectorManager — minimal interface expected by MicrophoneControl
// ---------------------------------------------------------------------------

class MockDetectorManager {
  delegate: any = null;
  sensitivity = 0.594;
  isRunning = false;
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
  onHit(_cb: Function) {}
}

class MockAudioService extends EventTarget {
  state = {
    kind: "uninitialized",
    selectedDeviceId: "",
    availableDevices: [] as Array<{ deviceId: string; label: string }>,
    context: null,
    analyserNode: null,
  };

  getSnapshot() {
    return this.state;
  }

  getContext() {
    return this.state.context;
  }

  async getAvailableDevices(): Promise<any[]> {
    return this.state.availableDevices;
  }

  async selectDevice(deviceId: string) {
    this.state = { ...this.state, selectedDeviceId: deviceId };
    this.dispatchEvent(
      new CustomEvent("changed", {
        detail: { state: this.state },
      }),
    );
  }

  setDevices(
    devices: Array<{ deviceId: string; label: string }>,
    selectedId = "",
  ) {
    this.state = {
      ...this.state,
      kind: "ready",
      availableDevices: devices,
      selectedDeviceId: selectedId,
    };
    this.dispatchEvent(
      new CustomEvent("changed", {
        detail: { state: this.state },
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let mockManager: MockDetectorManager;
let mockAudioService: MockAudioService;

async function createComponent() {
  mockManager = new MockDetectorManager();
  mockAudioService = new MockAudioService();

  const element = document.createElement("microphone-control") as InstanceType<
    typeof MicrophoneControl
  >;
  element.addEventListener("context-request", (event: any) => {
    if (event.context === DetectorManagerContext) {
      event.stopPropagation();
      event.callback(mockManager);
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test(
  "MicrophoneControl: should initialize with default state",
  async () => {
    const component = await createComponent();
    assertEquals(component.refs.statusIndicator?.textContent, "⚠️ Not configured");
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

Deno.test("MicrophoneControl: should register as custom element", async () => {
  const component = await createComponent();
  assertEquals(component.constructor.name, "MicrophoneControl");
});

Deno.test("MicrophoneControl: updateStatus should update UI", async () => {
  const component = await createComponent();

  component.updateStatus(true);
  assertEquals(component.refs.statusIndicator?.textContent, "✓ Configured");
  assertEquals(component.refs.statusIndicator?.classList.contains("complete"), true);

  component.updateStatus(false);
  assertEquals(component.refs.statusIndicator?.textContent, "⚠️ Not configured");
  assertEquals(
    component.refs.statusIndicator?.classList.contains("complete"),
    false,
  );
});

Deno.test(
  "MicrophoneControl: delegate should handle level updates (0–1 → 0–100%)",
  async () => {
    const component = await createComponent();
    if (!component.refs.levelBar) return;

    mockManager.delegate.onLevelChanged(0.5);
    assertEquals((component.refs.levelBar as HTMLElement).style.width, "50%");
  },
);

Deno.test(
  "MicrophoneControl: delegate should handle peak updates (0–1 → 0–100%)",
  async () => {
    const component = await createComponent();
    if (!component.refs.peakHold) return;

    mockManager.delegate.onPeakChanged(0.75);
    assertEquals((component.refs.peakHold as HTMLElement).style.left, "75%");
  },
);

Deno.test(
  "MicrophoneControl: delegate should handle threshold/sensitivity updates",
  async () => {
    const component = await createComponent();
    if (!component.refs.sensitivityLine || !component.refs.sensitivityLabel) return;

    mockManager.delegate.onThresholdChanged(0.64);
    assertEquals((component.refs.sensitivityLine as HTMLElement).style.left, "36%");
    assertEquals(
      (component.refs.sensitivityLabel as HTMLElement).textContent,
      "Sensitivity: 64%",
    );
  },
);

Deno.test(
  "MicrophoneControl: initial sensitivity pushed by setDelegate",
  async () => {
    const component = await createComponent();
    if (!component.refs.sensitivityLine) return;
    // MockDetectorManager pushes 0.594 on setDelegate → 40.6% position (left=more sensitive)
    assertEquals(
      (component.refs.sensitivityLine as HTMLElement).style.left,
      "40.6%",
    );
  },
);

Deno.test("MicrophoneControl: delegate onHit should be callable", async () => {
  const component = await createComponent();
  // Hit visualization now lives in timeline components via shared hit events
  // Just verify the callback is callable without error
  mockManager.delegate.onHit();
  component.onUnmount();
});

Deno.test(
  "MicrophoneControl: audio service changed event should render options",
  async () => {
    const component = await createComponent();
    if (!component.refs.select) return;

    mockAudioService.setDevices(
      [
        { deviceId: "dev1", label: "Mic A" },
        { deviceId: "dev2", label: "Mic B" },
      ],
      "dev1",
    );

    const select = component.refs.select as HTMLSelectElement;
    assertEquals(select.options.length, 2);
    assertEquals(select.value, "dev1");
  },
);

Deno.test(
  "MicrophoneControl: selecting a device should call audio service",
  async () => {
    const component = await createComponent();
    if (!component.refs.select) return;
    const select = component.refs.select as HTMLSelectElement;

    mockAudioService.setDevices(
      [
        { deviceId: "dev1", label: "Mic A" },
        { deviceId: "dev2", label: "Mic B" },
      ],
      "dev1",
    );

    select.value = "dev2";
    select.dispatchEvent(new Event("change"));

    assertEquals(mockAudioService.getSnapshot().selectedDeviceId, "dev2");
  },
);

Deno.test(
  "MicrophoneControl: should have element references after mount",
  async () => {
    const component = await createComponent();
    assertEquals(component.refs.statusIndicator !== null, true);
    assertEquals(component.refs.select !== null, true);
    assertEquals(component.refs.level !== null, true);
    assertEquals(component.refs.levelBar !== null, true);
    assertEquals(component.refs.peakHold !== null, true);
    assertEquals(component.refs.sensitivityLine !== null, true);
    assertEquals(component.refs.sensitivityLabel !== null, true);
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
