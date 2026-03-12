import { assertEquals } from "../base/assert.ts";
import SessionManager from "./session-manager.js";

Deno.test(
  "SessionManager: attach wires session-start/session-stop",
  async () => {
    const originalAlert = globalThis.alert;
    globalThis.alert = () => {};

    try {
      const playbackStateUpdates: any[] = [];

      const planPlayPane = new EventTarget() as any;
      planPlayPane.playbackState = {
        update(next: unknown) {
          playbackStateUpdates.push(next);
        },
      };

      const scorer = {
        reset() {},
        setBeatsPerMeasure(_n: number) {},
        setBeatDuration(_n: number) {},
        finalizeMeasure(_n: number) {},
        getOverallScore() {
          return 0;
        },
        getAllScores() {
          return [];
        },
        measureHits: [],
        lateHitAssignmentWindowBeats: 0.65,
        registerHit(_n: number) {},
      };

      const manager = new SessionManager(
        { renderClick(_time: number, _opts: any) {} } as any,
        scorer as any,
        {
          onHit(_cb: (hitAudioTime: number) => void) {},
          isRunning: true,
        } as any,
        {
          getSelectedChart() {
            return null;
          },
          addEventListener(_type: string, _cb: EventListener) {},
        } as any,
        planPlayPane.playbackState,
        {
          tempo: 120,
          beatsPerMeasure: 4,
          beatDuration: 0.5,
          transportState: "stopped",
          addEventListener(_type: string, _cb: EventListener) {},
          removeEventListener(_type: string, _cb: EventListener) {},
          seekToDivision(_n: number) {},
          play() {},
          stop() {},
        } as any,
      );

      let started = 0;
      let stopped = 0;

      manager.startSession = async (_audioContext: AudioContext) => {
        started++;
      };
      manager.stopSession = () => {
        stopped++;
      };

      manager.attach(planPlayPane, {
        audioContextService: {
          getContext() {
            return { currentTime: 0 } as AudioContext;
          },
        },
      });

      planPlayPane.dispatchEvent(new CustomEvent("session-start"));
      await Promise.resolve();
      planPlayPane.dispatchEvent(new CustomEvent("session-stop"));

      assertEquals(started, 1);
      assertEquals(stopped, 1);
      assertEquals(
        playbackStateUpdates.some((u) => (u as any).isPlaying === true),
        true,
      );
      assertEquals(
        playbackStateUpdates.some((u) => (u as any).isPlaying === false),
        true,
      );

      manager.detach();
    } finally {
      globalThis.alert = originalAlert;
    }
  },
);
