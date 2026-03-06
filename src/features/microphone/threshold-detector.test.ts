import { assertEquals, assert } from "../base/assert.ts";
import ThresholdDetector from "./threshold-detector.js";
import {
  compareHits,
  createMockAudioSourceFromWav,
  runDetectorLoop,
} from "./detector-test-harness.ts";

async function loadJson(relativePath: string) {
  const url = new URL(relativePath, import.meta.url);
  const text = await Deno.readTextFile(url);
  return JSON.parse(text);
}

const WAV_URL = new URL("./__samples__/mic-taps.wav", import.meta.url);
const TRUTH_URL = "./__samples__/mic-taps.actual.json";
const WARMUP_SECONDS = 3.0;
const MATCH_TOLERANCE_MS = 40;
const START_MARGIN_SECONDS = 0.2;
const END_MARGIN_SECONDS = 0.2;
const RAF_HZ = 120;

Deno.test("ThresholdDetector: matches hand-labeled mic taps", async () => {
  const expectedTaps = (await loadJson(TRUTH_URL)) as number[];
  const expectedStart = expectedTaps[0] - START_MARGIN_SECONDS;
  const expectedEnd =
    expectedTaps[expectedTaps.length - 1] + END_MARGIN_SECONDS;

  const audioSource = await createMockAudioSourceFromWav(WAV_URL, {
    fftSize: 256,
    minDb: -90,
    maxDb: -30,
  });

  const detector = new ThresholdDetector(
    audioSource as never,
    { sensitivity: 0.594 } as never,
    {},
  );

  const hits = await runDetectorLoop({
    detector,
    audioSource,
    rafHz: RAF_HZ,
    startSeconds: 0,
    endSeconds: audioSource.durationSeconds,
  });

  const comparison = compareHits(hits, expectedTaps, {
    toleranceMs: MATCH_TOLERANCE_MS,
    warmupSeconds: WARMUP_SECONDS,
    startSeconds: expectedStart,
    endSeconds: expectedEnd,
  });

  assertEquals(comparison.matched, expectedTaps.length);
  assertEquals(comparison.falseNegatives, 0);
  assertEquals(comparison.falsePositives, 0);
  assert(comparison.recall >= 1);
  assert(comparison.precision >= 1);
});
