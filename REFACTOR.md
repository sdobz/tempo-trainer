# Tempo Trainer Refactor Migration Plan

## Goal

Eliminate service fan-outs in the orchestration layer and split the god orchestrator into bounded, purposeful modules.

## Scope
This plan covers refactoring only. No product feature expansion.

Primary references:
- `ARCHITECTURE.md`
- `DOC.md`
- `doc/framework/*.md`
- `doc/features/**/*.md`

## Migration Principles
- Keep runtime behavior stable while moving ownership.
- Move one ownership boundary at a time.
- Prefer adapter layers over big-bang rewrites.
- Keep old and new paths in parallel only when removal criteria are explicit.
- Every boundary move requires tests in the same phase.
- Any shim/compatibility layer must be temporary, isolated, and tracked with an explicit removal trigger.
- No shim/adapter may remain after the final migration phase; completion requires zero compatibility layers.
- Documentation must be updated in the same phase as code ownership changes; no deferred doc catch-up phases.
- Each phase must remove or rewrite stale "current implementation" notes for the boundaries changed in that phase.

## Shim and Adapter Sunset Policy

When a shim is introduced, it must include all of the following at creation time:
1. Owner: one module/person responsible for removal.
2. Scope: exact files and interfaces bridged.
3. Removal trigger: measurable condition (for example: all consumers moved to new service API).
4. Deadline phase: latest phase in which the shim can still exist.
5. Test guard: at least one automated assertion proving the shim can be removed safely.

Rules:
- Shims must live in explicit compatibility modules or clearly named blocks (`compat`, `legacyBridge`).
- Shims must not accumulate domain logic.
- Adding a new shim in a later phase requires deleting at least one older shim in the same phase.
- Final plan completion requires a shim inventory count of zero.

## Documentation Update Rule (Applies to Every Phase)

For each phase PR/change set:
1. Update affected `doc/features/**` files to match new ownership and runtime behavior.
2. Move outdated statements from "current implementation" to either:
   - revised current implementation text, or
   - explicit migration seam text with a removal phase.
3. Update `ARCHITECTURE.md` when orchestration/composition responsibilities move.
4. Keep `DOC.md` migration notes aligned with actual remaining seams.
5. Add or update tests that verify the documented contract (commands/events/invariants/errors).

Phase cannot close if docs describe behavior that no longer exists in code.

## Status

### Previously Completed (Phases 0–5 + Hardware Refactor)

- **Phase 0 (Contract Hardening)**: ✅ COMPLETE
- **Phase 1 (Chart + Performance Services)**: ✅ COMPLETE
- **Phase 2 (Timeline Ownership Extraction)**: ✅ COMPLETE
- **Phase 3 (Playback Rendering Split)**: ✅ COMPLETE
- **Phase 4 (Slim Orchestration)**: ✅ COMPLETE — `src/script.js` deleted; `src/app-orchestrator.js` and `src/bootstrap.js` introduced; service instantiation consolidated in `main.js`
- **Phase 5 (Naming Unification)**: ✅ COMPLETE
- **Hardware Refactor**: ✅ COMPLETE — `AudioContextManager` rewritten as a discriminated-union hardware state machine; `AudioInputSource` deleted; `DetectorManager` stripped of hardware concerns

Tests at close: **196 passing, 0 failing**.

---

## Current Problem

`app-orchestrator.js` (~700 lines) has two cross-cutting problems.

### Problem 1: Service fan-outs

Any service that needs the audio context or current tempo must be explicitly wired in the orchestrator. There is no runtime signal if a new service needing BPM is added but omitted from the fan-out — it silently operates at the wrong value.

**AudioContext fan-out** — `applyAudioContext()` in `app-orchestrator.js` plus a parallel handler in `main.js`:
```
audioContextService ready  →  playbackService.audioContext = ctx
                           →  timelineService.setAudioContext(ctx)
                           →  calibration.audioContext = ctx
```

