# Audio Context

In Tempo Trainer, the audio context is a single shared Web Audio API `AudioContext` used as the app’s audio engine and timing clock.

## What it is

- The browser-provided `AudioContext` powers sound generation and audio processing.
- Its `currentTime` is the canonical timing source for click scheduling, drill playback sync, and timeline centering.
- The app treats it as a shared infrastructure object, not per-component state.

## Lifecycle in this codebase

Lifecycle is centralized in `AudioContextManager`:

- File: `src/features/audio/audio-context-manager.js`
- `ensureContext()` lazily creates the context on first use.
- If the context is `suspended`, it resumes it to satisfy browser user-gesture/audio policies.
- `getContext()` returns the current instance (or `null` if not created yet).
- Emits a `ready` event when context creation succeeds.

This design ensures there is one source of truth for audio state and avoids each feature creating its own context.

## How features use it

- Root provisioning: `src/features/main/main.js`
	- Provides audio service through context.
	- Notifies context consumers when audio becomes ready.
- Access overlay: `src/features/audio/audio-context-overlay.js`
	- Triggers `ensureContext()` from user interaction.
	- Keeps UI blocked until context exists.
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

This feature is now explicitly modeled as a service consumed through context.

Next refinement is to move remaining script-level audio wiring into service/component-level subscriptions so consumers self-wire from context events.


