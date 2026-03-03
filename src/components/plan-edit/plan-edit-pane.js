/**
 * PlanEditPane - Web component for plan editing workflow
 * Manages plan selection, creation, editing, visualization, and cloning
 * @module plan-edit-pane
 */

import BaseComponent from "../base/base-component.js";
import { querySelector, bindEvent, dispatchEvent } from "../base/component-utils.js";

/**
 * @typedef {Object} PlanEditState
 * @property {boolean} isEditing - Whether currently in edit mode
 * @property {string|null} currentPlanId - ID of currently selected plan
 */

/**
 * PlanEditPane component - manages plan library and editing
 *
 * Events emitted:
 * - 'plan-selected': When a plan is selected for playback
 * - 'plan-saved': When a plan is saved or updated
 * - 'navigate': When user wants to navigate (data: { pane: string })
 *
 * @extends BaseComponent
 */
export default class PlanEditPane extends BaseComponent {
  constructor() {
    super();

    /** @type {PlanEditState} */
    this.state = {
      isEditing: false,
      currentPlanId: null,
    };

    /** @type {Array<() => void>} */
    this._cleanups = [];

    // Injected dependencies (set externally)
    this.planLibrary = null;
    this.drillPlan = null;
    this.bpmInput = null;
    this.timeSignatureSelect = null;

    // DOM element references (set in onMount)
    this.planLibrarySelect = null;
    this.newPlanBtn = null;
    this.planInfoDisplay = null;
    this.planInfoName = null;
    this.planInfoDescription = null;
    this.planInfoDifficulty = null;
    this.planStatSegments = null;
    this.planStatMeasures = null;
    this.planStatDuration = null;
    this.planEditorSection = null;
    this.planNameInput = null;
    this.planDescriptionInput = null;
    this.planDifficultyInput = null;
    this.segmentsList = null;
    this.addSegmentBtn = null;
    this.savePlanBtn = null;
    this.cancelEditBtn = null;
    this.deletePlanBtn = null;
    this.clonePlanBtn = null;
    this.editPlanBtn = null;
    this.startPlanPlayBtn = null;
    this.planQuickActions = null;
    this.planVisualizationContainer = null;

    // UI state
    /** @type {Object|null} */
    this.currentPlan = null;
    /** @type {Object|null} */
    this.editingPlan = null;
    /** @type {Array} */
    this.editingSegments = [];
  }

  getTemplateUrl() {
    return "/src/components/plan-edit/plan-edit-pane.html";
  }

  getStyleUrl() {
    return "/src/components/plan-edit/plan-edit-pane.css";
  }

