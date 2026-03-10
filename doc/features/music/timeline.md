# Timeline

Timeline is currently a visualized beat-space projection, not yet a standalone service.

## Current implementation

- Main timeline UI is `src/features/visualizers/timeline-visualization.js`.
- It renders:
	- measure groups (`click-in`, `silent`, etc.)
	- beat grid
	- expected beat markers
	- detected hit markers
- `DrillSessionManager.updateTimelineScroll(...)` drives centering during playback.
- Calibration uses a separate timeline window managed in `script.js`.

## Inputs

- `SessionState.plan` and `SessionState.beatsPerMeasure` via context subscription.
- Audio-clock-derived beat positions supplied by orchestrators.

## Outputs

- Visual feedback only (no domain event contract yet).

## Known seam

Timeline semantics are split between:

- Session state tempo data.
- Metronome scheduling state.
- Visualization math and calibration rebase logic in `script.js`.

## Migration target

Create a dedicated timeline domain service for beat/measure mapping and keep `timeline-visualization` as a pure renderer.
