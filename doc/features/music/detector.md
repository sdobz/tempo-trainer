The detector identifies when an instrument plays a note.

## Current state

There are two detectors
- Threshold - when the audio volume exceeds a note
- Adaptive - complex algorithm to detect notes

Detector behavior is currently exposed through a manager that bridges detector internals and UI.

## Desired state

One detector has parameters to flexibly define any type of 

- Notch filter: only look at a certain frequency range
- Dynamic thresholding behavior
- Instrument-specific tuning presets

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

## Calibration

Calibration is the process of determining the association between the `currentTime` in the computer, how long it takes to play a sound, and how long a users response takes to be detected.