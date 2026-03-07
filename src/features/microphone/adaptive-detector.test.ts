import { assertEquals } from "../base/assert.ts";
import SessionState from "../base/session-state.js";
import { DEFAULT_ADAPTIVE_PARAMS } from "./detector-params.js";
import AdaptiveDetector from "./adaptive-detector.js";
import {
  assertHits,
  deriveFixedSessionBpm,
  runDetectorLoop,
  setupAudioSource,
} from "./detector-test-harness.ts";

const adaptiveSetup = {
  toleranceMs: 50,
  rafHz: 120,
  analyser: {
    minDb: -90,
    maxDb: -30,
    fftSize: 1024,
  },
};

const fixtures = [
  {
    name: "mic-taps",
    wav: "mic-taps.wav",
    truth: "mic-taps.actual.json",
    sensitivity: 0.2,
  },
  {
    name: "finger-taps",
    wav: "finger-taps.wav",
    truth: "finger-taps.actual.json",
    sensitivity: 0.35,
  },
];

for (const fixture of fixtures) {
  Deno.test(
    `AdaptiveDetector: aligns with hand-labeled ${fixture.name}`,
    async () => {
      const { audioSource, expectedHits } = await setupAudioSource(
        fixture.wav,
        fixture.truth,
        adaptiveSetup.analyser,
      );

      const fixedBpm = deriveFixedSessionBpm(expectedHits);
      const sessionState = new SessionState();
      sessionState.setBPM(fixedBpm);
      assertEquals(sessionState.bpm, fixedBpm);

      const detector = new AdaptiveDetector(
        audioSource as never,
        {
          ...DEFAULT_ADAPTIVE_PARAMS,
          sensitivity: fixture.sensitivity,
          bpm: sessionState.bpm,
        } as never,
        {},
      );

      const hits = await runDetectorLoop({
        detector,
        audioSource,
        rafHz: adaptiveSetup.rafHz,
        startSeconds: 0,
        endSeconds: audioSource.durationSeconds,
      });

      assertHits({
        label: `AdaptiveDetector:${fixture.name}`,
        metadata: {
          fixedBpm,
          rafHz: adaptiveSetup.rafHz,
          sensitivity: fixture.sensitivity,
          runtimeAlignedParams: true,
        },
        hits,
        expectedHits,
        toleranceMs: adaptiveSetup.toleranceMs,
      });
    },
  );
}

Deno.test(
  "AdaptiveDetector: bypasses long-gap prominence before first hit",
  () => {
    let hitCount = 0;
    const detector = new AdaptiveDetector(
      { audioContext: { currentTime: 0 } } as never,
      { ...DEFAULT_ADAPTIVE_PARAMS, sensitivity: 0.5 } as never,
      {
        onHit: () => {
          hitCount += 1;
        },
      },
    );

    const internal = detector as any;
    internal._calculateAdaptiveThreshold = () => 1;
    internal._smoothedThreshold = 1;
    internal._warmupFramesRemaining = 0;
    internal._minHistoryFramesForDetection = 1;
    internal._isArmed = true;
    internal._previousFlux = 0;
    internal._hitsDetected = 0;
    internal._lastHitTime = 0;
    internal._lastDetectTime = 0;

    const frame = detector.processFeatureFrame(4.2, 0.2, {
      nowMs: 5000,
      maxAmplitude: 40,
      audioTimeSeconds: 5,
    });

    assertEquals(frame.hit, true);
    assertEquals(hitCount, 1);
  },
);

Deno.test("AdaptiveDetector: keeps long-gap prominence after first hit", () => {
  const detector = new AdaptiveDetector(
    { audioContext: { currentTime: 0 } } as never,
    { ...DEFAULT_ADAPTIVE_PARAMS, sensitivity: 0.5 } as never,
    {},
  );

  const internal = detector as any;
  internal._calculateAdaptiveThreshold = () => 1;
  internal._smoothedThreshold = 1;
  internal._warmupFramesRemaining = 0;
  internal._minHistoryFramesForDetection = 1;
  internal._isArmed = true;
  internal._previousFlux = 0;
  internal._hitsDetected = 1;
  internal._lastHitTime = 0;
  internal._lastDetectTime = 0;

  const frame = detector.processFeatureFrame(4.2, 0.2, {
    nowMs: 5000,
    maxAmplitude: 40,
    audioTimeSeconds: 5,
  });

  assertEquals(frame.hit, false);
});
