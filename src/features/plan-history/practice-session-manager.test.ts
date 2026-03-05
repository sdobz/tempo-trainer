/// <reference lib="dom" />
import { assertEquals, assertNotEquals } from "../base/assert.ts";

const { default: PracticeSessionManager } = await import(
  "./practice-session-manager.js"
);
const { default: Scorer } = await import("../plan-play/scorer.js");

// ---------------------------------------------------------------------------
// MockStorageManager
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePlan(clickMeasures = 2) {
  return [
    { type: "click-in" },
    ...Array.from({ length: clickMeasures }, () => ({ type: "click" })),
  ];
}

/**
 * Build minimal session data with controllable hit patterns.
 * hitsByMeasure: sparse map of measureIndex → hit beat positions
 */
function makeSessionData(
  opts: {
    bpm?: number;
    beatsPerMeasure?: number;
    clickMeasures?: number;
    hitsByMeasure?: Record<number, number[]>;
    completed?: boolean;
    durationSeconds?: number;
  } = {},
) {
  const {
    bpm = 120,
    clickMeasures = 2,
    hitsByMeasure = {},
    completed = true,
    durationSeconds = 10,
  } = opts;
  const drillPlan = makePlan(clickMeasures);
  const measureHits: number[][] = drillPlan.map((_, i) =>
    hitsByMeasure[i] ?? []
  );

  return {
    plan: {
      id: "test-plan",
      name: "Test Plan",
      description: "",
      difficulty: "Beginner",
      segments: [{ on: clickMeasures, off: 0, reps: 1 }],
    },
    bpm,
    timeSignature: "4/4",
    completed,
    durationSeconds,
    measureHits,
    drillPlan,
    overallScore: 50,
  };
}

function createManager() {
  return new PracticeSessionManager(new MockStorage());
}

// ---------------------------------------------------------------------------
// saveSession / getSessions / deleteSession
// ---------------------------------------------------------------------------

Deno.test("PracticeSessionManager: getSessions returns empty array initially", () => {
  const manager = createManager();
  assertEquals(manager.getSessions(), []);
});

Deno.test("PracticeSessionManager: saveSession stores a session", () => {
  const manager = createManager();
  const sessionData = makeSessionData();
  const session = manager.saveSession(sessionData);

  assertNotEquals(session, null);
  assertEquals(manager.getSessions().length, 1);
});

Deno.test("PracticeSessionManager: saveSession returns session with id and timestamp", () => {
  const manager = createManager();
  const session = manager.saveSession(makeSessionData());

  assertNotEquals(session, null);
  assertEquals(typeof session!.id, "string");
  assertEquals(typeof session!.timestamp, "string");
});

Deno.test("PracticeSessionManager: saveSession attaches derived metrics", () => {
  const manager = createManager();
  const session = manager.saveSession(makeSessionData());

  assertNotEquals(session, null);
  assertNotEquals(session!.metrics, undefined);
  assertNotEquals(session!.metrics.drift, undefined);
  assertNotEquals(session!.metrics.missed, undefined);
  assertNotEquals(session!.metrics.rhythm, undefined);
  assertNotEquals(session!.metrics.completion, undefined);
});

Deno.test("PracticeSessionManager: sessions are stored most-recent-first", () => {
  const manager = createManager();
  manager.saveSession(makeSessionData());
  const second = manager.saveSession(makeSessionData());

  const sessions = manager.getSessions();
  assertEquals(sessions[0].id, second!.id);
});

Deno.test("PracticeSessionManager: deleteSession removes correct session", async () => {
  const manager = createManager();
  const s1 = manager.saveSession(makeSessionData());
  // Wait 2 ms so the second saveSession gets a distinct Date.now() id
  await new Promise((r) => setTimeout(r, 2));
  const s2 = manager.saveSession(makeSessionData());

  manager.deleteSession(s1!.id);

  const remaining = manager.getSessions();
  assertEquals(remaining.length, 1);
  assertEquals(remaining[0].id, s2!.id);
});

Deno.test("PracticeSessionManager: deleteSession returns false for unknown id", () => {
  const manager = createManager();
  assertEquals(manager.deleteSession("nonexistent"), false);
});

Deno.test("PracticeSessionManager: clearSessions removes all sessions", () => {
  const manager = createManager();
  manager.saveSession(makeSessionData());
  manager.saveSession(makeSessionData());
  manager.clearSessions();

  assertEquals(manager.getSessions().length, 0);
});

// ---------------------------------------------------------------------------
// calculateDrift
// ---------------------------------------------------------------------------

Deno.test("PracticeSessionManager: calculateDrift returns 'none' severity with no hits", () => {
  const manager = createManager();
  const sessionData = makeSessionData({ hitsByMeasure: {} });
  const drift = manager.calculateDrift(sessionData);

  assertEquals(drift.severity, "none");
  assertEquals(drift.direction, "balanced");
});

