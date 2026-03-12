import { assertEquals } from "../base/assert.ts";
import AudioContextManager from "./audio-context-manager.js";

class MockStorage {
  data = new Map<string, string>();

  get(key: string, defaultValue: string | null = null) {
    return this.data.has(key) ? this.data.get(key)! : defaultValue;
  }

  set(key: string, value: unknown) {
    this.data.set(key, String(value));
    return true;
  }
}

class MockAnalyserNode {
  fftSize = 0;
  smoothingTimeConstant = 0;
  disconnect() {}
}

class MockSourceNode {
  connect(_target: unknown) {}
  disconnect() {}
}

class MockAudioContext {
  state = "running";
  currentTime = 0;

  async resume() {
    this.state = "running";
  }

  createMediaStreamSource(_stream: unknown) {
    return new MockSourceNode() as any;
  }

  createAnalyser() {
    return new MockAnalyserNode() as any;
  }
}

Deno.test("AudioContextManager: ensureContext transitions to ready", async () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalNavigator = globalThis.navigator;

  Object.defineProperty(globalThis, "AudioContext", {
    value: MockAudioContext,
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: {
      mediaDevices: {
        enumerateDevices: async () => [],
        getUserMedia: async () => ({
          getAudioTracks: () => [{ getSettings: () => ({}) }],
          getTracks: () => [],
        }),
      },
    },
    configurable: true,
  });

  try {
    const manager = new AudioContextManager(new MockStorage() as any);
    const changes: any[] = [];
    manager.addEventListener("changed", (event) => {
      if (event instanceof CustomEvent) changes.push(event.detail.state);
    });

    await manager.ensureContext();

    assertEquals(manager.getSnapshot().kind, "ready");
    assertEquals(changes.length > 0, true);
  } finally {
    Object.defineProperty(globalThis, "AudioContext", {
      value: originalAudioContext,
      configurable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  }
});

Deno.test("AudioContextManager: device inventory and selection are state", async () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalNavigator = globalThis.navigator;

  Object.defineProperty(globalThis, "AudioContext", {
    value: MockAudioContext,
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: {
      mediaDevices: {
        enumerateDevices: async () => [
          { kind: "audioinput", deviceId: "dev1", label: "Mic A" },
          { kind: "audioinput", deviceId: "dev2", label: "Mic B" },
        ],
        getUserMedia: async () => ({
          getAudioTracks: () => [{ getSettings: () => ({ deviceId: "dev2" }) }],
          getTracks: () => [{ stop() {} }],
        }),
      },
    },
    configurable: true,
  });

  try {
    const manager = new AudioContextManager(new MockStorage() as any);
    await manager.ensureContext();
    await manager.getAvailableDevices();
    await manager.selectDevice("dev2");

    assertEquals(manager.getSnapshot().availableDevices.length, 2);
    assertEquals(manager.getSnapshot().selectedDeviceId, "dev2");
  } finally {
    Object.defineProperty(globalThis, "AudioContext", {
      value: originalAudioContext,
      configurable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  }
});

Deno.test("AudioContextManager: start and stop transition input lifecycle", async () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalNavigator = globalThis.navigator;

  Object.defineProperty(globalThis, "AudioContext", {
    value: MockAudioContext,
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: {
      mediaDevices: {
        enumerateDevices: async () => [],
        getUserMedia: async () => ({
          getAudioTracks: () => [{ getSettings: () => ({}) }],
          getTracks: () => [{ stop() {} }],
        }),
      },
    },
    configurable: true,
  });

  try {
    const manager = new AudioContextManager(new MockStorage() as any);

    await manager.start({ fftSize: 512, smoothingTimeConstant: 0.2 });
    assertEquals(manager.getSnapshot().kind, "input-ready");
    assertEquals(manager.analyserNode?.fftSize, 512);

    manager.stop();
    assertEquals(manager.getSnapshot().kind, "ready");
    assertEquals(manager.analyserNode, null);
  } finally {
    Object.defineProperty(globalThis, "AudioContext", {
      value: originalAudioContext,
      configurable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  }
});
