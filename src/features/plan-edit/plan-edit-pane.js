/**
 * PlanEditPane - Web component for plan editing workflow
 * Manages plan selection, creation, editing, visualization, and cloning
 * @module plan-edit-pane
 */

import BaseComponent from "../component/base-component.js";
import { dispatchEvent, querySelector } from "../component/component-utils.js";
import { ChartServiceContext } from "../music/chart-service.js";
import { TimelineServiceContext } from "../music/timeline-service.js";
import "../visualizers/plan-visualizer.js";

/**
 * PlanEditPane component - manages plan library and editing
 *
 * Events emitted:
 * - 'chart-saved': When a chart is saved or updated
 * - 'navigate': When user wants to navigate (data: { pane: string })
 *
 * @extends BaseComponent
 */
export default class PlanEditPane extends BaseComponent {
  constructor() {
    super();

    [this._getCurrentPlan, this._setCurrentPlan] = this.createSignalState(null);
    [this._getIsEditing, this._setIsEditing] = this.createSignalState(false);
    [this._getEditingPlan, this._setEditingPlan] = this.createSignalState(null);
    [this._getEditingSegments, this._setEditingSegments] =
      this.createSignalState([]);

    /** @type {import('../music/chart-service.js').default|null} */
    this.chartService = null;
    /** @type {import('../music/timeline-service.js').default|null} */
    this.timelineService = null;

    // DOM element references (set in onMount; only those needed by effects kept as fields)
    this.planLibrarySelect = null;
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
    this.deletePlanBtn = null;
    this.clonePlanBtn = null;
    this.editPlanBtn = null;
    this.startPlanPlayBtn = null;
    this.planQuickActions = null;

    // Guards against feedback loops when chart-selected listeners re-apply the same plan.
    this._lastPublishedChartId = null;
  }

  getTemplateUrl() {
    return new URL("./plan-edit-pane.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./plan-edit-pane.css", import.meta.url).href;
  }

