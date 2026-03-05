## Intent

Organize the codebase so features can evolve quickly without coupling UI details to core logic.

Core goals:
1. Parseable modules: small files, clear contracts, minimal hidden behavior
2. Composable features: add or change one capability without broad edits
3. Deterministic tests: behavior is testable with explicit inputs and outputs
4. Browser-native runtime: app code uses native platform APIs directly
5. Lightweight workflow: lint, check, and tests are fast enough for frequent runs

---

## Architectural Layers

### Layer 1: Product Semantics
The product teaches timing through an input → analysis → feedback loop.

- Input: user actions and audio/device signals
- Analysis: timing, scoring, and calibration logic
- Feedback: visual status, progress, and recommendations

This semantic pipeline is stable even as specific features change.

### Layer 2: Capability Modules
Code is grouped by responsibility, not screen location:

- UI components: rendering, interaction, lifecycle
- Domain/features: pure or mostly-pure logic for timing/scoring/session behavior
- Orchestration: the wiring layer that composes modules and routes events
- Shared styles and utilities: reusable primitives only

### Layer 3: Runtime Contracts
Modules communicate through explicit contracts:

- Method calls for command-style interactions
- Custom events for decoupled notifications
- State transition hooks for UI re-render behavior

---

## Component Pattern

UI components follow a consistent base-class contract:

- Extend a shared base component
- Declare template and style asset URLs explicitly
- Keep render/update logic inside component boundaries
- Expose small public methods as integration points
- Emit domain-relevant custom events instead of reaching into other components

Canonical lifecycle:

1. Construct with default local state
2. Load template + styles (fetch is cancellable via `AbortController`)
3. Mount and bind DOM events via `this.listen()`
4. React to state transitions in `onStateChange(oldState, newState)`
5. `onShow()` / `onHide()` when pane visibility changes
6. Cleanup listeners/resources on unmount (automatic via `this.listen()`)

State pattern:

- Local component state is plain data
- `setState` merges updates, then triggers `onStateChange(oldState, newState)`
- **All DOM side effects live in `onStateChange`**, not scattered across methods
- Methods that respond to events or delegate callbacks only call `setState`; they do not
  directly manipulate the DOM
- `setState` is a no-op if called after unmount (mount guard) and re-entrant calls are
  queued and flushed after the current `onStateChange` completes (re-entrance guard)

### BaseComponent API reference

| Member | Description |
|--------|-------------|
| `componentReady` | Promise that resolves after `onMount()` completes |
| `state` | Plain object; do not mutate directly |
| `setState(updates)` | Shallow-merges updates, calls `onStateChange`; guarded against unmount and re-entrance |
| `listen(target, event, handler, options?)` | Binds event listener and automatically removes it on unmount |
| `emit(name, detail?)` | Dispatches a bubbling `CustomEvent` from this element |
| `onMount()` | Override: called once after template + styles are loaded |
| `onUnmount()` | Override: called on `disconnectedCallback`; `listen()` cleanups run first |
| `onStateChange(old, new)` | Override: **the only place DOM updates should happen** |
| `onShow()` | Override: called by `PaneManager` when this component's pane becomes visible |
| `onHide()` | Override: called by `PaneManager` when this component's pane is hidden |

### Visibility lifecycle

Components that own expensive resources (microphone streams, `requestAnimationFrame` loops,
audio processing) implement `onShow()` and `onHide()`:

```javascript
class MicrophoneControl extends BaseComponent {
  onShow() {
    if (!this.micDetector?.isRunning) this.micDetector?.start();
  }
  onHide() {
    this.micDetector?.stop();
  }
}
```

`PaneManager.updateVisibility(pane)` calls `onHide()` on all `BaseComponent` instances inside
the outgoing pane and `onShow()` on all instances inside the incoming pane. The orchestrator
should **never** directly start or stop component resources in response to pane changes.

### Component encapsulation rules

The orchestrator and sibling components communicate with a component only through:

1. **Public methods** — documented, intentional interface points
2. **Custom events** — emitted via `this.emit(name, detail)`
3. **`componentReady`** — to await initialization before wiring

Forbidden from outside a component boundary:

