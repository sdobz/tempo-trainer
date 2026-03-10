The chart represents an intended sequence of notes

## Current state

It is named `plan`

## Service role

- Score consumes timeline semantics to place notes in beat/measure space.
- Score receives detector performance events and records outcomes.
- Score exposes aggregate/measure-level results as shared state.

## Performance

The performance is the resulting data from a detector reading 

## Event role

- Emits `patched` when score state changes.
- May emit finer events (`note-registered`, `measure-finalized`, `session-complete`) for focused UI updates.

## Context role

- Score service is provided by root context and consumed by components that visualize performance.

## Provider

The chart is provided in several contexts
- Editing a chart
- Performing a chart
- Reviewing a chart in history