# Playback

Playback is currently implemented by `src/features/plan-play/metronome.js` and orchestrated by `DrillSessionManager` in `src/features/plan-play/drill-session-manager.js`.

## Current implementation

- `Metronome` is a scheduler around `AudioContext.currentTime`.
- It keeps local state for:
	- running/stopped status
	- BPM and beat duration
	- beats-per-measure
	- next scheduled beat time
- `DrillSessionManager` provides beat/measure callbacks and chooses click frequencies.
- `scheduleClick(time, frequency)` synthesizes oscillator-based clicks.

## Responsibilities today

- Audible beat playback during session run.
- Measure progression signaling through callbacks.
- Calibration click playback via a second metronome instance in `script.js`.

Target boundary clarification:

- Timeline owns transport and timing (`play/pause/stop`, beat scheduling decisions, tempo/meter interpretation).
- Playback owns sound rendering only (when asked to emit a click/tone at a given time/profile).

## Observable playback state

`PlaybackState` (`src/features/plan-play/playback-state.js`) is the consumer-facing observable for the active session.

It holds:
- `scores` — per-measure score array
- `highlight` — currently active measure index
- `overallScore` — session aggregate
- `status` — display string
- `beat` — `{ beatNum, isDownbeat, shouldShow }` or `null`
- `isPlaying` — boolean

Consumers call `subscribe(fn)` and receive the full snapshot immediately and on every `update(patch)`.

`PlaybackContext` is the context token (exported from the same file). It is provided by `plan-play-pane` (scoped, not root) and consumed by `plan-visualizer` and `timeline-visualization`.

## Known seam

- `Metronome` uses callbacks (`onBeat`, `onMeasureComplete`) instead of event contracts.
- Two metronome instances are managed from `script.js` (session and calibration).
- `PlaybackState` uses a custom subscriber set (`subscribe`/`unsubscribe`) rather than `EventTarget`.

## Migration target

- Keep playback as an infrastructure service that renders sound on request.
- Move transport/timing ownership to timeline.
- Keep `PlaybackState` as UI-facing projection state; do not treat it as transport authority.

## Proposed command contract

- `renderClick(atTime, accentProfile)`
	- Schedules one click/tone render operation.
- `renderCue(cue, atTime)`
	- Schedules a non-beat cue (count-in, calibration marker, UI cue).
- `setClickProfile(profile)`
	- Updates rendering parameters used by future render commands.

Playback does not own tempo, meter, transport state, or beat progression.

## Proposed event contract

Required coarse/error events:

- `patched`
	- Emitted after successful rendering configuration transitions.
- `fault`
	- Emitted for asynchronous dependency/runtime failures.

Validation failures in command methods throw synchronously.

## Invariants

- Playback never becomes source-of-truth for transport lifecycle.
- Render commands never mutate timeline state.
- Scheduled click times are never emitted in the past relative to service clock.

## Error handling

- Validation failure (invalid click profile, invalid render request):
	- Throw synchronously.
	- State unchanged.
- Dependency failure (audio context unavailable/suspended/device blocked):
	- Emit `fault`.
- Runtime scheduling failure:
	- Emit `fault`.

