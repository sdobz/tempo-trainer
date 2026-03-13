import { assertEquals } from "../base/assert.ts";
import { createEffect, createSignal } from "./signal.js";

Deno.test("signal: effect runs immediately", () => {
  const [count] = createSignal(2);
  let seen = 0;

  const dispose = createEffect(() => {
    seen = count();
  });

  assertEquals(seen, 2);
  dispose();
});

Deno.test("signal: effect re-runs when signal changes", () => {
  const [count, setCount] = createSignal(0);
  const seen: number[] = [];

  const dispose = createEffect(() => {
    seen.push(count());
  });

  setCount(1);
  setCount(3);

  assertEquals(seen, [0, 1, 3]);
  dispose();
});

Deno.test("signal: set same value does not re-run effect", () => {
  const [count, setCount] = createSignal(4);
  let runs = 0;

  const dispose = createEffect(() => {
    count();
    runs += 1;
  });

  setCount(4);

  assertEquals(runs, 1);
  dispose();
});

Deno.test("signal: dispose stops future reactivity", () => {
  const [count, setCount] = createSignal(1);
  let runs = 0;

  const dispose = createEffect(() => {
    count();
    runs += 1;
  });

  dispose();
  setCount(2);

  assertEquals(runs, 1);
});

Deno.test("signal: cleanup runs on re-run and dispose", () => {
  const [count, setCount] = createSignal(0);
  let cleanups = 0;

  const dispose = createEffect(() => {
    count();
    return () => {
      cleanups += 1;
    };
  });

  setCount(1);
  dispose();

  assertEquals(cleanups, 2);
});
