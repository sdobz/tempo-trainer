# Chart Play Workflow

Chart play is the active practice run from "start" to completion/stop.

## Current flow

1. User enters `plan-play-pane` (class `PlanPlayPane`, element `<plan-play-pane>`).
2. `plan-play-pane` emits `session-start`.
3. `app-orchestrator.js` validates audio context and starts `DrillSessionManager`.
4. `DrillSessionManager` coordinates metronome, detector, scorer, and timeline updates.
5. On completion, session data is saved through `PracticeSessionManager` and shown in history.

## Inputs

- Selected chart from `ChartServiceContext`.
- BPM and beats-per-measure from `TimelineServiceContext`.
- Detector hits and calibration offsets.

## Outputs

- Live beat/status/score UI via `PlaybackState`.
- Session records persisted for review.

## Known seam

Workflow orchestration lives in `src/app-orchestrator.js`.

## Minimal design target

### Workflow state

- `idle | preparing | running | completing | stopped`

### Input intents

- `session-start`
- `session-stop`

### Output effects

- Invoke service commands only (timeline/playback/detector/performance).
- Persist completed run via performance/history service.

### Notifications

- Coarse workflow invalidation is sufficient by default.
- No additional workflow-specific fine-grained events unless a concrete consumer requires them.