import { assertEquals, assert } from "../base/assert.ts";
import DetectorManager from "./detector-manager.js";
import {
  DETECTOR_TYPES,
  DEFAULT_THRESHOLD_PARAMS,
  DEFAULT_ADAPTIVE_PARAMS,
} from "./detector-params.js";

// ---------------------------------------------------------------------------
// MockStorageManager — in-memory storage for deterministic tests
// ---------------------------------------------------------------------------

class MockStorageManager {
  private _store = new Map<string, string>();

  get(key: string, defaultValue: string | null = null): string | null {
    return this._store.has(key) ? this._store.get(key)! : defaultValue;
  }
  getNumber(key: string, defaultValue = 0): number {
    const v = this.get(key);
    if (v === null) return defaultValue;
    const n = parseFloat(v);
    return isNaN(n) ? defaultValue : n;
  }
  getInt(key: string, defaultValue = 0): number {
    const v = this.get(key);
    if (v === null) return defaultValue;
    const n = parseInt(v, 10);
    return isNaN(n) ? defaultValue : n;
  }
  set(key: string, value: unknown): boolean {
    this._store.set(key, String(value));
    return true;
  }
  remove(key: string): boolean {
    return this._store.delete(key);
  }
  clear(): void {
    this._store.clear();
  }
}

// ---------------------------------------------------------------------------
// Tests — params and storage layer (no AudioContext required)
// ---------------------------------------------------------------------------

Deno.test(
  "DetectorManager: getParams returns threshold defaults when storage is empty",
  () => {
    const storage = new MockStorageManager();
    const manager = new DetectorManager(storage);

    const params = manager.getParams();
    assertEquals(params.type, DETECTOR_TYPES.THRESHOLD);
    assertEquals(params.id, "default");
    assert(
      typeof params.sensitivity === "number",
      "sensitivity should be number",
    );
  },
);

Deno.test(
  "DetectorManager: getParams returns adaptive defaults after legacy type key",
  () => {
    const storage = new MockStorageManager();
    storage.set("tempoTrainer.detectorType", "adaptive");

    const manager = new DetectorManager(storage);
    const params = manager.getParams();
    assertEquals(params.type, DETECTOR_TYPES.ADAPTIVE);
    assertEquals(params.sensitivity, DEFAULT_ADAPTIVE_PARAMS.sensitivity);
  },
);

Deno.test("DetectorManager: migration from legacy hitThreshold key", () => {
  const storage = new MockStorageManager();
  storage.set("tempoTrainer.hitThreshold", "64"); // 64/128 = 0.5 → sensitivity = 1 - 0.5 = 0.5

  const manager = new DetectorManager(storage);
  const params = manager.getParams();
  assertEquals(params.type, DETECTOR_TYPES.THRESHOLD);
  assertEquals(params.sensitivity, 0.5);
});

Deno.test(
  "DetectorManager: setActiveDetector updates type and persists",
  () => {
    const storage = new MockStorageManager();
    const manager = new DetectorManager(storage);

    manager.setActiveDetector({ type: DETECTOR_TYPES.ADAPTIVE });

    const params = manager.getParams();
    assertEquals(params.type, DETECTOR_TYPES.ADAPTIVE);

    // Verify it was persisted to storage
    const stored = storage.get("tempoTrainer.detectorParams.default");
    assert(stored !== null, "Params should be persisted");
    const parsed = JSON.parse(stored!);
    assertEquals(parsed.type, DETECTOR_TYPES.ADAPTIVE);
  },
);

Deno.test(
  "DetectorManager: setActiveDetector preserves unchanged fields",
  () => {
    const storage = new MockStorageManager();
    const manager = new DetectorManager(storage);

    manager.setSensitivity(0.8);
    manager.setActiveDetector({ type: DETECTOR_TYPES.ADAPTIVE });

    assertEquals(manager.sensitivity, 0.8);
  },
);

Deno.test("DetectorManager: setSensitivity clamps to [0, 1]", () => {
  const storage = new MockStorageManager();
  const manager = new DetectorManager(storage);

  manager.setSensitivity(1.5);
  assertEquals(manager.sensitivity, 1.0);

  manager.setSensitivity(-0.2);
  assertEquals(manager.sensitivity, 0.0);
});

Deno.test("DetectorManager: setSensitivity persists to storage", () => {
  const storage = new MockStorageManager();
  const manager = new DetectorManager(storage);

  manager.setSensitivity(0.7);

  const stored = storage.get("tempoTrainer.detectorParams.default");
  assert(stored !== null, "Should persist params");
  const parsed = JSON.parse(stored!);
  assertEquals(parsed.sensitivity, 0.7);
});

Deno.test("DetectorManager: setSessionBpm updates adaptive params", () => {
  const storage = new MockStorageManager();
  const manager = new DetectorManager(storage);

  manager.setActiveDetector({ type: DETECTOR_TYPES.ADAPTIVE });
  manager.setSessionBpm(132);

  const params = manager.getParams();
  assertEquals(params.type, DETECTOR_TYPES.ADAPTIVE);
  if (params.type === DETECTOR_TYPES.ADAPTIVE) {
    assertEquals(params.bpm, 132);
  }
});

