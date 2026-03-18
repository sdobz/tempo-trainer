/// <reference lib="dom" />
import "../component/setup-dom.ts";
import { assertEquals, assertTrue } from "../base/assert.ts";

const { default: HistorySessionItem } = await import(
  "./history-session-item.js"
);

async function createItem(): Promise<any> {
  const element = document.createElement("history-session-item");
  await (element as any).componentReady;
  return element;
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    bpm: 120,
    overallScore: 85,
    completed: true,
    timestamp: "2026-03-03T12:00:00.000Z",
    durationSeconds: 90,
    plan: {
      id: "plan-1",
      name: "Core Groove",
      difficulty: "Beginner",
      segments: [{ on: 1, off: 1, reps: 2 }],
    },
    metrics: {
      drift: {
        description: "Stable",
        severity: "low",
        direction: "ahead",
        avgErrorBeats: 0.02,
      },
      missed: { description: "Accurate", completelMissed: 0, partialMissed: 0 },
      rhythm: { consistency: "consistent" },
      consistency: { stdDeviation: 3, consistency: "consistent", range: 6 },
      completion: { completed: true, percentage: 100 },
    },
    measureScores: [80, 85, 90, 88],
    ...overrides,
  };
}

Deno.test("HistorySessionItem: registers as custom element", () => {
  const el = customElements.get("history-session-item");
  assertEquals(el !== undefined, true);
});

Deno.test(
  "HistorySessionItem: renders score and plan name when session set",
  async () => {
    const item = await createItem();
    item._setSession(makeSession());

    const score = item.querySelector("[data-score]");
    const planName = item.querySelector("[data-plan-name]");
    assertEquals(score.textContent, "85");
    assertEquals(planName.textContent, "Core Groove");
  },
);

Deno.test("HistorySessionItem: shows completed status", async () => {
  const item = await createItem();
  item._setSession(makeSession({ completed: true }));
  const status = item.querySelector("[data-status]");
  assertTrue(status.textContent.includes("Completed"));
});

Deno.test("HistorySessionItem: shows stopped status for incomplete", async () => {
  const item = await createItem();
  item._setSession(makeSession({ completed: false }));
  const status = item.querySelector("[data-status]");
  assertTrue(status.textContent.includes("Stopped"));
});

Deno.test("HistorySessionItem: not expanded by default", async () => {
  const item = await createItem();
  item._setSession(makeSession());
  const inner = item.querySelector("[data-session-inner]");
  assertEquals(inner.classList.contains("expanded"), false);
});

Deno.test("HistorySessionItem: setExpanded(true) adds expanded class", async () => {
  const item = await createItem();
  item._setSession(makeSession());
  item.setExpanded(true);
  const inner = item.querySelector("[data-session-inner]");
  assertEquals(inner.classList.contains("expanded"), true);
});

Deno.test(
  "HistorySessionItem: setExpanded(false) removes expanded class",
  async () => {
    const item = await createItem();
    item._setSession(makeSession());
    item.setExpanded(true);
    item.setExpanded(false);
    const inner = item.querySelector("[data-session-inner]");
    assertEquals(inner.classList.contains("expanded"), false);
  },
);

Deno.test("HistorySessionItem: emits item-toggle on header click", async () => {
  const item = await createItem();
  item._setSession(makeSession({ id: "test-session" }));

  let fired = false;
  let detail: any = null;
  item.addEventListener("item-toggle", (e: CustomEvent) => {
    fired = true;
    detail = e.detail;
  });

  const header = item.querySelector("[data-header]") as HTMLElement;
  header.click();

  assertEquals(fired, true);
  assertEquals(detail.sessionId, "test-session");
});

Deno.test("HistorySessionItem: emits retry-chart on retry button click", async () => {
  const item = await createItem();
  item._setSession(makeSession());

  let fired = false;
  let detail: any = null;
  item.addEventListener("retry-chart", (e: CustomEvent) => {
    fired = true;
    detail = e.detail;
  });

  const btn = item.querySelector("[data-retry]") as HTMLButtonElement;
  btn.click();

  assertEquals(fired, true);
  assertEquals(detail.chart.name, "Core Groove");
});

Deno.test(
  "HistorySessionItem: emits navigate on select-plan button click",
  async () => {
    const item = await createItem();
    item._setSession(makeSession());

    let fired = false;
    let detail: any = null;
    item.addEventListener("navigate", (e: CustomEvent) => {
      fired = true;
      detail = e.detail;
    });

    const btn = item.querySelector("[data-select-plan]") as HTMLButtonElement;
    btn.click();

    assertEquals(fired, true);
    assertEquals(detail.pane, "plan-edit");
  },
);

Deno.test(
  "HistorySessionItem: emits delete-session on delete button click",
  async () => {
    const item = await createItem();
    item._setSession(makeSession({ id: "del-session" }));

    let fired = false;
    let detail: any = null;
    item.addEventListener("delete-session", (e: CustomEvent) => {
      fired = true;
      detail = e.detail;
    });

    const btn = item.querySelector("[data-delete]") as HTMLButtonElement;
    btn.click();

    assertEquals(fired, true);
    assertEquals(detail.sessionId, "del-session");
  },
);

Deno.test(
  "HistorySessionItem: renders metrics section in dynamic content",
  async () => {
    const item = await createItem();
    item._setSession(makeSession());

    const content = item.querySelector("[data-dynamic-content]");
    assertTrue(content.textContent.includes("Metrics"));
    assertTrue(content.textContent.includes("Tempo Control"));
  },
);

Deno.test(
  "HistorySessionItem: sets data-session-id on inner container",
  async () => {
    const item = await createItem();
    item._setSession(makeSession({ id: "find-me" }));
    const inner = item.querySelector('[data-session-id="find-me"]');
    assertTrue(Boolean(inner));
  },
);
