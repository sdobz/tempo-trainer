/// <reference lib="dom" />
import "../base/setup-dom.ts"; // Setup DOM environment first
import { assertEquals, assertNotEquals } from "../base/assert.ts";
import { MicrophoneDetectorDelegate } from "./microphone-control.js";

// Import the pure domain detector
const { default: MicrophoneDetector } = await import("../../microphone-detector.js");

/**
 * Test suite for MicrophoneDetector behavior (pure domain logic, no UI).
 * Tests audio processing, hit detection, threshold management, and device selection.
 */

/**
 * MockStorageManager tracks reads and writes for testing
 * Provides same interface as StorageManager but uses in-memory <storage
 */
class MockStorageManager {
  data: Record<string, string>;

  constructor() {
    this.data = {};
  }

  get(key: string, defaultValue: string | null = null): string | null {
    return this.data[key] ?? defaultValue;
  }

  getNumber(key: string, defaultValue: number = 0): number {
    const value = this.get(key);
    if (value === null) return defaultValue;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  getInt(key: string, defaultValue: number = 0): number {
    const value = this.get(key);
    if (value === null) return defaultValue;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  set(key: string, value: unknown): boolean {
    this.data[key] = String(value);
    return true;
  }
}

function createDetector(delegate: MicrophoneDetectorDelegate) {
  return new MicrophoneDetector(new MockStorageManager(), delegate);
}

/**
 * MockDelegate tracks callback invocations for testing
 * Implements the MicrophoneDetectorDelegate interface
 */
class MockDelegate implements MicrophoneDetectorDelegate {
  calls: Record<string, any[]>;

  constructor() {
    this.calls = {
      onLevelChanged: [],
      onPeakChanged: [],
      onOverThreshold: [],
      onHit: [],
      onThresholdChanged: [],
    };
  }

  onLevelChanged(level: number): void {
    this.calls.onLevelChanged.push(level);
  }

  onPeakChanged(peak: number): void {
    this.calls.onPeakChanged.push(peak);
  }

  onOverThreshold(isOver: boolean): void {
    this.calls.onOverThreshold.push(isOver);
  }

  onHit(): void {
    this.calls.onHit.push(true);
  }

  onThresholdChanged(threshold: number): void {
    this.calls.onThresholdChanged.push(threshold);
  }

  wasCalled(callbackName: string): boolean {
    return this.calls[callbackName].length > 0;
  }

  callCount(callbackName: string): number {
    return this.calls[callbackName].length;
  }

  getCall(callbackName: string, index: number = 0): any {
    return this.calls[callbackName][index];
  }
}

Deno.test("MicrophoneDetector: should initialize with default settings", () => {
  const detector = createDetector(new MockDelegate());
  assertEquals(detector.isRunning, false);
  assertEquals(detector.threshold, 52);
  assertEquals(detector.hitCooldown, 100);
  assertEquals(detector.peakHoldMs, 180);
  assertEquals(detector.peakFallPerSecond, 140);
});

Deno.test("MicrophoneDetector: should support delegate callbacks", () => {
  const delegate = new MockDelegate();
  const detector = createDetector(delegate);

  assertEquals(detector.delegate !== null, true);
  assertEquals(detector.delegate === delegate, true);
});

Deno.test("MicrophoneDetector: setThreshold should update threshold value", () => {
  const detector = createDetector(new MockDelegate());
  detector.setThreshold(75);
  assertEquals(detector.threshold, 75);
});

Deno.test("MicrophoneDetector: setThreshold should clamp to valid range", () => {
  const detector = createDetector(new MockDelegate());
  detector.setThreshold(-10);
  assertEquals(detector.threshold, 0);

  detector.setThreshold(200);
  assertEquals(detector.threshold, 128);
});

Deno.test("MicrophoneDetector: setThreshold should call delegate", () => {
  const delegate = new MockDelegate();
  const detector = createDetector(delegate);

  detector.setThreshold(80);

  assertEquals(delegate.wasCalled("onThresholdChanged"), true);
  assertEquals(delegate.getCall("onThresholdChanged"), 80);
});

Deno.test("MicrophoneDetector: selectDevice should update device ID", () => {
  const detector = createDetector(new MockDelegate());
  detector.selectDevice("device-123");
  assertEquals(detector.selectedDeviceId, "device-123");
});

Deno.test("MicrophoneDetector: onHit should register callback", () => {
  const detector = createDetector(new MockDelegate());
  let hitCalled = false;

  detector.onHit(() => {
    hitCalled = true;
  });

  assertEquals(detector.onHitCallback !== null, true);
});

Deno.test("MicrophoneDetector: should not be running before start()", () => {
  const detector = createDetector(new MockDelegate());
  assertEquals(detector.isRunning, false);
  assertEquals(detector.stream, null);
  assertEquals(detector.analyserNode, null);
});

Deno.test("MicrophoneDetector: should track peak hold properly", () => {
  const detector = createDetector(new MockDelegate());
  assertEquals(detector.peakHoldValue, 0);
  assertEquals(detector.peakHoldUntil, 0);
});

Deno.test("MicrophoneDetector: should track last hit time", () => {
  const detector = createDetector(new MockDelegate());
  assertEquals(detector.lastHitTime, 0);
});

Deno.test("MicrophoneDetector: should track last level and peak for delegates", () => {
  const detector = createDetector(new MockDelegate());
  assertEquals(detector.lastLevel, 0);
  assertEquals(detector.lastPeak, 0);
  assertEquals(detector.lastOverThreshold, false);
});

Deno.test("MicrophoneDetector: getAvailableDevices should return array", async () => {
  const detector = createDetector(new MockDelegate());
  const devices = await detector.getAvailableDevices();
  assertEquals(Array.isArray(devices), true);
});

Deno.test("MicrophoneDetector: should load settings from storage", () => {
  const detector = createDetector(new MockDelegate());
  assertEquals(typeof detector.threshold, "number");
  assertEquals(typeof detector.selectedDeviceId, "string");
});

Deno.test("MicrophoneDetector: stop should clear RAF and mark as not running", () => {
  const detector = createDetector(new MockDelegate());
  detector.isRunning = true;
  detector.rafId = 123;

  detector.stop();

  assertEquals(detector.isRunning, false);
  assertEquals(detector.rafId, null);
});