- Accessing internal DOM element references (`component.button`, `component.bpmInput`)
- Adding event listeners to a component's internal elements
- Passing one component's DOM elements as arguments to another component
- Traversing more than one level of component nesting (`a.b.c`)

If the orchestrator needs data that lives inside a component, the component should expose a
method or emit an event. If configuration must be shared between two components, the
orchestrator reads it from one and passes it as data to the other.

### Auto-registration

Components register themselves with a guard:

```javascript
if (!customElements.get("my-component")) {
  customElements.define("my-component", MyComponent);
}
```

---

## Delegate Pattern for Domain-UI Integration

A domain module that requires callbacks implements the **delegate pattern**: the domain object accepts a delegate object whose methods it calls to notify of state changes.

The UI component directly implements the delegate interface, eliminating indirection:

```javascript
// Domain module (pure logic, no DOM)
class MicrophoneDetector {
  constructor(audioContext, delegate) {
    this.delegate = delegate;
  }
  
  _analyzeAudio() {
    // ... audio analysis logic ...
    this.delegate.onLevelChanged(level);
    this.delegate.onHit();
  }
}

// UI component implements the interface directly
class MicrophoneControl extends BaseComponent {
  onMount() {
    // Component passes itself as the delegate
    this.detector = new MicrophoneDetector(null, this);
  }
  
  // These public methods form the delegate interface
  onLevelChanged(level) {
    this.levelBar.style.width = `${level}%`;
  }
  
  onHit() {
    // visual feedback
  }
}
```

Benefits:

- **Pure domain logic**: The detector has zero DOM dependencies and is fully testable in isolation
- **Single responsibility**: UI component owns all presentation, domain object owns all analysis
- **Minimal overhead**: No wrapper objects or factory methods; the component is the delegate
- **Clear contract**: Component methods form an explicit interface that the domain object expects

The delegate pattern enables loose coupling: the domain module doesn't depend on the UI component, and the component can be replaced with a different delegate (for example, a test mock or an alternative UI).

---

## Inversion of Control: Dependency Injection

Domain modules accept their dependencies as constructor parameters rather than importing them directly. This **inversion of control** enables testability, reusability, and decoupling from concrete implementations.

Dependencies that should be injected:

- Data persistence (storage, databases)
- External services and APIs
- Behavior callbacks (delegates)
- Runtime contexts (audio, rendering, etc.)

Benefits:

- **Explicit dependencies**: Constructor signature documents what a module needs
- **Testability**: Tests substitute mock implementations without modifying the module
- **Reusability**: Same module works with different backends and UI implementations
- **No globals**: Modules receive what they need from the wiring layer, not from imports
- **Composition**: The orchestration layer assembles a working system by wiring dependencies

Rules:

- Domain modules depend on abstract contracts, not concrete implementations
- Domain modules do not import utilities or services directly — accept them as constructor parameters
- `StorageManager` is a service and must be injected, never imported in domain modules
- UI components depend on domain modules and inject themselves as delegates
- The orchestration layer (wiring) creates all instances and connects them
- Tests provide mock implementations to verify behavior in isolation

---

## Boundaries and Coupling Rules


1. Components handle presentation and interaction only
2. Domain modules handle computation, timing logic, and business rules
3. Orchestration connects modules; modules do not hard-wire each other
4. Data crosses boundaries through typed shapes, events, and small method APIs
5. Components do not query or mutate unrelated global DOM regions

Coupling heuristic:

- Prefer event-driven composition when one module informs another
- Prefer direct method calls when one module commands another
- Avoid two-way dependencies between peer modules

---

## Styling Pattern

- Styles are component-scoped with consistent naming (for example, BEM-like conventions)
- Theme values come from shared tokens/custom properties
- Structural styles remain local to each component
- Avoid injecting style text from component logic

---

## Testing Pattern

Tests validate behavior contracts, not incidental implementation details.

For component tests:

- Use a single environment bootstrap that provides DOM and browser API mocks
- Provide test-specific input data directly in each test case
- Assert state transitions, emitted events, and observable DOM outcomes
- Keep tests resilient to markup refactors that do not change behavior

For domain module tests:

