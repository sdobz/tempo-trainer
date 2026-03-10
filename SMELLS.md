# Hostile Architecture Review

Scope reviewed:
- `DOC.md` migration plan
- `ROADMAP.md` product trajectory
- contracts in `doc/features/service.md`, `doc/features/component.md`, `doc/features/state.md`, `doc/features/audio.md`, `doc/features/timeline.md`, `doc/features/metronome.md`, `doc/features/score.md`, `doc/features/detector.md`, `doc/features/main.md`

## Executive Verdict

`Conditional`

The direction is viable only if ownership boundaries are made explicit now, service contracts are made deterministic, and `script.js` orchestration is aggressively retired before Phases 3-4 scale complexity.

## Top 10 Architecture Risks (Severity x Likelihood)

1. **Dual-orchestrator drift (`main.js` + `script.js`)**
2. **Context/event contract ambiguity causing hidden coupling**
3. **`patched` event overuse collapsing semantic boundaries**
4. **Timeline under-specified for roadmap-grade timing analytics**
5. **Detector abstraction inflation before stability criteria**
6. **Lifecycle ownership ambiguity for service readiness/replacement**
7. **Score service boundary confusion (`score` vs `plan`)**
8. **Main-thread event jitter risk vs AudioWorklet roadmap**
9. **Service interfaces too broad for agent-maintainable evolution**
10. **Phase sequencing mismatch (feature ambition outruns architecture constraints)**

## Evidence Table

| Risk | Concrete source location | Failure mode | Triggered by what change |
| --- | --- | --- | --- |
| Dual-orchestrator drift | `DOC.md` "Phased migration" (Phase 3/4: move wiring from `script.js`, then deprecate), `doc/features/audio.md` "How features use it" (still references `src/script.js`) | Duplicate control paths for timing/audio/detection create race conditions and divergent app state | Any new feature wiring added to `script.js` while service graph is partially migrated |
| Context/event contract ambiguity | `DOC.md` "Event/context contract" + `doc/features/component.md` "Context" + `doc/features/service.md` "Runtime propagation" | Developers use context callbacks as state updates instead of identity/readiness updates, causing stale subscriptions and phantom listeners | Swapping service instances or lazy readiness transitions under load |
| `patched` event overuse | `DOC.md` "Prefer one coarse `patched` event" + `doc/features/state.md` and `doc/features/timeline.md`/`score.md`/`detector.md` allowing optional fine events | Event consumers over-render, infer incorrect deltas, or miss required domain-level semantics | Adding advanced metrics (drift, IOI variance, weighted scoring) needing precise event granularity |
| Timeline under-specification | `doc/features/timeline.md` only defines BPM/meter mapping; `ROADMAP.md` Phases 3, 5, 8 require drift modeling, tempo estimation, longitudinal comparability | Analytics logic leaks into detector/score/components, creating inconsistent timing math and duplicated transforms | Introducing Phase 3 drift metrics and Phase 5 tempo intelligence without timeline contract expansion |
| Detector abstraction inflation | `doc/features/detector.md` "Desired state" moves to one flexible detector with notch filters, dynamic thresholds, presets; `ROADMAP.md` Phase 1/2 require fidelity first | Prematurely unifying detectors into configurable mega-object produces unstable behavior and opaque tuning regressions | Merging threshold/adaptive paths before objective performance gates are met |
| Lifecycle ownership ambiguity | `doc/features/component.md` lifecycle section has inconsistent wording for mount/unmount; `doc/features/audio.md` readiness and context notify semantics; `doc/features/main.md` composition-root duty | Memory leaks and duplicate event handlers when components/services remount or service identity changes | Introducing service replacement/restart flows (device changes, calibration reset, detector mode switch) |
| Score boundary confusion | `doc/features/score.md` says "score" current state named `plan`; roadmap phases 4/6/7/8 require differentiated pedagogical layers | Plan authoring state and performance scoring state become coupled, blocking independent evolution and testing | Adding weighted scoring, longitudinal stats, and training scheduler on same mutable model |
| Main-thread timing risk | `ROADMAP.md` Phase 1 explicitly requires AudioWorklet migration; current contracts emphasize generic events/context without deterministic clock-domain rules | Timestamp drift and event latency invalidate "rhythm-game-level" trust | Scaling detector throughput, adding UI observers, and relying on DOM/event loop timing |
| Interfaces too broad for agent maintenance | `doc/features/service.md` allows services to be components/state machines/shared API/global state; weakly bounded concept | Future agents introduce god-services and cross-domain methods with unclear ownership | Feature accretion across phases 6-11 (analytics, scheduler, pedagogy, sharing) |
| Phase sequencing mismatch | `ROADMAP.md` aggressively expands analytics/training; `DOC.md` migration mostly addresses DI wiring, not domain contract hardening | Architecture debt compounds silently, then hardens into irreversible coupling | Starting Phase 3+ features before enforcing service contract tests and ownership rules |

## Guardrails (Enforceable)

1. **Single composition root rule**
	- Enforce: only `src/features/main/main.js` may instantiate root services.
	- Test/lint: forbid `new <Service>` in `src/script.js` and feature components via lint rule/grep CI check.

