import { assertEquals, assert } from "../base/assert.ts";
import AdaptiveDetector from "./adaptive-detector.js";
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
const MATCH_TOLERANCE_MS = 50;
const RAF_HZ = 120;

Deno.test("AdaptiveDetector: aligns with hand-labeled mic taps", async () => {
  const expectedTaps = (await loadJson(TRUTH_URL)) as number[];

  const audioSource = await createMockAudioSourceFromWav(WAV_URL, {
    minDb: -90,
    maxDb: -30,
    fftSize: 1024,
  });

  const detector = new AdaptiveDetector(
    audioSource as never,
    {
      sensitivity: 0.2,
      historyWindowSize: 120,
      entropyThreshold: 0.99,
      bpm: 40,
    } as never,
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
  });

  assertEquals(comparison.countsMatch, true);
  assert(comparison.allWithinTolerance);
});
