# Timeline

Timeline is the domain that translates raw time into musical divisions (beat, measure, segment position).

Timeline is the canonical owner of tempo, meter, transport state, and time-division mapping.

## Current implementation

- Runtime semantics are still partially distributed in legacy code:
	- `SessionState` (`src/features/base/session-state.js`) still stores tempo/meter as migration debt.
	- `Metronome` (`src/features/plan-play/metronome.js`) still derives beat duration internally.
	- timeline rendering lives in `src/features/visualizers/timeline-visualization.js`.
- Main timeline UI is `src/features/visualizers/timeline-visualization.js`.
- It renders:
	- measure groups (`click-in`, `silent`, etc.)
	- beat grid
	- expected beat markers
	- detected hit markers
- `DrillSessionManager.updateTimelineScroll(...)` drives centering during playback.
- Calibration uses a separate timeline window managed in `script.js`.

## Inputs

- Audio clock time (`AudioContext.currentTime`).
- Session timing configuration (BPM, beats-per-measure).
- Chart/plan measure structure used for division labeling.
- Calibration offset used to map observed hit times.

## Outputs

- Beat duration and measure/beat mapping helpers (currently implicit across modules).
- Beat positions for scroll/visualization.
- Future domain events for tempo/meter/time-map changes.

## Known seam

Legacy runtime still duplicates timing logic in `SessionState`, `Metronome`, and `script.js`.
This is an implementation seam, not an ownership model.

## Migration target

- Keep timeline as the sole timing owner.
- Remove timing ownership from `SessionState` and `Metronome`.
- Keep `timeline-visualization` as a pure renderer consuming timeline outputs.

## Minimal design target

### Canonical state

- `transportState`: `stopped | playing | paused`
- `tempo`
- `beatsPerMeasure`
- `position`: current musical position (division/measure+beat)

### Commands

- `setTempo(bpm)`
- `setBeatsPerMeasure(count)`
- `play()`
- `pause()`
- `stop()`
- `seekToDivision(position)`

### Notifications

- One coarse invalidation notification (`changed`/`patched`) after successful state transitions.
- Optional high-frequency playhead stream only if a consumer cannot efficiently pull from canonical state.
- `fault` for asynchronous dependency/runtime failures.

### Invariants

- Tempo is positive and finite.
- Beats per measure is a positive integer.
- Beat duration is derived from tempo only.
- Transport commands are idempotent when target state already matches current state.
- No other service owns tempo/meter as canonical state.

### Error handling

- Validation failures throw synchronously and do not mutate state.
- Dependency/runtime failures do not throw through unrelated callers; they emit `fault` and keep timeline in a safe transport state.