- Prefer deterministic input/output assertions
- Isolate time/device dependencies behind explicit seams
- Inject `MockStorageManager` instead of `StorageManager` to avoid localStorage side effects
- Inject `MockDelegate` to capture callback invocations

### Test tier priorities

Tier 1 — domain modules with no UI (purest contracts, zero setup cost):
`Scorer`, `PracticeSessionManager`, `PlanLibrary`

Tier 2 — infrastructure:
`BaseComponent` lifecycle guards, `PaneManager` navigation, `StorageManager`

Tier 3 — component behavior:
State transitions, custom event emission, delegate callbacks (requires DOM mock)

### Canonical data shapes

Plan data has a single canonical runtime shape. All parsing and conversion happens at the
boundary; the rest of the codebase uses the canonical form:

```javascript
/**
 * @typedef {{ type: "click" | "silent" | "click-in" }} Measure
 * @typedef {{ on: number, off: number, reps: number, startIndex: number }} DrillSegment
 * @typedef {{ plan: Measure[], segments: DrillSegment[] }} DrillPlan
 */
```

Functions that accept external plan data (string, legacy array, history objects) must normalize
to `DrillPlan` at entry. Defensive `if (Array.isArray(planData))` checks outside of parsing
utilities indicate a missing normalization step and should be treated as bugs.

---

## Orchestration Pattern

The wiring layer is the integration boundary between modules.

- Initializes long-lived services and UI surfaces
- Subscribes to events and routes data across module boundaries
- Avoids embedding core business rules
- Keeps control flow explicit and inspectable

When orchestration grows, split by capability (for example, input setup, session control, feedback updates) while preserving one-way data flow.

### Coordinated initialization (three-phase init)

All cross-component wiring must happen **after** all components are ready. Structure `init()` in
three strict phases:

```javascript
async function init() {
  // Phase 1 — wait for all components; extract references only
  await Promise.all([compA.componentReady, compB.componentReady]);
  const domainObj = compA.getDomainInstance(); // reference extraction only

  // Phase 2 — wire callbacks now that all references are valid
  domainObj.onChange((data) => compB.update(data)); // safe: compB is ready

  // Phase 3 — navigate to initial pane
  paneManager.initialize(); // fires first pane-change callback
  paneManager.navigate(initialPane);
}
```

**Rule:** Never wire cross-component callbacks inside individual `.then()` chains on individual
`componentReady` promises. A callback wired in `compA.componentReady.then(...)` may execute
before `compB.componentReady` resolves, leaving variables `undefined`.

`PaneManager.initialize()` must be called **after** registering all `onPaneChange` callbacks.
The constructor does not fire the initial pane change — `initialize()` does. This ensures
listeners are in place before the first navigation event.

---

## Complexity Controls

Use these guardrails to keep architecture stable:

- Prefer small modules with one dominant reason to change
- Keep public APIs narrow and documented
- Minimize hidden global state
- Centralize cross-cutting setup (test/bootstrap, shared utilities)
- Refactor when a module handles multiple semantic concerns

### Event listener discipline

Inside components, bind all listeners via `this.listen()` rather than raw `addEventListener`.
This guarantees removal on unmount without requiring `onUnmount` boilerplate:

```javascript
// Good — automatically cleaned up
this.listen(this.startBtn, "click", () => this._onStart());

// Avoid — requires manual cleanup tracking
this._cleanups.push(bindEvent(this.startBtn, "click", () => this._onStart()));
```

For listeners on global targets (`window`, `document`), still prefer `this.listen()` and
implement `onHide()` to pause them when the component is not visible.

### Canonical scoring function

All score calculations must use `Scorer.scoreFromErrorMs(errorMs)` as the single
implementation. Duplicating the scoring curve in `PracticeSessionManager` or display components
causes historically displayed scores to diverge from live session scores.

### `setDrillPlan` vs `reset`

`Scorer.setDrillPlan(plan)` updates the plan without resetting scores. Call `scorer.reset()`
explicitly when starting a new session. This prevents a plan navigation event from accidentally
clearing scores from a session that just completed.

---

## Beat Detection Strategy Pattern

Hit detection algorithms are pluggable via the strategy pattern. This allows tempo-trainer to
support multiple detection techniques—amplitude threshold, spectral flux, multi-band classification,
etc.—without coupling the UI, calibration pipeline, or drill session logic to any single algorithm.

