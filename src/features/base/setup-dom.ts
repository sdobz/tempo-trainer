/**
 * Setup DOM environment and API mocks for tests
 * Provides complete test environment including DOM, fetch, AudioContext, and MediaDevices
 * Must be imported before any component code
 */

// deno-lint-ignore-file no-explicit-any require-await

import { JSDOM } from "npm:jsdom@23.0.0";

// Create a JSDOM instance
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

// Inject DOM globals from jsdom into globalThis
const keys = Object.getOwnPropertyNames(dom.window) as any[];
for (const key of keys) {
  if (
    key !== "window" &&
    key !== "self" &&
    key !== "top" &&
    key !== "parent" &&
    key !== "frames" &&
    key !== "length" &&
    key !== "frameElement"
  ) {
    try {
      // @ts-ignore - blasting this into mainstream
      globalThis[key] = dom.window[key];
    } catch (e) {
      // Some properties might be read-only or throw
    }
  }
}

// Explicitly set commonly-used globals
globalThis.window = dom.window as any;
globalThis.document = dom.window.document as any;
globalThis.HTMLElement = dom.window.HTMLElement as any;
globalThis.Element = dom.window.Element as any;
globalThis.Document = dom.window.Document as any;
globalThis.Event = dom.window.Event as any;
globalThis.CustomEvent = dom.window.CustomEvent as any;
globalThis.DOMParser = dom.window.DOMParser as any;

/**
 * Mock AudioContext for Web Audio API testing
 */
class MockAudioContext {
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
class MockMediaStream {
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
class MockNavigatorMediaDevices {
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

  async getUserMedia(
    constraints: MediaStreamConstraints,
  ): Promise<MediaStream> {
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

// Setup AudioContext mocks immediately when this file is imported
(globalThis as any).AudioContext = MockAudioContext;
(globalThis as any).webkitAudioContext = MockAudioContext;

// Setup navigator.mediaDevices immediately
if (!(globalThis as any).navigator) {
  (globalThis as any).navigator = {};
}
(globalThis as any).navigator.mediaDevices = new MockNavigatorMediaDevices();

// Setup fetch interceptor for template/style loading
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (
  url: string | Request,
  options?: RequestInit,
): Promise<Response> => {
  const urlString = url instanceof Request ? url.url : url;

  // For .html or .css files, load from filesystem
  if (urlString.includes(".html") || urlString.includes(".css")) {
    try {
      const urlObj = new URL(urlString);
      const fsPath = urlObj.pathname.replace(/^\//, "");

      const fileContent = await Deno.readTextFile(fsPath);
      return new Response(fileContent, {
        status: 200,
        headers: {
          "content-type": fsPath.endsWith(".css") ? "text/css" : "text/html",
        },
      });
    } catch (e) {
      const error = `
❌ FETCH FAILED: Could not load component template/style file
   Attempted URL: ${urlString}
   Error: ${e instanceof Error ? e.message : String(e)}
   
   Make sure the file exists at the expected path relative to project root.
      `;
      console.error(error);
      throw new Error(error);
    }
  }

  return originalFetch(urlString, options);
}) as any;
