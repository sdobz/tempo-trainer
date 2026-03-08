Provides an audible signal representing measure and beat.

## Service role

- Metronome is a service (or service-backed runtime) consumed by playback features.
- It consumes timeline semantics (tempo/meter) and audio runtime.

## Event role

- Emits beat/measure events that UI and scoring systems can observe.
- Emits lifecycle events (`started`, `stopped`) for orchestration.

## Context role

- Components should not wire metronome through ad-hoc callbacks.
- Components/services consume metronome through context and subscribe to its events.