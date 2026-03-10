# State

## The core idea

State is the single source of truth for a domain.
The DOM is one subscriber to state — not the owner of it.

This means:
- To understand what the app is doing, read state. Not the DOM.
- To change behavior, change state. Not the DOM directly.
- To reason about the app (as a human or an LLM), the state objects are the complete picture.

This is the same principle React popularised: UI is a pure function of state. This system applies the same discipline without a framework — state machines are the model, components are the render function.

## Why not just use the DOM?

The DOM is excellent at representing the current visual state of one component.
It breaks down when:
- Two components need to agree on the same value.
- State needs to survive a component unmounting and remounting.
- Logic needs to act on state without touching the DOM (scoring, calibration, analytics).
- An LLM agent needs to understand "what is true right now" without parsing markup.

Upstream state solves all of these at the cost of one discipline: the DOM must always be derived from state, never the reverse.

## How state changes

A state machine exposes named transition methods.
Each method accepts a payload, validates or transforms it, advances the internal state, and emits an event.

Nobody reaches inside and mutates state directly.
The state machine decides what the next state is. Callers only express intent.

## How consumers react

Consumers subscribe once (on mount) and receive a notification when state changes.
The notification carries the new state — or old and new — and the consumer re-derives its view.

The consumer is responsible for diffing: "what changed between old and new, and which DOM mutations follow?"
This is deliberate. The state machine should not know which consumers exist or what they render.

## Granularity

A coarse `patched` event (carries full new state) is the default.
Fine-grained events (`beat`, `hit`, `measure-finalized`) are added only when a specific consumer has a demonstrated performance or correctness need.

Do not emit fine-grained events speculatively. Start coarse.

## Context integration

State machines shared across components are provided as services via context.
Context notifications signal that a service instance was replaced or became ready — not that state changed.
State changes propagate through events, not through context.

## Boundaries between service state and component-local state

If only one component cares about a value, keep it local to that component.
Promote to a service state machine only when a second consumer appears, or when the value must outlive the component.
