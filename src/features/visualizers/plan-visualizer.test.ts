/// <reference lib="dom" />
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/assert/mod.ts";
import "../component/setup-dom.ts";
import PlanVisualizer from "./plan-visualizer.js";

Deno.test("PlanVisualizer: should initialize with default state", async () => {
  const component = new PlanVisualizer();
  await component.componentReady;
  assertExists(component);
  assertEquals(component.plan, []);
  assertEquals(component.segments, []);
  assertEquals(component.currentMeasureIndex, 0);
});

Deno.test("PlanVisualizer: should parse plan string correctly", async () => {
  const component = new PlanVisualizer();
  await component.componentReady;
  const plan = component.parse("1,1,2");

  assertEquals(plan.length, 5); // 1 click-in + (1 click + 1 silent) * 2
  assertEquals(plan[0].type, "click-in");
  assertEquals(plan[1].type, "click");
  assertEquals(plan[2].type, "silent");
  assertEquals(plan[3].type, "click");
  assertEquals(plan[4].type, "silent");
});

Deno.test(
  "PlanVisualizer: should have required template and style URLs",
  async () => {
    const component = new PlanVisualizer();
    await component.componentReady;
    assertEquals(
      component.getTemplateUrl(),
      new URL("./plan-visualizer.html", import.meta.url).href,
    );
    assertEquals(
      component.getStyleUrl(),
      new URL("./plan-visualizer.css", import.meta.url).href,
    );
  },
);

Deno.test("PlanVisualizer: should register as custom element", () => {
  assertExists(customElements.get("plan-visualizer"));
});
