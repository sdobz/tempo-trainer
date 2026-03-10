# Pane

A pane is a tightly scoped UI container with a clear lifecycle and navigation boundary.

## Purpose

- Encapsulate one workflow step or view state.
- Own DOM behavior for that step.
- Delegate cross-pane coordination to orchestration, not peer panes.

## Lifecycle

1. Mounted and DOM bindings created.
2. Receives input via context/events/props.
3. Emits intent events (`navigate`, domain actions).
4. Unmounted and all listeners cleaned up.

## Rules

- A pane does not directly orchestrate other panes.
- A pane does not own global services.
- Navigation policy is external (router/orchestrator).

## In this codebase

- Concrete pane orchestration lives in `doc/features/workflow/orchestration.md`.
