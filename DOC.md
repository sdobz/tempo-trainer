## Third Clock

Never take two clocks to sea, always take one or three

A semantic with three independent descriptions is stable, the other two can be used to verify the third

This project has three implementations

- `src/**/*.js` - the reference implementation that the user experiences
- `*.test.ts` - a way to exercise the code in isolation and 
- `doc/**/*.md` - the natural language description of what features are

## What This Project Is

Tempo Trainer is both:

1. A concrete drum-practice product.
2. A laboratory for a "vanilla JS + LLM" development workflow where semantics are explicit enough to extract a reusable framework later.

The framework extraction goal does **not** mean adding framework features now. It means documenting stable semantics, reducing hidden coupling, and tightening ownership boundaries in the existing product.

## Anti-Complexity Rules

- Prefer one owner per state domain.
- Prefer event contracts over cross-feature direct mutation.
- Prefer small service APIs over "manager" objects that absorb unrelated responsibilities.
- If a behavior is temporary migration glue, document it as temporary and name its removal trigger.
- No feature addition as part of doc backfill.

## Linting

#todo

./tools/semantic-lint 

File by file assert that the three implementations align

Use one agent per file to scan the codebase, tell each agent to summarize what it needed in a file, or perhaps discover an optimal path through it to use a context window

## Migration

We are migrating toward a DI-style service graph where:

- `main.js` instantiates core services
- root context provides those services
- components consume services through context
- services publish state changes through events
- `script.js` is reduced to startup/nav glue and eventually deprecated

### Current service graph (as implemented now)

1. `AudioContextManager` (created in `src/features/main/main.js`)
	- Shared audio context lifecycle and readiness.
	- Exposed through root context.
2. `SessionState` (created in `src/script.js`, provided by `main`)
	- Owns session BPM, beats-per-measure, and active plan data.
	- Fan-out currently uses subscribe handlers.
3. `DetectorManager` (created in `src/script.js`, provided by `main`)
	- Owns detector type/config, mic input bridge, device selection, hit listeners.
4. `Metronome` + `Scorer` + `DrillSessionManager` (created in `src/script.js`)
	- Coordinate playback, detection registration, per-session scoring, and completion flow.
5. `PracticeSessionManager` + `PlanLibrary`
	- Persist history metrics and plan catalog (built-in and custom).

### Target service graph (migration direction)

1. `audio-context` service
	- Provides current time, mic/analyser access, FFT-related nodes
	- Emits readiness and error events
2. `timeline` service
	- Consumes audio time
	- Owns BPM, beats-per-measure, beat duration, and time-division mapping
3. `playback` service (currently implemented as `Metronome`)
	- Consumes timeline + audio
	- Emits audible beat/measure events
4. `chart` service (currently implemented as `PlanLibrary` + session plan projection)
	- Owns intended practice representation
	- Projects chart into timeline-ready measures
5. `performance` service (currently split across `Scorer` + `PracticeSessionManager`)
	- Captures and evaluates observed user performance
	- Emits measure/session scoring updates
6. `detector` service
	- Consumes audio
	- Emits hit/level/device events

### Event/context contract

- Context is for discovery and subscription to service instances.
- Events are for runtime state propagation.
- Services follow state-machine conventions documented in `doc/features/**`.
- Prefer one coarse `patched` event plus optional fine-grained events where needed.

Note: `doc/features/state.md` does not exist yet in this structure. Until added, state semantics are documented per feature file under `doc/features/**`.

### Phased migration

1. Keep `script.js` behavior stable while documenting exact ownership seams.
2. Move ownership descriptions into feature docs first, then move code ownership.
3. Replace ad-hoc callback fan-out with explicit event contracts.
4. Remove script-level orchestration only after equivalent context/service paths exist.

## Docs to Code Propagation Workflow

Use this loop whenever docs are refined so changes become code constraints, not prose drift.

1. **Backfill (code -> docs)**
	- For each feature doc, capture only what current code does now.
	- Record owner, inputs, outputs, persistence, lifecycle, and known temporary seams.

2. **Refine (docs only, no new features)**
	- Tighten names and boundaries.
	- Remove ambiguous terms (for example, "service/manager/runtime" overlap) by choosing one role.
	- Add explicit failure modes and invariants.

3. **Derive code deltas (docs -> tasks)**
	- Convert each doc change into a bounded code change:
	  - interface change
	  - event contract change
	  - ownership move
	  - cleanup/removal
	- Track each as a small PR-sized step.

4. **Implement in code with tests**
	- Update `src/**/*.js` and matching `*.test.ts`.
	- Verify runtime behavior does not add unplanned product features.

5. **Reconcile the third clock**
	- Confirm `doc`, `src`, and tests all express the same semantics.
	- If one differs, treat it as a bug and fix in the same iteration.

### Required template for each feature doc

Each `doc/features/**.md` should include:

- Purpose
- Current implementation
- Owned state
- Inputs and dependencies
- Outputs/events
- Persistence
- Lifecycle
- Known seams and migration target

### Refusal criteria (anti-complexity)

Reject a docs-driven code change if it:

- Introduces a new cross-cutting abstraction without a concrete owner.
- Moves more than one ownership boundary at once.
- Expands API surface without a corresponding test contract.
- Keeps old and new orchestration paths active without explicit removal criteria.