### BeatDetector Interface

All detection strategies must implement this contract:

```javascript
// @typedef {Object} BeatDetector
// @property {(callback: (hitAudioTime: number) => void) => void} onHit
// @property {() => Promise<boolean>} start
// @property {() => void} stop
// @property {boolean} isRunning
```

**Why no device selection on the detector?**

Device selection is a UI concern, not a detection concern. The UI layer:
1. Queries available devices (via browser AudioContext API, not the detector)
2. Instantiates the detector with a chosen device ID
3. If the device changes, stops the detector and creates a new instance with the new device ID

This keeps detectors focused on audio analysis, not device management.

**Optional visualization callbacks** (emitted as methods on the delegate):
- `onLevelChanged(level)` — instantaneous RMS or spectral energy
- `onPeakChanged(peak)` — max level in current window
- `onThresholdChanged(threshold)` — threshold-based detector only
- `onFluxChanged(magnitude)` — spectral flux detector only

UI components query whether these optional methods exist and render appropriately.

### Included Strategies

**ThresholdDetector** (`src/features/microphone/threshold-detector.js`)
- Algorithm: RMS amplitude deviation from baseline (128), user-settable threshold
- Use case: Responsive, low-latency, simple to calibrate
- Tuning: Threshold slider in microphone control; default ~40
- Refractory cooldown: 100ms (prevents double-triggers from acoustic resonance)
- Visualization: Shows current level + user-set threshold line
- Device selection: Handled by UI layer; detector re-instantiated when device changes

**AdaptiveDetector** (`src/features/microphone/adaptive-detector.js`)
- Algorithm: Spectral flux (positive frame-to-frame magnitude change in STFT)
- Use case: Frequency-aware, adaptive threshold (median + k×MAD), tempo-sensitive
- Tuning: Fixed parameters; refractory period scales with tempo (BPM)
- Refractory cooldown: 60000 / BPM milliseconds (e.g., 300ms at 200 BPM, 500ms at 120 BPM)
- Visualization: Shows spectral flux magnitude for diagnostic feedback
- Notes: Phase 1 uses RAF + main thread; AudioWorklet migration is planned for later phase
- Device selection: Handled by UI layer; detector re-instantiated when device changes

### Adding Future Detectors

To add a new hit detection algorithm:

1. Create `src/features/microphone/my-detector.js` implementing the BeatDetector contract
2. Implement `onHit(callback)`, `start()`, `stop()`, and `isRunning` getter
3. Add optional visualization callbacks: `onLevelChanged()`, `onPeakChanged()`, etc.
4. Optional: add device management methods (e.g., `selectDevice()`) for UI convenience,
   but keep device selection logic in the UI layer
5. Register in `DetectorFactory`:
   ```javascript
   case "my-detector":
     return new MyDetector(storageManager, delegate, audioContext);
   ```
6. Add test file `my-detector.test.ts`
7. Update onboarding UI to show detector option (if user-facing)
8. Update ARCHITECTURE.md with new strategy details

No changes needed to `MicrophoneControl`, `CalibrationControl`, orchestration, or drill logic;
they all work with any BeatDetector implementation.

### DetectorFactory

`DetectorFactory` (static methods) centralizes strategy creation and preference persistence:

```javascript
// Create instance by type
const detector = DetectorFactory.createDetector("adaptive", storageManager, delegate, audioContext);

// Get/set user preference
DetectorFactory.setPreferredType(storageManager, "adaptive");
const preferred = DetectorFactory.getPreferredType(storageManager); // "adaptive" or "threshold"

// Create using stored preference
const detector = DetectorFactory.createPreferred(storageManager, delegate, audioContext);
```

Storage key: `"tempoTrainer.detectorType"` (persists across sessions).

---

## Validation Workflow

Run quality gates frequently:

- Lint for style and consistency
- Static checks for type and contract drift
- Tests for behavior and integration confidence

Architecture health signals:

- New features are added by composing existing contracts
- Most changes stay local to one capability area
- Tests remain readable and deterministic as features evolve

---

## Reference

Implementation sequencing and agent workflow details live in [AGENT.md](AGENT.md).
