# Detector

The detector identifies when an instrument plays a note and provides calibration-facing timing observations.

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
- detector-facing calibration timing inputs (observed hit times)

## Service role

- Detector service consumes audio service output (mic stream, analyser/FFT).
- It owns active detector configuration and runtime detection state.
- It is the source of observed hit timestamps used by calibration and scoring.

## Current signal surface

`DetectorManager` is not yet an `EventTarget`. It uses two parallel interfaces:

- `addHitListener(fn)` — registers a timing callback that receives `hitAudioTime` (an `AudioContext.currentTime` float). Returns an unsubscribe function. Used by calibration and scoring.
- `setDelegate(obj)` — registers a UI delegate for visual feedback. The delegate receives: `onHit()`, `onLevelChanged(level)`, `onPeakChanged(peak)`, `onThresholdChanged(pos)`, `onDevicesChanged(devs, activeId)`.

Calibration consumes detector hit timing; calibration does not own hit detection.

## Minimal design target

### Canonical state

- `activeDetectorType`
- `params`
- `selectedDeviceId`
- `running`

### Commands

- `setActiveDetector(config)`
- `setSensitivity(value)`
- `setBpm(value)`
- `selectDevice(deviceId)`
- `start()` / `stop()`

### Notifications

- One coarse invalidation notification (`changed`/`patched`) for configuration/runtime state changes.
- One required stream notification: `hit` (timing stream needed by calibration/scoring).
- Optional debug/preview streams (`level`, `devices-changed`) only while there is a concrete consumer.
- `fault` for asynchronous dependency/runtime failures.

### Invariants

- Detector configuration is always normalized before activation.
- Exactly one active detector strategy exists while running.
- Hit timing source is canonical for downstream scoring/calibration.

### Error handling

- Validation failures throw synchronously.
- Runtime/dependency failures emit `fault` and keep detector in safe stopped/degraded mode.

## Context role

- Provided as a root context service.
- Components consume detector service and update DOM from events.
- Prefer event-driven subscriptions over delegates/callback references.

In current implementation, the manager is context-provided by `main`, but instance construction still happens in `script.js`.

## Calibration

Calibration in this project is detector-adjacent timing alignment:

- observed side: detector hit timestamps
- expected side: scheduled reference beats
- output: offset used to translate observed hits into musical time

Current implementation still orchestrates calibration flow in `src/script.js`, but the detector domain owns the observed timing stream that calibration depends on.