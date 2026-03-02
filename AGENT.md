# AGENT Development Guide

_How to implement features in Tempo Trainer with clarity, maintainability, and measurable impact_

---

## Core Philosophy

This project embodies a **measurement-first** approach to drum training software.

- **Accuracy before features** — Reliability of timing detection supercedes new functionality
- **Signal quality before ML** — Robust signal processing beats complex algorithms
- **Measurable improvement over gamification** — Track real skill progression, not engagement
- **Progressive overload** — Training difficulty scales with demonstrated competency
- **Long-term session analytics** — Every session feeds into longitudinal improvement models

This philosophy guides every decision: from onset detection fidelity to UI layout to feature prioritization.

---

## Semantic Gradient

Features exist at multiple levels of abstraction. Understanding this hierarchy helps place code correctly:

### High-Level Intent

```
Using a microphone to detect and score the timing of drum beats
in order to teach drumming skills
```

### Semantic Concepts

- **microphone** → audio input capture & device selection
- **detect** → onset detection, spectral analysis, triggering
- **score** → timing accuracy measurement, metric derivation
- **timing** → latency calibration, phase relationships
- **drum** → instrument classification, frequency-band analysis
- **beat** → metronome reference, measure subdivision
- **teach** → feedback loop, recommendation generation
- **skills** → tracked competencies (drift, consistency, rhythm, etc.)

### Organizational Level (Modules)

- `microphone-detector.js` — raw input handling
- `drill-plan.js` — plan visualization and parsing
- `plan-editor-ui.js` — plan creation interface
- `practice-session-manager.js` — session data persistence
- `history-display-ui.js` — progress review and trending
- `timeline.js` — beat visualization
- `metronome.js` — tempo reference
- `scorer.js` — measure-by-measure accuracy
- `pane-manager.js` — navigation wiring

### Implementation Level (Methods, Functions)

- `MicrophoneDetector.setLevel()` — threshold adjustment
- `Scorer.deriveMetrics()` — calculate drift, missed, rhythm, etc.
- `HistoryDisplayUI.analyzeTrend()` — detect fatigue or improvement patterns

**Placement Rule:** Code belongs at the **smallest semantic scope** where it can be expressed clearly. If a feature spans semantic levels, decompose it into multiple modules.

---

## Architecture Patterns

### 1. Feature Modules (Pillars)

Each major feature is a self-contained class:

```javascript
class MicrophoneDetector {
  constructor() { ... }
  start() { ... }
  stop() { ... }
  onHit(callback) { ... }  // Callback-based events
}
```

**Design rules:**

- One semantic concept per module
- Callbacks expose events, not tight coupling
- No direct DOM manipulation (wiring layer handles it)
- Minimal dependencies on other modules

### 2. Wiring Layer (script.js)

The wiring layer connects features together. It:

- Instantiates all feature modules with dependencies
- Wires callbacks between features
- Gets DOM references and passes to features
- Orchestrates data flow on lifecycle events

```javascript
// In script.js:
const sessionManager = new PracticeSessionManager();
const microphone = new MicrophoneDetector();
const history = new HistoryDisplayUI();

microphone.onHit((timestamp) => {
  sessionManager.recordHit(timestamp);
});

drillPlan.onMeasureEnd(() => {
  const score = scorer.calculateMeasureScore();
  sessionManager.recordMeasureScore(score);
});
```

**Design rule:** Wiring layer changes signal that features are too coupled. Refactor to reduce dependencies.

### 3. Callback-Based Events

Don't import features into each other. Use event callbacks:

```javascript
// GOOD:
detector.onHit(callback); // Feature exposes event
microphone.onCalibrate(cb); // Feature emits when ready

// BAD:
class SessionManager {
  constructor(microphone) {
    this.detector = microphone; // Tight coupling
  }
}
```

**Design rule:** If feature A needs to know about feature B, make B emit an event that A listens to.

### 4. localStorage-First State

All persistent state lives in localStorage:

```javascript
class PlanLibrary {
  getPlan(id) {
    const plans = JSON.parse(localStorage.getItem("tempoTrainer.plans"));
    return plans[id];
  }
}
```