Deno.test("DetectorManager: setSessionBpm forwards to active detector", () => {
  const storage = new MockStorageManager();
  const manager = new DetectorManager(storage);

  let receivedBpm: number | null = null;
  (manager as any)._detector = {
    setBpm: (bpm: number) => {
      receivedBpm = bpm;
    },
  };

  manager.setSessionBpm(141);
  assertEquals(receivedBpm, 141);
});

Deno.test("DetectorManager: sensitivity getter returns current value", () => {
  const storage = new MockStorageManager();
  const manager = new DetectorManager(storage);

  manager.setSensitivity(0.3);
  assertEquals(manager.sensitivity, 0.3);
});

Deno.test(
  "DetectorManager: loads persisted DetectorParams JSON over legacy keys",
  () => {
    const storage = new MockStorageManager();
    // Old legacy key — should be superseded by the new JSON key
    storage.set("tempoTrainer.detectorType", "adaptive");
    // New params key — should win
    storage.set(
      "tempoTrainer.detectorParams.default",
      JSON.stringify({ id: "default", type: "threshold", sensitivity: 0.3 }),
    );

    const manager = new DetectorManager(storage);
    const params = manager.getParams();
    assertEquals(params.type, DETECTOR_TYPES.THRESHOLD);
    assertEquals(params.sensitivity, 0.3);
  },
);

Deno.test(
  "DetectorManager: setDelegate pushes current sensitivity immediately",
  () => {
    const storage = new MockStorageManager();
    const manager = new DetectorManager(storage);
    manager.setSensitivity(0.8);

    let received: number | null = null;
    const mockDelegate = {
      onThresholdChanged: (v: number) => {
        received = v;
      },
    };

    manager.setDelegate(mockDelegate);
    assertEquals(received, 0.8);
  },
);

Deno.test(
  "DetectorManager: delegate forwarding routes callbacks correctly",
  () => {
    const storage = new MockStorageManager();
    const manager = new DetectorManager(storage);

    const received: Record<string, any> = {};
    manager.setDelegate({
      onLevelChanged: (v: number) => {
        received.level = v;
      },
      onPeakChanged: (v: number) => {
        received.peak = v;
      },
      onThresholdChanged: (v: number) => {
        received.threshold = v;
      },
      onHit: () => {
        received.hit = true;
      },
      onDevicesChanged: (devs: any, id: string) => {
        received.devices = devs;
        received.selectedId = id;
      },
    });

    // Simulate detector callbacks reaching the manager
    manager.onLevelChanged(0.6);
    manager.onPeakChanged(0.4);
    manager.onThresholdChanged(0.5);
    manager.onHitFromDetector();
    manager.onDevicesChanged([{ deviceId: "d1", label: "Mic" }], "d1");

    assertEquals(received.level, 0.6);
    assertEquals(received.peak, 0.4);
    assertEquals(received.hit, true);
    assertEquals(received.devices.length, 1);
    assertEquals(received.selectedId, "d1");
  },
);

Deno.test("DetectorManager: onHit callback is stored for re-wiring", () => {
  const storage = new MockStorageManager();
  const manager = new DetectorManager(storage);

  let hitFired = false;
  manager.onHit(() => {
    hitFired = true;
  });

  // _onHitTimingCallback is stored
  assert(
    (manager as any)._onHitTimingCallback !== null,
    "Timing callback should be stored",
  );
});

Deno.test(
  "DetectorManager: isRunning returns false when no detector created",
  () => {
    const storage = new MockStorageManager();
    const manager = new DetectorManager(storage);
    assertEquals(manager.isRunning, false);
  },
);

// [Phase 0] Event contract tests for hit, changed, fault events
Deno.test("DetectorManager: emits 'hit' EventTarget events on hits", () => {
  const storage = new MockStorageManager();
  const manager = new DetectorManager(storage);
  const hits: CustomEvent[] = [];

  manager.addEventListener("hit", (ev) => {
    if (ev instanceof CustomEvent) hits.push(ev);
  });

  manager.onHitFromDetector(100.5);

  assertEquals(hits.length, 1);
  assertEquals(hits[0].detail.time, 100.5);
});

Deno.test("DetectorManager: emits 'changed' events on setSensitivity", () => {
  const storage = new MockStorageManager();
  const manager = new DetectorManager(storage);
  const changes: CustomEvent[] = [];

  manager.addEventListener("changed", (ev) => {
    if (ev instanceof CustomEvent) changes.push(ev);
  });

  manager.setSensitivity(0.7);

  assertEquals(changes.length, 1);
  assertEquals(changes[0].detail.field, "sensitivity");
  assertEquals(changes[0].detail.value, 0.7);
});

Deno.test(
  "DetectorManager: hit event and addHitListener both fire (compat)",
  () => {
    const storage = new MockStorageManager();
    const manager = new DetectorManager(storage);
    const hitEvents: CustomEvent[] = [];
    const hitTimes: number[] = [];

    manager.addEventListener("hit", (ev) => {
      if (ev instanceof CustomEvent) hitEvents.push(ev);
    });

    manager.addHitListener((time) => hitTimes.push(time));

    manager.onHitFromDetector(150);

    assertEquals(hitEvents.length, 1);
    assertEquals(hitTimes.length, 1);
    assertEquals(hitEvents[0].detail.time, 150);
    assertEquals(hitTimes[0], 150);
  },
);
