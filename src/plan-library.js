import StorageManager from "./storage-manager.js";

/**
 * PlanLibrary manages drill plans including built-in patterns and custom user-created plans.
 * Provides methods for retrieving, creating, modifying, and analyzing practice plans.
 */
class PlanLibrary {
  /**
   * Creates a new PlanLibrary instance.
   * Initializes with built-in practice plans and loads custom plans from storage.
   */
  constructor() {
    this.storageKey = "tempoTrainer.customPlans";
    this.builtInPlans = this._getBuiltInPlans();
  }

  // Get all built-in (immutable) plans
  _getBuiltInPlans() {
    return [
      {
        id: "beginner-simple",
        name: "Beginner: Simple Pattern",
        description: "1 measure on, 1 measure off - perfect for getting started",
        difficulty: "Beginner",
        segments: [{ on: 1, off: 1, reps: 8 }],
        isBuiltIn: true,
        tags: ["beginner", "simple"],
      },
      {
        id: "beginner-extended",
        name: "Beginner: Extended Pattern",
        description: "2 measures on, 2 off - building endurance",
        difficulty: "Beginner",
        segments: [{ on: 2, off: 2, reps: 6 }],
        isBuiltIn: true,
        tags: ["beginner", "endurance"],
      },
      {
        id: "intermediate-pyramid",
        name: "Intermediate: Pyramid (1-4)",
        description: "Classic pyramid pattern building from 1 to 4 measures",
        difficulty: "Intermediate",
        segments: [
          { on: 1, off: 1, reps: 4 },
          { on: 2, off: 2, reps: 4 },
          { on: 3, off: 3, reps: 4 },
          { on: 4, off: 4, reps: 4 },
        ],
        isBuiltIn: true,
        tags: ["intermediate", "pyramid", "progression"],
      },
      {
        id: "intermediate-quick",
        name: "Intermediate: Quick Drill",
        description: "Short, intense practice session",
        difficulty: "Intermediate",
        segments: [{ on: 1, off: 1, reps: 1 }],
        isBuiltIn: true,
        tags: ["intermediate", "quick", "warm-up"],
      },
      {
        id: "advanced-pyramid",
        name: "Advanced: Extended Pyramid (1-8)",
        description: "Full pyramid pattern for advanced endurance training",
        difficulty: "Advanced",
        segments: [
          { on: 1, off: 1, reps: 2 },
          { on: 2, off: 2, reps: 2 },
          { on: 3, off: 3, reps: 2 },
          { on: 4, off: 4, reps: 2 },
          { on: 5, off: 5, reps: 2 },
          { on: 6, off: 6, reps: 2 },
          { on: 7, off: 7, reps: 2 },
          { on: 8, off: 8, reps: 2 },
        ],
        isBuiltIn: true,
        tags: ["advanced", "pyramid", "endurance"],
      },
      {
        id: "advanced-mixed",
        name: "Advanced: Mixed Intervals",
        description: "Varied rest periods to challenge your internal clock",
        difficulty: "Advanced",
        segments: [
          { on: 4, off: 2, reps: 2 },
          { on: 4, off: 4, reps: 2 },
          { on: 4, off: 8, reps: 2 },
          { on: 8, off: 4, reps: 2 },
        ],
        isBuiltIn: true,
        tags: ["advanced", "intervals", "challenging"],
      },
      {
        id: "expert-marathon",
        name: "Expert: Marathon Session",
        description: "Ultimate endurance challenge with long intervals",
        difficulty: "Expert",
        segments: [
          { on: 8, off: 8, reps: 4 },
          { on: 12, off: 4, reps: 2 },
        ],
        isBuiltIn: true,
        tags: ["expert", "marathon", "endurance"],
      },
      {
        id: "expert-precision",
        name: "Expert: Precision Challenge",
        description: "Short bursts requiring maximum focus and accuracy",
        difficulty: "Expert",
        segments: [
          { on: 1, off: 7, reps: 8 },
          { on: 2, off: 6, reps: 4 },
        ],
        isBuiltIn: true,
        tags: ["expert", "precision", "focus"],
      },
    ];
  }

  /**
   * Gets all available plans (built-in and custom).
   * @returns {Array} Array of plan objects
   */
  getAllPlans() {
    const customPlans = this.getCustomPlans();
    return [...this.builtInPlans, ...customPlans];
  }

  /**
   * Gets only user-created custom plans.
   * @returns {Array} Array of custom plan objects
   */
  getCustomPlans() {
    const stored = StorageManager.get(this.storageKey);
    if (!stored) return [];

    try {
      const plans = JSON.parse(stored);
      return Array.isArray(plans) ? plans : [];
    } catch (e) {
      console.error("Failed to parse custom plans:", e);
      return [];
    }
  }

  /**
   * Retrieves a specific plan by its ID.
   * @param {string} id - The plan ID
   * @returns {Object|undefined} The plan object or undefined if not found
   */
  getPlanById(id) {
    const allPlans = this.getAllPlans();
    return allPlans.find((p) => p.id === id);
  }

