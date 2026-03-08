# Audio Context

In Tempo Trainer, the audio context is a single shared Web Audio API `AudioContext` used as the app’s audio engine and timing clock.

## What it is

- The browser-provided `AudioContext` powers sound generation and audio processing.
- Its `currentTime` is the canonical timing source for click scheduling, drill playback sync, and timeline centering.
- The app treats it as a shared infrastructure object, not per-component state.

## Lifecycle in this codebase

Lifecycle is centralized in `AudioContextManager`:

- File: `src/features/base/audio-context-manager.js`
- `ensureContext()` lazily creates the context on first use.
- If the context is `suspended`, it resumes it to satisfy browser user-gesture/audio policies.
- `getContext()` returns the current instance (or `null` if not created yet).
- `onContextCreated(callback)` lets dependent features register once and receive the created context.

This design ensures there is one source of truth for audio state and avoids each feature creating its own context.

## How features use it

- App wiring: `src/script.js`
	- Registers `onContextCreated` to inject the same context into metronomes, detector manager, and calibration detector.
	- Calls `ensureContext()` before operations that require audio/microphone readiness.
- Metronome/playback: `src/features/plan-play/metronome.js`
	- Uses the context to create oscillator/gain nodes and schedule clicks precisely.
- Microphone input: `src/features/microphone/audio-input-source.js`
	- Uses the context to build input/analyser nodes for detection.
- Calibration/timeline sync: `src/script.js` and `src/features/calibration/calibration-detector.js`
	- Uses `currentTime` as the reference for beat position and hit timing.

## Error handling

- If Web Audio is unavailable, context creation fails with a “Web Audio API not available” error.
- Call sites surface this as user-facing startup/session errors where relevant.

## Practical definition

For this project, “audio context” means the shared, lazily-initialized, browser-managed real-time audio/timing runtime that all audio and microphone features synchronize against.

## Updates

Move this to a `service` and create a component that overlays and interrupts interactions. Bind creating the audio context to a click event on that overlay so that app interaction is blocked until we guarantee that the mic is available. Include a disclaimer describing the need


