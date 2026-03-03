/**
 * Tests for MicrophoneDetector component
 * @module microphone-detector.test
 */

import {
  assertEquals,
  assertNotEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { setupGlobalMocks } from "../base/test-mocks.js";

// Setup browser API mocks BEFORE importing components
// This must happen before BaseComponent tries to extend HTMLElement
setupGlobalMocks();

// Dynamic import after mocks are set up
const { default: MicrophoneDetector } = await import("./microphone-detector.js");

/**
 * Helper to create a fresh component instance
 * @returns {Promise<MicrophoneDetector>}
 */
async function createComponent() {
  // Use proper custom element creation (triggers correct initialization)
  // Component auto-registers itself via customElements.define() on import
  const element = /** @type {MicrophoneDetector} */ (
    document.createElement("microphone-detector")
  );

  // Wait for initialization to complete (or fail)
  // In tests, initialization will fail when trying to find DOM elements
  // but the state management still works since we check for element references
  try {
    await element.componentReady;
  } catch (error) {
    // Initialization failure is expected in tests (no real DOM)
    // Component is still usable for testing state/logic
  }

  return element;
}

// Initialization Tests

Deno.test("MicrophoneDetector: should initialize with default state", async () => {
  const component = await createComponent();
  assertEquals(component.state.error, null);
  assertEquals(component.state.isConnected, false);
  assertEquals(component.state.level, 0);
  assertEquals(component.state.peakLevel, 0);
  assertEquals(component.state.threshold, 52);
  assertEquals(component.state.recentHits, []);
});

Deno.test("MicrophoneDetector: should have required template and style URLs", async () => {
  const component = await createComponent();
  assertEquals(typeof component.getTemplateUrl(), "string");
  assertEquals(typeof component.getStyleUrl(), "string");
  assertEquals(component.getTemplateUrl().includes("html"), true);
  assertEquals(component.getStyleUrl().includes("css"), true);
});

// State Management Tests

Deno.test("MicrophoneDetector: should update state via setState()", async () => {
  const component = await createComponent();
  const oldState = { ...component.state };
  component.setState({ level: 75 });

  assertEquals(component.state.level, 75);
  assertEquals(component.state.threshold, 52); // unchanged
  assertNotEquals(oldState, component.state); // state object changed
});

Deno.test("MicrophoneDetector: should call onStateChange hook when state updates", async () => {
  const component = await createComponent();
  let hookCalled = false;
  let oldState, newState;

  const original = component.onStateChange;
  component.onStateChange = function (old, neu) {
    hookCalled = true;
    oldState = old;
    newState = neu;
    original.call(this, old, neu);
  };

  component.setState({ level: 50 });

  assertEquals(hookCalled, true);
  assertEquals(oldState.level, 0);
  assertEquals(newState.level, 50);
});

Deno.test("MicrophoneDetector: should merge state updates, not replace", async () => {
  const component = await createComponent();
  component.setState({ level: 30, threshold: 60 });
  assertEquals(component.state.level, 30);
  assertEquals(component.state.threshold, 60);
  assertEquals(component.state.recentHits, []); // unchanged
});

// Public API - setLevel Tests

Deno.test("MicrophoneDetector: setLevel should set audio level 0-100", async () => {
  const component = await createComponent();
  component.setLevel(50);
  assertEquals(component.state.level, 50);
});

Deno.test("MicrophoneDetector: setLevel should clamp level to 0-100", async () => {
  const component = await createComponent();
  component.setLevel(-10);
  assertEquals(component.state.level, 0);

  component.setLevel(150);
  assertEquals(component.state.level, 100);
});

Deno.test("MicrophoneDetector: setLevel should update state", async () => {
  const component = await createComponent();
  let changeCount = 0;
  const original = component.onStateChange;
  component.onStateChange = function (old, neu) {
    changeCount++;
    original.call(this, old, neu);
  };

  component.setLevel(65);
  assertEquals(changeCount, 1);
});

// Public API - setPeak Tests

Deno.test("MicrophoneDetector: setPeak should set peak level", async () => {
  const component = await createComponent();
  component.setPeak(85);
  assertEquals(component.state.peakLevel, 85);
});

Deno.test("MicrophoneDetector: setPeak should clamp peak level to 0-100", async () => {
  const component = await createComponent();
  component.setPeak(200);
  assertEquals(component.state.peakLevel, 100);
});

// Public API - setThreshold Tests

Deno.test("MicrophoneDetector: setThreshold should set threshold value and update state", async () => {
  const component = await createComponent();
  component.setThreshold(70);
  assertEquals(component.state.threshold, 70);

  // Test changing to different value
  component.setThreshold(75);
  assertEquals(component.state.threshold, 75);
});

// Public API - Hits Management Tests

Deno.test("MicrophoneDetector: addHit should add hits to recentHits", async () => {
  const component = await createComponent();
  component.addHit("hit1");
  component.addHit("hit2");

  assertEquals(component.state.recentHits, ["hit1", "hit2"]);
});

Deno.test("MicrophoneDetector: addHit should limit recentHits to 20 items", async () => {
  const component = await createComponent();
  for (let i = 0; i < 25; i++) {
    component.addHit(`hit${i}`);
  }

  assertEquals(component.state.recentHits.length, 20);
  assertEquals(component.state.recentHits[0], "hit5");
  assertEquals(component.state.recentHits[19], "hit24");
});

Deno.test("MicrophoneDetector: clearHits should clear hits", async () => {
  const component = await createComponent();
  component.addHit("hit1");
  component.addHit("hit2");
  component.clearHits();

  assertEquals(component.state.recentHits, []);
});

// Error Handling Tests

Deno.test("MicrophoneDetector: should set error state on failure", async () => {
  const component = await createComponent();
  component.setState({ error: "Test error message" });
  assertEquals(component.state.error, "Test error message");
});

Deno.test("MicrophoneDetector: should clear error on success", async () => {
  const component = await createComponent();
  component.setState({ error: null });
  assertEquals(component.state.error, null);
});

// Connection State Tests

Deno.test("MicrophoneDetector: should track connection state", async () => {
  const component = await createComponent();
  component.setState({ isConnected: true });
  assertEquals(component.state.isConnected, true);

  component.setState({ isConnected: false });
  assertEquals(component.state.isConnected, false);
});

// State Validation Tests

Deno.test("MicrophoneDetector: setState should throw on invalid argument", async () => {
  const component = await createComponent();
  assertThrows(() => component.setState(null), Error);
  assertThrows(() => component.setState("invalid"), Error);
  assertThrows(() => component.setState(123), Error);
});

Deno.test("MicrophoneDetector: setState should accept valid state objects", async () => {
  const component = await createComponent();
  // These should not throw
  component.setState({});
  component.setState({ level: 50 });
});