  /**
   * Saves a custom plan to storage.
   * Creates a new plan or updates existing one by ID.
   * @param {Object} plan - The plan object to save
   * @param {string} plan.name - Plan name (required)
   * @param {Array} plan.segments - Array of segment objects with on/off/reps (required)
   * @param {string} [plan.id] - Optional ID (auto-generates if not provided)
   * @param {string} [plan.description] - Optional description
   * @param {string} [plan.difficulty] - Optional difficulty level
   * @param {Array} [plan.tags] - Optional array of tags
   * @returns {Object} The saved plan object with assigned ID and timestamps
   * @throws {Error} If plan lacks required name or segments
   */
  savePlan(plan) {
    // Ensure the plan has required fields
    if (!plan.name || !plan.segments || plan.segments.length === 0) {
      throw new Error("Plan must have a name and at least one segment");
    }

    // Generate ID if not provided
    if (!plan.id) {
      plan.id = "custom-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    }

    // Mark as custom
    plan.isBuiltIn = false;

    // Ensure metadata exists
    plan.createdAt = plan.createdAt || new Date().toISOString();
    plan.updatedAt = new Date().toISOString();

    const customPlans = this.getCustomPlans();
    const existingIndex = customPlans.findIndex((p) => p.id === plan.id);

    if (existingIndex >= 0) {
      // Update existing plan
      customPlans[existingIndex] = plan;
    } else {
      // Add new plan
      customPlans.push(plan);
    }

    StorageManager.set(this.storageKey, JSON.stringify(customPlans));
    return plan;
  }

  /**
   * Deletes a custom plan from storage.
   * @param {string} id - The ID of the plan to delete
   * @returns {boolean} True if plan was deleted, false if plan not found
   */
  deletePlan(id) {
    const customPlans = this.getCustomPlans();
    const filtered = customPlans.filter((p) => p.id !== id);

    if (filtered.length === customPlans.length) {
      return false; // Plan not found
    }

    StorageManager.set(this.storageKey, JSON.stringify(filtered));
    return true;
  }

  /**
   * Creates a copy of an existing plan as a custom plan.
   * Useful for creating variations of built-in (immutable) plans.
   * @param {string} id - ID of the plan to clone
   * @param {string} [newName] - Optional custom name for the clone
   * @returns {Object} The newly created cloned plan
   * @throws {Error} If source plan not found
   */
  clonePlan(id, newName) {
    const source = this.getPlanById(id);
    if (!source) {
      throw new Error("Plan not found");
    }

    const cloned = {
      name: newName || `${source.name} (Copy)`,
      description: source.description || "",
      difficulty: source.difficulty || "",
      segments: JSON.parse(JSON.stringify(source.segments)), // Deep clone
      tags: [...(source.tags || [])],
    };

    return this.savePlan(cloned);
  }

  /**
   * Converts segment array to legacy plan string format.
   * Format: "on,off,reps;on,off,reps;..."
   * @param {Array} segments - Array of segment objects with on/off/reps properties
   * @returns {string} Formatted plan string
   */
  segmentsToString(segments) {
    return segments.map((seg) => `${seg.on},${seg.off},${seg.reps}`).join(";");
  }

  /**
   * Converts legacy plan string format to segment array.
   * Parses format: "on,off,reps;on,off,reps;..."
   * @param {string} planString - Legacy format plan string
   * @returns {Array} Array of segment objects with on/off/reps properties
   */
  stringToSegments(planString) {
    const segments = [];
    const trimmed = planString.trim();

    if (!trimmed) return segments;

    const steps = trimmed.split(";");
    steps.forEach((step) => {
      const parts = step
        .trim()
        .split(",")
        .map((p) => parseInt(p.trim(), 10));

      if (parts.length === 3 && !parts.some(isNaN)) {
        const [on, off, reps] = parts;
        segments.push({ on, off, reps });
      }
    });

    return segments;
  }

  /**
   * Calculates statistics for the given segments.
   * @param {Array} segments - Array of segment objects with on/off/reps properties
   * @returns {Object} Statistics object with totalMeasures, playingMeasures, restMeasures, segments count
   */
  calculateStats(segments) {
    let totalMeasures = 0;
    let playingMeasures = 0;
    let restMeasures = 0;

    segments.forEach((seg) => {
      const measuresPerRep = seg.on + seg.off;
      const totalForSegment = measuresPerRep * seg.reps;
      totalMeasures += totalForSegment;
      playingMeasures += seg.on * seg.reps;
      restMeasures += seg.off * seg.reps;
    });

    return {
      totalMeasures,
      playingMeasures,
      restMeasures,
      segments: segments.length,
    };
  }

  /**
   * Estimates the duration of a practice session based on plan and tempo.
   * @param {Array} segments - Array of segment objects
   * @param {number} bpm - Beats per minute (tempo)
   * @param {number} beatsPerMeasure - Number of beats in each measure
   * @returns {number} Estimated duration in seconds (rounded up)
   */
  estimateDuration(segments, bpm, beatsPerMeasure) {
    const stats = this.calculateStats(segments);
    const beatsPerSecond = bpm / 60.0;
    const totalBeats = (stats.totalMeasures + 1) * beatsPerMeasure; // +1 for click-in
    return Math.ceil(totalBeats / beatsPerSecond);
  }

  /**
   * Formats a duration in seconds as a human-readable MM:SS string.
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration string (e.g., "2:34")
   */
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }
}

export default PlanLibrary;
