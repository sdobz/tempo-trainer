# Tempo Trainer Refactor Migration Plan

## Goal
Align implementation in `src/**` with the architecture and feature contracts in `doc/**` by:
- enforcing one canonical owner per domain
- moving timing/transport ownership to timeline
- eliminating `src/script.js` entirely (no legacy bootstrap/orchestrator file remains)
- replacing callback/delegate fan-out with explicit service event contracts
- unifying `plan` vs `chart` semantics under one domain owner

## Scope
This plan covers refactoring only. No product feature expansion.

Primary references:
- `ARCHITECTURE.md`
- `DOC.md`
- `doc/framework/*.md`
- `doc/features/**/*.md`

## Current vs Target (Delta Summary)

### Target ownership from docs
- `audio-context`: browser audio lifecycle and readiness
- `timeline`: tempo, meter, transport, time mapping
- `playback`: sound rendering only
- `detector`: hit stream and detector/device config
- `chart`: catalog + selected chart + projection
- `performance`: runtime scoring + persisted session records
- `persistence`: storage mechanics only

### Current implementation hotspots
- `src/script.js` is a large orchestrator + domain glue.
- `SessionState` now serves as a compatibility mirror for legacy plan/timing consumers (`src/features/base/session-state.js`).
- `TimelineService` is canonical owner of tempo/meter/transport/position (`src/features/music/timeline-service.js`).
- `Metronome` mixes scheduling/transport with rendering (`src/features/plan-play/metronome.js`).
- Performance is split across scorer/history (`src/features/plan-play/scorer.js`, `src/features/plan-history/practice-session-manager.js`).
- Detector still uses callbacks/delegate patterns (`src/features/microphone/detector-manager.js`).
- Naming remains mixed (`plan-*` in code vs `chart` in docs).

## Migration Principles
- Keep runtime behavior stable while moving ownership.
- Move one ownership boundary at a time.
- Prefer adapter layers over big-bang rewrites.
- Keep old and new paths in parallel only when removal criteria are explicit.
- Every boundary move requires tests in the same phase.
- `src/script.js` can exist only as temporary migration glue and must be deleted by the final phase.
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

## Phase Plan

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

- **Phase 0 (Contract Hardening)**: ✅ COMPLETE
- **Phase 1 (Chart + Performance Services)**: ✅ COMPLETE
  - ChartService created and wired as canonical chart owner
  - PerformanceService created as canonical scoring/history owner
  - plan-edit-pane adapted to use ChartServiceContext
  - MainComponent updated to provide both services
  - Documentation updated: chart.md, performance.md
  - All Phase 1 files compile without errors
- **Phase 2 (Timeline Ownership Extraction)**: ✅ COMPLETE
  - `timeline-service.js` added and provided via root context
  - Tempo/meter fan-out moved to TimelineService event subscription in `script.js`
  - Detector BPM input now follows timeline changes (not SessionState)
  - `timeline-visualization` consumes canonical timeline meter
  - SessionState timing fields retained as compatibility seam only
  - Timeline docs updated to reflect canonical ownership + seam removal target
- **Phase 3 (Playback Rendering Split)**: ✅ COMPLETE
  - `playback-service.js` added with render-only API (`renderClick`, `renderCue`, `setClickProfile`)
  - Drill and calibration click paths both routed through `PlaybackService`
  - Metronome converted to compatibility scheduler shim; rendering delegated to PlaybackService
  - Timeline remains canonical transport owner; playback has no transport state
  - `doc/features/browser/playback.md` updated for rendering-only ownership
- **Phase 4**: NOT STARTED

## Phase 0: Contract Hardening (Non-breaking)

### Objectives
- Normalize event semantics around existing services.
- Prepare codebase for ownership extraction without changing user behavior.

### Changes
1. Convert `SessionState` subscriber model to EventTarget-like contract while preserving existing API with compatibility shims.
2. Convert `DetectorManager` delegate/callback fan-out to explicit events:
   - required stream: `hit`
   - coarse state event: `changed`/`patched`
   - optional runtime failures: `fault`
3. Add snapshot helpers where missing (`PlaybackState` read API for deterministic bootstrap).
4. Document temporary seams in code comments near compatibility adapters.

