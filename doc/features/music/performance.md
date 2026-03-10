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

## Known seam

Performance ownership is split between runtime scoring and persistence analytics, coordinated in `script.js`.

## Migration target

Introduce a single context-visible performance domain API while keeping scorer math and history storage internally separated.