**BPM / meter fan-out** — `timelineService.changed` listener in `init()`:
```
timelineService tempo      →  scorer.setBeatDuration(60/bpm)
                           →  calibration.setBeatDuration(60/bpm)
                           →  detectorManager.setSessionBpm(bpm)
timelineService meter      →  scorer.setBeatsPerMeasure(n)
                           →  calibration.setBeatsPerMeasure(n)
```

Plus duplicate bootstrap calls at the end of `init()`:
```
scorer.setBeatDuration(timelineService.beatDuration)
scorer.setBeatsPerMeasure(timelineService.beatsPerMeasure)
detectorManager.setSessionBpm(timelineService.tempo)
```

The fix is to have each service declare its dependencies in its constructor and subscribe internally. If a service omits a required dependency, it throws immediately at construction — an obvious failure at both test time and startup.

### Problem 2: God orchestrator

No boundary separates three distinct workflows that all live in `app-orchestrator.js`:

- **Calibration session lifecycle** (~200 lines): metronome start/stop, calibration timeline visualization window, hit routing, RAF scroll loop, window rebasing.
- **Drill session lifecycle** (~150 lines): `session-start/stop` handling, `DrillSessionManager` construction after componentReady, session-complete callback, saving to `PerformanceService`, navigating to history.
- **Top-level navigation** (~150 lines): pane transitions, preview monitoring, component-ready sequencing.

`DrillSessionManager` itself takes 8 constructor arguments, including a raw DOM element (`timeline`). The composition root constructs it deep inside an async `init()` after multiple componentReady promises resolve, making it impossible to test the session lifecycle without mocking the entire orchestrator.

---

## Phase 6: Move Cross-Service Wiring into the Composition Root

### The constraint

The DOM context system (`consumeContext`) works by dispatching a `context-request` event that bubbles up the DOM tree to the nearest provider. Only custom elements (DOM nodes) can participate. Plain JS service objects like `PlaybackService`, `TimelineService`, and `Scorer` cannot dispatch context requests — they have no place in the DOM tree.

This means services cannot self-wire via context. The composition root (`main.js`) already creates all service instances and provides them as context tokens. It is the natural proxy: it has every instance, it is a custom element, and `onMount()` runs exactly once at startup after all service instances exist.

### Signals/observables fit

Signals can reduce local fan-out boilerplate inside a domain, but introducing them as a new cross-cutting abstraction has non-trivial cost in this codebase:

- You would now have two reactive systems to maintain:
  - `EventTarget` + snapshots/events (current service contract)
  - signal subscriptions (new contract)
- Every integration boundary would need adapters (signal -> event for existing consumers, or event -> signal for mixed modules).
- Test patterns, docs, and feature contracts would all need a second language for state changes.

Decision for this migration:
- Do not add a global signal/observable abstraction in Phase 6.
- Keep `EventTarget` as the service contract (aligned with `doc/framework/state.md`).
- Reduce fan-outs by moving all cross-service wiring to one auditable place (`main.js.onMount()`).

Optional future optimization (only if needed):
- Allow a service to use an internal signal-like field for one hot path, but keep the external contract as events + snapshots.
- This keeps context/event compatibility intact and avoids framework-wide churn.

### Objectives

Eliminate all cross-service fan-outs from `app-orchestrator.js`. Move them to `main.js.onMount()` — the only place that should know which services depend on which other services. No new constructor arguments are added to any service.

### How service dependencies work after this phase

Services stay as simple plain-object domain modules. They expose the minimal public API needed to receive runtime state (setters, commands). The root component subscribes to source-of-truth events and calls those setters/commands in `main.js.onMount()`.

`main.js.onMount()` becomes the single auditable wiring table. If a new service ever needs audio context or timeline tempo, the only file to update is `main.js`.

### Changes

**1. `main.js.onMount()`**

Add two explicit wiring subscriptions:

