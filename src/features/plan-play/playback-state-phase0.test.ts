import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { PlaybackState } from "./playback-state.js";

Deno.test("PlaybackState: getSnapshot returns copy of current state", () => {
  const playback = new PlaybackState();
  playback.update({
    scores: [100, 90, 85],
    highlight: 2,
    overallScore: 91,
    status: "running",
    beat: { beatNum: 3, isDownbeat: false, shouldShow: true },
    isPlaying: true,
  });

  const snapshot = playback.getSnapshot();
  assertEquals(snapshot.scores.length, 3);
  assertEquals(snapshot.highlight, 2);
  assertEquals(snapshot.overallScore, 91);
  assertEquals(snapshot.status, "running");
  assertEquals(snapshot.isPlaying, true);

  // Verify it's a copy, not a reference
  snapshot.scores[0] = 0;
  snapshot.overallScore = 999;
  const snapshot2 = playback.getSnapshot();
  assertEquals(snapshot2.scores[0], 100); // Unchanged
  assertEquals(snapshot2.overallScore, 91); // Unchanged
});
