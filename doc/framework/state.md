State is stored in state machines.

- A state machine is a class with a `state` property that is publicly readonly
- Methods can transition this state and produce events

## Context integration

- State machines that are shared across components are provided as services via context.
- Components subscribe once, then react to state-machine events for DOM updates.
- Use context notifications when a service instance is replaced or becomes ready.
