# Timeline

Timeline is the domain that translates raw time into musical divisions (beat, measure, segment position).

Timeline is the canonical owner of tempo, meter, transport state, and time-division mapping.

## Current implementation [Phase 2]

- **Canonical owner**: `src/features/music/timeline-service.js` (TimelineService)
- **State**: `tempo`, `beatsPerMeasure`, `transportState`, `position`
- **Commands**: `setTempo`, `setBeatsPerMeasure`, `play`, `pause`, `stop`, `seekToDivision`
- **Event contract**: `changed` (coarse patch), `transport` (state transition)

### Current consumers

- `plan-play-pane` consumes `TimelineServiceContext` for BPM/time-signature UI.
- `timeline-visualization` consumes `TimelineServiceContext` for canonical meter (`beatsPerMeasure`).
- `script.js` subscribes to timeline changes and fans out updates to metronome/scorer/calibration/detector.
- `detector-manager` receives BPM via `setSessionBpm` from timeline updates.

### Rendering/runtime notes

- Main timeline UI remains `src/features/visualizers/timeline-visualization.js`.
- It renders measure groups, beat grid, expected beat markers, and detected hit markers.
- `DrillSessionManager.updateTimelineScroll(...)` still drives centering during playback.
- Calibration uses a separate timeline window managed in `script.js`.

## Inputs

- Audio clock time (`AudioContext.currentTime`).
- Session timing configuration (BPM, beats-per-measure) from TimelineService.
- Chart/plan measure structure used for division labeling.
- Calibration offset used to map observed hit times.

## Outputs

- Beat duration and measure/beat mapping helpers (`timelineService.beatDuration`, division position).
- Beat positions for scroll/visualization.
- Domain events for tempo/meter/transport transitions.

## Known seam

- `SessionState` still exposes mirrored `bpm`/`beatsPerMeasure` for compatibility.
- The migration seam is one-way startup bridge: initial timing values are read once from SessionState.
- SessionState timing mirror removal target: Phase 4.

## Migration target

Achieved in Phase 2 for canonical ownership:

- Timeline is sole canonical timing owner.
- SessionState timing fields are compatibility mirrors only.
- `timeline-visualization` consumes timeline meter as canonical input.

Remaining seam:

- `Metronome` still performs scheduling internals and will be split in Phase 3.

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
