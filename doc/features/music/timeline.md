# Timeline

Timeline is the domain that translates raw time into musical divisions (beat, measure, segment position).

It is the destination for session timing semantics and selected playback timing logic that is currently split across `SessionState` and `Metronome`.

## Current implementation

- Domain semantics are currently split:
	- `SessionState` (`src/features/base/session-state.js`) owns BPM and beats-per-measure.
	- `Metronome` (`src/features/plan-play/metronome.js`) owns beat duration and next scheduled beat progression.
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

Timeline semantics are split between:

- Session state tempo data.
- Metronome scheduling state.
- Visualization math and calibration rebase logic in `script.js`.

This split makes ownership unclear and duplicates time-translation logic.

## Migration target

Create a dedicated Timeline service that owns:

- BPM, beats-per-measure, and derived beat duration.
- Conversion between audio time and musical divisions.
- Canonical helpers for beat/measure/segment lookup.

Keep `timeline-visualization` as a pure renderer that consumes timeline outputs.

Move session-state timing fields and selected metronome timing math into timeline-owned semantics.

## Proposed command contract

- `setTempo(bpm)`
	- Updates canonical tempo for all time-division mapping.
- `setBeatsPerMeasure(count)`
	- Updates meter for beat/measure indexing.
- `play()`
	- Transitions transport lifecycle to `playing`.
- `pause()`
	- Transitions transport lifecycle to `paused`.
- `stop()`
	- Transitions transport lifecycle to `stopped`.
- `seekToDivision(position)`
	- Moves transport anchor to a specific musical position.

Commands express intent; direct state mutation is forbidden.

## Proposed event contract

Required coarse event:

- `patched`
	- Emitted after every successful state transition.

Required domain events:

- `state-changed`
	- Emitted when timeline lifecycle state changes. Payload includes previous/current state enum (`stopped`, `playing`, `paused`).
- `config-changed`
	- Emitted when timing config changes (tempo/meter).
- `fault`
	- Emitted for asynchronous dependency/runtime failures.

Rationale: lifecycle is represented by one enum transition event, not multiple edge event names.

## Invariants

- Tempo is always positive and finite.
- Beats per measure is an integer greater than zero.
- Beat duration is always derived from tempo (never independently assigned).
- A transport state command that does not change state is idempotent (no-op, no events).
- Time-to-division mapping uses one canonical source of tempo/meter at any given moment.

## Error handling

- Validation failure (invalid tempo/meter/seek position):
	- Throw synchronously.
	- State remains unchanged.
	- Do not emit domain events or `patched`.
- Dependency failure (audio clock unavailable):
	- Timeline remains usable for pure math operations.
	- Clock-dependent queries return a documented failure/null result.
	- Emit `fault`.
- Runtime failure (unexpected mapping/transport exception):
	- Service enters a safe non-playing state.
	- Emit `fault`.
