import ThresholdDetector from "./threshold-detector.js";
import { DEFAULT_THRESHOLD_PARAMS } from "./detector-params.js";
import {
  assertHits,
  runDetectorLoop,
  setupAudioSource,
} from "./detector-test-harness.ts";

const thresholdSetup = {
  toleranceMs: 40,
  rafHz: 120,
  analyser: {
    fftSize: 256,
    minDb: -90,
    maxDb: -30,
  },
};

const fixtures = [
  {
    name: "mic-taps",
    wav: "mic-taps.wav",
    truth: "mic-taps.actual.json",
    sensitivity: 0.594,
  },
  {
    name: "finger-taps",
    wav: "finger-taps.wav",
    truth: "finger-taps.actual.json",
    sensitivity: 0.7,
  },
];

for (const fixture of fixtures) {
  Deno.test(
    `ThresholdDetector: matches hand-labeled ${fixture.name}`,
    async () => {
      const { audioSource, expectedHits } = await setupAudioSource(
        fixture.wav,
        fixture.truth,
        thresholdSetup.analyser,
      );

      const detector = new ThresholdDetector(
        audioSource as never,
        {
          ...DEFAULT_THRESHOLD_PARAMS,
          sensitivity: fixture.sensitivity,
        } as never,
        {},
      );

      const hits = await runDetectorLoop({
        detector,
        audioSource,
        rafHz: thresholdSetup.rafHz,
        startSeconds: 0,
        endSeconds: audioSource.durationSeconds,
      });

      assertHits({
        label: `ThresholdDetector:${fixture.name}`,
        metadata: {
          rafHz: thresholdSetup.rafHz,
          sensitivity: fixture.sensitivity,
          runtimeAlignedParams: true,
        },
        hits,
        expectedHits,
        toleranceMs: thresholdSetup.toleranceMs,
      });
    },
  );
}
