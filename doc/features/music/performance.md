# Performance

Performance is the observed user output during and after a run.

## Current implementation

Performance is split across two modules:

- `src/features/plan-play/scorer.js`
	- Session-time hit registration and measure scoring.
	- Maintains `measureHits` and computes overall score.
- `src/features/plan-history/practice-session-manager.js`
	- Persists completed sessions.
	- Derives metrics (drift, missed measures, rhythm variance, consistency, completion).

## Inputs

- Detector hit timings (`DetectorManager.onHit` path through `DrillSessionManager`).
- Session timing config (BPM and beats-per-measure from `SessionState`).
- Chart/plan measures active for the run.

## Outputs

- Live score updates through playback state.
- Final session record with plan snapshot and derived metrics.
- History/statistics views in plan history pane.

## Storage

- Performance history persistence is owned by `PracticeSessionManager`.
- Storage transport uses browser persistence (`StorageManager`).
- Performance domain owns session record shape and derived metric semantics.

## Known seam

Performance ownership is split between runtime scoring and persistence analytics, coordinated in `script.js`.

## Migration target

Introduce a single context-visible performance domain API while keeping scorer math and history storage internally separated.

## Minimal design target

### Canonical state

- `currentRun` summary (status, per-measure scores, overall score)
- `lastCompletedSession` summary

### Commands

- `startRun(context)`
- `registerHit(hitTime)`
- `finalizeMeasure(index)`
- `completeRun(meta)`
- `discardRun()`

### Notifications

- One coarse invalidation notification (`changed`/`patched`) for score/progress updates.
- One optional edge notification `run-completed` if a consumer must react immediately without diffing.
- `fault` for asynchronous persistence/analysis failures.

### Invariants

- Scoring state for the active run is append-only with measure finalization boundaries.
- Completed sessions are immutable records once persisted.

### Error handling

- Validation failures throw synchronously.
- Persistence/derivation failures emit `fault`; run state remains queryable.