  async onMount() {
    // Query all DOM elements
    this.planLibrarySelect = querySelector(this, "[data-plan-library-select]");
    this.newPlanBtn = querySelector(this, "[data-new-plan-btn]");
    this.planInfoDisplay = querySelector(this, "[data-plan-info-display]");
    this.planInfoName = querySelector(this, "[data-plan-info-name]");
    this.planInfoDescription = querySelector(
      this,
      "[data-plan-info-description]",
    );
    this.planInfoDifficulty = querySelector(
      this,
      "[data-plan-info-difficulty]",
    );
    this.planStatSegments = querySelector(this, "[data-plan-stat-segments]");
    this.planStatMeasures = querySelector(this, "[data-plan-stat-measures]");
    this.planStatDuration = querySelector(this, "[data-plan-stat-duration]");
    this.planEditorSection = querySelector(this, "[data-plan-editor-section]");
    this.planNameInput = querySelector(this, "[data-plan-name-input]");
    this.planDescriptionInput = querySelector(
      this,
      "[data-plan-description-input]",
    );
    this.planDifficultyInput = querySelector(
      this,
      "[data-plan-difficulty-input]",
    );
    this.segmentsList = querySelector(this, "[data-segments-list]");
    this.deletePlanBtn = querySelector(this, "[data-delete-plan-btn]");
    this.clonePlanBtn = querySelector(this, "[data-clone-plan-btn]");
    this.editPlanBtn = querySelector(this, "[data-edit-plan-btn]");
    this.startPlanPlayBtn = querySelector(this, "[data-start-plan-play-btn]");
    this.planQuickActions = querySelector(this, "[data-plan-quick-actions]");

    // Local-only refs (not needed beyond onMount wire-up)
    const newPlanBtn = querySelector(this, "[data-new-plan-btn]");
    const savePlanBtn = querySelector(this, "[data-save-plan-btn]");
    const cancelEditBtn = querySelector(this, "[data-cancel-edit-btn]");
    const addSegmentBtn = querySelector(this, "[data-add-segment-btn]");

    // --- Effects ---

    // Effect 1: plan info panel
    this.createEffect(() => {
      const plan = this._getCurrentPlan();
      if (!plan) {
        this._lastPublishedChartId = null;
        this.planInfoDisplay.style.display = "none";
        this.clonePlanBtn.style.display = "none";
        this.editPlanBtn.style.display = "none";
        this.startPlanPlayBtn.style.display = "none";
        return;
      }

      this.planInfoName.textContent = plan.name;
      this.planInfoDescription.textContent = plan.description || "";

      if (plan.difficulty) {
        this.planInfoDifficulty.setAttribute(
          "data-difficulty",
          plan.difficulty,
        );
        this.planInfoDifficulty.textContent = plan.difficulty;
      } else {
        this.planInfoDifficulty.setAttribute("data-difficulty", "");
        this.planInfoDifficulty.textContent = "Not specified";
      }

      const { segments: planSegs } = this._segmentsToPlanData(
        plan.segments || [],
      );
      const userSegs = planSegs.filter((s) => !s.isClickIn);
      this.planStatSegments.textContent = userSegs.length;

      const totalMeasures = userSegs.reduce(
        (sum, seg) => sum + (seg.on + seg.off) * seg.reps,
        0,
      );
      this.planStatMeasures.textContent = totalMeasures;

      const bpm = plan.bpm || 120;
      this.planStatDuration.textContent = `${Math.round((totalMeasures * (60000 / bpm) * 4) / 1000)}s`;

      this.planInfoDisplay.style.display = "block";
      this.clonePlanBtn.style.display = "inline-block";
      this.editPlanBtn.style.display = plan.isBuiltIn ? "none" : "inline-block";
      this.startPlanPlayBtn.style.display = "inline-block";

      const selectedId = plan.id || null;
      if (this.chartService && selectedId !== this._lastPublishedChartId) {
        this._lastPublishedChartId = selectedId;
        this.chartService.selectChart(plan);
      }
    });

    // Effect 2: editor layout visibility
    this.createEffect(() => {
      const editing = this._getIsEditing();
      this.planEditorSection.style.display = editing ? "block" : "none";
      this.planQuickActions.style.display = editing ? "none" : "flex";
    });

    // Effect 3: editor form fields
    this.createEffect(() => {
      const plan = this._getEditingPlan();
      if (!plan) return;
      this.planNameInput.value = plan.name || "";
      this.planDescriptionInput.value = plan.description || "";
      this.planDifficultyInput.value = plan.difficulty || "";
      this.deletePlanBtn.style.display =
        plan.id && !plan.isBuiltIn ? "inline-block" : "none";
    });

    // Effect 4: segments editor list + live visualization
    this.createEffect(() => {
      const segments = this._getEditingSegments();
      this.segmentsList.innerHTML = "";
      segments.forEach((segment, index) => {
        const el = document.createElement("div");
        el.className = "segment-item";
        el.dataset.segmentIndex = String(index);
        el.innerHTML = `
          <div class="segment-controls">
            <div class="segment-control">
              <label>On (measures):</label>
              <input type="number" data-on value="${segment.on ?? 1}" min="0" />
            </div>
            <div class="segment-control">
              <label>Off (measures):</label>
              <input type="number" data-off value="${segment.off ?? 0}" min="0" />
            </div>
            <div class="segment-control">
              <label>Reps:</label>
              <input type="number" data-reps value="${segment.reps ?? 1}" min="1" />
            </div>
          </div>
          <div class="segment-actions">
            <button class="delete-segment-btn" data-delete-segment>🗑️</button>
          </div>
        `;
        this.segmentsList.appendChild(el);
      });

      if (segments.length > 0) {
        const planData = this._segmentsToPlanData(segments);
        const editorViz =
          this.planEditorSection?.querySelector("plan-visualizer");
        if (editorViz?.setDrillPlan) editorViz.setDrillPlan(planData);
      }
    });

    // Event delegation on segments list (replaces per-row bindEvent calls)
    this.listen(this.segmentsList, "change", (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      const row = input.closest("[data-segment-index]");
      if (!row) return;
      const index = parseInt(
        /** @type {HTMLElement} */ (row).dataset.segmentIndex,
      );
      const segs = [...this._getEditingSegments()];
      const field =
        "on" in input.dataset ? "on" : "off" in input.dataset ? "off" : "reps";
      segs[index] = {
        ...segs[index],
        [field]: parseInt(input.value) || (field === "reps" ? 1 : 0),
      };
      this._setEditingSegments(segs);
    });

    this.listen(this.segmentsList, "click", (e) => {
      if (
        !(
          /** @type {HTMLElement} */ (e.target).matches("[data-delete-segment]")
        )
      )
        return;
      const row = /** @type {HTMLElement} */ (e.target).closest(
        "[data-segment-index]",
      );
      if (!row) return;
      const index = parseInt(
        /** @type {HTMLElement} */ (row).dataset.segmentIndex,
      );
      const segs = [...this._getEditingSegments()];
      segs.splice(index, 1);
      this._setEditingSegments(segs);
    });

    // --- Context consumers ---

    this.consumeContext(ChartServiceContext, (cs) => {
      this.chartService = cs;
      if (cs) this._populatePlanLibrary();
    });
    this.consumeContext(TimelineServiceContext, (ts) => {
      this.timelineService = ts;
    });

    // --- Button listeners ---

    this.listen(this.planLibrarySelect, "change", () => this._onPlanSelected());
    this.listen(newPlanBtn, "click", () => this._onNewPlan());
    this.listen(this.editPlanBtn, "click", () => this._onEditPlan());
    this.listen(this.clonePlanBtn, "click", () => this._onClonePlan());
    this.listen(savePlanBtn, "click", () => this._onSavePlan());
    this.listen(cancelEditBtn, "click", () => this._onCancelEdit());
    this.listen(this.deletePlanBtn, "click", () => this._onDeletePlan());
    this.listen(addSegmentBtn, "click", () => this._onAddSegment());
    this.listen(this.startPlanPlayBtn, "click", () => this._onStartTraining());
  }

