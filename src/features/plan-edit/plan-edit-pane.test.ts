/// <reference lib="dom" />
import "../component/setup-dom.ts"; // Setup DOM environment first
import { assertEquals } from "../base/assert.ts";

// Dynamic import after mocks are set up
const { default: PlanEditPane } = await import("./plan-edit-pane.js");

/**
 * Helper to create a fresh component instance and wait for it to be ready
 */
async function createComponent(): Promise<any> {
  const element = document.createElement("plan-edit-pane");
  await (element as any).componentReady;
  return element;
}

Deno.test(
  "PlanEditPane: should initialize with null current plan",
  async () => {
    const component = await createComponent();
    assertEquals(component._getCurrentPlan(), null);
    assertEquals(component.getCurrentChart(), null);
  },
);

Deno.test("PlanEditPane: should initialize with isEditing false", async () => {
  const component = await createComponent();
  assertEquals(component._getIsEditing(), false);
});

Deno.test(
  "PlanEditPane: should have required template and style URLs",
  async () => {
    const component = await createComponent();
    assertEquals(typeof component.getTemplateUrl(), "string");
    assertEquals(typeof component.getStyleUrl(), "string");
    assertEquals(component.getTemplateUrl().includes("html"), true);
    assertEquals(component.getStyleUrl().includes("css"), true);
  },
);

Deno.test(
  "PlanEditPane: should show plan info panel when plan is set",
  async () => {
    const component = await createComponent();
    assertEquals(component.planInfoDisplay !== null, true);
    const infoDisplay = component.planInfoDisplay as HTMLElement;
    assertEquals(infoDisplay.style.display, "none");

    component._setCurrentPlan({
      id: "p1",
      name: "Test Plan",
      description: "A plan",
      difficulty: "Beginner",
      bpm: 120,
      segments: [{ on: 1, off: 1, reps: 2 }],
    });
    assertEquals(infoDisplay.style.display, "block");
  },
);

Deno.test(
  "PlanEditPane: should show editor when _setIsEditing(true)",
  async () => {
    const component = await createComponent();
    const editorSection = component.planEditorSection as HTMLElement;
    assertEquals(editorSection.style.display, "none");
    component._setIsEditing(true);
    assertEquals(editorSection.style.display, "block");
    component._setIsEditing(false);
    assertEquals(editorSection.style.display, "none");
  },
);

Deno.test("PlanEditPane: should register as custom element", () => {
  const customElement = customElements.get("plan-edit-pane");
  assertEquals(customElement !== undefined, true);
});

Deno.test(
  "PlanEditPane: getCurrentChart should return null initially",
  async () => {
    const component = await createComponent();
    assertEquals(component.getCurrentChart(), null);
  },
);

Deno.test(
  "PlanEditPane: getAllPlans should return empty array when not initialized",
  async () => {
    const component = await createComponent();
    const plans = component.getAllPlans();
    assertEquals(Array.isArray(plans), true);
    assertEquals(plans.length, 0);
  },
);

Deno.test(
  "PlanEditPane: should have element references after mount",
  async () => {
    const component = await createComponent();
    assertEquals(component.planLibrarySelect !== null, true);
    assertEquals(component.newPlanBtn !== null, true);
    assertEquals(component.planInfoDisplay !== null, true);
    assertEquals(component.planEditorSection !== null, true);
    assertEquals(component.planNameInput !== null, true);
    assertEquals(component.segmentsList !== null, true);
  },
);

Deno.test(
  "PlanEditPane: should select chart in chartService when current plan set",
  async () => {
    const component = await createComponent();

    const selected: any[] = [];
    const mockChartService = {
      selectChart(chart: any) {
        selected.push(chart);
      },
    };
    component.chartService = mockChartService as any;

    const chart = {
      id: "p1",
      name: "Test",
      description: "",
      difficulty: "Beginner",
      bpm: 120,
      segments: [
        { on: 1, off: 1, reps: 2 },
        { on: 2, off: 0, reps: 1 },
      ],
    };

    component._setCurrentPlan(chart);

    assertEquals(selected.length, 1);
    assertEquals(selected[0].id, "p1");
    assertEquals(selected[0].name, "Test");
  },
);

Deno.test(
  "PlanEditPane: should not re-emit chart selection for same plan during re-entrant updates",
  async () => {
    const component = await createComponent();

    const chart = {
      id: "p-loop",
      name: "Loop Guard",
      description: "",
      difficulty: "Beginner",
      bpm: 120,
      segments: [{ on: 1, off: 1, reps: 1 }],
    };

    let calls = 0;
    component.chartService = {
      selectChart(selected: any) {
        calls += 1;
        // Simulate a subscriber feeding the same selection back into the pane.
        if (calls === 1) {
          component._setCurrentPlan(selected);
        }
      },
    } as any;

    component._setCurrentPlan(chart);

    assertEquals(calls, 1);
  },
);

Deno.test(
  "PlanEditPane: should hide edit action for built-in plans",
  async () => {
    const component = await createComponent();

    component._setCurrentPlan({
      id: "builtin-1",
      name: "Built-in Plan",
      isBuiltIn: true,
      segments: [{ on: 1, off: 1, reps: 1 }],
    });

    assertEquals(component.editPlanBtn !== null, true);
    assertEquals(component.clonePlanBtn !== null, true);
    assertEquals(component.startPlanPlayBtn !== null, true);

    const editBtn = component.editPlanBtn as HTMLElement;
    const cloneBtn = component.clonePlanBtn as HTMLElement;
    const startBtn = component.startPlanPlayBtn as HTMLElement;

    assertEquals(editBtn.style.display, "none");
    assertEquals(cloneBtn.style.display, "inline-block");
    assertEquals(startBtn.style.display, "inline-block");
  },
);

Deno.test(
  "PlanEditPane: should not open editor for built-in plans",
  async () => {
    const component = await createComponent();

    component._setCurrentPlan({
      id: "builtin-1",
      name: "Built-in Plan",
      isBuiltIn: true,
      segments: [{ on: 1, off: 1, reps: 1 }],
    });

    component._onEditPlan();

    assertEquals(component._getIsEditing(), false);
    assertEquals(component.planEditorSection !== null, true);
    const editorSection = component.planEditorSection as HTMLElement;
    assertEquals(editorSection.style.display, "none");
  },
);

Deno.test("PlanEditPane: should block delete for built-in plans", async () => {
  const component = await createComponent();

  let deleteCalled = false;
  component.chartService = {
    deleteChart: () => {
      deleteCalled = true;
      return true;
    },
  } as any;

  component._setEditingPlan({
    id: "builtin-1",
    name: "Built-in Plan",
    isBuiltIn: true,
    segments: [{ on: 1, off: 1, reps: 1 }],
  });

  component._onDeletePlan();

  assertEquals(deleteCalled, false);
});
