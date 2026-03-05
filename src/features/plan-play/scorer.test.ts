/// <reference lib="dom" />
import { assertEquals, assertNotEquals } from "../base/assert.ts";

const { default: Scorer } = await import("./scorer.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a simple drill plan: one click-in followed by N click measures. */
function makePlan(clickMeasures: number) {
  return [
    { type: "click-in" },
    ...Array.from({ length: clickMeasures }, () => ({ type: "click" })),
  ];
}

function createScorer(beatsPerMeasure = 4, bpm = 120) {
  const beatDuration = 60.0 / bpm;
  return new Scorer(beatsPerMeasure, beatDuration);
}

// ---------------------------------------------------------------------------
// Static scoreFromErrorMs
// ---------------------------------------------------------------------------

Deno.test("Scorer.scoreFromErrorMs: perfect hit returns 99", () => {
  assertEquals(Scorer.scoreFromErrorMs(0), 99);
});

Deno.test("Scorer.scoreFromErrorMs: error within bestFeasibleErrorMs returns 99", () => {
  assertEquals(Scorer.scoreFromErrorMs(17), 99);
});

Deno.test("Scorer.scoreFromErrorMs: error at maxScorableErrorMs returns 0", () => {
  assertEquals(Scorer.scoreFromErrorMs(220), 0);
});

Deno.test("Scorer.scoreFromErrorMs: error above maxScorableErrorMs returns 0", () => {
  assertEquals(Scorer.scoreFromErrorMs(300), 0);
});

Deno.test("Scorer.scoreFromErrorMs: mid-range error returns value between 1 and 98", () => {
  const score = Scorer.scoreFromErrorMs(100);
  assertEquals(score >= 1 && score <= 98, true, `score: ${score}`);
});

Deno.test("Scorer.scoreFromErrorMs: higher error yields lower score", () => {
  const score50 = Scorer.scoreFromErrorMs(50);
  const score150 = Scorer.scoreFromErrorMs(150);
  assertEquals(score50 > score150, true, `${score50} should be > ${score150}`);
});

Deno.test("Scorer.scoreFromErrorMs: accepts custom thresholds", () => {
  // With bestFeasibleErrorMs=0 and maxScorableErrorMs=100, error=0 should be 99
  assertEquals(Scorer.scoreFromErrorMs(0, 0, 100), 99);
  // And error=100 should be 0
  assertEquals(Scorer.scoreFromErrorMs(100, 0, 100), 0);
});

// ---------------------------------------------------------------------------
// setDrillPlan / reset (decoupled)
// ---------------------------------------------------------------------------

Deno.test("Scorer: setDrillPlan does NOT reset scores", () => {
  const scorer = createScorer();
  scorer.setDrillPlan(makePlan(2));
  scorer.reset();

  // Register a hit in measure 1, finalize it
  const bpm = 120;
  const beatDuration = 60.0 / bpm;
  scorer.registerHit(4.0); // measure 1, beat 0 (exactish)
  scorer.finalizeMeasure(1);
  const scoreBefore = scorer.getMeasureScore(1);
  assertNotEquals(scoreBefore, null);

  // setDrillPlan with the same plan − scores should NOT be reset
  scorer.setDrillPlan(makePlan(2));
  assertEquals(scorer.getMeasureScore(1), scoreBefore);
});

Deno.test("Scorer: reset() clears all scores and hits", () => {
  const scorer = createScorer();
  scorer.setDrillPlan(makePlan(2));
  scorer.reset();

  scorer.registerHit(4.0);
  scorer.finalizeMeasure(1);
  assertNotEquals(scorer.getMeasureScore(1), null);

  scorer.reset();
  // After reset, score for click-in (index 0) stays null; click measures reset to 0
  assertEquals(scorer.getMeasureScore(0), null);
  assertEquals(scorer.getMeasureScore(1), 0);
});

// ---------------------------------------------------------------------------
// registerHit
// ---------------------------------------------------------------------------

Deno.test("Scorer: registerHit routes hit to correct measure", () => {
  const scorer = createScorer(4, 120);
  const plan = makePlan(4); // indices 0=click-in, 1–4=click
  scorer.setDrillPlan(plan);
  scorer.reset();

  // Beat 4.0 is the start of measure index 1 (beat 0 of second measure)
  const index = scorer.registerHit(4.0);
  assertEquals(index, 1);
});

Deno.test("Scorer: registerHit returns -1 for hit outside assignment window", () => {
  const scorer = createScorer(4, 120);
  scorer.setDrillPlan(makePlan(2));
  scorer.reset();

  // Beat 100 is far past any measure
  const index = scorer.registerHit(100.0);
  assertEquals(index, -1);
});

Deno.test("Scorer: registerHit ignores click-in measures", () => {
  const scorer = createScorer(4, 120);
  scorer.setDrillPlan(makePlan(2));
  scorer.reset();

  // Beat 0.0 would be in the click-in measure — should not be accepted
  const index = scorer.registerHit(0.0);
  assertEquals(index, -1);
});

// ---------------------------------------------------------------------------
// finalizeMeasure
// ---------------------------------------------------------------------------

Deno.test("Scorer: finalizeMeasure with no hits scores 0", () => {
  const scorer = createScorer(4);
  scorer.setDrillPlan(makePlan(1));
  scorer.reset();

  scorer.finalizeMeasure(1);
  assertEquals(scorer.getMeasureScore(1), 0);
});

Deno.test("Scorer: finalizeMeasure with perfect hits scores 99", () => {
  const scorer = createScorer(4, 120);
  scorer.setDrillPlan(makePlan(1));
  scorer.reset();

  // Measure 1 starts at beat 4 (after click-in), with 4 expected beats: 4,5,6,7
  scorer.registerHit(4.0);
  scorer.registerHit(5.0);
  scorer.registerHit(6.0);
  scorer.registerHit(7.0);
  scorer.finalizeMeasure(1);

  assertEquals(scorer.getMeasureScore(1), 99);
});

Deno.test("Scorer: finalizeMeasure sets click-in score to null", () => {
  const scorer = createScorer(4);
  scorer.setDrillPlan(makePlan(2));
  scorer.reset();

  scorer.finalizeMeasure(0); // click-in
  assertEquals(scorer.getMeasureScore(0), null);
});

Deno.test("Scorer: finalizeMeasure is idempotent (can be called twice safely)", () => {
  const scorer = createScorer(4, 120);
  scorer.setDrillPlan(makePlan(1));
  scorer.reset();

  scorer.registerHit(4.0);
  scorer.registerHit(5.0);
  scorer.registerHit(6.0);
  scorer.registerHit(7.0);
  scorer.finalizeMeasure(1);
  const firstScore = scorer.getMeasureScore(1);

  // Second call should not change the score
  scorer.finalizeMeasure(1);
  assertEquals(scorer.getMeasureScore(1), firstScore);
});

// ---------------------------------------------------------------------------
// getOverallScore
// ---------------------------------------------------------------------------

Deno.test("Scorer: getOverallScore returns 0 when no plan", () => {
  const scorer = createScorer();
  assertEquals(scorer.getOverallScore(), 0);
});

Deno.test("Scorer: getOverallScore excludes click-in measures", () => {
  const scorer = createScorer(4, 120);
  scorer.setDrillPlan(makePlan(2)); // 1 click-in + 2 click
  scorer.reset();

  // Finalize both click measures with perfect hits
  for (let m = 1; m <= 2; m++) {
    for (let b = 0; b < 4; b++) scorer.registerHit(m * 4 + b);
    scorer.finalizeMeasure(m);
  }

  const overall = scorer.getOverallScore();
  assertEquals(overall, 99);
});

Deno.test("Scorer: getOverallScore is average of non-click-in measure scores", () => {
  const scorer = createScorer(4, 120);
  scorer.setDrillPlan(makePlan(2)); // indices 0=click-in, 1=click, 2=click
  scorer.reset();

  // Measure 1: perfect hits → 99
  for (let b = 0; b < 4; b++) scorer.registerHit(4 + b);
  scorer.finalizeMeasure(1);

  // Measure 2: no hits → 0
  scorer.finalizeMeasure(2);

  const overall = scorer.getOverallScore();
  // Should be average of 99 and 0 ≈ 49 or 50
  assertEquals(overall >= 48 && overall <= 51, true, `overall: ${overall}`);
});

// ---------------------------------------------------------------------------
// getAllScores
// ---------------------------------------------------------------------------

Deno.test("Scorer: getAllScores length matches plan length", () => {
  const scorer = createScorer();
  const plan = makePlan(3);
  scorer.setDrillPlan(plan);
  scorer.reset();

  assertEquals(scorer.getAllScores().length, plan.length);
});
