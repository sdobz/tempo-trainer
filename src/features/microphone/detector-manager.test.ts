import { assertEquals, assert } from "../base/assert.ts";
import DetectorManager from "./detector-manager.js";
import {
  DETECTOR_TYPES,
  DEFAULT_THRESHOLD_PARAMS,
  DEFAULT_ADAPTIVE_PARAMS,
} from "./detector-params.js";

class MockStorageManager {
  private _store = new Map<string, string>();

  get(key: string, defaultValue: string | null = null): string | null {
    return this._store.has(key) ? this._store.get(key)! : defaultValue;
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
}

class MockAudioService {
  private _context = { currentTime: 0 };
  analyserNode = null;
  audioContext = this._context;

  getContext() {
    return this._context as any;
  }

  async start() {
    return { frequencyBinCount: 128, fftSize: 256 } as any;
  }

  stop() {}
}

function createManager(storage = new MockStorageManager()) {
  return new DetectorManager(new MockAudioService() as any, storage as any);
}

Deno.test(
  "DetectorManager: getParams returns threshold defaults when storage is empty",
  () => {
    const manager = createManager();
    const params = manager.getParams();
    assertEquals(params.type, DETECTOR_TYPES.THRESHOLD);
    assertEquals(params.id, "default");
    assert(typeof params.sensitivity === "number");
  },
);

Deno.test(
  "DetectorManager: getParams returns adaptive defaults after legacy type key",
  () => {
    const storage = new MockStorageManager();
    storage.set("tempoTrainer.detectorType", "adaptive");

    const manager = createManager(storage);
    const params = manager.getParams();
    assertEquals(params.type, DETECTOR_TYPES.ADAPTIVE);
    assertEquals(params.sensitivity, DEFAULT_ADAPTIVE_PARAMS.sensitivity);
  },
);

Deno.test("DetectorManager: migration from legacy hitThreshold key", () => {
  const storage = new MockStorageManager();
  storage.set("tempoTrainer.hitThreshold", "64");

  const manager = createManager(storage);
  const params = manager.getParams();
  assertEquals(params.type, DETECTOR_TYPES.THRESHOLD);
  assertEquals(params.sensitivity, 0.5);
});

Deno.test(
  "DetectorManager: setActiveDetector updates type and persists",
  () => {
    const storage = new MockStorageManager();
    const manager = createManager(storage);

    manager.setActiveDetector({ type: DETECTOR_TYPES.ADAPTIVE });

    const params = manager.getParams();
    assertEquals(params.type, DETECTOR_TYPES.ADAPTIVE);

    const stored = storage.get("tempoTrainer.detectorParams.default");
    assert(stored !== null);
    const parsed = JSON.parse(stored!);
    assertEquals(parsed.type, DETECTOR_TYPES.ADAPTIVE);
  },
);

Deno.test(
  "DetectorManager: setActiveDetector preserves unchanged fields",
  () => {
    const manager = createManager();
    manager.setSensitivity(0.8);
    manager.setActiveDetector({ type: DETECTOR_TYPES.ADAPTIVE });
    assertEquals(manager.sensitivity, 0.8);
  },
);

Deno.test("DetectorManager: setSensitivity clamps to [0, 1]", () => {
  const manager = createManager();
  manager.setSensitivity(1.5);
  assertEquals(manager.sensitivity, 1.0);
  manager.setSensitivity(-0.2);
  assertEquals(manager.sensitivity, 0.0);
});

Deno.test("DetectorManager: setSensitivity persists to storage", () => {
  const storage = new MockStorageManager();
  const manager = createManager(storage);

  manager.setSensitivity(0.7);

  const stored = storage.get("tempoTrainer.detectorParams.default");
  assert(stored !== null);
  const parsed = JSON.parse(stored!);
  assertEquals(parsed.sensitivity, 0.7);
});

Deno.test("DetectorManager: setSessionBpm updates adaptive params", () => {
  const manager = createManager();
  manager.setActiveDetector({ type: DETECTOR_TYPES.ADAPTIVE });
  manager.setSessionBpm(132);

  const params = manager.getParams();
  assertEquals(params.type, DETECTOR_TYPES.ADAPTIVE);
  if (params.type === DETECTOR_TYPES.ADAPTIVE) {
    assertEquals(params.bpm, 132);
  }
});

Deno.test("DetectorManager: setSessionBpm forwards to active detector", () => {
  const manager = createManager();

  let receivedBpm: number | null = null;
  (manager as any)._detector = {
    setBpm: (bpm: number) => {
      receivedBpm = bpm;
    },
  };

  manager.setSessionBpm(141);
  assertEquals(receivedBpm, 141);
});

Deno.test(
  "DetectorManager: loads persisted DetectorParams JSON over legacy keys",
  () => {
    const storage = new MockStorageManager();
    storage.set("tempoTrainer.detectorType", "adaptive");
    storage.set(
      "tempoTrainer.detectorParams.default",
      JSON.stringify({ id: "default", type: "threshold", sensitivity: 0.3 }),
    );

    const manager = createManager(storage);
    const params = manager.getParams();
    assertEquals(params.type, DETECTOR_TYPES.THRESHOLD);
    assertEquals(params.sensitivity, 0.3);
  },
);

Deno.test(
  "DetectorManager: setDelegate pushes current sensitivity immediately",
  () => {
    const manager = createManager();
    manager.setSensitivity(0.8);

    let received: number | null = null;
    manager.setDelegate({
      onThresholdChanged: (value: number) => {
        received = value;
      },
    });

    assertEquals(received, 0.8);
  },
);

Deno.test(
  "DetectorManager: delegate forwarding routes callbacks correctly",
  () => {
    const manager = createManager();
    const received: Record<string, any> = {};

    manager.setDelegate({
      onLevelChanged: (value: number) => {
        received.level = value;
      },
      onPeakChanged: (value: number) => {
        received.peak = value;
      },
      onThresholdChanged: (value: number) => {
        received.threshold = value;
      },
      onHit: () => {
        received.hit = true;
      },
    });

    manager.onLevelChanged(0.6);
    manager.onPeakChanged(0.4);
    manager.onThresholdChanged(0.5);
    manager.onHitFromDetector();

    assertEquals(received.level, 0.6);
    assertEquals(received.peak, 0.4);
    assertEquals(received.threshold, 0.5);
    assertEquals(received.hit, true);
  },
);

Deno.test("DetectorManager: onHit callback is stored for re-wiring", () => {
  const manager = createManager();
  manager.onHit(() => {});
  assert((manager as any)._onHitTimingCallback !== null);
});

Deno.test("DetectorManager: isRunning returns false before start", () => {
  const manager = createManager();
  assertEquals(manager.isRunning, false);
});

Deno.test("DetectorManager: emits 'hit' EventTarget events on hits", () => {
  const manager = createManager();
  const hits: CustomEvent[] = [];

  manager.addEventListener("hit", (event) => {
    if (event instanceof CustomEvent) hits.push(event);
  });

  manager.onHitFromDetector(100.5);

  assertEquals(hits.length, 1);
  assertEquals(hits[0].detail.time, 100.5);
});

Deno.test("DetectorManager: emits 'changed' events on setSensitivity", () => {
  const manager = createManager();
  const changes: CustomEvent[] = [];

  manager.addEventListener("changed", (event) => {
    if (event instanceof CustomEvent) changes.push(event);
  });

  manager.setSensitivity(0.7);

  assertEquals(changes.length, 1);
  assertEquals(changes[0].detail.field, "sensitivity");
  assertEquals(changes[0].detail.value, 0.7);
});

Deno.test("DetectorManager: hit event and addHitListener both fire", () => {
  const manager = createManager();
  const hitEvents: CustomEvent[] = [];
  const hitTimes: number[] = [];

  manager.addEventListener("hit", (event) => {
    if (event instanceof CustomEvent) hitEvents.push(event);
  });
  manager.addHitListener((time) => hitTimes.push(time));

  manager.onHitFromDetector(150);

  assertEquals(hitEvents.length, 1);
  assertEquals(hitTimes.length, 1);
  assertEquals(hitEvents[0].detail.time, 150);
  assertEquals(hitTimes[0], 150);
});

Deno.test("DetectorManager: default params remain threshold defaults", () => {
  const manager = createManager();
  const params = manager.getParams();
  assertEquals(params.type, DETECTOR_TYPES.THRESHOLD);
  assertEquals(params.sensitivity, DEFAULT_THRESHOLD_PARAMS.sensitivity);
});
