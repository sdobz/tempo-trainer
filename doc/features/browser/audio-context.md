# Audio Context

In Tempo Trainer, audio context is the browser runtime boundary for timing, output playback, and microphone processing.

## What it is

- The browser-provided `AudioContext` powers sound generation and audio processing.
- Its `currentTime` is the canonical timing source for click scheduling, drill playback sync, and timeline centering.
- The app treats it as a shared infrastructure object, not per-component state.

Microphone runtime is part of this boundary: audio input nodes/analyser chains depend on this same context lifecycle.

## Lifecycle in this codebase

Lifecycle is centralized in `AudioContextManager`:

- File: `src/features/audio/audio-context-manager.js`
- `ensureContext()` lazily creates the context on first use.
- If the context is `suspended`, it resumes it to satisfy browser user-gesture/audio policies.
- `getContext()` returns the current instance (or `null` if not created yet).
- Emits a `ready` event when context creation succeeds.

This design ensures there is one source of truth for audio state and avoids each feature creating its own context.

Microphone source wiring currently happens in `src/features/microphone/audio-input-source.js` via injected `AudioContext` from this service.

## How features use it

- Root provisioning: `src/features/main/main.js`
	- Provides audio service through context.
	- Notifies context consumers when audio becomes ready.
- Access overlay: `src/features/audio/audio-context-overlay.js`
	- Is the canonical UI trigger for `ensureContext()` from user interaction.
	- Keeps UI blocked until context exists.
- Playback: `src/features/plan-play/metronome.js`
	- Uses the context to create oscillator/gain nodes and schedule clicks precisely.
- Microphone input and detector runtime: `src/features/microphone/audio-input-source.js` and `src/features/microphone/detector-manager.js`
	- Uses the context to build input/analyser nodes for detection.
- Calibration/timeline sync: `src/script.js` and `src/features/calibration/calibration-detector.js`
	- Uses `currentTime` as the reference for beat position and hit timing.

## Error handling

- If Web Audio is unavailable, context creation fails with a “Web Audio API not available” error.
- Call sites surface this as user-facing startup/session errors where relevant.

## Practical definition

For this project, "audio context" means the shared, lazily-initialized browser runtime that all timing, playback, and microphone detection features synchronize against.

It is the only supported gateway for creating/resuming `AudioContext` in app code.

## Known seam

- `AudioContextManager` is context-provided from `main`, but many runtime consumers are still wired in `script.js`.
- Browser boundary concerns (audio context, storage, permissions) are split across feature docs and not fully normalized yet.

## Migration target

- Treat audio context + microphone runtime as one browser boundary with explicit contracts.
- Move script-level wiring to service/component-level subscriptions.
- Remove direct `AudioContext` creation/resume outside this service.

## Minimal design target

### Canonical state

- `contextState`: `uninitialized | ready | suspended | unavailable`
- `context`: nullable `AudioContext` reference

### Commands

- `ensureContext()`
- `resume()`

### Notifications

- One coarse invalidation notification (`changed`/`patched`) when readiness state changes.
- `fault` for asynchronous initialization/resume failures.

### Invariants

- At most one shared `AudioContext` instance is active.
- Consumers do not create independent context instances.
- `ensureContext()` is user-gesture-triggered by `audio-context-overlay`, not by arbitrary components.

### Error handling

- Validation/precondition failures throw synchronously when applicable.
- Browser/runtime failures emit `fault` and preserve a queryable readiness state.


