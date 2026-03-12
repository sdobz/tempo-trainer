import { assertEquals } from "../base/assert.ts";
import CalibrationOrchestrator from "./calibration-orchestrator.js";

class MockTimelineService extends EventTarget {
  beatsPerMeasure = 4;
  beatDuration = 0.5;
  playCalls = 0;
  stopCalls = 0;
  seekCalls: number[] = [];

  play() {
    this.playCalls++;
  }

  stop() {
    this.stopCalls++;
  }

  seekToDivision(n: number) {
    this.seekCalls.push(n);
  }
}

Deno.test(
  "CalibrationOrchestrator: enter and leave onboarding lifecycle",
  async () => {
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCancel = globalThis.cancelAnimationFrame;
    const originalAlert = globalThis.alert;

    let rafId = 0;
    globalThis.requestAnimationFrame = () => ++rafId;
    globalThis.cancelAnimationFrame = () => {};
    globalThis.alert = () => {};

    try {
      const calibrationTimeline = {
        componentReady: Promise.resolve(),
        isConnected: true,
        clearDetections() {},
        setBeatsPerMeasure(_n: number) {},
        setDisplayStartBeat(_n: number) {},
        setDrillPlan(_plan: any[]) {},
        centerAt(_n: number) {},
        addDetection(_n: number) {},
        flashNowLine() {},
      };

      const calibration = {
        isCalibrating: false,
        registerExpectedBeat(_time: number) {},
        registerHit(_time: number) {},
        getCalibratedBeatPosition(
          hit: number,
          runStart: number,
          beatDuration: number,
        ) {
          return Math.max(0, (hit - runStart) / beatDuration);
        },
      };

      const onboardingPane = new EventTarget() as any;
      onboardingPane.componentReady = Promise.resolve();
      onboardingPane.calibration = calibration;
      onboardingPane.calibrationControl = {
        querySelector: () => calibrationTimeline,
      };
      onboardingPane.querySelector = () => calibrationTimeline;
      onboardingPane.refreshSetupStatus = () => {};

      const timelineService = new MockTimelineService();
      const playbackService = {
        renderClick(_time: number, _opts: any) {},
      };

      let detectorRunning = false;
      let detectorStarts = 0;
      let detectorStops = 0;

      const detectorManager = {
        get isRunning() {
          return detectorRunning;
        },
        async start() {
          detectorRunning = true;
          detectorStarts++;
        },
        stop() {
          detectorRunning = false;
          detectorStops++;
        },
        addHitListener(_listener: (hitAudioTime: number) => void) {
          return () => {};
        },
      };

      const audioContextService = {
        getContext() {
          return { currentTime: 1 } as AudioContext;
        },
      };

      const orchestrator = new CalibrationOrchestrator({
        onboardingPane,
        planTimeline: null,
        timelineService: timelineService as any,
        playbackService: playbackService as any,
        audioContextService,
        detectorManager: detectorManager as any,
      });

      const entered = await orchestrator.enterOnboarding();
      assertEquals(entered, true);
      assertEquals(detectorStarts, 1);

      orchestrator.leaveOnboarding({ stopDetector: true });
      assertEquals(detectorStops, 1);

      orchestrator.dispose();
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
      globalThis.cancelAnimationFrame = originalCancel;
      globalThis.alert = originalAlert;
    }
  },
);
