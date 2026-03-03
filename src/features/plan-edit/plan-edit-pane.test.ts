/// <reference lib="dom" />
import "../base/setup-dom.ts"; // Setup DOM environment first
import { assertEquals } from "../base/assert.ts";

// Dynamic import after mocks are set up
const { default: PlanEditPane } = await import("./plan-edit-pane.js");

/**
 * Helper to create a fresh component instance and wait for it to be ready
 */
async function createComponent() {
  const element = document.createElement("plan-edit-pane") as InstanceType<typeof PlanEditPane>;

  await element.componentReady;

  return element;
}

Deno.test("PlanEditPane: should initialize with default state", async () => {
  const component = await createComponent();
  assertEquals(component.state.isEditing, false);
  assertEquals(component.state.currentPlanId, null);
});

Deno.test("PlanEditPane: should have required template and style URLs", async () => {
  const component = await createComponent();
  assertEquals(typeof component.getTemplateUrl(), "string");
  assertEquals(typeof component.getStyleUrl(), "string");
  assertEquals(component.getTemplateUrl().includes("html"), true);
  assertEquals(component.getStyleUrl().includes("css"), true);
});

Deno.test("PlanEditPane: should update state via setState()", async () => {
  const component = await createComponent();
  component.setState({ isEditing: true, currentPlanId: "test-id" });
  assertEquals(component.state.isEditing, true);
  assertEquals(component.state.currentPlanId, "test-id");
});

Deno.test("PlanEditPane: should merge state updates, not replace", async () => {
  const component = await createComponent();
  component.setState({ isEditing: true });
  assertEquals(component.state.isEditing, true);
  assertEquals(component.state.currentPlanId, null);
  component.setState({ currentPlanId: "plan-1" });
  assertEquals(component.state.isEditing, true);
  assertEquals(component.state.currentPlanId, "plan-1");
});

Deno.test("PlanEditPane: should call onStateChange hook when state updates", async () => {
  const component = await createComponent();
  let hookCalled = false;
  let oldState: any = null;
  let newState: any = null;

  component.onStateChange = (oldS, newS) => {
    hookCalled = true;
    oldState = oldS;
    newState = newS;
  };

  component.setState({ isEditing: true });
  assertEquals(hookCalled, true);
  assertEquals(oldState?.isEditing, false);
  assertEquals(newState?.isEditing, true);
});

Deno.test("PlanEditPane: should register as custom element", () => {
  const customElement = customElements.get("plan-edit-pane");
  assertEquals(customElement !== undefined, true);
});

Deno.test("PlanEditPane: setState should throw on invalid argument", async () => {
  const component = await createComponent();
  try {
    component.setState(null as any);
    assertEquals(true, false); // Should not reach here
  } catch (e) {
    assertEquals((e as Error).message, "setState requires an object");
  }
});

Deno.test("PlanEditPane: setState should accept valid state objects", async () => {
  const component = await createComponent();
  component.setState({});
  assertEquals(component.state.isEditing, false);
  component.setState({ isEditing: true, currentPlanId: "id-1" });
  assertEquals(component.state.isEditing, true);
  assertEquals(component.state.currentPlanId, "id-1");
});

Deno.test("PlanEditPane: getCurrentPlan should return null initially", async () => {
  const component = await createComponent();
  assertEquals(component.getCurrentPlan(), null);
});

Deno.test("PlanEditPane: getAllPlans should return empty array when not initialized", async () => {
  const component = await createComponent();
  const plans = component.getAllPlans();
  assertEquals(Array.isArray(plans), true);
  assertEquals(plans.length, 0);
});

Deno.test("PlanEditPane: should have element references after mount", async () => {
  const component = await createComponent();
  assertEquals(component.planLibrarySelect !== null, true);
  assertEquals(component.newPlanBtn !== null, true);
  assertEquals(component.planInfoDisplay !== null, true);
  assertEquals(component.planEditorSection !== null, true);
  assertEquals(component.planNameInput !== null, true);
  assertEquals(component.segmentsList !== null, true);
});

Deno.test("PlanEditPane: should pass string plan format to drillPlan.parse", async () => {
  const component = await createComponent();

  let parseArg = "";

  // Mock the visualization component's parse method
  component.drillPlanViz = {
    parse: (input: string) => {
      parseArg = input;
    },
  } as any;

  component._showPlanInfo({
    id: "p1",
    name: "Test",
    description: "",
    difficulty: "Beginner",
    bpm: 120,
    segments: [
      { on: 1, off: 1, reps: 2 },
      { on: 2, off: 0, reps: 1 },
    ],
  });

  assertEquals(typeof parseArg, "string");
  assertEquals(parseArg, "1,1,2;2,0,1");
});

Deno.test("PlanEditPane: should hide edit action for built-in plans", async () => {
  const component = await createComponent();

  component._showPlanInfo({
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
});

Deno.test("PlanEditPane: should not open editor for built-in plans", async () => {
  const component = await createComponent();

  component.currentPlan = {
    id: "builtin-1",
    name: "Built-in Plan",
    isBuiltIn: true,
    segments: [{ on: 1, off: 1, reps: 1 }],
  };

  component._onEditPlan();

  assertEquals(component.state.isEditing, false);
  assertEquals(component.planEditorSection !== null, true);
  const editorSection = component.planEditorSection as HTMLElement;
  assertEquals(editorSection.style.display, "none");
});

Deno.test("PlanEditPane: should block delete for built-in plans", async () => {
  const component = await createComponent();

  let deleteCalled = false;
  component.planLibrary = {
    deletePlan: () => {
      deleteCalled = true;
      return true;
    },
  } as unknown as typeof component.planLibrary;

  component.editingPlan = {
    id: "builtin-1",
    name: "Built-in Plan",
    isBuiltIn: true,
    segments: [{ on: 1, off: 1, reps: 1 }],
  };

  component._onDeletePlan();

  assertEquals(deleteCalled, false);
});
