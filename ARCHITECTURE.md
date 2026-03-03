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
2. Load template + styles
3. Mount and bind DOM events
4. React to state transitions in a single update path
5. Cleanup listeners/resources on unmount

State pattern:

- Local component state is plain data
- `setState` merges updates, then triggers `onStateChange(oldState, newState)`
- UI side effects occur in lifecycle hooks, not scattered across methods

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

---

## Orchestration Pattern

The wiring layer is the integration boundary between modules.

- Initializes long-lived services and UI surfaces
- Subscribes to events and routes data across module boundaries
- Avoids embedding core business rules
- Keeps control flow explicit and inspectable

When orchestration grows, split by capability (for example, input setup, session control, feedback updates) while preserving one-way data flow.

---

## Complexity Controls

Use these guardrails to keep architecture stable:

- Prefer small modules with one dominant reason to change
- Keep public APIs narrow and documented
- Minimize hidden global state
- Centralize cross-cutting setup (test/bootstrap, shared utilities)
- Refactor when a module handles multiple semantic concerns

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
