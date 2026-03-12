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

Microphone capture also depends on this boundary, but microphone capture is not a separate root service. It is an internal browser adapter used by the detector domain.

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

Lifecycle is split into one public service and one internal adapter:

- Public root service: `src/features/audio/audio-context-manager.js`
	- `ensureContext()` lazily creates the shared context on first use.
	- If the context is `suspended`, it resumes it to satisfy browser user-gesture/audio policies.
	- `getContext()` returns the current instance (or `null` if not created yet).
	- Emits a `ready` event when context creation succeeds.

- Internal browser-audio adapter currently implemented at: `src/features/microphone/audio-input-source.js`
	- receives the shared `AudioContext`
	- acquires `getUserMedia` stream
	- creates `MediaStreamSource` + `AnalyserNode`
	- manages microphone device selection persistence

`AudioInputSource` should be treated as browser-facing plumbing, even though it currently lives under the microphone/detector implementation tree.

The detector domain should ideally see only a ready input/analyser source, not own browser device concerns as part of its semantic contract.

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
- Microphone input and detector runtime: `src/features/microphone/audio-input-source.js` and `src/features/microphone/detector-manager.js`
	- Browser audio plumbing creates and updates the input/analyser source.
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

## Known seam

- The public browser audio service is narrower than the conceptual browser boundary: device state and input-stream setup are currently implemented below detector code rather than exposed as browser-audio-owned behavior.
- Current runtime API therefore leaks one browser concern (`selectDevice`) through `DetectorManager` even though the domain owner should be browser audio runtime.

## Migration target

- Treat audio context + microphone primitives + device state as one browser boundary with explicit contracts.
- Keep detector semantics in `DetectorManager` and detector strategies.
- If the implementation remains split internally, document `AudioInputSource` as browser-audio-owned infrastructure rather than detector-owned semantics.

## Minimal design target

### Canonical state

- `contextState`: `uninitialized | ready | suspended | unavailable`
- `context`: nullable `AudioContext` reference
- `selectedDeviceId`
- `availableDevices`

### Commands

- `ensureContext()`
- `resume()`
- `getAvailableDevices()`
- `selectDevice(deviceId)`
- `openInputStream()` or equivalent browser-input acquisition command

Microphone stream acquisition is currently exposed through detector runtime, not through the root audio service surface. That is an implementation seam, not the ideal boundary.

### Notifications

- One coarse invalidation notification (`changed`/`patched`) when readiness state changes.
- Optional `devices-changed` notification when device inventory or selected device changes.
- `fault` for asynchronous initialization/resume failures.

### Invariants

- At most one shared `AudioContext` instance is active.
- Consumers do not create independent context instances.
- `ensureContext()` is user-gesture-triggered by `audio-context-overlay`, not by arbitrary components.
- Browser device selection is not detector semantics.
- `AudioInputSource` is not a peer root service; it is browser-facing plumbing.

### Error handling

- Validation/precondition failures throw synchronously when applicable.
- Browser/runtime failures emit `fault` and preserve a queryable readiness state.


