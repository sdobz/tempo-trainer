# SIGNALS.md: Refactoring Plan for Declarative, Fine-Grained Reactivity

## 1. Intent and Success Criteria

This plan exists to reduce JS lines of code by replacing manual UI synchronization with a small signal runtime and component-scoped effects.

Current pain points:

- Manual `setState(...)` plus imperative DOM writes are spread across panes and controls.
- State-to-view translation is repetitive (`textContent`, `classList`, `style`, show/hide toggles).
- Components are harder to reason about because update logic is split across handlers and helper methods.

Success means:

- Less component code, not just different component code.
- Fewer bespoke render/update helper methods.
- No behavior regression in existing tests.
- Migration can proceed incrementally without a big-bang rewrite.

Measured baseline for planning:

- `src/features/**/*.js`: `10,242` LOC
- High-impact component set (selected for migration): `4,292` LOC
- `setState(` call sites in `src/features`: `29`

## 2. Core Runtime Model

Signals runtime remains dependency-free and minimal:

- `createSignal(initialValue)` returns `[get, set]`
- `createEffect(fn)` runs immediately, tracks dependencies, re-runs when dependencies change
- `effect` supports disposal, so BaseComponent can clean it on disconnect

Optional but recommended in v1 (to avoid future rewrites):

- `batch(fn)` to coalesce cascaded updates
- `createMemo(fn)` for derived values used in multiple effects

## 3. Phase 1 (Combined): Runtime + BaseComponent Integration

This merges old Phase 1 and 2.

### 3.1 Deliverables

1. Add `src/features/component/signal.js` with:
    - dependency graph per signal
    - effect stack for dependency collection
    - disposer returned by `createEffect`
    - no-op on `set` when value is `Object.is` equal
2. Add `src/features/component/signal.test.ts`:
    - effect runs once on creation
    - effect re-runs on value change
    - no re-run on same value
    - disposer prevents future runs
    - nested effect safety (if supported)
3. Extend `src/features/component/base-component.js`:
    - add `createEffect(fn)` wrapper that registers disposer in `_cleanups`
    - add `createSignalState(initial)` helper for ergonomic local state
4. Extend `src/features/component/base-component.test.ts`:
    - effect is disposed at `disconnectedCallback`
    - no post-unmount DOM updates from effects

### 3.2 LOC Impact

- Adds infra code first: approximately `+180 to +260` LOC (`signal.js` + tests + BaseComponent helpers)
- Adds reusable primitives that reduce repeated code in later phases

### 3.3 Elimination Targets Enabled by Phase 1

- Component-local ad-hoc render triggers
- Extra glue methods whose only purpose is "recompute and paint"
- Repeated `if (!mounted) return` style guards in update paths

Completion gate:

- New runtime and BaseComponent helpers are stable under tests
- No component behavior changes yet, only new capability

## 4. Phase 2 (Combined): Pilot Refactor + Documentation Lock-In

This merges old Phase 3 and 4.

Pilot target: `src/features/microphone/microphone-control.js` (`261` LOC)

### 4.1 Implementation Details

1. Convert internal mutable fields to signals:
    - level, peak, sensitivity label/position, configured state, selected device id
2. Keep service contracts unchanged:
    - `DetectorManager` delegate API remains the same
    - context consumption remains the same
3. Replace imperative status/render methods with effects:
    - one effect for status text/class
    - one effect for threshold label/line
    - one effect for level/peak position
    - one effect for device list selection display
4. Keep template files as-is (`.html`), no framework switch

### 4.2 Documentation in Same Phase

Update during pilot, not after:

1. `ARCHITECTURE.md`: component reactivity section updated to signal-first
2. `doc/framework/component.md`: canonical example from refactored microphone control
3. Deprecation note: `onStateChange` for new DOM logic is deprecated; legacy components are allowed until migrated

### 4.3 LOC Savings (Pilot)