**Design rules:**

- Use `localStorage.getItem()` for reads
- Use `localStorage.setItem()` for writes
- Namespace all keys: `tempoTrainer.{entity}`
- Deriving/computed data should NOT be stored

---

## How to Write a New Feature

### Step 1: Identify the Semantic Scope

Ask: "What single drum training concept does this feature represent?"

- Detection fidelity → `MicrophoneDetector`
- Timing accuracy → `Scorer`
- Practice feedback → `HistoryDisplayUI`
- Plan visualization → `DrillPlan`

### Step 2: Determine Module Type

Choose **one**:

| Module Type    | Purpose                    | Example                                     | Storage              |
| -------------- | -------------------------- | ------------------------------------------- | -------------------- |
| **Data**       | Record and retrieve facts  | `PracticeSessionManager`                    | localStorage         |
| **Processing** | Compute, analyze, classify | `Scorer`, `HistoryDisplayUI.analyzeTrend()` | Computed on-demand   |
| **UI**         | Display & user interaction | `PlanEditorUI`, `Timeline`                  | DOM (ephemeral)      |
| **System**     | Bridge features together   | `MicrophoneDetector`, `Metronome`           | Stateless or minimal |

### Step 3: Define the Interface

Write public methods/callbacks before implementation:

```javascript
class NewFeature {
  /**
   * Brief description
   * @param {Type} param - Parameter description
   * @returns {Type} Return description
   */
  publicMethod(param) {
    // Implement
  }

  /**
   * Called when ... [event name]
   * @callback onEventName
   * @param {Type} eventData - What the event carries
   */
  onEventName(callback) {
    this.eventCallback = callback;
  }
}
```

### Step 4: Implement with Minimal Dependencies

Depend on:

- **localStorage** (for data retrieval)
- **DOM references** (passed in by wiring layer)
- **Callbacks** (from other features)

Avoid:

- Direct imports of other feature modules
- Global state
- Reaching into DOM that's not passed in

### Step 5: Wire Into script.js

```javascript
// In script.js init():
const newFeature = new NewFeature(domRef);

// Connect to other features:
microphone.onHit((ts) => newFeature.handleHit(ts));
newFeature.onStateChange((state) => history.refresh());
```

### Step 6: Add JSDoc Types

Document parameters and returns with JSDoc:

```javascript
/**
 * Analyzes performance trends across sessions
 * @param {Object[]} sessions - Array of session records
 * @param {number} sessions[].score - Session accuracy score
 * @returns {Object} Trend analysis with improvement/fatigue flags
 */
analyzeTrend(sessions) {
  // ...
}
```

Run `./scripts/check` to validate types.

### Step 7: Test Measurable Behavior

Test that the feature:

- **Records correctly**: Data persists in localStorage
- **Computes correctly**: Metrics match expected values
- **Triggers correctly**: Callbacks fire at right times
- **Integrates correctly**: Other features respond to changes

Example:

```javascript
// Test new Scorer changes:
const sessionData = { hits: [100, 200, 300], measures: [0, 1, 2] };
const metrics = scorer.deriveMetrics(sessionData);
assert(metrics.drift > 0, "Should detect drift");
assert(metrics.consistency < 1.0, "Should show variance");
```

---

## Common Patterns

### Pattern 1: Parse → Render → Track

Many features follow this cycle:

```javascript
class DrillPlan {
  /**
   * Parse drill string into structured data
   * @param {string} planString - Plan text
   * @returns {Object} Parsed plan with segments, measures
   */
  parse(planString) {
    // Break into measures, tracks, segments
    return { measures: [...], segments: [...] };
  }

  /**
   * Render parsed plan to DOM
   * @param {HTMLElement} container - Target element
   */
  render(container) {
    // Create flex layout, add measure divs, etc.
  }

  /**
   * Update measure after scoring
   * @param {number} measureIndex - Which measure
   * @param {number} score - Accuracy score 0-1
   */
  updateMeasureScore(measureIndex, score) {
    // Modify DOM to show visual feedback
  }
}
```