```js
// AudioContext wiring
this.listen(this._audioContextService, 'ready', () => {
  const ctx = this._audioContextService.getContext();
  this._playbackService.audioContext = ctx;
  this._timelineService.setAudioContext(ctx);
  if (this._calibration) this._calibration.audioContext = ctx;
});

// Timeline tempo/meter wiring
this.listen(this._timelineService, 'changed', (event) => {
  const { field, value } = event.detail;
  if (field === 'tempo') {
    this._scorer.setBeatDuration(60.0 / value);
    this._detectorManager.setSessionBpm(value);
    this._calibration?.setBeatDuration(60.0 / value);
  }
  if (field === 'beatsPerMeasure') {
    this._scorer.setBeatsPerMeasure(value);
    this._calibration?.setBeatsPerMeasure(value);
  }
});
```

Plus bootstrap calls immediately after services are constructed:

```js
this._scorer.setBeatDuration(this._timelineService.beatDuration);
this._scorer.setBeatsPerMeasure(this._timelineService.beatsPerMeasure);
this._detectorManager.setSessionBpm(this._timelineService.tempo);
```

**2. `app-orchestrator.js`**

- Delete `applyAudioContext()` function entirely.
- Delete `audioContextService.addEventListener("ready", applyAudioContext)`.
- Delete the `timelineService.changed` BPM/meter fan-out listener from `init()`.
- Delete the redundant bootstrap calls (`scorer.setBeatDuration`, `scorer.setBeatsPerMeasure`, `detectorManager.setSessionBpm`) from `init()`.
- Remove `audioContextService` from the orchestrator's destructured runtime if it's no longer used there.

**3. `CalibrationDetector` construction**

`calibration` is currently constructed inside `app-orchestrator.js` after `onboardingReady` resolves. Move its construction to `main.js` so the wiring subscriptions above can reference it directly.

### Files

- `src/features/main/main.js`
- `src/app-orchestrator.js`
- `src/features/calibration/calibration-detector.js` (construction site moves, no API changes)

### Exit criteria

- `applyAudioContext()` does not exist anywhere in the codebase.
- No `setAudioContext`, `setBeatDuration`, `setBeatsPerMeasure`, `setSessionBpm` calls in `app-orchestrator.js`.
- All cross-service subscriptions are in `main.js.onMount()`.
- `./tools/test` passes.

### Risk

Low — this is purely a code-motion change. No service API changes. The subscriptions already exist; they're just moving files.

---

## Phase 7: Orchestrator Decomposition

### Objectives

Split the remaining bulk out of `app-orchestrator.js` into focused modules. Don't create new abstraction layers — reshape existing modules to own their natural scope, and shift boundaries.

### Changes

**1. `CalibrationOrchestrator` (new: `src/features/calibration/calibration-orchestrator.js`)**

Extracts the calibration session lifecycle from `app-orchestrator.js`. This is a genuine new module because the calibration workflow (~200 lines of RAF loops, window rebasing, metronome scheduling, hit routing) has a coherent, self-contained boundary that is currently too large to leave in the app orchestrator.

Constructor: `(audioContextService, timelineService, playbackService, detectorManager, onboardingPane)`.

Owns:
- Calibration metronome: `startCalibrationMetronome()`, `stopCalibrationMetronome()`, `calibrationTickListener`.
- Calibration timeline visualization: `startCalibrationTimeline()`, `stopCalibrationTimeline()`, `buildCalibrationTimelineWindow()`, `maybeRebaseCalibrationTimeline()`, `calibrationTimelineLoop()`, RAF management, window rebasing state.
- Calibration hit routing: registering hits against the calibration timeline during an active calibration run.
- Helpers: `resolveCalibrationTimeline()`, `getCalibrationBeatPositionFromAudioTime()`.

Exposes: `start()`, `stop()`, `onHit(hitAudioTime)`.

After extraction, `app-orchestrator.js` replaces all calibration code with one `calibrationOrchestrator.start()` / `calibrationOrchestrator.stop()` pair.

**2. `DrillSessionManager` absorbs its own session lifecycle**

There is no new `DrillSessionOrchestrator` module. Instead, `DrillSessionManager` is repurposed to own the full drill session lifecycle — not just the mechanics, but also the pane-level event handling.

Current constructor (8 args, includes a DOM element): too large a surface, wrong dependencies.