- Expected file reduction: `261 -> 190 to 210` LOC
- Net saving in pilot: approximately `50 to 70` LOC
- Typical removals:
  - bespoke UI update helpers that only mirror state
  - repeated `setState(...)` calls for purely visual updates
  - duplicated branches for text/class/style sync

Completion gate:

- Existing `microphone-control` tests pass
- Docs are updated in same PR series as pilot
- Pilot is used as migration template

## 5. Phase 3: Ordered Incremental Refactor Across Existing `src`

This expands old Phase 5 into a concrete order with expected wins.

### 5.1 Ordering Strategy

- Start with low-risk/high-clarity components
- Then medium components with visible UI state
- End with large panes where savings are highest but refactor risk is higher

### 5.2 Ordered File Plan with Savings

1. `src/features/audio/audio-context-overlay.js` (`71` LOC)
    - Savings: `10 to 18` LOC
    - Eliminate: manual `render()` branching boilerplate
2. `src/features/base/app-notification.js` (`100` LOC)
    - Savings: `15 to 25` LOC
    - Eliminate: imperative show/hide and class reset branching
3. `src/features/onboarding/onboarding-pane.js` (`197` LOC)
    - Savings: `25 to 40` LOC
    - Eliminate: explicit state-to-status text/class mapping code
4. `src/features/calibration/calibration-control.js` (`344` LOC)
    - Savings: `35 to 60` LOC
    - Eliminate: progress/status paint boilerplate
5. `src/features/plan-play/plan-play-pane.js` (`339` LOC)
    - Savings: `35 to 55` LOC
    - Eliminate: playback state UI sync branches
6. `src/features/visualizers/plan-visualizer.js` (`341` LOC)
    - Savings: `20 to 35` LOC
    - Eliminate: repeated DOM state toggles and score display glue
7. `src/features/plan-play/timeline-visualization.js` (`228` LOC)
    - Savings: `15 to 30` LOC
    - Eliminate: repeated render trigger plumbing
8. `src/features/visualizers/timeline-visualization.js` (`342` LOC)
    - Savings: `20 to 35` LOC
    - Eliminate: duplicated now-line and viewport update wiring
9. `src/features/plan-edit/plan-edit-pane.js` (`682` LOC)
    - Savings: `70 to 120` LOC
    - Eliminate: many explicit `textContent/style.display` sync blocks
10. `src/features/plan-history/plan-history-pane.js` (`869` LOC)
    - Savings: `90 to 150` LOC
    - Eliminate: expansion and detail rendering synchronization boilerplate

Projected total savings from component migrations above:

- Conservative: `335` LOC
- Aggressive: `568` LOC

### 5.3 Cleanup Eliminations After Conversion

1. Delete duplicate legacy base class file:
    - `src/features/base/base-component.js` (`399` LOC)
2. Remove obsolete references and docs that instruct manual `onStateChange` DOM painting
3. Keep `setState` API temporarily for backward compatibility, then remove once last migrated component no longer depends on it

Projected additional cleanup savings:

- Immediate: `399` LOC from duplicate base-component removal
- Later: `40 to 90` LOC from legacy compatibility path removal in main BaseComponent (only after full migration)

## 6. Net LOC Outcome

Estimated net after full rollout:

- Infra cost (Phase 1): `+180 to +260`
- Component savings (Phase 2 + Phase 3): `-385 to -638` (pilot included)
- Duplicate/legacy cleanup: `-399 to -489`

Estimated net project delta:

- Conservative: `-604` LOC
- Aggressive: `-867` LOC

This makes the signals effort a code reduction initiative, not just an architectural swap.

## 7. Guardrails

- Do not change service event contracts while migrating UI state handling.
- Keep `.html` templates and CSS structure stable unless a specific bug requires changes.
- Refactor one component per PR slice where possible.
- Keep test updates minimal and behavior-focused.
- Prefer deleting code over wrapping old code.
