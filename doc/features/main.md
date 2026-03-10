# Main Root Component

`src/features/main/main.js` defines `tempo-trainer-main`, the root component.

## Current implementation

- Owns one `AudioContextManager` instance directly.
- Provides context tokens for:
	- `SessionStateContext`
	- `DetectorManagerContext`
	- `AudioContextServiceContext`
- Receives `sessionState` and `detectorManager` from `script.js` via `setServices(...)`.
- Calls `notifyContext(...)` when injected service instances change.
- Listens for audio manager `ready` and notifies `AudioContextServiceContext` consumers.

## Ownership boundary

- `main` is a context bridge and composition root shell.
- It owns root context provisioning and root-level inter-service wiring.
- It does not orchestrate pane workflows, session lifecycle, or scoring.

## Known seam

`main` is only a partial composition root today because `script.js` still creates several core runtime objects (`SessionState`, `DetectorManager`, `Metronome`, `Scorer`, `DrillSessionManager`).

## Minimal feature-contract baseline

Use this baseline for all `doc/features/**` service-like docs:

- Define one canonical state snapshot for the domain.
- Define command methods that mutate that state.
- Start with one coarse invalidation notification (`changed`/`patched`).
- Add stream notifications only when coarse invalidation is not practical (high-frequency or strict edge consumers).
- Validation failures throw synchronously; asynchronous dependency/runtime failures emit `fault`.

This keeps event surfaces small and pushes correctness into canonical state and command semantics.
