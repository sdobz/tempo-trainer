/// <reference lib="dom" />
import { assertEquals, assertNotEquals } from "../base/assert.ts";

const { default: PlanLibrary } = await import("./plan-library.js");

// ---------------------------------------------------------------------------
// MockStorage
// ---------------------------------------------------------------------------

class MockStorage {
  data: Record<string, string> = {};

  get(key: string, defaultValue: string | null = null): string | null {
    return key in this.data ? this.data[key] : defaultValue;
  }

  set(key: string, value: unknown): boolean {
    this.data[key] = String(value);
    return true;
  }
}

function createLibrary() {
  return new PlanLibrary(new MockStorage());
}

// ---------------------------------------------------------------------------
// Built-in plans
// ---------------------------------------------------------------------------

Deno.test("PlanLibrary: getAllPlans includes at least 8 built-in plans", () => {
  const lib = createLibrary();
  const plans = lib.getAllPlans();
  assertEquals(
    plans.length >= 8,
    true,
    `expected >= 8 plans, got ${plans.length}`,
  );
});

Deno.test("PlanLibrary: built-in plans are marked isBuiltIn", () => {
  const lib = createLibrary();
  const allPlans = lib.getAllPlans();
  const builtIn = allPlans.filter((p: any) => p.isBuiltIn);
  assertEquals(builtIn.length >= 8, true);
  builtIn.forEach((p: any) => assertEquals(p.isBuiltIn, true));
});

Deno.test(
  "PlanLibrary: getCustomPlans returns empty array when no custom plans",
  () => {
    const lib = createLibrary();
    assertEquals(lib.getCustomPlans(), []);
  },
);

// ---------------------------------------------------------------------------
// savePlan
// ---------------------------------------------------------------------------

Deno.test(
  "PlanLibrary: savePlan creates a custom plan with auto-generated id",
  () => {
    const lib = createLibrary();
    const plan = lib.savePlan({
      name: "Test Plan",
      segments: [{ on: 2, off: 2, reps: 4 }],
    });

    assertEquals(typeof plan.id, "string");
    assertEquals(plan.isBuiltIn, false);
  },
);

Deno.test(
  "PlanLibrary: savePlan persists to storage (retrievable via getCustomPlans)",
  () => {
    const lib = createLibrary();
    lib.savePlan({ name: "My Plan", segments: [{ on: 1, off: 1, reps: 4 }] });

    assertEquals(lib.getCustomPlans().length, 1);
    assertEquals(lib.getCustomPlans()[0].name, "My Plan");
  },
);

Deno.test(
  "PlanLibrary: savePlan updates existing plan when id provided",
  () => {
    const lib = createLibrary();
    const first = lib.savePlan({
      name: "Old Name",
      segments: [{ on: 1, off: 1, reps: 1 }],
    });
    lib.savePlan({ ...first, name: "New Name" });

    assertEquals(lib.getCustomPlans().length, 1);
    assertEquals(lib.getCustomPlans()[0].name, "New Name");
  },
);

