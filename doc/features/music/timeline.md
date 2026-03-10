The timeline is global state.

It maps audio `currentTime` to musical structure (beats, measures, segments).

## Service role

- Timeline is a shared service provided through root context.
- It consumes audio time and owns tempo semantics:
	- BPM
	- beats per measure
	- beat duration
	- measure/beat mapping helpers

## Consumers

- Metronome consumes timeline for beat scheduling.
- Chart consumes timeline for intended/actual note mapping.
- Visual components consume timeline events to update DOM.

## Persistence

The timeline is generally "always running" even if invisible.