  async onMount() {
    // Query all DOM elements
    this.planLibrarySelect = querySelector(this, "[data-plan-library-select]");
    this.newPlanBtn = querySelector(this, "[data-new-plan-btn]");
    this.planInfoDisplay = querySelector(this, "[data-plan-info-display]");
    this.planInfoName = querySelector(this, "[data-plan-info-name]");
    this.planInfoDescription = querySelector(this, "[data-plan-info-description]");
    this.planInfoDifficulty = querySelector(this, "[data-plan-info-difficulty]");
    this.planStatSegments = querySelector(this, "[data-plan-stat-segments]");
    this.planStatMeasures = querySelector(this, "[data-plan-stat-measures]");
    this.planStatDuration = querySelector(this, "[data-plan-stat-duration]");
    this.planEditorSection = querySelector(this, "[data-plan-editor-section]");
    this.planNameInput = querySelector(this, "[data-plan-name-input]");
    this.planDescriptionInput = querySelector(this, "[data-plan-description-input]");
    this.planDifficultyInput = querySelector(this, "[data-plan-difficulty-input]");
    this.segmentsList = querySelector(this, "[data-segments-list]");
    this.addSegmentBtn = querySelector(this, "[data-add-segment-btn]");
    this.savePlanBtn = querySelector(this, "[data-save-plan-btn]");
    this.cancelEditBtn = querySelector(this, "[data-cancel-edit-btn]");
    this.deletePlanBtn = querySelector(this, "[data-delete-plan-btn]");
    this.clonePlanBtn = querySelector(this, "[data-clone-plan-btn]");
    this.editPlanBtn = querySelector(this, "[data-edit-plan-btn]");
    this.startPlanPlayBtn = querySelector(this, "[data-start-plan-play-btn]");
    this.planQuickActions = querySelector(this, "[data-plan-quick-actions]");
    this.planVisualizationContainer = querySelector(this, "[data-plan-visualization-container]");

    // Bind event listeners
    this._cleanups.push(bindEvent(this.planLibrarySelect, "change", () => this._onPlanSelected()));
    this._cleanups.push(bindEvent(this.newPlanBtn, "click", () => this._onNewPlan()));
    this._cleanups.push(bindEvent(this.editPlanBtn, "click", () => this._onEditPlan()));
    this._cleanups.push(bindEvent(this.clonePlanBtn, "click", () => this._onClonePlan()));
    this._cleanups.push(bindEvent(this.savePlanBtn, "click", () => this._onSavePlan()));
    this._cleanups.push(bindEvent(this.cancelEditBtn, "click", () => this._onCancelEdit()));
    this._cleanups.push(bindEvent(this.deletePlanBtn, "click", () => this._onDeletePlan()));
    this._cleanups.push(bindEvent(this.addSegmentBtn, "click", () => this._onAddSegment()));
    this._cleanups.push(bindEvent(this.startPlanPlayBtn, "click", () => this._onStartTraining()));
  }

  onUnmount() {
    this._cleanups.forEach((cleanup) => cleanup());
    this._cleanups = [];
  }

  /**
   * Initialize the component with dependencies
   * @param {PlanLibrary} planLibrary
   * @param {DrillPlan} drillPlan
   * @param {HTMLInputElement} bpmInput
   * @param {HTMLSelectElement} timeSignatureSelect
   */
  init(planLibrary, drillPlan, bpmInput, timeSignatureSelect) {
    this.planLibrary = planLibrary;
    this.drillPlan = drillPlan;
    this.bpmInput = bpmInput;
    this.timeSignatureSelect = timeSignatureSelect;

    this._populatePlanLibrary();
  }

  // --- Public Methods ---

  /**
   * Get the currently selected plan
   * @returns {Object|null}
   */
  getCurrentPlan() {
    return this.currentPlan;
  }

  /**
   * Get all plans from the library
   * @returns {Array}
   */
  getAllPlans() {
    return this.planLibrary ? this.planLibrary.getAllPlans() : [];
  }

  /**
   * Select a plan by its object (used for retrying from history)
   * @param {Object} planObject - Plan object with id and other properties
   */
  selectPlanByObject(planObject) {
    if (!planObject || !planObject.id) return;

    const plan = this.planLibrary.getPlanById(planObject.id);
    if (plan) {
      this.planLibrarySelect.value = plan.id || "";
      this._showPlanInfo(plan);
      this.updateUrlWithPlan(plan.id || null);
    }
  }

