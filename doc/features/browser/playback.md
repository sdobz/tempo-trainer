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

- Promote playback to a context-provided runtime service with explicit events (`started`, `stopped`, `beat`, `measure`).
- Merge `Metronome` scheduling and `PlaybackState` observation under one service boundary.

