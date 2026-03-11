import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import SessionState from "./session-state.js";

Deno.test("SessionState: EventTarget event emission on state changes", () => {
  const state = new SessionState(120, 4);
  const events: CustomEvent[] = [];
  state.addEventListener("changed", (ev) => {
    if (ev instanceof CustomEvent) events.push(ev);
  });

  state.setBPM(140);
  assertEquals(events.length, 1);
  assertEquals(events[0].detail.field, "bpm");
  assertEquals(events[0].detail.value, 140);

  events.length = 0;
  state.setBeatsPerMeasure(3);
  assertEquals(events.length, 1);
  assertEquals(events[0].detail.field, "beatsPerMeasure");
  assertEquals(events[0].detail.value, 3);
});

Deno.test("SessionState: backward-compatible subscribe() still works", () => {
  const state = new SessionState(120, 4);
  const received: { bpm?: number; beatsPerMeasure?: number } = {};

  const unsub = state.subscribe({
    onBPMChange: (bpm) => {
      received.bpm = bpm;
    },
    onBeatsPerMeasureChange: (n) => {
      received.beatsPerMeasure = n;
    },
  });

  state.setBPM(150);
  assertEquals(received.bpm, 150);

  state.setBeatsPerMeasure(5);
  assertEquals(received.beatsPerMeasure, 5);

  // Verify both events and callbacks are emitted
  const events: unknown[] = [];
  state.addEventListener("changed", () => events.push(null));

  state.setBPM(160);
  assertEquals(received.bpm, 160);
  assertEquals(events.length, 3); // Already 1 from above, +2 more

  unsub();
  state.setBPM(170);
  assertEquals(received.bpm, 160); // Unchanged after unsub
});

Deno.test("SessionState: readonly properties match setters", () => {
  const state = new SessionState(100, 2);

  assertEquals(state.bpm, 100);
  assertEquals(state.beatsPerMeasure, 2);
  assertEquals(state.plan, null);

  state.setBPM(200);
  state.setBeatsPerMeasure(8);
  state.setPlan({ measures: [1, 2, 3] });

  assertEquals(state.bpm, 200);
  assertEquals(state.beatsPerMeasure, 8);
  assertEquals(state.plan.measures.length, 3);
});
