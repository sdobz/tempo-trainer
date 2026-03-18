import { assertEquals, assertTrue } from "../base/assert.ts";
import ChartService from "./chart-service.js";

class MockStorage {
  map: Map<string, string>;

  constructor() {
    this.map = new Map();
  }

  get(key: string, def: string | null = null) {
    const value = this.map.get(key);
    return value ?? def;
  }

  set(key: string, value: unknown) {
    this.map.set(key, String(value));
    return true;
  }
}

Deno.test("ChartService.projectChart: returns click-in and expanded measure plan", () => {
  const service = new ChartService(new MockStorage());

  const projected = service.projectChart({
    id: "p1",
    name: "test",
    segments: [
      { on: 2, off: 1, reps: 2 },
      { on: 1, off: 0, reps: 1 },
    ],
  });

  // 1 click-in + (2+1)*2 + (1+0)*1 = 8
  assertEquals(projected.plan.length, 8);
  assertEquals(projected.plan[0].type, "click-in");
  assertEquals(projected.plan[1].type, "click");
  assertEquals(projected.plan[2].type, "click");
  assertEquals(projected.plan[3].type, "silent");
  assertEquals(projected.plan[4].type, "click");
  assertEquals(projected.plan[5].type, "click");
  assertEquals(projected.plan[6].type, "silent");
  assertEquals(projected.plan[7].type, "click");

  assertEquals(projected.segments.length, 3);
  assertTrue(Boolean(projected.segments[0].isClickIn));
  assertEquals(projected.segments[1].startIndex, 1);
  assertEquals(projected.segments[2].startIndex, 7);
});

Deno.test("ChartService.projectChart: handles large reps without malformed short plan", () => {
  const service = new ChartService(new MockStorage());

  const projected = service.projectChart({
    id: "p-heavy",
    name: "heavy",
    segments: [{ on: 1, off: 1, reps: 500 }],
  });

  // Regression: plan must be expanded, not just raw segment count.
  assertEquals(projected.plan.length, 1001);
  assertEquals(projected.plan[0].type, "click-in");
  assertEquals(projected.plan[1].type, "click");
  assertEquals(projected.plan[2].type, "silent");
});
