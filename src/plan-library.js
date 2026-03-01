// Manages plan storage and built-in plan library
class PlanLibrary {
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
        description:
          "1 measure on, 1 measure off - perfect for getting started",
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

  // Get all plans (built-in + custom)
  getAllPlans() {
    const customPlans = this.getCustomPlans();
    return [...this.builtInPlans, ...customPlans];
  }

  // Get only custom (user-created) plans
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

  // Get a plan by ID
  getPlanById(id) {
    const allPlans = this.getAllPlans();
    return allPlans.find((p) => p.id === id);
  }

  // Save a custom plan
  savePlan(plan) {
    // Ensure the plan has required fields
    if (!plan.name || !plan.segments || plan.segments.length === 0) {
      throw new Error("Plan must have a name and at least one segment");
    }

    // Generate ID if not provided
    if (!plan.id) {
      plan.id =
        "custom-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
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

  // Delete a custom plan
  deletePlan(id) {
    const customPlans = this.getCustomPlans();
    const filtered = customPlans.filter((p) => p.id !== id);

    if (filtered.length === customPlans.length) {
      return false; // Plan not found
    }

    StorageManager.set(this.storageKey, JSON.stringify(filtered));
    return true;
  }

  // Clone a plan (useful for immutable built-in plans)
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

  // Convert segments to legacy plan string format
  segmentsToString(segments) {
    return segments.map((seg) => `${seg.on},${seg.off},${seg.reps}`).join(";");
  }

  // Convert legacy plan string to segments
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

  // Calculate plan statistics
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

  // Estimate duration in seconds (based on BPM and time signature)
  estimateDuration(segments, bpm, beatsPerMeasure) {
    const stats = this.calculateStats(segments);
    const beatsPerSecond = bpm / 60.0;
    const totalBeats = (stats.totalMeasures + 1) * beatsPerMeasure; // +1 for click-in
    return Math.ceil(totalBeats / beatsPerSecond);
  }

  // Format duration as MM:SS
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }
}