2. **No cross-service writes rule**
	- Enforce: services may call command methods on dependencies, never mutate dependency state directly.
	- Test: contract tests that freeze dependency state snapshots and assert no external mutation.

3. **Explicit event catalog per service**
	- Enforce: each service doc declares allowed events and payload schema.
	- Test: unit test subscribes to wildcard/known events and fails on undocumented event names.

4. **`patched` is not sufficient for domain transitions**
	- Enforce: any roadmap-critical metric transition must emit domain event (`beat`, `hit`, `measure-finalized`, etc.) in addition to optional `patched`.
	- Test: scenario tests assert domain events exist for timing/scoring milestones.

5. **Service ownership map is mandatory**
	- Enforce: each state field has one owning service in docs.
	- Review gate: PR fails if new shared state lacks explicit owner entry.

6. **Context callback semantics are fixed**
	- Enforce: context notifications mean identity/readiness changes only; never incremental state.
	- Test: component tests replace service instance and assert re-subscribe behavior; state changes must come from events.

7. **Clock-domain discipline rule**
	- Enforce: timing-critical events must carry audio-clock timestamps.
	- Test: detector/metronome integration tests assert monotonic audio-time stamps and bounded conversion error.

8. **Detector progression gates**
	- Enforce: detector unification work blocked until Phase 1 metrics pass (double-trigger, false positive, ghost-note criteria).
	- Test: benchmark suite in CI defines pass/fail thresholds before enabling new detector abstraction.

9. **Plan vs score separation rule**
	- Enforce: immutable plan definition cannot store live performance aggregates.
	- Test: type/shape tests ensure performance data is stored in score/session models only.

10. **Migration burn-down metric**
	- Enforce: each sprint must reduce `script.js` service wiring count.
	- Test: CI script counts forbidden orchestration patterns and fails if count increases.

## Do Not Allow (Anti-Patterns)

- Adding any new orchestration path in `src/script.js`.
- Services that both own state and render DOM.
- Components reading service internals without subscribing to documented events.
- Event names without payload schema and producer ownership.
- "Utility" services that aggregate unrelated domains (audio + scoring + scheduling).
- Silent service replacement without context notification.
- Detector config objects that mutate live behavior without versioned presets.
- Timeline math duplicated outside timeline service.
- Score logic that depends on UI component state.
- Roadmap features added without contract updates in `doc/features/*.md`.

## Minimal Target Architecture

Service graph (minimum viable, bounded ownership):

1. `AudioContextService` (owner: audio runtime)
	- Owns: `AudioContext` lifecycle, readiness/error, clock accessor.
	- Emits: `ready`, `error`.

2. `TimelineService` (owner: musical time semantics)
	- Depends on: `AudioContextService` clock.
	- Owns: BPM, meter, beat duration, time-map helpers.
	- Emits: `patched`, `bpm-changed`, `meter-changed`.

3. `MetronomeService` (owner: click scheduling)
	- Depends on: `AudioContextService`, `TimelineService`.
	- Owns: start/stop state, schedule horizon.
	- Emits: `started`, `stopped`, `beat`, `measure`.

4. `DetectorService` (owner: hit detection runtime)
	- Depends on: `AudioContextService` input/analyser.
	- Owns: detector mode/config, runtime detection state.
	- Emits: `hit`, `level`, `devices-changed`, `patched`.

5. `ScoreService` (owner: performance evaluation)
	- Depends on: `TimelineService`, `DetectorService`, optional `MetronomeService` beat events.
	- Owns: expected events mapping, observed performance, session aggregates.
	- Emits: `note-registered`, `measure-finalized`, `session-complete`, `patched`.

Ownership boundaries:
- `main.js` owns construction and context provisioning only.
- Components own DOM only.
- Services own domain state only.
- `script.js` owns temporary startup glue only until deleted.

## 30/60/90 Day Migration Checkpoints

30 days (Roadmap Phase 1-2 alignment):
- `script.js` no longer creates/owns audio/timeline/detector wiring.
- Timeline service contract expanded for Phase 3 timing diagnostics input needs.
- Event catalogs documented and tested for all five core services.

60 days (Roadmap Phase 3-5 alignment):
- AudioWorklet path integrated with detector timestamps normalized to audio clock.
- Score service separated from plan definition with explicit session model.
- Domain-event tests cover drift, IOI/subdivision, and tempo-estimation pathways.

90 days (Roadmap Phase 6-8 alignment):
- Longitudinal analytics consume only score/session outputs, not raw component state.
- Training engine depends on stable metric interfaces, not detector internals.
- `script.js` orchestration removed; deprecation complete and enforced in CI.

## Kill Criteria (Rollback Triggers)

- `script.js` orchestration footprint grows for two consecutive iterations.
- Any core metric (timing error, drift slope, consistency) computed differently in more than one service.
- Inability to replay a session deterministically from event logs.
- Detector abstraction merge causes measurable regression in Phase 1 deliverables.
- New roadmap features require bypassing context/service contracts to ship.
- Service ownership disputes remain unresolved across two planning cycles.
