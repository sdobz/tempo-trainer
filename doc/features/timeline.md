The timeline is global state.

It maps audio `currentTime` to musical structure (beats, measures, segments).

## Service role

- Timeline is a shared service provided through root context.
- It consumes audio time and owns tempo semantics:
	- BPM
	- beats per measure
	- beat duration
	- measure/beat mapping helpers

## Event role

- Emits `patched` for broad state changes.
- May emit finer events (`bpm-changed`, `meter-changed`) if needed for performance.

## Consumers

- Metronome consumes timeline for beat scheduling.
- Score consumes timeline for intended/actual note mapping.
- Visual components consume timeline events to update DOM.

