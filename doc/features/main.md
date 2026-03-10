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
- It does not orchestrate pane workflows, session lifecycle, or scoring.

## Known seam

`main` is only a partial composition root today because `script.js` still creates several core runtime objects (`SessionState`, `DetectorManager`, `Metronome`, `Scorer`, `DrillSessionManager`).
