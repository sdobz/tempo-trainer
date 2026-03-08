State is stored in state machines.

- A state machine is a class with a `state` property that is publicly readonly
- Methods can transition this state and produce events
- In low performance cases these events can be as simple as "patched"
- Create a "patch" helper to make this easier
- Optimization may require more fine grained events
