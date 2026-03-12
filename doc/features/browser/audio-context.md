# Audio Context

In Tempo Trainer, this doc describes the browser audio runtime boundary.

That boundary is broader than click playback alone, but narrower than note detection:

- Browser audio runtime owns shared Web Audio lifecycle and browser-provided audio primitives.
- Detector domain owns note-detection strategy, detector configuration, and hit timing semantics.

This means the project should be understood as two adjacent domains in this area, not three peer services:

- browser-facing audio runtime
- domain-facing detector runtime

## What it is

- The browser-provided `AudioContext` powers sound generation and audio processing.
- Its `currentTime` is the canonical timing source for click scheduling, drill playback sync, and timeline centering.
- The app treats it as a shared infrastructure object, not per-component state.

Microphone capture also depends on this boundary, but microphone capture is not a separate root service. It is now owned directly by the browser audio runtime service.

## Boundary split

### Browser audio runtime owns

- shared `AudioContext` creation/resume/lifecycle
- browser microphone permission handshake
- `MediaStream` acquisition
- `MediaStreamAudioSourceNode` and `AnalyserNode` creation
- browser device enumeration primitives
- selected input device state
- device change notifications

### Browser audio runtime does not own

- detector type selection
- detector sensitivity or detector params
- hit classification semantics
- scoring or calibration meaning

Those belong to detector/calibration/performance domains.

## Lifecycle in this codebase

Lifecycle is centralized in one public root service:

- Public root service: `src/features/audio/audio-context-manager.js`
	- lazily creates and resumes the shared `AudioContext`
	- owns selected device state and available device inventory
	- acquires `getUserMedia` stream
	- creates `MediaStreamSource` + `AnalyserNode`
	- exposes coarse state transitions through a discriminated-union state snapshot
	- emits `ready`, `changed`, and `fault`

The detector domain now depends directly on this browser audio runtime service for its input/analyser source.

This design ensures there is one source of truth for audio state and avoids each feature creating its own context.

## How features use it

- Root provisioning: `src/features/main/main.js`
	- Provides audio service through context.
	- Notifies context consumers when audio becomes ready.
- Access overlay: `src/features/audio/audio-context-overlay.js`
	- Is the canonical UI trigger for `ensureContext()` from user interaction.
	- Keeps UI blocked until context exists.
- Timeline + playback runtime:
	- `TimelineService` uses `currentTime` as the scheduling clock.
	- `PlaybackService` uses the shared context to render scheduled clicks.
- Microphone input and detector runtime: `src/features/audio/audio-context-manager.js` and `src/features/microphone/detector-manager.js`
	- Browser audio runtime creates and updates the input/analyser source.
	- Detector runtime consumes that source to perform note detection.
- Calibration/timeline sync: `src/app-orchestrator.js` and `src/features/calibration/calibration-detector.js`
	- Uses `currentTime` as the reference for beat position and hit timing.

## Error handling

- If Web Audio is unavailable, context creation fails with a “Web Audio API not available” error.
- Call sites surface this as user-facing startup/session errors where relevant.

## Practical definition

For this project, "audio context" means the shared, lazily-initialized browser audio runtime that timing, playback, and microphone capture all synchronize against.

It is the only supported gateway for creating/resuming `AudioContext` in app code.

It is not the owner of detector semantics.

It is the owner of browser audio device state.

## State machine

The browser audio runtime is modeled as a discriminated union state machine.

### State variants

- `uninitialized`
	- no shared `AudioContext`
	- no active input stream
- `ready`
	- shared `AudioContext` exists
	- device inventory and selected device are known
	- no active analyser/input stream
- `input-ready`
	- shared `AudioContext` exists
	- active microphone stream and `AnalyserNode` exist
- `unavailable`
	- browser runtime capability is missing
- `fault`
	- browser/runtime operation failed asynchronously

This keeps browser hardware truth in one service instead of splitting it across root service plus detector-side adapter.

## Migration target

- Treat audio context + microphone primitives + device state as one browser boundary with explicit contracts.
- Keep detector semantics in `DetectorManager` and detector strategies.
- If the implementation remains split internally, document `AudioInputSource` as browser-audio-owned infrastructure rather than detector-owned semantics.

## Minimal design target

### Canonical state

- discriminated union state with `kind`
- `context`: nullable `AudioContext` reference
- `selectedDeviceId`
- `availableDevices`
- `analyserNode`

### Commands

- `ensureContext()`
- `resume()`
- `getAvailableDevices()`
- `selectDevice(deviceId)`
- `start()` to open microphone input/analyser
- `stop()` to release the active input stream while preserving the shared `AudioContext`

### Notifications

- One coarse invalidation notification (`changed`) when the state machine transitions.
- `ready` when the shared `AudioContext` first becomes available.
- `fault` for asynchronous initialization/resume failures.

### Invariants

- At most one shared `AudioContext` instance is active.
- Consumers do not create independent context instances.
- `ensureContext()` is user-gesture-triggered by `audio-context-overlay`, not by arbitrary components.
- Browser device selection is not detector semantics.
- There is no separate microphone hardware service parallel to browser audio runtime.

### Error handling

- Validation/precondition failures throw synchronously when applicable.
- Browser/runtime failures emit `fault` and preserve a queryable readiness state.


