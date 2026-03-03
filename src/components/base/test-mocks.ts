/**
 * Test mocks for browser APIs not available in jsdom
 * Minimal set: Web Audio and Media APIs only
 * DOM is handled by jsdom, fetch by Deno natively
 */

// deno-lint-ignore-file no-explicit-any require-await

/**
 * Mock AudioContext for Web Audio API testing
 */
export class MockAudioContext {
  currentTime = 0;
  destination = {};
  sampleRate = 44100;

  createOscillator() {
    return {
      connect: () => {},
      disconnect: () => {},
      start: (_when?: number) => {},
      stop: (_when?: number) => {},
      frequency: { value: 440 },
      type: "sine",
    };
  }

  createGain() {
    return {
      connect: () => {},
      disconnect: () => {},
      gain: {
        value: 1,
        setValueAtTime: (_value: number, _time: number) => {},
      },
    };
  }

  createAnalyser() {
    return {
      connect: () => {},
      disconnect: () => {},
      fftSize: 2048,
      frequencyBinCount: 1024,
      getByteTimeDomainData: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = 128 + Math.random() * 10;
        }
      },
      getByteFrequencyData: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.random() * 255;
        }
      },
    };
  }

  async resume() {
    return Promise.resolve();
  }

  async suspend() {
    return Promise.resolve();
  }

  async close() {
    return Promise.resolve();
  }
}

/**
 * Mock MediaStream for getUserMedia testing
 */
export class MockMediaStream {
  tracks: Record<string, unknown>[] = [];

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }

  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }

  addTrack(track: Record<string, unknown>) {
    this.tracks.push(track);
  }

  removeTrack(track: Record<string, unknown>) {
    const index = this.tracks.indexOf(track);
    if (index > -1) {
      this.tracks.splice(index, 1);
    }
  }
}

/**
 * Mock MediaDevices for microphone testing
 */
export class MockNavigatorMediaDevices {
  mockDevices: MediaDeviceInfo[] = [
    {
      deviceId: "default",
      kind: "audioinput",
      label: "Mock Microphone",
      groupId: "default-group",
      toJSON: () => ({}),
    } as MediaDeviceInfo,
    {
      deviceId: "mock-mic-1",
      kind: "audioinput",
      label: "Test Microphone 1",
      groupId: "test-group",
      toJSON: () => ({}),
    } as MediaDeviceInfo,
  ];

  async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    const stream = new MockMediaStream();
    if (constraints.audio) {
      stream.addTrack({
        kind: "audio",
        id: "mock-audio-track",
        enabled: true,
        stop: () => {},
      });
    }
    return stream as any;
  }

  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    return Promise.resolve([...this.mockDevices]);
  }

  addMockDevice(device: Partial<MediaDeviceInfo>) {
    this.mockDevices.push({
      ...device,
      groupId: device.groupId || "test-group",
      toJSON: () => ({}),
    } as MediaDeviceInfo);
  }

  removeMockDevice(deviceId: string) {
    const index = this.mockDevices.findIndex((d) => d.deviceId === deviceId);
    if (index > -1) {
      this.mockDevices.splice(index, 1);
    }
  }
}

/**
 * Setup global mocks for testing
 * Call this at the beginning of test files that need browser APIs
 */
export function setupGlobalMocks(): void {
  // Mock AudioContext
  (globalThis as any).AudioContext = MockAudioContext;
  (globalThis as any).webkitAudioContext = MockAudioContext;

  // Mock navigator.mediaDevices
  if (!(globalThis as any).navigator) {
    (globalThis as any).navigator = {};
  }
  (globalThis as any).navigator.mediaDevices = new MockNavigatorMediaDevices();
}

/**
 * Clear all mocks (for test isolation)
 */
export function clearGlobalMocks(): void {
  if ((globalThis as any).navigator?.mediaDevices) {
    (globalThis as any).navigator.mediaDevices = new MockNavigatorMediaDevices();
  }
}
