/**
 * Plan Editor UI
 * Manages the plan library interface, plan info display, and visual plan editor
 */
class PlanEditorUI {
  constructor(planLibrary, drillPlan, bpmInput, timeSignatureSelect) {
    this.planLibrary = planLibrary;
    this.drillPlan = drillPlan;
    this.bpmInput = bpmInput;
    this.timeSignatureSelect = timeSignatureSelect;

    // State
    this.currentPlan = null;
    this.editingPlan = null;
    this.editingSegments = [];

    // Get DOM elements
    this.planLibrarySelect = document.getElementById("plan-library-select");
    this.newPlanBtn = document.getElementById("new-plan-btn");
    this.planInfoDisplay = document.getElementById("plan-info-display");
    this.planInfoName = document.getElementById("plan-info-name");
    this.planInfoDescription = document.getElementById("plan-info-description");
    this.planInfoDifficulty = document.getElementById("plan-info-difficulty");
    this.planStatSegments = document.getElementById("plan-stat-segments");
    this.planStatMeasures = document.getElementById("plan-stat-measures");
    this.planStatDuration = document.getElementById("plan-stat-duration");
    this.planEditorSection = document.getElementById("plan-editor-section");
    this.planNameInput = document.getElementById("plan-name-input");
    this.planDescriptionInput = document.getElementById(
      "plan-description-input",
    );
    this.planDifficultyInput = document.getElementById("plan-difficulty-input");
    this.segmentsList = document.getElementById("segments-list");
    this.addSegmentBtn = document.getElementById("add-segment-btn");
    this.savePlanBtn = document.getElementById("save-plan-btn");
    this.cancelEditBtn = document.getElementById("cancel-edit-btn");
    this.deletePlanBtn = document.getElementById("delete-plan-btn");
    this.clonePlanBtn = document.getElementById("clone-plan-btn");
    this.editPlanBtn = document.getElementById("edit-plan-btn");
    this.startPlanPlayBtn = document.getElementById("start-plan-play-btn");

    // Setup event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.planLibrarySelect.addEventListener("change", () => {
      if (this.planLibrarySelect.value) {
        const plan = this.planLibrary.getPlanById(this.planLibrarySelect.value);
        if (plan) {
          this.showPlanInfo(plan);
          // Update URL to include selected plan
          this.updateUrlWithPlan(plan.id);
        }
      } else {
        this.hidePlanInfo();
        this.updateUrlWithPlan(null);
      }
    });

    this.newPlanBtn.addEventListener("click", () => {
      this.showPlanEditor(null);
    });

    this.editPlanBtn.addEventListener("click", () => {
      if (this.currentPlan) {
        this.showPlanEditor(this.currentPlan);
      }
    });

    this.clonePlanBtn.addEventListener("click", () => {
      this.clonePlan();
    });

    this.addSegmentBtn.addEventListener("click", () => {
      this.addSegment();
    });

    this.savePlanBtn.addEventListener("click", () => {
      this.savePlan();
    });

    this.cancelEditBtn.addEventListener("click", () => {
      this.hidePlanEditor();
      if (this.currentPlan) {
        this.showPlanInfo(this.currentPlan);
      }
    });

    this.deletePlanBtn.addEventListener("click", () => {
      this.deletePlan();
    });
  }

  init() {
    this.populatePlanLibrary();

    // Try to restore plan from URL, otherwise use default
    const urlPlanId = this.getPlanIdFromUrl();
    let planToShow = null;

    if (urlPlanId) {
      planToShow = this.planLibrary.getPlanById(urlPlanId);
    }

    if (!planToShow) {
      // Fall back to first plan
      const plans = this.planLibrary.getAllPlans();
      if (plans.length > 0) {
        planToShow = plans[0];
      }
    }

    if (planToShow) {
      this.planLibrarySelect.value = planToShow.id;
      this.showPlanInfo(planToShow);
      // Explicitly update URL when programmatically setting plan
      this.updateUrlWithPlan(planToShow.id);
    }
  }

  getPlanIdFromUrl() {
    // Extract plan ID from URL query parameter
    const params = new URLSearchParams(window.location.search);
    return params.get("plan");
  }

  updateUrlWithPlan(planId) {
    // Update URL with selected plan without reloading
    const url = new URL(window.location);
    if (planId) {
      url.searchParams.set("plan", planId);
    } else {
      url.searchParams.delete("plan");
    }
    window.history.replaceState({}, "", url);
  }

  getCurrentPlan() {
    return this.currentPlan;
  }

  selectPlanByObject(planObject) {
    // Select a plan by its object (used for retrying from history)
    if (!planObject || !planObject.id) return;

    const plan = this.planLibrary.getPlanById(planObject.id);
    if (plan) {
      this.planLibrarySelect.value = plan.id;
      this.showPlanInfo(plan);
      this.updateUrlWithPlan(plan.id);
    }
  }

  populatePlanLibrary() {
    const plans = this.planLibrary.getAllPlans();
    this.planLibrarySelect.innerHTML =
      '<option value="">Select a plan...</option>';

    const builtInPlans = plans.filter((p) => p.isBuiltIn);
    const customPlans = plans.filter((p) => !p.isBuiltIn);

    if (builtInPlans.length > 0) {
      const builtInGroup = document.createElement("optgroup");
      builtInGroup.label = "Built-in Plans";
      builtInPlans.forEach((plan) => {
        const option = document.createElement("option");
        option.value = plan.id;
        option.textContent = plan.name;
        builtInGroup.appendChild(option);
      });
      this.planLibrarySelect.appendChild(builtInGroup);
    }

    if (customPlans.length > 0) {
      const customGroup = document.createElement("optgroup");
      customGroup.label = "My Plans";
      customPlans.forEach((plan) => {
        const option = document.createElement("option");
        option.value = plan.id;
        option.textContent = plan.name;
        customGroup.appendChild(option);
      });
      this.planLibrarySelect.appendChild(customGroup);
    }
  }

  showPlanInfo(plan) {
    this.currentPlan = plan;

    // Show plan info
    this.planInfoName.textContent = plan.name;
    this.planInfoDescription.textContent = plan.description || "";
    this.planInfoDifficulty.textContent = plan.difficulty || "";
    this.planInfoDifficulty.setAttribute(
      "data-difficulty",
      plan.difficulty || "",
    );

    // Calculate and show stats
    const stats = this.planLibrary.calculateStats(plan.segments);
    const bpm = parseInt(this.bpmInput.value, 10);
    const beatsPerMeasure = parseInt(
      this.timeSignatureSelect.value.split("/")[0],
      10,
    );
    const duration = this.planLibrary.estimateDuration(
      plan.segments,
      bpm,
      beatsPerMeasure,
    );

    this.planStatSegments.textContent = stats.segments;
    this.planStatMeasures.textContent = stats.totalMeasures + 1; // +1 for click-in
    this.planStatDuration.textContent =
      this.planLibrary.formatDuration(duration);

    this.planInfoDisplay.style.display = "block";

    // Show action buttons
    this.startPlanPlayBtn.style.display = "block";
    this.clonePlanBtn.style.display = "block";
    this.editPlanBtn.style.display = plan.isBuiltIn ? "none" : "block";

    // Parse and visualize the plan
    const planString = this.planLibrary.segmentsToString(plan.segments);
    this.drillPlan.parse(planString);
  }

  hidePlanInfo() {
    this.currentPlan = null;
    this.planInfoDisplay.style.display = "none";
    this.startPlanPlayBtn.style.display = "none";
    this.clonePlanBtn.style.display = "none";
    this.editPlanBtn.style.display = "none";
  }

  showPlanEditor(plan = null) {
    if (plan) {
      // Editing existing plan
      this.editingPlan = plan;
      this.editingSegments = JSON.parse(JSON.stringify(plan.segments)); // Deep clone
      this.planNameInput.value = plan.name;
      this.planDescriptionInput.value = plan.description || "";
      this.planDifficultyInput.value = plan.difficulty || "";
      this.deletePlanBtn.style.display = plan.isBuiltIn ? "none" : "block";
    } else {
      // Creating new plan
      this.editingPlan = null;
      this.editingSegments = [{ on: 1, off: 1, reps: 4 }]; // Default segment
      this.planNameInput.value = "";
      this.planDescriptionInput.value = "";
      this.planDifficultyInput.value = "";
      this.deletePlanBtn.style.display = "none";
    }

    this.renderSegments();
    this.updateEditingVisualization();
    this.planEditorSection.style.display = "block";
    this.hidePlanInfo();
  }

  hidePlanEditor() {
    this.planEditorSection.style.display = "none";
    this.editingPlan = null;
    this.editingSegments = [];
  }

  updateEditingVisualization() {
    // Update the plan visualization with current editing segments
    if (this.editingSegments.length > 0) {
      const planString = this.planLibrary.segmentsToString(
        this.editingSegments,
      );
      this.drillPlan.parse(planString);
    }
  }

  renderSegments() {
    this.segmentsList.innerHTML = "";

    this.editingSegments.forEach((segment, index) => {
      const item = document.createElement("div");
      item.className = "segment-item";

      const controls = document.createElement("div");
      controls.className = "segment-controls";

      // On control
      const onControl = document.createElement("div");
      onControl.className = "segment-control";
      onControl.innerHTML = `
        <label>On (measures)</label>
        <input type="number" min="1" max="99" value="${segment.on}" data-index="${index}" data-field="on">
      `;
      controls.appendChild(onControl);

      // Off control
      const offControl = document.createElement("div");
      offControl.className = "segment-control";
      offControl.innerHTML = `
        <label>Off (measures)</label>
        <input type="number" min="0" max="99" value="${segment.off}" data-index="${index}" data-field="off">
      `;
      controls.appendChild(offControl);

      // Reps control
      const repsControl = document.createElement("div");
      repsControl.className = "segment-control";
      repsControl.innerHTML = `
        <label>Repetitions</label>
        <input type="number" min="1" max="99" value="${segment.reps}" data-index="${index}" data-field="reps">
      `;
      controls.appendChild(repsControl);

      item.appendChild(controls);

      // Actions
      const actions = document.createElement("div");
      actions.className = "segment-actions";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-segment-btn";
      deleteBtn.textContent = "🗑️";
      deleteBtn.title = "Delete segment";
      deleteBtn.addEventListener("click", () => this.deleteSegment(index));

      actions.appendChild(deleteBtn);
      item.appendChild(actions);

      this.segmentsList.appendChild(item);
    });

    // Add change listeners to all inputs
    this.segmentsList.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", (e) => {
        const index = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        const value = Math.max(
          1,
          Math.min(99, parseInt(e.target.value, 10) || 1),
        );
        if (field === "off") {
          this.editingSegments[index][field] = Math.max(0, value); // Off can be 0
        } else {
          this.editingSegments[index][field] = value;
        }
        e.target.value = this.editingSegments[index][field];
        this.updateEditingVisualization();
      });
    });
  }

  addSegment() {
    this.editingSegments.push({ on: 1, off: 1, reps: 1 });
    this.renderSegments();
    this.updateEditingVisualization();
  }

  deleteSegment(index) {
    if (this.editingSegments.length === 1) {
      alert("You must have at least one segment.");
      return;
    }
    this.editingSegments.splice(index, 1);
    this.renderSegments();
    this.updateEditingVisualization();
  }

  savePlan() {
    const name = this.planNameInput.value.trim();
    if (!name) {
      alert("Please enter a plan name.");
      this.planNameInput.focus();
      return;
    }

    if (this.editingSegments.length === 0) {
      alert("Please add at least one segment.");
      return;
    }

    const plan = {
      name: name,
      description: this.planDescriptionInput.value.trim(),
      difficulty: this.planDifficultyInput.value,
      segments: this.editingSegments,
    };

    if (this.editingPlan && !this.editingPlan.isBuiltIn) {
      // Updating existing plan
      plan.id = this.editingPlan.id;
      plan.createdAt = this.editingPlan.createdAt;
    }

    try {
      this.planLibrary.savePlan(plan);
      this.populatePlanLibrary();
      this.hidePlanEditor();

      // Select the saved plan
      this.planLibrarySelect.value = plan.id;
      const savedPlan = this.planLibrary.getPlanById(plan.id);
      if (savedPlan) {
        this.showPlanInfo(savedPlan);
        this.updateUrlWithPlan(plan.id);
      }
    } catch (error) {
      alert("Error saving plan: " + error.message);
    }
  }

  deletePlan() {
    if (!this.editingPlan || this.editingPlan.isBuiltIn) {
      return;
    }

    if (
      !confirm(
        `Are you sure you want to delete "${this.editingPlan.name}"? This cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      this.planLibrary.deletePlan(this.editingPlan.id);
      this.populatePlanLibrary();
      this.hidePlanEditor();
      this.hidePlanInfo();
      this.planLibrarySelect.value = "";
      this.updateUrlWithPlan(null);
    } catch (error) {
      alert("Error deleting plan: " + error.message);
    }
  }

  clonePlan() {
    if (!this.currentPlan) return;

    const newName = prompt(
      "Enter a name for the cloned plan:",
      `${this.currentPlan.name} (Copy)`,
    );
    if (!newName || !newName.trim()) return;

    try {
      const cloned = this.planLibrary.clonePlan(
        this.currentPlan.id,
        newName.trim(),
      );
      this.populatePlanLibrary();

      // Select and show the cloned plan
      this.planLibrarySelect.value = cloned.id;
      this.showPlanInfo(cloned);
      this.updateUrlWithPlan(cloned.id);
    } catch (error) {
      alert("Error cloning plan: " + error.message);
    }
  }
}
