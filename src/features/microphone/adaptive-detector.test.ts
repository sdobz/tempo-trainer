import { assertEquals } from "../base/assert.ts";
import SessionState from "../base/session-state.js";
import AdaptiveDetector from "./adaptive-detector.js";
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
const MATCH_TOLERANCE_MS = 50;
const RAF_HZ = 120;

function deriveFixedSessionBpm(expectedHits: number[]) {
  const intervals = expectedHits
    .slice(1)
    .map((time, index) => time - expectedHits[index]);
  const beatLikeIntervals = intervals.filter(
    (delta) => delta > 0 && delta < 0.8,
  );
  const source = beatLikeIntervals.length > 0 ? beatLikeIntervals : intervals;
  const sorted = [...source].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianIntervalSeconds =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  if (!Number.isFinite(medianIntervalSeconds) || medianIntervalSeconds <= 0) {
    return 120;
  }

  return Math.round(60 / medianIntervalSeconds);
}

Deno.test("AdaptiveDetector: aligns with hand-labeled mic taps", async () => {
  const expectedTaps = (await loadJson(TRUTH_URL)) as number[];
  const fixedBpm = deriveFixedSessionBpm(expectedTaps);
  const sessionState = new SessionState();
  sessionState.setBPM(fixedBpm);

  assertEquals(sessionState.bpm, 120);

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
      bpm: sessionState.bpm,
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

  assertHits({
    label: "AdaptiveDetector",
    metadata: { fixedBpm, rafHz: RAF_HZ },
    hits,
    expectedHits: expectedTaps,
    toleranceMs: MATCH_TOLERANCE_MS,
  });
});
