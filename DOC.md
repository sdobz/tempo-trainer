## Third Clock

Never take two clocks to sea, always take one or three

A semantic with three independent descriptions is stable, the other two can be used to verify the third

This project has three implementations

- `src/**/*.js` - the reference implementation that the user experiences
- `*.test.ts` - a way to exercise the code in isolation and 
- `doc/**/*.md` - the natural language description of what features are

## Linting

#todo

./tools/semantic-lint 

File by file assert that the three implementations align

Use one agent per file to scan the codebase, tell each agent to summarize what it needed in a file, or perhaps discover an optimal path through it to use a context window

## Migration

We are migrating toward a DI-style service graph where:

- `main.js` instantiates core services
- root context provides those services
- components consume services through context
- services publish state changes through events
- `script.js` is reduced to startup/nav glue and eventually deprecated

### Target service graph

1. `audio-context` service
	- Provides current time, mic/analyser access, FFT-related nodes
	- Emits readiness and error events
2. `timeline` service
	- Consumes audio time
	- Owns BPM, beats-per-measure, beat duration, and time-division mapping
3. `metronome` service
	- Consumes timeline + audio
	- Emits audible beat/measure events
4. `score` service
	- Consumes timeline
	- Represents intended notes and scored performance
5. `detector` service
	- Consumes audio
	- Emits hit/level/device events

### Event/context contract

- Context is for discovery and subscription to service instances.
- Events are for runtime state propagation.
- Services follow state-machine conventions from `doc/features/state.md`.
- Prefer one coarse `patched` event plus optional fine-grained events where needed.

### Phased migration

