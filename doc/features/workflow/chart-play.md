# Chart Play Workflow

Chart play is the active practice run from "start" to completion/stop.

## Current flow

1. User enters `plan-play` pane.
2. `plan-play-pane` emits `session-start`.
3. `script.js` validates audio context and starts `DrillSessionManager`.
4. `DrillSessionManager` coordinates metronome, detector, scorer, and timeline updates.
5. On completion, session data is saved through `PracticeSessionManager` and shown in history.

## Inputs

- Selected plan from `SessionState.plan`.
- BPM and beats-per-measure from `SessionState`.
- Detector hits and calibration offsets.

## Outputs

- Live beat/status/score UI via `PlaybackState`.
- Session records persisted for review.

## Known seam

Workflow orchestration still lives in `script.js` rather than a dedicated play workflow service.