  // --- Public Methods ---

  /**
   * Get the currently selected chart
   * @returns {Object|null}
   */
  getCurrentChart() {
    return this._getCurrentPlan();
  }

  /**
   * Get all plans from the library
   * @returns {Array}
   */
  getAllPlans() {
    return this.chartService ? this.chartService.getAllCharts() : [];
  }

  /**
   * Select a chart by its object (used for retrying from history)
   * @param {Object} chart - Chart object with id and other properties
   */
  selectChartByObject(chart) {
    if (!chart?.id || !this.chartService) return;

    const plan = this.chartService.getChartById(chart.id);

    if (plan) {
      this.planLibrarySelect.value = plan.id || "";
      this._setCurrentPlan(plan);
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
    const newUrl = params.toString()
      ? `?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }

  // --- Private Methods ---

  /**
   * Populate the plan library dropdown
   */
  _populatePlanLibrary() {
    const plans = this.chartService ? this.chartService.getAllCharts() : [];
    this.planLibrarySelect.innerHTML =
      '<option value="">Select a plan...</option>';
    plans.forEach((plan) => {
      const option = document.createElement("option");
      option.value = plan.id || "";
      option.textContent = plan.name;
      this.planLibrarySelect.appendChild(option);
    });

    const params = new URLSearchParams(window.location.search);
    const planId = params.get("plan");
    if (planId) {
      this.planLibrarySelect.value = planId;
      const plan = this.chartService?.getChartById(planId);
      if (plan) this._setCurrentPlan(plan);
    }
  }

  _onPlanSelected() {
    if (!this.planLibrarySelect.value) {
      this._setCurrentPlan(null);
      this.updateUrlWithPlan(null);
      return;
    }
    const plan = this.chartService?.getChartById(this.planLibrarySelect.value);
    if (plan) {
      this._setCurrentPlan(plan);
      this.updateUrlWithPlan(plan.id || null);
    }
  }

  _onNewPlan() {
    this.planLibrarySelect.value = "";
    this._setEditingPlan({ segments: [] });
    this._setEditingSegments([]);
    this._setIsEditing(true);
  }

  _onEditPlan() {
    const plan = this._getCurrentPlan();
    if (!plan || plan.isBuiltIn) return;
    this._setEditingPlan({ ...plan });
    this._setEditingSegments([...(plan.segments || [])]);
    this._setIsEditing(true);
  }

  _onClonePlan() {
    const plan = this._getCurrentPlan();
    if (!plan) return;
    const cloned = { ...plan, id: undefined, name: `${plan.name} (Copy)` };
    this._setEditingPlan(cloned);
    this._setEditingSegments([...(plan.segments || [])]);
    this._setIsEditing(true);
  }

  _onSavePlan() {
    if (!this.chartService) return;

    const editingPlan = this._getEditingPlan();
    const editingBuiltIn = Boolean(editingPlan?.isBuiltIn);
    const planData = {
      id: editingBuiltIn ? undefined : editingPlan.id,
      name: this.planNameInput.value || "Untitled",
      description: this.planDescriptionInput.value,
      difficulty: this.planDifficultyInput.value || undefined,
      segments: this._getEditingSegments(),
      bpm: this.timelineService?.tempo ?? 120,
    };

    if (!planData.name.trim()) {
      alert("Plan name cannot be empty");
      return;
    }
    if (planData.segments.length === 0) {
      alert("Plan must have at least one segment");
      return;
    }

    try {
      const savedPlan = this.chartService.saveChart(planData);
      this._setIsEditing(false);
      this._populatePlanLibrary();
      this.planLibrarySelect.value = savedPlan.id || "";
      this._setCurrentPlan(savedPlan);
      dispatchEvent(this, "chart-saved", { chart: savedPlan });
    } catch (e) {
      console.error("Failed to save plan:", e);
      alert("Failed to save plan");
    }
  }

  _onCancelEdit() {
    this._setIsEditing(false);
    const current = this._getCurrentPlan();
    if (current) {
      this.planLibrarySelect.value = current.id || "";
    } else {
      this.planLibrarySelect.value = "";
      this._setCurrentPlan(null);
    }
  }

  _onDeletePlan() {
    const editingPlan = this._getEditingPlan();
    if (!editingPlan?.id || editingPlan.isBuiltIn) return;
    if (!this.chartService) return;

    if (!confirm(`Delete "${editingPlan.name}"?`)) return;

    try {
      this.chartService.deleteChart(editingPlan.id);
      this._setIsEditing(false);
      this._populatePlanLibrary();
      this.planLibrarySelect.value = "";
      this._setCurrentPlan(null);
    } catch (e) {
      console.error("Failed to delete plan:", e);
      alert("Failed to delete plan");
    }
  }

  _onAddSegment() {
    this._setEditingSegments([
      ...this._getEditingSegments(),
      { on: 1, off: 1, reps: 1 },
    ]);
  }

  _onStartTraining() {
    if (this._getCurrentPlan()) {
      dispatchEvent(this, "navigate", { pane: "plan-play" });
    }
  }

  /**
   * Normalize UI/library segment shapes into DrillPlan object format.
   * Returns { plan: Measure[], segments: DrillSegment[] } directly without string roundtrip.
   * @param {Array} rawSegments
   * @returns {{ plan: Array<{type:string}>, segments: Array }}
   */
  _segmentsToPlanData(rawSegments) {
    const plan = [];
    const segs = [];

    const segments = (Array.isArray(rawSegments) ? rawSegments : [])
      .map((segment) => {
        if (
          typeof segment?.on === "number" &&
          typeof segment?.off === "number" &&
          typeof segment?.reps === "number"
        ) {
          return {
            on: Math.max(0, segment.on),
            off: Math.max(0, segment.off),
            reps: Math.max(1, segment.reps),
          };
        }
        if (typeof segment?.measures === "number") {
          return { on: Math.max(0, segment.measures), off: 0, reps: 1 };
        }
        return null;
      })
      .filter(Boolean);

    segs.push({ isClickIn: true, on: 1, off: 0, reps: 1, startIndex: 0 });
    plan.push({ type: "click-in" });

    let currentIndex = 1;
    for (const { on, off, reps } of segments) {
      segs.push({ on, off, reps, startIndex: currentIndex });
      for (let rep = 0; rep < reps; rep++) {
        for (let i = 0; i < on; i++) {
          plan.push({ type: "click" });
          currentIndex++;
        }
        for (let i = 0; i < off; i++) {
          plan.push({ type: "silent" });
          currentIndex++;
        }
      }
    }

    return { plan, segments: segs };
  }

  /**
   * Normalize UI/library segment shapes into DrillPlan parse string format.
   * @param {Array} segments
   * @returns {string}
   * @deprecated Use _segmentsToPlanData() instead
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
          return { on: Math.max(0, segment.measures), off: 0, reps: 1 };
        }

        return null;
      })
      .filter((segment) => segment !== null);

    return normalized
      .map((segment) => `${segment.on},${segment.off},${segment.reps}`)
      .join(";");
  }
}

// Register the component
customElements.define("plan-edit-pane", PlanEditPane);