Revised approach:
- Remove the raw DOM `timeline` element from the constructor. Replace with `setVisualizer(narrowInterface)` called after construction.
- Remove `calibration` from the constructor. Pass a `getCalibrationOffset(): number` function to `startSession()` instead.
- Add `attach(planPlayPane)` — subscribes to `session-start` and `session-stop` events on the pane. Returns a cleanup or stores it for `detach()`.
- `onSessionComplete` callback (already exists on `DrillSessionManager`) remains the extension point. `app-orchestrator.js` registers one callback that handles: assembling `fullSessionData`, calling `performanceService.saveSession()`, navigating to `plan-history`.

Revised constructor shape: `(playbackService, scorer, chartService, timelineService)` — no DOM elements, no calibration reference.

`app-orchestrator.js` after this change:
```js
drillSessionManager.attach(planPlayPane);
drillSessionManager.setVisualizer(timeline);
drillSessionManager.onSessionComplete((sessionData) => {
  // assemble + save + navigate
});
```

That block replaces ~150 lines of session lifecycle code without adding a new module.

**3. `app-orchestrator.js` (residual)**

After both changes:
- Navigation: pane change handling, preview monitoring, initial pane selection.
- Calibration: `calibrationOrchestrator.start()` / `.stop()` calls at pane-change time.
- Drill lifecycle: `drillSessionManager.attach(planPlayPane)` + `onSessionComplete` callback.
- Cross-cutting routing: `retry-chart` (history → edit), `delete-session`, onboarding completion.
- Startup sequencing: `init()` waits for componentReady promises.

No domain logic, no timing math, no direct service mutation.

### Files

- `src/features/calibration/calibration-orchestrator.js` (new)
- `src/features/plan-play/drill-session-manager.js` (refactored)
- `src/app-orchestrator.js` (simplified)
- Affected `*.test.ts` files

### Exit criteria

- `app-orchestrator.js` contains no `calibrationTimeline*`, `calibration*Timeline*`, `startCalibration*`, `stopCalibration*`, `buildCalibration*`, `maybeRebase*` identifiers.
- `app-orchestrator.js` session start/stop handling is replaced by `drillSessionManager.attach()`.
- `DrillSessionManager` constructor has ≤5 arguments and no DOM element parameters.
- `DrillSessionManager` tests do not require any DOM component instances.
- `CalibrationOrchestrator` has its own test file.
- `./tools/test` passes.

### Risk

Medium-high — the calibration workflow is timing-sensitive. The RAF loop, window rebasing, and metronome tick must not change execution order. Tests should cover the full `start()` → hit → `stop()` lifecycle before extraction is considered complete.

---

## Automated Testing Notes

Use existing project tooling for all automated checks:
- tests: `./tools/test`
- type check: `./tools/check`
- lint: `./tools/lint`

Required test additions per phase:

**Phase 6:**
1. `main.js` wiring test: assert that after mounting with mock services, a `ready` event on `audioContextService` results in `playbackService.audioContext` being set.
2. `main.js` wiring test: assert that a `changed` event on `timelineService` with `field: 'tempo'` results in `scorer.setBeatDuration` being called with the correct value.
3. Assertion: `applyAudioContext` is not defined anywhere in the codebase.

**Phase 7:**
1. `CalibrationOrchestrator` lifecycle test: `start()` → mock calibration hit → `stop()`, verify metronome and timeline methods are called in correct order.
2. `DrillSessionManager` attach test: attach to mock pane element, fire `session-start` event, verify `startSession` is invoked; verify `onSessionComplete` callback is called on completion.
3. `DrillSessionManager` unit test with mock visualizer interface — no DOM component instances required.

Recommended phase gate (run before merge of each phase):
1. `./tools/check`
2. `./tools/lint`
3. `./tools/test`

## Sequencing Dependencies

- Phase 6 before Phase 7: moving fan-outs to main.js reduces app-orchestrator surface first, making Phase 7 extraction cleaner.
- Phase 6 and Phase 7 can be split across commits for safety.


