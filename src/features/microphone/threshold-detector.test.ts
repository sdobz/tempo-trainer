import ThresholdDetector from "./threshold-detector.js";
import {
  assertHits,
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
const MATCH_TOLERANCE_MS = 40;
const RAF_HZ = 120;

Deno.test("ThresholdDetector: matches hand-labeled mic taps", async () => {
  const expectedTaps = (await loadJson(TRUTH_URL)) as number[];

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

  assertHits({
    label: "ThresholdDetector",
    metadata: { rafHz: RAF_HZ },
    hits,
    expectedHits: expectedTaps,
    toleranceMs: MATCH_TOLERANCE_MS,
  });
});