### Files
- `src/features/base/session-state.js`
- `src/features/microphone/detector-manager.js`
- `src/features/plan-play/playback-state.js`
- tests in corresponding `*.test.ts`

### Exit criteria
- Existing tests pass with no behavior changes.
- No new direct delegate coupling introduced.
- Every shim introduced in this phase is registered with removal trigger and deadline.
- `doc/features/music/detector.md`, `doc/features/browser/playback.md`, and related framework notes reflect the new event contract language.

### Risk
- Low

## Phase 1: Introduce Chart + Performance Services

### Objectives
- Make chart and performance explicit service boundaries.
- Keep existing panes functioning while switching API ownership.

### Changes
1. Create chart service (new domain owner):
   - canonical state: selected chart/catalog revision
   - commands: select/save/delete/project
2. Create performance service that composes runtime scorer + history persistence.
3. Keep `PlanLibrary` and `PracticeSessionManager` as internal dependencies initially.
4. Migrate pane consumers to service interfaces rather than direct legacy modules.

### Files (new)
- `src/features/music/chart-service.js`
- `src/features/music/performance-service.js`

### Files (adapt)
- `src/features/plan-edit/plan-edit-pane.js`
- `src/features/plan-play/plan-play-pane.js`
- `src/features/plan-history/plan-history-pane.js`
- `src/features/main/main.js`

### Exit criteria
- Selected chart is no longer canonically owned by `SessionState`.
- Performance run lifecycle is callable through one service surface.
- History persistence still works with existing data.
- Phase-0 compatibility layers are either removed or reduced in scope with updated removal deadlines.
- `doc/features/music/chart.md` and `doc/features/music/performance.md` are rewritten to describe the new canonical service owners (not legacy split ownership).

### Risk
- Medium (schema and wiring drift)

## Phase 2: Timeline Ownership Extraction

### Objectives
- Move tempo/meter/transport ownership from legacy state/metronome into timeline service.

### Changes
1. Create `timeline` service as canonical owner:
   - state: tempo, beatsPerMeasure, transport, position
   - commands: `setTempo`, `setBeatsPerMeasure`, `play`, `pause`, `stop`, `seekToDivision`
2. Bridge from legacy `SessionState` values at startup only (temporary migration seam).
3. Update detector BPM inputs to subscribe to timeline.
4. Update timeline visualizer to consume timeline service output as canonical source.

### Files (new)
- `src/features/music/timeline-service.js`

### Files (adapt)
- `src/features/base/session-state.js`
- `src/features/microphone/detector-manager.js`
- `src/features/visualizers/timeline-visualization.js`
- `src/script.js`

### Exit criteria
- No canonical tempo/meter ownership in `SessionState`.
- Timeline command invariants enforced and tested.
- Any timeline migration bridge is isolated behind one compatibility seam and scheduled for removal by Phase 4.
- `doc/features/music/timeline.md` no longer describes distributed timing ownership as current behavior; any remaining seam is marked temporary with a removal phase.

### Risk
- Medium-high (timing regression potential)

## Phase 3: Split Playback Rendering from Transport

### Objectives
- Keep playback strictly as sound rendering infrastructure.

### Changes
1. Introduce playback service interface:
   - `renderClick(atTime, accentProfile)`
   - `renderCue(cue, atTime)`
   - `setClickProfile(profile)`
2. Refactor `Metronome` responsibilities:
   - transport/scheduling decisions belong to timeline/orchestration
   - oscillator/click rendering belongs to playback
3. Keep calibration click path using same playback abstraction.

### Files (new)
- `src/features/music/playback-service.js`

### Files (adapt)
- `src/features/plan-play/metronome.js`
- `src/script.js`
- calibration wiring in onboarding/play flow

### Exit criteria
- Playback does not own transport state.
- Timeline is single source of transport truth.
- Metronome compatibility forwarding (if kept) is marked for removal no later than Phase 6.
- `doc/features/browser/playback.md` reflects playback as rendering-only and references timeline for transport ownership.

### Risk
- Medium-high (audio timing accuracy)

## Phase 4: Slim Orchestration (`script.js`)

### Objectives
- Reduce `script.js` to a temporary thin orchestrator while moving all startup composition to explicit runtime modules.