Deno.test("PlanLibrary: savePlan throws when name is missing", () => {
  const lib = createLibrary();
  let threw = false;
  try {
    lib.savePlan({ segments: [{ on: 1, off: 1, reps: 1 }] } as any);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("PlanLibrary: savePlan throws when segments are empty", () => {
  const lib = createLibrary();
  let threw = false;
  try {
    lib.savePlan({ name: "No Segs", segments: [] } as any);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

// ---------------------------------------------------------------------------
// deletePlan
// ---------------------------------------------------------------------------

Deno.test("PlanLibrary: deletePlan removes a custom plan", () => {
  const lib = createLibrary();
  const plan = lib.savePlan({
    name: "Delete Me",
    segments: [{ on: 1, off: 1, reps: 1 }],
  });

  const deleted = lib.deletePlan(plan.id!);
  assertEquals(deleted, true);
  assertEquals(lib.getCustomPlans().length, 0);
});

Deno.test("PlanLibrary: deletePlan returns false for non-existent id", () => {
  const lib = createLibrary();
  assertEquals(lib.deletePlan("does-not-exist"), false);
});

Deno.test("PlanLibrary: deletePlan cannot delete built-in plans", () => {
  const lib = createLibrary();
  const builtInId = lib.getAllPlans().find((p: any) => p.isBuiltIn)!
    .id as string;

  // Built-in plans are not in custom storage, so deletePlan returns false
  const deleted = lib.deletePlan(builtInId);
  assertEquals(deleted, false);
});

// ---------------------------------------------------------------------------
// clonePlan
// ---------------------------------------------------------------------------

Deno.test("PlanLibrary: clonePlan creates copy of built-in plan", () => {
  const lib = createLibrary();
  const builtInId = "beginner-simple";
  const clone = lib.clonePlan(builtInId, "My Clone");

  assertEquals(clone.name, "My Clone");
  assertEquals(clone.isBuiltIn, false);
  assertEquals(typeof clone.id, "string");
  assertNotEquals(clone.id, builtInId);
});

Deno.test("PlanLibrary: clonePlan deep-copies segments", () => {
  const lib = createLibrary();
  const source = lib.getPlanById("beginner-simple")!;
  const clone = lib.clonePlan("beginner-simple");

  // Mutating clone segments should not affect source
  clone.segments[0].on = 999;
  assertEquals(source.segments[0].on !== 999, true);
});

Deno.test("PlanLibrary: clonePlan throws for unknown id", () => {
  const lib = createLibrary();
  let threw = false;
  try {
    lib.clonePlan("nonexistent");
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

// ---------------------------------------------------------------------------
// segmentsToString / stringToSegments (round-trip)
// ---------------------------------------------------------------------------

Deno.test("PlanLibrary: segmentsToString produces correct format", () => {
  const lib = createLibrary();
  const result = lib.segmentsToString([
    { on: 2, off: 2, reps: 4 },
    { on: 1, off: 3, reps: 2 },
  ]);
  assertEquals(result, "2,2,4;1,3,2");
});

Deno.test("PlanLibrary: stringToSegments parses correctly", () => {
  const lib = createLibrary();
  const segs = lib.stringToSegments("2,2,4;1,3,2");

  assertEquals(segs.length, 2);
  assertEquals(segs[0], { on: 2, off: 2, reps: 4 });
  assertEquals(segs[1], { on: 1, off: 3, reps: 2 });
});

Deno.test(
  "PlanLibrary: segmentsToString + stringToSegments round-trips",
  () => {
    const lib = createLibrary();
    const original = [
      { on: 4, off: 4, reps: 3 },
      { on: 2, off: 1, reps: 5 },
    ];
    const roundTripped = lib.stringToSegments(lib.segmentsToString(original));

    assertEquals(roundTripped, original);
  },
);

Deno.test(
  "PlanLibrary: stringToSegments returns empty array for empty string",
  () => {
    const lib = createLibrary();
    assertEquals(lib.stringToSegments(""), []);
  },
);

// ---------------------------------------------------------------------------
// calculateStats
// ---------------------------------------------------------------------------

Deno.test("PlanLibrary: calculateStats computes totals correctly", () => {
  const lib = createLibrary();
  const segs = [{ on: 2, off: 2, reps: 4 }]; // 4 measures per rep × 4 reps = 16 total
  const stats = lib.calculateStats(segs);

  assertEquals(stats.totalMeasures, 16);
  assertEquals(stats.playingMeasures, 8);
  assertEquals(stats.restMeasures, 8);
  assertEquals(stats.segments, 1);
});

Deno.test("PlanLibrary: calculateStats handles zero-rest segments", () => {
  const lib = createLibrary();
  const segs = [{ on: 4, off: 0, reps: 2 }];
  const stats = lib.calculateStats(segs);

  assertEquals(stats.totalMeasures, 8);
  assertEquals(stats.restMeasures, 0);
});
