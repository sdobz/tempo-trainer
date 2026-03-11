# Detector

The detector identifies when an instrument plays a note and provides calibration-facing timing observations.

## Current state (with Phase 0 contract hardening)

Two detectors are available:
- **Threshold**: When audio volume exceeds a note threshold.
- **Adaptive**: Complex algorithm to detect notes.

Detector behavior is exposed through `DetectorManager` which bridges detector internals and UI.

### [Phase 0] Event contract (NEW)

DetectorManager now emits EventTarget events for state changes and hits:

- **`hit` event**: Required stream of hit timings.
  - Fired on `onHitFromDetector(hitAudioTime)`.
  - Detail: `{ time: number }` (AudioContext.currentTime).
  - Used by calibration and scoring.

- **`changed` event**: Coarse state invalidation.
  - Fired on sensitivity changes, device selection, detector type changes.
  - Detail: `{ field: string, value: unknown }` (e.g., `{ field: "sensitivity", value: 0.7 }`).

- **`fault` event**: Async/dependency failures (runtime, not validation).
  - Emitted for detector startup/stream failures.
  - Detail: `{ code: string, error: Error }`.

### [Phase 0] Legacy callback/delegate interface (COMPAT SHIM)

Old interfaces remain for backward compatibility (remove in Phase 4):

- `setDelegate(obj)` — registers UI delegate for visual feedback (deprecated).
  - Delegate receives: `onHit()`, `onLevelChanged(level)`, `onPeakChanged(peak)`, etc.
  - Will be removed once consumers migrate to event listeners.

- `addHitListener(fn)` — registers timing callback (deprecated).
  - Returns unsubscribe function.
  - Fires alongside `hit` events until removal in Phase 4.

## Runtime owner

`src/features/microphone/detector-manager.js` is the current owner for detector lifecycle.

It owns:

- detector instance creation/switching
- sensitivity and parameter persistence
- microphone device selection
- **[Phase 0] hit event stream via EventTarget** (was: hit listener registration)
- **[Phase 0] state change notifications via EventTarget** (was: delegate forwarding)
- BPM propagation for adaptive refractory behavior
- detector-facing calibration timing inputs (observed hit times)

## Service role

- Detector service consumes audio service output (mic stream, analyser/FFT).
- It owns active detector configuration and runtime detection state.
- It is the source of observed hit timestamps used by calibration and scoring.

## Current signal surface

**[Phase 0] New EventTarget interface:**
- `addEventListener("hit", handler)` — hit stream (required).
- `addEventListener("changed", handler)` — state changes (coarse).
- `addEventListener("fault", handler)` — failures.
- `removeEventListener("hit" | "changed" | "fault", handler)`.

**Legacy delegate/callback interface (COMPAT SHIM, target=Phase 4):**
- `setDelegate(obj)` — registers UI delegate.
- `addHitListener(fn)` — registers timing callback; returns unsubscribe.

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