### Changes
1. Move service instantiation and root context provisioning fully into `main` composition root.
2. Keep app orchestrator responsibilities in `script.js` temporarily:
   - pane intent handling (`navigate`, `session-start`, `session-stop`)
   - cross-service command routing
3. Remove domain math and state mutation from orchestrator.
4. Extract explicit orchestrator and bootstrap modules:
  - `src/app-orchestrator.js` for workflow routing
  - `src/bootstrap.js` (or `src/main-entry.js`) for DOM startup + wiring
5. Update `index.html` module entrypoint away from `src/script.js`.

### Files
- `src/features/main/main.js`
- `src/script.js` (shrinks to forwarding shell only)
- new `src/app-orchestrator.js`
- new `src/bootstrap.js` (or `src/main-entry.js`)
- `index.html`

### Exit criteria
- `script.js` no longer acts as a second domain owner and contains no domain logic.
- Pane components emit intents, not domain mutations.
- Entrypoint can boot without importing logic from `script.js` except temporary forwarding.
- Compatibility shims created before Phase 2 are removed.
- `doc/features/workflow/orchestration.md`, `doc/features/main.md`, and `ARCHITECTURE.md` reflect the new bootstrap/orchestrator split.

### Risk
- Medium

## Phase 5: Naming Unification (`plan` -> `chart`)

### Objectives
- Eliminate semantic split between docs and code.

### Changes
1. Rename classes/events/public identifiers toward `chart` terminology.
2. Keep compatibility aliases during transition where needed.
3. Delay folder/file renames until service boundaries stabilize.

### Candidate renames
- `PlanLibrary` -> chart catalog implementation (internal)
- `planData` -> `chartProjection` (or equivalent)
- pane event payload terms from `plan` to `chart`

### Exit criteria
- docs and runtime use one canonical term in public API.
- Naming compatibility aliases are reduced to the minimum set required for one-release transition only.
- `doc/features/workflow/chart-edit.md`, `doc/features/workflow/chart-play.md`, and `doc/features/workflow/chart-review.md` use canonical naming consistently.

### Risk
- Low-medium (migration churn)

## Phase 6: Cleanup + Legacy Removal

### Objectives
- Remove migration seams and deprecations after parity is proven.

### Changes
1. Remove canonical timing and chart ownership remnants from `SessionState`.
2. Remove compatibility adapters and fallback wiring.
3. Prune dead callback APIs after event contract adoption.
4. Delete `src/script.js` and remove any remaining import/reference paths.
5. Update docs to reflect completed migration state.

### Exit criteria
- no legacy ownership mirrors left
- no duplicate code paths for same command flow
- `src/script.js` file no longer exists
- `index.html` loads the new entrypoint module
- no active compatibility adapters/shims remain in runtime code
- no stale "current implementation" statements remain in touched docs for completed phases

### Risk
- Low

## Phase 7: Post-Deletion Hardening (No `script.js` Regression)

### Objectives
- Prevent accidental reintroduction of `src/script.js` and enforce the new entrypoint architecture.

### Changes
1. Add a CI guard test that fails if `src/script.js` exists.
2. Add a static wiring test that verifies `index.html` points to `src/bootstrap.js` (or chosen replacement).
3. Add architecture assertions for orchestrator boundaries (no domain ownership in orchestrator module).

### Files
- `src/**/*.test.ts` (new architecture guard tests)
- CI workflow/config scripts

### Exit criteria
- CI fails on any PR that reintroduces `src/script.js`.
- Entry module path is enforced by tests.
- CI fails when shim inventory is non-zero.
- CI includes stale-doc guard checks for migration-completed domains.

### Risk
- Low

## Target Module Mapping

Current -> Target direction:

- `src/features/base/session-state.js`
  - from: canonical tempo/meter/plan owner
  - to: temporary bridge only, then removed or reduced to minimal session UI state

- `src/features/plan-play/metronome.js`
  - from: mixed transport + rendering
  - to: rendering infrastructure behind playback service

- `src/features/plan-edit/plan-library.js`
  - from: direct domain owner by legacy name
  - to: internal storage implementation behind chart service

- `src/features/plan-play/scorer.js` + `src/features/plan-history/practice-session-manager.js`
  - from: split performance ownership
  - to: internal modules under performance service

