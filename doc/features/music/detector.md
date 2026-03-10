The detector identifies when an instrument plays a note.

## Current state

There are two detectors
- Threshold - when the audio volume exceeds a note
- Adaptive - complex algorithm to detect notes

Detector behavior is currently exposed through a manager that bridges detector internals and UI.

## Runtime owner

`src/features/microphone/detector-manager.js` is the current owner for detector lifecycle.

It owns:

- detector instance creation/switching
- sensitivity and parameter persistence
- microphone device selection
- hit listener registration
- BPM propagation for adaptive refractory behavior

## Service role

- Detector service consumes audio service output (mic stream, analyser/FFT).
- It owns active detector configuration and runtime detection state.

## Event role

- Emits domain events for consumers:
	- `hit`
	- `level`
	- `devices-changed`
	- `patched`

## Context role

- Provided as a root context service.
- Components consume detector service and update DOM from events.
- Prefer event-driven subscriptions over delegates/callback references.

In current implementation, the manager is context-provided by `main`, but instance construction still happens in `script.js`.

## Calibration

Calibration is the process of determining the association between the `currentTime` in the computer, how long it takes to play a sound, and how long a users response takes to be detected.

Calibration currently uses detector hit timing plus metronome expected beats and is orchestrated in `script.js`.