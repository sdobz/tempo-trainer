import { assert } from "../base/assert.ts";
import DetectorFactory from "./detector-factory.js";
import ThresholdDetector from "./threshold-detector.js";
import AdaptiveDetector from "./adaptive-detector.js";

// Mock StorageManager matching the actual StorageManager interface
class MockStorageManager {
  private storage: Map<string, string> = new Map();

  get(key: string, defaultValue: string | null = null): string | null {
    return this.storage.get(key) || defaultValue;
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
    this.storage.set(key, String(value));
    return true;
  }

  remove(key: string): boolean {
    return this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }
}

// Minimal delegate for testing
class TestDelegate {
  onLevelChanged(level: number): void {}
  onPeakChanged(peak: number): void {}
  onHit(): void {}
  onThresholdChanged?(threshold: number): void {}
  onFluxChanged?(flux: number): void {}
}

// Create mock AudioContext
function createMockAudioContext(): any {
  return {
    sampleRate: 44100,
    state: "running",
    createMediaStreamAudioSource: () => ({
      connect: () => {},
    }),
    createAnalyser: () => ({
      fftSize: 2048,
      frequencyBinCount: 1024,
      getByteFrequencyData: (data: Uint8Array) => {},
      getFloatFrequencyData: (data: Float32Array) => {},
    }),
    createScriptProcessor: (bufferSize: number, inputChannels: number, outputChannels: number) => ({
      connect: () => {},
      disconnect: () => {},
    }),
  };
}

Deno.test("DetectorFactory - createDetector returns ThresholdDetector for 'threshold'", () => {
  const storage = new MockStorageManager();
  const delegate = new TestDelegate();
  const audioContext = createMockAudioContext();

  const detector = DetectorFactory.createDetector("threshold", storage, delegate, audioContext);

  assert(detector instanceof ThresholdDetector, "Should return ThresholdDetector instance");
  assert(detector !== null, "Detector should not be null");
});

Deno.test("DetectorFactory - createDetector returns AdaptiveDetector for 'adaptive'", () => {
  const storage = new MockStorageManager();
  const delegate = new TestDelegate();
  const audioContext = createMockAudioContext();

  const detector = DetectorFactory.createDetector("adaptive", storage, delegate, audioContext);

  assert(detector instanceof AdaptiveDetector, "Should return AdaptiveDetector instance");
  assert(detector !== null, "Detector should not be null");
});

Deno.test("DetectorFactory - createDetector throws for unknown type", () => {
  const storage = new MockStorageManager();
  const delegate = new TestDelegate();
  const audioContext = createMockAudioContext();

  try {
    DetectorFactory.createDetector("unknown", storage, delegate, audioContext);
    assert(false, "Should have thrown an error");
  } catch (error: any) {
    assert(error.message.includes("Unknown detector type"), "Error should mention unknown type");
  }
});

Deno.test("DetectorFactory - getPreferredType returns 'threshold' by default", () => {
  const storage = new MockStorageManager();

  const type = DetectorFactory.getPreferredType(storage);

  assert(type === "threshold", "Should default to 'threshold'");
});

Deno.test("DetectorFactory - setPreferredType and getPreferredType persist selection", () => {
  const storage = new MockStorageManager();

  DetectorFactory.setPreferredType(storage, "adaptive");
  const type = DetectorFactory.getPreferredType(storage);

  assert(type === "adaptive", "Should return stored 'adaptive' type");
});

Deno.test("DetectorFactory - createPreferred uses stored type", () => {
  const storage = new MockStorageManager();
  const delegate = new TestDelegate();
  const audioContext = createMockAudioContext();

  DetectorFactory.setPreferredType(storage, "adaptive");
  const detector = DetectorFactory.createPreferred(storage, delegate, audioContext);

  assert(detector instanceof AdaptiveDetector, "Should create AdaptiveDetector when 'adaptive' is stored");
});

Deno.test("DetectorFactory - createPreferred defaults to threshold", () => {
  const storage = new MockStorageManager();
  const delegate = new TestDelegate();
  const audioContext = createMockAudioContext();

  const detector = DetectorFactory.createPreferred(storage, delegate, audioContext);

  assert(
    detector instanceof ThresholdDetector,
    "Should create ThresholdDetector when no preference is stored"
  );
});

Deno.test("DetectorFactory - ThresholdDetector has required BeatDetector interface", () => {
  const storage = new MockStorageManager();
  const delegate = new TestDelegate();
  const audioContext = createMockAudioContext();

  const detector = DetectorFactory.createDetector("threshold", storage, delegate, audioContext);

  assert(typeof detector.onHit === "function", "Should have onHit method");
  assert(typeof detector.start === "function", "Should have start method");
  assert(typeof detector.stop === "function", "Should have stop method");
  assert("isRunning" in detector, "Should have isRunning getter");
});

Deno.test("DetectorFactory - AdaptiveDetector has required BeatDetector interface", () => {
  const storage = new MockStorageManager();
  const delegate = new TestDelegate();
  const audioContext = createMockAudioContext();

  const detector = DetectorFactory.createDetector("adaptive", storage, delegate, audioContext);

  assert(typeof detector.onHit === "function", "Should have onHit method");
  assert(typeof detector.start === "function", "Should have start method");
  assert(typeof detector.stop === "function", "Should have stop method");
  assert("isRunning" in detector, "Should have isRunning getter");
});