- `src/features/microphone/detector-manager.js`
  - from: callback/delegate manager
  - to: detector service contract with required `hit` stream

- `src/script.js`
  - from: monolithic bootstrap/orchestrator
  - to: deleted; responsibilities moved to `src/bootstrap.js` + `src/app-orchestrator.js` + service owners

## Test Plan By Phase

- Phase 0:
  - event bootstrap tests (initial read + subscribe)
  - detector hit stream contract tests

- Phase 1:
  - chart service command/invariant tests
  - performance run lifecycle tests (`startRun` -> `registerHit` -> `completeRun`)
  - history persistence compatibility tests

- Phase 2:
  - timeline command invariants
  - transport state transitions and idempotency
  - BPM change propagation to detector/performance consumers

- Phase 3:
  - playback render command validation tests
  - no transport ownership regression tests

- Phase 4:
  - orchestrator integration tests for pane intents in `src/app-orchestrator.js`
  - no direct pane-to-domain mutation checks
  - entrypoint wiring test for `index.html` -> new bootstrap module

- Phase 5-6:
  - naming compatibility tests
  - dead-path removal verification
  - file deletion verification (`src/script.js` absent)

- Phase 7:
  - CI architecture guard tests
  - anti-regression check blocking `src/script.js` reintroduction

## Automated Testing Notes

Use existing project tooling for all automated checks:
- tests: `./tools/test`
- type check: `./tools/check`
- lint: `./tools/lint`

Recommended phase gate (run before merge of each migration phase):
1. `./tools/check`
2. `./tools/lint`
3. `./tools/test`

Required automated test additions for this migration:
1. Architecture guard test: assert `src/script.js` does not exist after Phase 6.
2. Entry wiring test: parse `index.html` and assert script module points to the new bootstrap file.
3. Service ownership tests: verify timeline is sole tempo/meter owner; playback has no transport state.
4. Event contract tests: ensure `changed/patched`, required streams (`hit`), and `fault` behavior match docs.
5. Persistence compatibility tests: old stored data can still be read after service extraction.
6. Shim inventory test: assert no compatibility modules/markers remain after final phase.
7. Stale-doc guard tests: for completed phases, assert key docs do not contain outdated ownership statements (string/regex assertions against known stale phrases).

CI recommendation:
1. Add one required pipeline job `architecture-and-contracts` running:
   - `./tools/check`
   - `./tools/lint`
   - `./tools/test`
2. Keep architecture guard tests in the default test suite so they are always enforced.
3. For timing-sensitive changes (timeline/playback phases), run tests at least twice in CI to catch flakiness.
4. Add a static check (script or test) that scans for compatibility markers (`compat`, `legacyBridge`, `TODO(remove-compat)`) and fails after Phase 6.
5. Add a static stale-doc check that scans target docs for banned stale phrases once a phase is marked complete.

## Sequencing Dependencies

- Phase 0 before all other phases.
- Phase 1 before phase 4 for stable pane contracts.
- Phase 2 before phase 3 completion (timeline must own transport first).
- Phase 4 before phase 6 (do not remove legacy seams until orchestration is stable).
- Phase 6 before phase 7 (delete file first, then add anti-regression hardening).

## Rollback Strategy

- Keep adapters at each boundary move until tests and one release cycle are stable.
- Use feature flags or constructor switches where timing-sensitive rewrites occur (timeline/playback split).
- Preserve existing persisted schemas until migration readers are verified.

## Definition of Done
A migration phase is complete only when:
- domain ownership matches `doc/features/**` for the touched boundary
- old and new paths are not both canonical owners
- tests validate command, event, invariant, and error contracts
- `script.js` complexity is reduced during migration and the file is deleted by final phase
- automated test gates (`./tools/check`, `./tools/lint`, `./tools/test`) pass for that phase
- shim/adapter inventory for that phase is at or below its planned burn-down target

Final migration completion requires:
- zero compatibility shims/adapters in runtime paths
- zero compatibility aliases in public service interfaces
- docs in `ARCHITECTURE.md`, `DOC.md`, and affected `doc/features/**` files describe the migrated architecture without stale "current state" contradictions