  /**
   * Update URL with the selected plan ID
   * @param {string|null} planId
   */
  updateUrlWithPlan(planId) {
    const params = new URLSearchParams(window.location.search);
    if (planId) {
      params.set("plan", planId);
    } else {
      params.delete("plan");
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }

  // --- Private Methods ---

  /**
   * Populate the plan library dropdown
   */
  _populatePlanLibrary() {
    if (!this.planLibrary) return;

    const plans = this.planLibrary.getAllPlans();
    this.planLibrarySelect.innerHTML = '<option value="">Select a plan...</option>';

    plans.forEach((plan) => {
      const option = document.createElement("option");
      option.value = plan.id || "";
      option.textContent = plan.name;
      this.planLibrarySelect.appendChild(option);
    });

    // Check if there's a plan in the URL
    const params = new URLSearchParams(window.location.search);
    const planId = params.get("plan");
    if (planId) {
      this.planLibrarySelect.value = planId;
      const plan = this.planLibrary.getPlanById(planId);
      if (plan) {
        this._showPlanInfo(plan);
      }
    }
  }

  /**
   * Handle plan selection
   */
  _onPlanSelected() {
    if (!this.planLibrarySelect.value) {
      this._hidePlanInfo();
      this.updateUrlWithPlan(null);
      return;
    }

    const plan = this.planLibrary.getPlanById(this.planLibrarySelect.value);
    if (plan) {
      this._showPlanInfo(plan);
      this.updateUrlWithPlan(plan.id || null);
    }
  }

  /**
   * Normalize UI/library segment shapes into DrillPlan parse string format.
   * Format: "on,off,reps;on,off,reps"
   * @param {Array} segments
   * @returns {string}
   */
  _segmentsToPlanString(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return "";

    const normalized = segments
      .map((segment) => {
        const hasLibraryShape =
          typeof segment?.on === "number" &&
          typeof segment?.off === "number" &&
          typeof segment?.reps === "number";

        if (hasLibraryShape) {
          return {
            on: Math.max(0, segment.on),
            off: Math.max(0, segment.off),
            reps: Math.max(1, segment.reps),
          };
        }

        const hasLegacyShape = typeof segment?.measures === "number";
        if (hasLegacyShape) {
          return {
            on: Math.max(0, segment.measures),
            off: 0,
            reps: 1,
          };
        }

        return null;
      })
      .filter((segment) => segment !== null);

    return normalized.map((segment) => `${segment.on},${segment.off},${segment.reps}`).join(";");
  }

  /**
   * Display plan information
   * @param {Object} plan
   */
  _showPlanInfo(plan) {
    this.currentPlan = plan;
    this.setState({ currentPlanId: plan.id || null });

    this.planInfoName.textContent = plan.name;
    this.planInfoDescription.textContent = plan.description || "";

    if (plan.difficulty) {
      this.planInfoDifficulty.setAttribute("data-difficulty", plan.difficulty);
      this.planInfoDifficulty.textContent = plan.difficulty;
    } else {
      this.planInfoDifficulty.setAttribute("data-difficulty", "");
      this.planInfoDifficulty.textContent = "Not specified";
    }

    const segments = plan.segments || [];
    const planString = this._segmentsToPlanString(segments);
    const normalizedSegments = planString
      ? planString.split(";").map((step) => {
          const [on, off, reps] = step.split(",").map((value) => parseInt(value, 10));
          return { on, off, reps };
        })
      : [];

    this.planStatSegments.textContent = normalizedSegments.length;

    const totalMeasures = normalizedSegments.reduce(
      (sum, seg) => sum + (seg.on + seg.off) * seg.reps,
      0
    );
    this.planStatMeasures.textContent = totalMeasures;

    const bpm = plan.bpm || 120;
    const beatDuration = (60000 / bpm) * 4; // Assume 4/4 time
    const durationMs = totalMeasures * beatDuration;
    const durationSeconds = Math.round(durationMs / 1000);
    this.planStatDuration.textContent = `${durationSeconds}s`;

    this.planInfoDisplay.style.display = "block";

    // Update visualization
    if (this.drillPlan) {
      try {
        this.drillPlan.parse(planString);
      } catch (e) {
        console.error("Failed to visualize plan:", e);
      }
    }

    // Show/hide action buttons
    this.clonePlanBtn.style.display = "inline-block";
    this.editPlanBtn.style.display = plan.isBuiltIn ? "none" : "inline-block";
    this.startPlanPlayBtn.style.display = "inline-block";
  }

  /**
   * Hide plan information
   */
  _hidePlanInfo() {
    this.currentPlan = null;
    this.setState({ currentPlanId: null });
    this.planInfoDisplay.style.display = "none";
    this.clonePlanBtn.style.display = "none";
    this.editPlanBtn.style.display = "none";
    this.startPlanPlayBtn.style.display = "none";
    this.planVisualizationContainer.innerHTML = "<h3>Plan Visualization</h3>";
  }

  /**
   * Show the plan editor for a new or existing plan
   * @param {Object|null} plan
   */
  _showPlanEditor(plan) {
    this.editingPlan = plan ? { ...plan } : { segments: [] };
    this.editingSegments = plan ? [...(plan.segments || [])] : [];

    if (plan) {
      this.planNameInput.value = plan.name || "";
      this.planDescriptionInput.value = plan.description || "";
      this.planDifficultyInput.value = plan.difficulty || "";
      this.deletePlanBtn.style.display = plan.isBuiltIn ? "none" : "inline-block";
    } else {
      this.planNameInput.value = "";
      this.planDescriptionInput.value = "";
      this.planDifficultyInput.value = "";
      this.deletePlanBtn.style.display = "none";
    }

    this.setState({ isEditing: true });
    this.planEditorSection.style.display = "block";
    this.planQuickActions.style.display = "none";
    this._renderSegmentsList();
  }

  /**
   * Hide the plan editor
   */
  _hidePlanEditor() {
    this.setState({ isEditing: false });
    this.planEditorSection.style.display = "none";
    this.planQuickActions.style.display = "flex";
  }

  /**
   * Render the segments list
   */
  _renderSegmentsList() {
    this.segmentsList.innerHTML = "";

    this.editingSegments.forEach((segment, index) => {
      const segmentEl = document.createElement("div");
      segmentEl.className = "segment-item";

      segmentEl.innerHTML = `
        <div class="segment-controls">
          <div class="segment-control">
            <label>On (measures):</label>
            <input type="number" data-on value="${segment.on || 1}" min="0" />
          </div>
          <div class="segment-control">
            <label>Off (measures):</label>
            <input type="number" data-off value="${segment.off || 0}" min="0" />
          </div>
          <div class="segment-control">
            <label>Reps:</label>
            <input type="number" data-reps value="${segment.reps || 1}" min="1" />
          </div>
        </div>
        <div class="segment-actions">
          <button class="delete-segment-btn" data-delete-segment>🗑️</button>
        </div>
      `;

      const onInput = segmentEl.querySelector("[data-on]");
      const offInput = segmentEl.querySelector("[data-off]");
      const repsInput = segmentEl.querySelector("[data-reps]");
      const deleteBtn = segmentEl.querySelector("[data-delete-segment]");

      const updateSegment = () => {
        this.editingSegments[index].on = parseInt(onInput.value) || 0;
        this.editingSegments[index].off = parseInt(offInput.value) || 0;
        this.editingSegments[index].reps = parseInt(repsInput.value) || 1;
        this._updateEditorVisualization();
      };

      this._cleanups.push(bindEvent(onInput, "change", updateSegment));
      this._cleanups.push(bindEvent(offInput, "change", updateSegment));
      this._cleanups.push(bindEvent(repsInput, "change", updateSegment));

      this._cleanups.push(
        bindEvent(deleteBtn, "click", () => {
          this.editingSegments.splice(index, 1);
          this._renderSegmentsList();
          this._updateEditorVisualization();
        })
      );

      this.segmentsList.appendChild(segmentEl);
    });

    this._updateEditorVisualization();
  }

  /**
   * Handle "New Plan" button
   */
  _onNewPlan() {
    this.planLibrarySelect.value = "";
    this._showPlanEditor(null);
  }

  /**
   * Handle "Edit Plan" button
   */
  _onEditPlan() {
    if (this.currentPlan && !this.currentPlan.isBuiltIn) {
      this._showPlanEditor(this.currentPlan);
    }
  }

  /**
   * Handle "Clone Plan" button
   */
  _onClonePlan() {
    if (!this.currentPlan) return;

    const clonedPlan = {
      ...this.currentPlan,
      id: undefined, // Let library assign new ID
      name: `${this.currentPlan.name} (Copy)`,
    };

    this._showPlanEditor(clonedPlan);
  }

  /**
   * Handle "Save Plan" button
   */
  _onSavePlan() {
    if (!this.planLibrary) return;

    // Built-in plans are immutable; if this path is reached unexpectedly,
    // save as a new custom plan instead of mutating built-in identity.
    const editingBuiltIn = Boolean(this.editingPlan?.isBuiltIn);

    const planData = {
      id: editingBuiltIn ? undefined : this.editingPlan.id,
      name: this.planNameInput.value || "Untitled",
      description: this.planDescriptionInput.value,
      difficulty: this.planDifficultyInput.value || undefined,
      segments: this.editingSegments,
      bpm: this.bpmInput?.value ? parseInt(this.bpmInput.value) : 120,
    };

    // Validate
    if (!planData.name.trim()) {
      alert("Plan name cannot be empty");
      return;
    }
    if (planData.segments.length === 0) {
      alert("Plan must have at least one segment");
      return;
    }

    try {
      const savedPlan = this.planLibrary.savePlan(planData);
      this._hidePlanEditor();
      this._populatePlanLibrary();
      this.planLibrarySelect.value = savedPlan.id || "";
      this._showPlanInfo(savedPlan);

      // Emit event
      dispatchEvent(this, "plan-saved", { plan: savedPlan });
    } catch (e) {
      console.error("Failed to save plan:", e);
      alert("Failed to save plan");
    }
  }

  /**
   * Handle "Cancel Edit" button
   */
  _onCancelEdit() {
    this._hidePlanEditor();
    if (this.currentPlan) {
      this.planLibrarySelect.value = this.currentPlan.id || "";
      this._showPlanInfo(this.currentPlan);
    } else {
      this.planLibrarySelect.value = "";
      this._hidePlanInfo();
    }
  }

  /**
   * Handle "Delete Plan" button
   */
  _onDeletePlan() {
    if (!this.planLibrary || !this.editingPlan?.id || this.editingPlan.isBuiltIn) return;

    if (!confirm(`Delete "${this.editingPlan.name}"?`)) {
      return;
    }

    try {
      this.planLibrary.deletePlan(this.editingPlan.id);
      this._hidePlanEditor();
      this._populatePlanLibrary();
      this.planLibrarySelect.value = "";
      this._hidePlanInfo();
    } catch (e) {
      console.error("Failed to delete plan:", e);
      alert("Failed to delete plan");
    }
  }

  /**
   * Handle "Add Segment" button
   */
  _onAddSegment() {
    this.editingSegments.push({
      on: 1,
      off: 1,
      reps: 1,
    });
    this._renderSegmentsList();
  }

  /**
   * Update visualization during editing
   */
  _updateEditorVisualization() {
    if (!this.drillPlan || this.editingSegments.length === 0) {
      return;
    }

    try {
      const planString = this._segmentsToPlanString(this.editingSegments);
      if (planString) {
        this.drillPlan.parse(planString);
      }
    } catch (e) {
      console.error("Failed to update visualization:", e);
    }
  }

  /**
   * Handle "Start Training" button
   */
  _onStartTraining() {
    if (this.currentPlan) {
      // Parse plan for visualization
      if (this.drillPlan) {
        try {
          const planString = this._segmentsToPlanString(this.currentPlan.segments || []);
          this.drillPlan.parse(planString);
        } catch (e) {
          console.error("Failed to parse plan:", e);
        }
      }

      // Emit navigation event
      dispatchEvent(this, "navigate", { pane: "plan-play" });
    }
  }
}

// Register the component
customElements.define("plan-edit-pane", PlanEditPane);
