/// <reference lib="dom" />
import "../component/setup-dom.ts";
import { assertEquals, assertTrue } from "../base/assert.ts";

const { default: PlanHistoryPane } = await import("./plan-history-pane.js");

async function createComponent(): Promise<any> {
  const element = document.createElement("plan-history-pane");
  await (element as any).componentReady;
  return element;
}

async function waitAll(component: HTMLElement) {
  const items = Array.from(component.querySelectorAll("history-session-item"));
  await Promise.all(items.map((v: any) => v.componentReady));
  const vizs = Array.from(component.querySelectorAll("plan-visualizer"));
  await Promise.all(vizs.map((v: any) => v.componentReady));
}

function createSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    bpm: 120,
    overallScore: 87,
    completed: true,
    timestamp: "2026-03-03T12:00:00.000Z",
    durationSeconds: 95,
    plan: {
      id: "plan-1",
      name: "Core Groove",
      description: "Test plan",
      difficulty: "Beginner",
      segments: [{ on: 1, off: 1, reps: 2 }],
    },
    metrics: {
      drift: {
        description: "Stable",
        severity: "low",
        direction: "ahead",
        avgErrorBeats: 0.03,
      },
      missed: {
        description: "Accurate",
        completelMissed: 0,
        partialMissed: 0,
      },
      rhythm: {
        consistency: "consistent",
      },
      consistency: {
        stdDeviation: 4,
        consistency: "consistent",
        range: 8,
      },
      completion: {
        completed: true,
        percentage: 100,
      },
    },
    measureScores: [82, 84, 88, 90],
    ...overrides,
  };
}

Deno.test("PlanHistoryPane: initializes default state", async () => {
  const component = await createComponent();
  assertEquals(component._getExpandedSessionId(), null);
  assertEquals(Array.isArray(component.sessions), true);
  assertEquals(component.sessions.length, 0);
});

Deno.test(
  "PlanHistoryPane: displays empty state when no sessions",
  async () => {
    const component = await createComponent();
    component.displaySessions([]);

    const empty = component.querySelector(".empty-history");
    assertTrue(Boolean(empty));
  },
);

Deno.test(
  "PlanHistoryPane: renders sessions and expands first by default",
  async () => {
    const component = await createComponent();
    const sessions = [createSession(), createSession({ id: "session-2" })];

    component.displaySessions(sessions as any);
    await waitAll(component);

    const items = component.querySelectorAll(".history-session");
    assertEquals(items.length, 2);
    assertEquals(items[0].classList.contains("expanded"), true);
    assertEquals(items[1].classList.contains("expanded"), false);
  },
);

Deno.test("PlanHistoryPane: expands provided session id", async () => {
  const component = await createComponent();
  const sessions = [createSession(), createSession({ id: "session-2" })];

  component.displaySessions(sessions as any, "session-2");
  await waitAll(component);

  const second = component.querySelector(
    '.history-session[data-session-id="session-2"]',
  );
  assertTrue(Boolean(second));
  assertEquals((second as HTMLElement).classList.contains("expanded"), true);
  assertEquals(component._getExpandedSessionId(), "session-2");
});

Deno.test(
  "PlanHistoryPane: toggles expanded session on item-toggle handler",
  async () => {
    const component = await createComponent();
    const sessions = [createSession()];

    component.displaySessions(sessions as any);
    await waitAll(component);

    component.handleItemToggle(
      new CustomEvent("item-toggle", {
        detail: { sessionId: "session-1" },
      }) as CustomEvent<{ sessionId: string }>,
    );
    assertEquals(component._getExpandedSessionId(), null);

    component.handleItemToggle(
      new CustomEvent("item-toggle", {
        detail: { sessionId: "session-1" },
      }) as CustomEvent<{ sessionId: string }>,
    );
    assertEquals(component._getExpandedSessionId(), "session-1");
  },
);

Deno.test(
  "PlanHistoryPane: emits retry-chart event with session chart",
  async () => {
    const component = await createComponent();
    const sessions = [createSession()];
    component.displaySessions(sessions as any);
    await waitAll(component);

    let fired = false;
    let detail: any = null;
    component.addEventListener("retry-chart", ((event: CustomEvent) => {
      fired = true;
      detail = event.detail;
    }) as EventListener);

    const retryBtn = component.querySelector(
      ".retry-session-btn",
    ) as HTMLButtonElement;
    retryBtn.click();

    assertEquals(fired, true);
    assertEquals(detail.chart.name, "Core Groove");
  },
);

Deno.test(
  "PlanHistoryPane: emits navigate event for select different plan",
  async () => {
    const component = await createComponent();
    const sessions = [createSession()];
    component.displaySessions(sessions as any);
    await waitAll(component);

    let fired = false;
    let detail: any = null;
    component.addEventListener("navigate", ((event: CustomEvent) => {
      fired = true;
      detail = event.detail;
    }) as EventListener);

    const selectBtn = component.querySelector(
      ".select-plan-btn",
    ) as HTMLButtonElement;
    selectBtn.click();

    assertEquals(fired, true);
    assertEquals(detail.pane, "plan-edit");
  },
);

Deno.test(
  "PlanHistoryPane: emits delete-session event with session id",
  async () => {
    const component = await createComponent();
    const sessions = [createSession()];
    component.displaySessions(sessions as any);
    await waitAll(component);

    let fired = false;
    let detail: any = null;
    component.addEventListener("delete-session", ((event: CustomEvent) => {
      fired = true;
      detail = event.detail;
    }) as EventListener);

    const deleteBtn = component.querySelector(
      ".delete-session-btn",
    ) as HTMLButtonElement;
    deleteBtn.click();

    assertEquals(fired, true);
    assertEquals(detail.sessionId, "session-1");
  },
);

Deno.test(
  "PlanHistoryPane: renders metrics and recommendations sections",
  async () => {
    const component = await createComponent();
    const sessions = [
      createSession({
        metrics: {
          drift: {
            description: "Fast drift",
            severity: "high",
            direction: "ahead",
            avgErrorBeats: 0.2,
          },
          missed: {
            description: "Needs work",
            completelMissed: 1,
            partialMissed: 4,
          },
          rhythm: {
            consistency: "variable",
          },
          consistency: {
            stdDeviation: 14,
            consistency: "inconsistent",
            range: 28,
          },
          completion: {
            completed: false,
            percentage: 70,
          },
        },
      }),
    ];

    component.displaySessions(sessions as any);
    await waitAll(component);

    const detailsText =
      (component.querySelector(".session-details") as HTMLElement)
        .textContent || "";
    assertEquals(detailsText.includes("Metrics"), true);
    assertEquals(detailsText.includes("Recommendations"), true);
  },
);