### Pattern 2: Record → Derive → Display

Data flows: collection → computation → presentation

```javascript
// Record
sessionManager.recordHit(timestamp);

// Derive (in calculateMeasureScore)
const drift = hits.reduce((sum, h) => sum + Math.abs(h - expected), 0);
const metrics = { drift, missed: missingCount, ... };

// Display (in HistoryDisplayUI)
history.renderMetrics(metrics);
```

### Pattern 3: Feedback Loop

User action → measurement → recommendation → next action

```javascript
// User completes session
finalizeRun() {
  sessionManager.saveSession(sessionData);  // Record
  sessionManager.deriveMetrics();           // Compute

  history.displaySessions();                // Show results
  history.generateRecommendations();        // Suggest next steps

  paneManager.navigate('plan-history');     // Prompt review
}
```

---

## Refactoring Guide

### When to Refactor

1. **Feature leak** — A module handles two semantic concepts
   - Fix: Split into separate modules
2. **Tight coupling** — Module A imports module B directly
   - Fix: Use callbacks instead; wire in script.js
3. **God class** — A module >400 lines doing unrelated things
   - Fix: Extract sub-features and wiring
4. **Wiring complexity** — script.js >600 lines
   - Fix: Group related wiring into sub-wiring modules

### How to Refactor

1. **Identify what to extract** (class, methods, state)
2. **Create new module** with minimal interface
3. **Write JSDoc** for new public API
4. **Update wiring** in script.js
5. **Run tests** to verify behavior unchanged
6. **Delete old code** from original module
7. **Run `./scripts/lint` and `./scripts/check`** to validate

Example: Moving recommendations from `PracticeSessionManager` to `HistoryDisplayUI`:

```javascript
// Before: recommendation logic in SessionManager
class PracticeSessionManager {
  getRecommendations(sessionId) {
    const session = this.getSessions()[sessionId];
    // 50 lines of trend analysis...
    return recommendations;
  }
}

// After: move to UI layer where results are displayed
class HistoryDisplayUI {
  generateRecommendations(session) {
    // Same logic, now in presentation layer
    return recommendations;
  }
}

// Update wiring:
// old: const recs = sessionManager.getRecommendations(id);
// new: const recs = history.generateRecommendations(session);
```

---

## Code Quality Standards

### JSDoc Coverage

Every **public** method must have JSDoc:

```javascript
/**
 * Record a drum hit timestamp
 * @param {number} timestamp - Audio clock timestamp in ms
 */
recordHit(timestamp) {
  this.hits.push(timestamp);
}
```

Run `./scripts/check` to verify type checking passes.

### File Organization

Files organized by semantic level:

```
src/
  ├── microphone-detector.js     (System: audio input)
  ├── metronome.js               (System: tempo reference)
  ├── scorer.js                  (Processing: timing -> metrics)
  ├── drift-analyzer.js          (Processing: trend detection)
  ├── plan-library.js            (Data: plan persistence)
  ├── practice-session-manager.js (Data: session persistence)
  ├── drill-plan.js              (UI: plan visualization)
  ├── timeline.js                (UI: beat visualization)
  ├── plan-editor-ui.js          (UI: plan creation)
  ├── history-display-ui.js      (UI: review & trends)
  ├── pane-manager.js            (System: navigation)
  └── script.js                  (Wiring: feature orchestration)
```

### Naming Conventions

- **Classes**: PascalCase (`MicrophoneDetector`)
- **Methods**: camelCase (`recordHit()`)
- **Constants**: UPPER_SNAKE_CASE if module-level
- **localStorage keys**: tempoTrainer.{entity} (`tempoTrainer.sessions`)
- **Callbacks**: on{EventName} (`onHit`, `onMeasureEnd`)

### Linting & Formatting

- Run `./scripts/lint` before committing
- Run `./scripts/format` to auto-fix spacing
- Run `./scripts/check` to verify types

---

## Integration Checklist (New Feature)