Deno.test("PracticeSessionManager: calculateDrift detects late timing", () => {
  const manager = createManager();
  // Measure 1 at BPM 120: expected beats at 4,5,6,7 (beat units)
  // Hits at 4.4, 5.4, 6.4, 7.4 — consistently 0.4 beats late
  const sessionData = makeSessionData({
    hitsByMeasure: {
      1: [4.4, 5.4, 6.4, 7.4],
      2: [8.4, 9.4, 10.4, 11.4],
    },
  });
  const drift = manager.calculateDrift(sessionData);

  assertEquals(drift.direction, "late");
  assertEquals(drift.avgErrorBeats > 0, true);
});

Deno.test("PracticeSessionManager: calculateDrift detects early timing", () => {
  const manager = createManager();
  const sessionData = makeSessionData({
    hitsByMeasure: {
      1: [3.7, 4.7, 5.7, 6.7],
      2: [7.7, 8.7, 9.7, 10.7],
    },
  });
  const drift = manager.calculateDrift(sessionData);
  assertEquals(drift.direction, "early");
});

// ---------------------------------------------------------------------------
// calculateMissed
// ---------------------------------------------------------------------------

Deno.test("PracticeSessionManager: calculateMissed counts completely missed measures", () => {
  const manager = createManager();
  // Measure 1 has hits, measure 2 has none
  const sessionData = makeSessionData({
    hitsByMeasure: { 1: [4, 5, 6, 7] }, // measure 2 empty
  });
  const missed = manager.calculateMissed(sessionData);

  assertEquals(missed.completelMissed, 1);
  assertEquals(missed.missedMeasures.includes(2), true);
});

Deno.test("PracticeSessionManager: calculateMissed detects partial misses", () => {
  const manager = createManager();
  // Measure 1: only 2 of 4 beats hit
  const sessionData = makeSessionData({
    hitsByMeasure: { 1: [4, 5] },
  });
  const missed = manager.calculateMissed(sessionData);

  assertEquals(missed.partialMissed, 1);
  assertEquals(missed.partialMeasures[0].measureIndex, 1);
});

Deno.test("PracticeSessionManager: calculateMissed returns all-attempted when all measures have hits", () => {
  const manager = createManager();
  const sessionData = makeSessionData({
    hitsByMeasure: {
      1: [4, 5, 6, 7],
      2: [8, 9, 10, 11],
    },
  });
  const missed = manager.calculateMissed(sessionData);

  assertEquals(missed.completelMissed, 0);
  assertEquals(missed.partialMissed, 0);
  assertEquals(missed.description, "All measures attempted");
});

// ---------------------------------------------------------------------------
// calculateCompletion
// ---------------------------------------------------------------------------

Deno.test("PracticeSessionManager: calculateCompletion returns 100% for completed session", () => {
  const manager = createManager();
  const sessionData = makeSessionData({ completed: true });
  const completion = manager.calculateCompletion(sessionData);

  assertEquals(completion.completed, true);
  assertEquals(completion.percentage, 100);
});

Deno.test("PracticeSessionManager: calculateCompletion marks incomplete session", () => {
  const manager = createManager();
  // Use a very short duration (0.3 s) relative to the plan length (3 measures × 0.5 s = 1.5 s)
  // so the percentage stays well below 100 even after clamping.
  const sessionData = makeSessionData({ completed: false, durationSeconds: 0.3 });
  const completion = manager.calculateCompletion(sessionData);

  assertEquals(completion.completed, false);
  assertEquals(completion.percentage < 100, true);
});

// ---------------------------------------------------------------------------
// _computeScoresFromHits uses Scorer.scoreFromErrorMs (no divergence)
// ---------------------------------------------------------------------------

Deno.test("PracticeSessionManager: _computeScoresFromHits uses canonical scoring", () => {
  const manager = createManager();
  const bpm = 120;
  const beatDuration = 60.0 / bpm;

  // Perfect hits in measure 1 (beats 4,5,6,7)
  const sessionData = makeSessionData({
    bpm,
    hitsByMeasure: { 1: [4, 5, 6, 7] },
  });

  // Compute via manager
  const [, score] = (manager as any)._computeScoresFromHits(sessionData);

  // Compute expected using canonical function (error=0 → 99)
  const expected = Scorer.scoreFromErrorMs(0 * beatDuration * 1000);
  assertEquals(score, expected);
});

Deno.test("PracticeSessionManager: _computeScoresFromHits skips click-in measures", () => {
  const manager = createManager();
  const sessionData = makeSessionData({ hitsByMeasure: {} });
  const scores = (manager as any)._computeScoresFromHits(sessionData);

  assertEquals(scores[0], null); // click-in
});

// ---------------------------------------------------------------------------
// getOverallStats
// ---------------------------------------------------------------------------

Deno.test("PracticeSessionManager: getOverallStats returns null when no sessions", () => {
  const manager = createManager();
  assertEquals(manager.getOverallStats(), null);
});

Deno.test("PracticeSessionManager: getOverallStats aggregates across sessions", () => {
  const manager = createManager();
  manager.saveSession(makeSessionData({ completed: true }));
  manager.saveSession(makeSessionData({ completed: false }));

  const stats = manager.getOverallStats();
  assertNotEquals(stats, null);
  assertEquals(stats!.totalSessions, 2);
  assertEquals(stats!.completedSessions, 1);
  assertEquals(stats!.completionRate, 50);
});
