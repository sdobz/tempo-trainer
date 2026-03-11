# Playback

Playback is implemented by `src/features/music/playback-service.js`.
It is orchestration-driven and rendering-only.

## Current implementation [Phase 3]

- `PlaybackService` is the canonical rendering owner.
- Public interface:
	- `renderClick(atTime, accentProfile)`
	- `renderCue(cue, atTime)`
	- `setClickProfile(profile)`
- `DrillSessionManager` chooses click accents/frequencies and calls `playbackService.renderClick(...)`.
- Calibration flow in `script.js` also uses the same `PlaybackService` instance.
- `Metronome` remains as a temporary scheduler shim and forwards legacy `scheduleClick(...)` calls to `PlaybackService`.

## Responsibilities today

- Sound rendering only.
- Shared rendering path for drill clicks and calibration clicks.
- Click profile configuration.

Target boundary clarification:

- Timeline owns transport and timing (`play/pause/stop`, beat scheduling decisions, tempo/meter interpretation).
- Playback owns sound rendering only (when asked to emit a click/tone at a given time/profile).

## Observable playback state

`PlaybackState` (`src/features/plan-play/playback-state.js`) is the consumer-facing observable for the active session.

It holds:
- `scores` — per-measure score array
- `highlight` — currently active measure index
- `overallScore` — session aggregate
- `status` — display string
- `beat` — `{ beatNum, isDownbeat, shouldShow }` or `null`
- `isPlaying` — boolean

**[Phase 0] Consumer bootstrap pattern:**
- Call `getSnapshot()` to read current state without subscribing (deterministic initial render).
- Call `subscribe(fn)` to listen for updates; fn is called immediately and on every change.
- Call `update(patch)` to modify state (internal use only).

`PlaybackContext` is the context token (exported from the same file). It is provided by `plan-play-pane` (scoped, not root) and consumed by `plan-visualizer` and `timeline-visualization`.

## Known seam

**[Phase 3 compat]:**
- `Metronome` still schedules beats and invokes callbacks; this shim remains for compatibility.
- Shim removal trigger: timeline/orchestration owns scheduling loop directly.
- Shim deadline: no later than Phase 6.
- `PlaybackState` uses custom subscriber (compatible design, no EventTarget needed for UI state).

## Migration target

- Keep playback as an infrastructure service that renders sound on request.
- Move transport/timing ownership to timeline.
- Keep `PlaybackState` as UI-facing projection state; do not treat it as transport authority.

## Minimal design target

### Canonical state

- `ready`: audio output available for rendering
- `clickProfile`: rendering parameters for future clicks/cues

### Commands

- `renderClick(atTime, accentProfile)`
- `renderCue(cue, atTime)`
- `setClickProfile(profile)`

Playback does not own tempo, meter, transport state, or beat progression.

### Notifications

- Coarse invalidation notification only for configuration changes (`changed`/`patched`).
- No transport lifecycle notifications.
- `fault` for asynchronous dependency/runtime failures.

### Invariants

- Playback never becomes source-of-truth for transport lifecycle.
- Render commands never mutate timeline state.
- Scheduled click times are not in the past relative to playback clock.

### Error handling

- Validation failures throw synchronously and leave state unchanged.
- Dependency/runtime failures emit `fault`.

