/// <reference lib="dom" />
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/assert/mod.ts";
import "../component/setup-dom.ts";
import PlanVisualizer from "./plan-visualizer.js";

async function createComponent() {
  const component = new PlanVisualizer();
  await component.componentReady;
  return component;
}

Deno.test(
  "PlanVisualizer: should initialize with empty visualization",
  async () => {
    const component = await createComponent();
    assertExists(component);
    assertEquals(component.getLength(), 0);
    assertEquals(component.getPlan().plan, []);
    assertEquals(component.querySelectorAll(".measure-block").length, 0);
  },
);

Deno.test("PlanVisualizer: should parse plan string correctly", async () => {
  const component = await createComponent();
  const plan = component.parse("1,1,2");
  const blocks = component.querySelectorAll(".measure-block");

  assertEquals(plan.length, 5);
  assertEquals(plan[0].type, "click-in");
  assertEquals(plan[1].type, "click");
  assertEquals(plan[2].type, "silent");
  assertEquals(plan[3].type, "click");
  assertEquals(plan[4].type, "silent");
  assertEquals(blocks.length, 5);
});

Deno.test("PlanVisualizer: should render scores and highlight", async () => {
  const component = await createComponent();
  component.parse("2,0,1");
  component.setScores([0, 88, 105]);
  component.setHighlight(2);

  const blocks = component.querySelectorAll(".measure-block");
  const firstBlock = blocks[0] as HTMLElement;
  const secondBlock = blocks[1] as HTMLElement;
  const thirdBlock = blocks[2] as HTMLElement;

  assertEquals(firstBlock.textContent, "");
  assertEquals(secondBlock.textContent, "88");
  assertEquals(secondBlock.dataset.score, "88");
  assertEquals(thirdBlock.textContent, "99");
  assertEquals(thirdBlock.classList.contains("current"), true);
});

Deno.test(
  "PlanVisualizer: should invoke delegate on measure click",
  async () => {
    const component = await createComponent();
    component.parse("1,0,1");

    let clickedIndex = -1;
    component.setDelegate({
      onMeasureClick(index: number) {
        clickedIndex = index;
      },
    });

    const blocks = component.querySelectorAll(".measure-block");
    (blocks[1] as HTMLElement).click();

    assertEquals(clickedIndex, 1);
    assertEquals(
      component
        .querySelector("#plan-visualization")
        ?.classList.contains("interactive"),
      true,
    );
  },
);

Deno.test(
  "PlanVisualizer: should have required template and style URLs",
  async () => {
    const component = await createComponent();
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
