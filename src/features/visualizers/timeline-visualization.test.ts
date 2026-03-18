/// <reference lib="dom" />
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/assert/mod.ts";
import "../component/setup-dom.ts";
import TimelineVisualization from "./timeline-visualization.js";

async function createComponent() {
  const component = new TimelineVisualization();
  await component.componentReady;

  const viewport = component.querySelector(
    "[data-timeline-viewport]",
  ) as HTMLElement;
  const track = component.querySelector("[data-timeline-track]") as HTMLElement;

  Object.defineProperty(viewport, "clientWidth", {
    configurable: true,
    get: () => 300,
  });

  Object.defineProperty(track, "offsetWidth", {
    configurable: true,
    get: () => parseInt(track.style.width || "0", 10),
  });

  return component;
}

Deno.test("TimelineVisualization: should initialize empty", async () => {
  const component = await createComponent();
  assertExists(component);
  assertEquals(component.querySelectorAll(".timeline-group").length, 0);
  assertEquals(component.querySelectorAll(".timeline-expectation").length, 0);
});

Deno.test(
  "TimelineVisualization: should render groups and expectations from plan",
  async () => {
    const component = await createComponent();

    component.setBeatsPerMeasure(4);
    component.setDrillPlan([{ type: "click-in" }, { type: "click" }]);

    assertEquals(component.querySelectorAll(".timeline-group").length, 2);
    assertEquals(component.querySelectorAll(".timeline-grid-line").length, 2);
    assertEquals(component.querySelectorAll(".timeline-expectation").length, 8);
    assertEquals(
      component.querySelectorAll(".timeline-expectation-filled").length,
      4,
    );
  },
);

Deno.test(
  "TimelineVisualization: should position detections using display start beat",
  async () => {
    const component = await createComponent();

    component.setBeatsPerMeasure(4);
    component.setDrillPlan([{ type: "click" }, { type: "click" }]);
    component.setDisplayStartBeat(4);

    const appended = component.addDetection(4);
    const detection = component.querySelector(
      ".timeline-detection",
    ) as HTMLElement;

    assertEquals(appended, true);
    assertEquals(detection.style.left, "300px");
  },
);

Deno.test(
  "TimelineVisualization: centerAt should scroll track and track last beat",
  async () => {
    const component = await createComponent();

    component.setBeatsPerMeasure(4);
    component.setDrillPlan([{ type: "click" }, { type: "click" }]);
    component.centerAt(4);

    const track = component.querySelector(
      "[data-timeline-track]",
    ) as HTMLElement;
    assertEquals(component.getLastBeatPosition(), 4);
    assertEquals(track.style.transform, "translateX(-222px)");
  },
);
