State is stored in state machines.

- A state machine is a class with a `state` property that is publicly readonly
- Methods can transition this state and produce events
- In low performance cases these events can be as simple as "patched"
- Create a "patch" helper to make this easier
- Optimization may require more fine grained events

## Context integration

- State machines that are shared across components are provided as services via context.
- Components subscribe once, then react to state-machine events for DOM updates.
- Use context notifications when a service instance is replaced or becomes ready.
