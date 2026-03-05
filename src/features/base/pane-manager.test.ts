/// <reference lib="dom" />
import "../base/setup-dom.ts"; // Setup DOM environment first
import { assertEquals } from "../base/assert.ts";

const { default: PaneManager } = await import("../base/pane-manager.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set location.hash and await the setTimeout(0) that jsdom queues internally
 * to dispatch the hashchange event. This drains the timer inside the current
 * test so it cannot bleed into the next one and cause a "timer leak" failure.
 */
async function resetHash(pane = "onboarding") {
  globalThis.location.hash = `#${pane}`;
  await new Promise((r) => setTimeout(r, 0));
}

/** Create pane and nav DOM elements for a set of pane names. */
function createPaneDom(panes: string[]) {
  // Remove any previous fixtures
  document
    .querySelectorAll(".pane, .pane-link")
    .forEach((el) => el.parentNode?.removeChild(el));

  for (const name of panes) {
    const paneEl = document.createElement("div");
    paneEl.id = `pane-${name}`;
    paneEl.className = "pane";
    document.body.appendChild(paneEl);

    const btn = document.createElement("button");
    btn.className = "pane-link";
    btn.dataset.pane = name;
    document.body.appendChild(btn);
  }
}

// ---------------------------------------------------------------------------
// Static getInitialPane
// ---------------------------------------------------------------------------

Deno.test("PaneManager.getInitialPane: never onboarded → 'onboarding'", () => {
  const pane = PaneManager.getInitialPane({
    hasCompletedOnboarding: false,
    hasCalibration: false,
  });
  assertEquals(pane, "onboarding");
});

Deno.test("PaneManager.getInitialPane: onboarded + calibrated → 'plan-play'", () => {
  const pane = PaneManager.getInitialPane({
    hasCompletedOnboarding: true,
    hasCalibration: true,
  });
  assertEquals(pane, "plan-play");
});

Deno.test("PaneManager.getInitialPane: onboarded but no calibration → 'onboarding'", () => {
  const pane = PaneManager.getInitialPane({
    hasCompletedOnboarding: true,
    hasCalibration: false,
  });
  assertEquals(pane, "onboarding");
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

Deno.test("PaneManager constructor does NOT fire pane change callbacks", async () => {
  await resetHash("onboarding");
  let callCount = 0;

  const pm = new PaneManager();
  pm.onPaneChange(() => { callCount++; });

  // Constructor must not have called any callbacks yet
  assertEquals(callCount, 0);
  assertEquals(pm.getCurrentPane(), null);
});

// ---------------------------------------------------------------------------
// initialize()
// ---------------------------------------------------------------------------

Deno.test("PaneManager.initialize() fires onPaneChange callback with current hash pane", async () => {
  await resetHash("plan-play");
  const pm = new PaneManager();
  const received: string[] = [];
  pm.onPaneChange((pane) => received.push(pane));

  pm.initialize();

  assertEquals(received, ["plan-play"]);
});

Deno.test("PaneManager.initialize() defaults to 'onboarding' when hash is empty", async () => {
  globalThis.location.hash = "";
  await new Promise((r) => setTimeout(r, 0));
  const pm = new PaneManager();
  const received: string[] = [];
  pm.onPaneChange((pane) => received.push(pane));

  pm.initialize();

  assertEquals(received, ["onboarding"]);
});

Deno.test("PaneManager.initialize() sets currentPane", async () => {
  await resetHash("calibration");
  const pm = new PaneManager();
  pm.onPaneChange(() => {});
  pm.initialize();

  assertEquals(pm.getCurrentPane(), "calibration");
});

Deno.test("PaneManager.initialize() fires all registered onPaneChange callbacks", async () => {
  await resetHash("plan-edit");
  const pm = new PaneManager();
  const callsA: string[] = [];
  const callsB: string[] = [];
  pm.onPaneChange((p) => callsA.push(p));
  pm.onPaneChange((p) => callsB.push(p));

  pm.initialize();

  assertEquals(callsA, ["plan-edit"]);
  assertEquals(callsB, ["plan-edit"]);
});

// ---------------------------------------------------------------------------
// getCurrentPane()
// ---------------------------------------------------------------------------

Deno.test("PaneManager.getCurrentPane() returns null before initialize()", async () => {
  await resetHash("onboarding");
  const pm = new PaneManager();
  assertEquals(pm.getCurrentPane(), null);
});

Deno.test("PaneManager.getCurrentPane() returns pane name after initialize()", async () => {
  await resetHash("plan-history");
  const pm = new PaneManager();
  pm.initialize();
  assertEquals(pm.getCurrentPane(), "plan-history");
});

// ---------------------------------------------------------------------------
// updateVisibility() — onHide / onShow lifecycle hooks
// ---------------------------------------------------------------------------

Deno.test("PaneManager.updateVisibility() calls onShow on incoming pane elements", async () => {
  await resetHash("onboarding");
  createPaneDom(["onboarding", "plan-play"]);

  const pm = new PaneManager();
  pm.initialize();

  // Add a mock component inside plan-play pane
  const mockEl = document.createElement("div");
  let showCalled = false;
  (mockEl as any).onShow = () => { showCalled = true; };
  document.getElementById("pane-plan-play")!.appendChild(mockEl);

  pm.updateVisibility("plan-play");

  assertEquals(showCalled, true);
});

Deno.test("PaneManager.updateVisibility() calls onHide on outgoing pane elements", () => {
  createPaneDom(["onboarding", "plan-play"]);

  const pm = new PaneManager();
  // Simulate state after having navigated away from "onboarding":
  // updateVisibility() uses _previousPane to find the outgoing pane for onHide hooks.
  pm._previousPane = "onboarding";

  const mockEl = document.createElement("div");
  let hideCalled = false;
  (mockEl as any).onHide = () => { hideCalled = true; };
  document.getElementById("pane-onboarding")!.appendChild(mockEl);

  pm.updateVisibility("plan-play");

  assertEquals(hideCalled, true);
});

Deno.test("PaneManager.updateVisibility() hides all panes except target", async () => {
  await resetHash("onboarding");
  createPaneDom(["onboarding", "plan-play", "calibration"]);

  const pm = new PaneManager();
  pm.initialize();
  pm.updateVisibility("plan-play");

  const onboardingEl = document.getElementById("pane-onboarding") as HTMLElement;
  const planPlayEl = document.getElementById("pane-plan-play") as HTMLElement;
  const calibrationEl = document.getElementById("pane-calibration") as HTMLElement;

  assertEquals(onboardingEl.style.display, "none");
  assertEquals(planPlayEl.style.display, "block");
  assertEquals(calibrationEl.style.display, "none");
});

Deno.test("PaneManager.updateVisibility() marks nav button active for target pane", async () => {
  await resetHash("onboarding");
  createPaneDom(["onboarding", "plan-play"]);

  const pm = new PaneManager();
  pm.initialize();
  pm.updateVisibility("plan-play");

  const planPlayBtn = document.querySelector(
    ".pane-link[data-pane='plan-play']",
  ) as HTMLElement;
  const onboardingBtn = document.querySelector(
    ".pane-link[data-pane='onboarding']",
  ) as HTMLElement;

  assertEquals(planPlayBtn.classList.contains("active"), true);
  assertEquals(onboardingBtn.classList.contains("active"), false);
});

Deno.test("PaneManager.updateVisibility() skips onHide if no previous pane", async () => {
  await resetHash("onboarding");
  createPaneDom(["onboarding", "plan-play"]);

  const pm = new PaneManager();
  // Do NOT initialize — _previousPane is null
  // Should not throw
  pm.updateVisibility("plan-play");
  assertEquals(pm.getCurrentPane(), null); // pane tracked by _onHashChange not updateVisibility
});
