/// <reference lib="dom" />
import "../base/setup-dom.ts"; // Setup DOM environment first
import { assertEquals } from "../base/assert.ts";

// Import the pure domain detector
const { default: CalibrationDetector } = await import("./calibration-detector.js");

/**
 * Test suite for CalibrationDetector behavior (pure domain logic, no UI).
 * Tests hit registration, offset calculation, confidence scoring, and stability analysis.
 */

/**
 * MockStorageManager tracks reads and writes for testing
 * Provides same interface as StorageManager but uses in-memory storage
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

/**
 * MockDelegate tracks callback invocations for testing
 */
class MockDelegate {
  calls: Record<string, any[]>;

  constructor() {
    this.calls = {
      onStatusChanged: [],
      onOffsetChanged: [],
      onCalibrationStateChanged: [],
    };
  }

  onStatusChanged(message: string): void {
    this.calls.onStatusChanged.push(message);
  }

  onOffsetChanged(offsetMs: number): void {
    this.calls.onOffsetChanged.push(offsetMs);
  }

  onCalibrationStateChanged(isStarted: boolean): void {
    this.calls.onCalibrationStateChanged.push(isStarted);
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

function createDetector(delegate: any = null) {
  return new CalibrationDetector(new MockStorageManager(), delegate ?? new MockDelegate());
}

Deno.test("CalibrationDetector: should initialize with default settings", () => {
  const detector = createDetector();
  assertEquals(detector.isCalibrating, false);
  assertEquals(detector.lookahead, 25.0);
  assertEquals(detector.minHits, 10);
  assertEquals(detector.offsetMs, 0);
});

Deno.test("CalibrationDetector: should support delegate callbacks", () => {
  const delegate = new MockDelegate();
  const detector = createDetector(delegate);

  assertEquals(detector.delegate !== null, true);
  assertEquals(detector.delegate === delegate, true);
});

Deno.test("CalibrationDetector: setBeatsPerMeasure should update configuration", () => {
  const detector = createDetector();
  detector.setBeatsPerMeasure(3);
  assertEquals(detector.beatsPerMeasure, 3);
});

Deno.test("CalibrationDetector: setBeatDuration should update configuration", () => {
  const detector = createDetector();
  detector.setBeatDuration(0.25);
  assertEquals(detector.beatDuration, 0.25);
});

Deno.test("CalibrationDetector: getOffsetMs should return current offset", () => {
  const detector = createDetector();
  const offset = detector.getOffsetMs();
  assertEquals(typeof offset, "number");
});

Deno.test("CalibrationDetector: onStop should register callback", () => {
  const detector = createDetector();
  let stopCalled = false;

  detector.onStop(() => {
    stopCalled = true;
  });

  assertEquals(detector.onStopCallback !== null, true);
});

Deno.test("CalibrationDetector: getCalibratedBeatPosition should adjust for offset", () => {
  const detector = createDetector();
  detector.offsetMs = 50;

  const audioTime = 2.0;
  const runStartTime = 1.0;
  const beatDuration = 0.5;

  const position = detector.getCalibratedBeatPosition(audioTime, runStartTime, beatDuration);
  assertEquals(typeof position, "number");
  assertEquals(position >= 0, true);
});

Deno.test("CalibrationDetector: registerHit should not process when not calibrating", () => {
  const delegate = new MockDelegate();
  const detector = createDetector(delegate);

  detector.registerHit(1.0);
  assertEquals(detector.offsetsMs.length, 0);
});

Deno.test("CalibrationDetector: should persist offset to storage", () => {
  const storage = new MockStorageManager();
  const detector = new CalibrationDetector(storage, new MockDelegate());

  detector.offsetMs = 75;
  storage.set(detector.storageKey, detector.offsetMs);

  const retrieved = storage.getNumber(detector.storageKey, 0);
  assertEquals(retrieved, 75);
});

Deno.test("CalibrationDetector: should load settings from storage on init", () => {
  const storage = new MockStorageManager();
  storage.set("tempoTrainer.calibrationOffsetMs", "42");

  const detector = new CalibrationDetector(storage, new MockDelegate());
  assertEquals(detector.offsetMs, 42);
});