- [ ] Feature has single semantic purpose
- [ ] Public methods documented with JSDoc
- [ ] Uses callbacks, not direct imports
- [ ] Dependencies passed in, not imported
- [ ] Wired into script.js in init()
- [ ] Data persisted to localStorage (if applicable)
- [ ] `./scripts/lint` passes
- [ ] `./scripts/check` passes
- [ ] Feature tested with real use case
- [ ] No regressions in other features

---

## Long-Term Growth

### Phases and Priority

Refer to ROADMAP.md for feature priority. **Current focus:**

**Core Pathway (Phases 1-9)** — Critical foundation features:
1. ✅ **PHASE 1** — Reliable hit detection (complete)
2. ⏳ **PHASE 2** — Instrument classification (pending)
3. ⏳ **PHASE 3** — Advanced timing metrics (partial)
4. ⏳ **PHASE 4** — Probabilistic scoring (proposed)
5. ⏳ **PHASE 5** — Tempo intelligence (proposed)
6. ⏳ **PHASE 6** — Longitudinal analytics (in progress)
7. ⏳ **PHASE 7** — Training engine (proposed)
8. ⏳ **PHASE 8** — Quantitative improvement model (proposed)
9. ⏳ **PHASE 9** — Expert-level features (optional)

**Enhancement Pathway (Phases 10-11)** — Nice-to-have pedagogy & UX:
- **PHASE 10a** — Variable difficulty patterns (high priority)
- **PHASE 10b** — Plan UI/UX improvements (high priority)
- **PHASE 10c** — Pedagogical features (medium priority)
- **PHASE 10d** — Audio enhancements (medium priority)
- **PHASE 11** — Engagement & platform features (optional)

When implementing features, prioritize core pathway first. Enhancement features should only be added once core phases reach milestone maturity.

### Planned Refactors

- **AudioWorklet migration** — Move onset detection to separate thread
- **Multi-band classification** — Per-instrument scoring in Scorer
- **ESM modules** — Convert to `import/export` (requires bundler setup)
- **Workout entity** — Layer between Plans and Sessions for tempo/time-signature parameters

---

## Debugging Guide

### "Where does X happen?"

1. Search semantic concept in this file
2. Find owning module (one per concept)
3. Read module's public interface
4. Trace callback flow in script.js

### Type Checking Issues

```bash
./scripts/check
```

Reports JSDoc mismatches. Fix by:

- Adding `@param {Type}` to function
- Adding `@returns {Type}` to function
- Marking `@private` if not public

### Timing Issues

Check in this order:

1. `MicrophoneDetector.onHit()` — Is detection firing?
2. `PracticeSessionManager.recordHit()` — Is data recorded?
3. `Scorer.calculateMeasureScore()` — Is math correct?
4. `Timeline` or `DrillPlan` render — Is UI updating?

### Performance Issues

Profile in this order:

1. Audio processing in `MicrophoneDetector`
2. DOM updates in render methods
3. localStorage writes (write less often, batch)
4. Trend analysis in `HistoryDisplayUI.analyzeTrend()`

---

## When to Ask for Help

This is production drum training software. Before implementing:

- **Large refactors** → Verify architecture alignment
- **New scoring metrics** → Test against real drum recordings
- **UI changes** → Ensure UX doesn't obscure data
- **Performance optimizations** → Profile first, don't guess
- **Long-term changes** → Check ROADMAP phase dependencies

---

## Success Criteria

A feature is complete when:

1. **It solves a real problem** from user feedback or ROADMAP
2. **It's measurable** (metrics, testable behavior, not just "feels better")
3. **It integrates cleanly** (minimal wiring complexity)
4. **It's documented** (JSDoc, ARCHITECTURE/ROADMAP updated)
5. **It passes checks** (`./scripts/lint`, `./scripts/check`)
6. **It doesn't break anything** (existing features still work)
7. **It feels reliable** (rhythm-game-level detection fidelity for audio)

---

## Related Documents

- **ROADMAP.md** — Long-term feature priorities and phases
- **ARCHITECTURE.md** — Semantic organization principles
- **DEVELOPMENT.md** — Setup and local development guide
- **flake.nix** — Reproducible dev environment
