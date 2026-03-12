import { assertEquals } from "../base/assert.ts";
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
      assertEquals(fixedBpm > 0, true);

      const detector = new AdaptiveDetector(
        audioSource as never,
        {
          ...DEFAULT_ADAPTIVE_PARAMS,
          sensitivity: fixture.sensitivity,
          bpm: fixedBpm,
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

Deno.test(
  "AdaptiveDetector: higher sensitivity has easier re-arm profile",
  () => {
    const highSensitivity = new AdaptiveDetector(
      { audioContext: { currentTime: 0 } } as never,
      { ...DEFAULT_ADAPTIVE_PARAMS, sensitivity: 1.0 } as never,
      {},
    );

    const lowSensitivity = new AdaptiveDetector(
      { audioContext: { currentTime: 0 } } as never,
      { ...DEFAULT_ADAPTIVE_PARAMS, sensitivity: 0.0 } as never,
      {},
    );

    assertEquals(
      (highSensitivity as any)._fluxResetFactor >
        (lowSensitivity as any)._fluxResetFactor,
      true,
    );
  },
);

Deno.test(
  "AdaptiveDetector: higher sensitivity should not be harder for same frame",
  () => {
    const highSensitivity = new AdaptiveDetector(
      { audioContext: { currentTime: 0 } } as never,
      { ...DEFAULT_ADAPTIVE_PARAMS, sensitivity: 1.0 } as never,
      {},
    );

    const lowSensitivity = new AdaptiveDetector(
      { audioContext: { currentTime: 0 } } as never,
      { ...DEFAULT_ADAPTIVE_PARAMS, sensitivity: 0.0 } as never,
      {},
    );

    const highInternal = highSensitivity as any;
    highInternal._calculateAdaptiveThreshold = () => 4;
    highInternal._smoothedThreshold = 4;
    highInternal._warmupFramesRemaining = 0;
    highInternal._minHistoryFramesForDetection = 1;
    highInternal._isArmed = true;
    highInternal._previousFlux = 4.2;
    highInternal._hitsDetected = 0;
    highInternal._lastHitTime = 0;
    highInternal._lastDetectTime = 0;

    const lowInternal = lowSensitivity as any;
    lowInternal._calculateAdaptiveThreshold = () => 4;
    lowInternal._smoothedThreshold = 4;
    lowInternal._warmupFramesRemaining = 0;
    lowInternal._minHistoryFramesForDetection = 1;
    lowInternal._isArmed = true;
    lowInternal._previousFlux = 4.2;
    lowInternal._hitsDetected = 0;
    lowInternal._lastHitTime = 0;
    lowInternal._lastDetectTime = 0;

    const highFrame = highSensitivity.processFeatureFrame(4.8, 0.2, {
      nowMs: 5000,
      maxAmplitude: 40,
      audioTimeSeconds: 5,
    });

    const lowFrame = lowSensitivity.processFeatureFrame(4.8, 0.2, {
      nowMs: 5000,
      maxAmplitude: 40,
      audioTimeSeconds: 5,
    });

    assertEquals(highFrame.hit, true);
    assertEquals(lowFrame.hit, false);
  },
);
