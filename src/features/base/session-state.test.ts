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

Deno.test("SessionState: emits changed events for each timing mutation", () => {
  const state = new SessionState(120, 4);
  const events: Array<{ field: string; value: number }> = [];

  state.addEventListener("changed", (event) => {
    if (event instanceof CustomEvent) {
      events.push(event.detail as { field: string; value: number });
    }
  });

  state.setBPM(150);
  state.setBeatsPerMeasure(5);

  assertEquals(events.length, 2);
  assertEquals(events[0].field, "bpm");
  assertEquals(events[0].value, 150);
  assertEquals(events[1].field, "beatsPerMeasure");
  assertEquals(events[1].value, 5);
});

Deno.test("SessionState: readonly properties match setters", () => {
  const state = new SessionState(100, 2);

  assertEquals(state.bpm, 100);
  assertEquals(state.beatsPerMeasure, 2);

  state.setBPM(200);
  state.setBeatsPerMeasure(8);

  assertEquals(state.bpm, 200);
  assertEquals(state.beatsPerMeasure, 8);
});
