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

## Known seam

- Playback uses callbacks (`onBeat`, `onMeasureComplete`) instead of event contracts.
- Two metronome instances are managed from `script.js` (session and calibration).

## Migration target

- Promote playback to a context-provided runtime service with explicit events (`started`, `stopped`, `beat`, `measure`).

