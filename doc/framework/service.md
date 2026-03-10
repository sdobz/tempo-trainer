A service is available via context request and provides inter-component state

Services can be
- `Component` public state
- Shared API access like `audio-context`
- Global state
- Shared semantics like `timeline`

Services are also sometimes state machines or components

## DI style contract

- `main.js` constructs service instances once.
- Root context provides service instances by token.
- Components consume services through context in `onMount()`.

## Runtime propagation

- Services publish changes via events.
- Components react to those events and update DOM.
- Context notifications are used when the provided instance or readiness changes.

## Recommended service shape

- Stateful class (often `EventTarget`) with readonly/public state snapshot.
- Command methods (`start`, `stop`, `setBpm`, etc).
- Event surface:
	- `ready`
	- optional feature-specific events (`hit`, `beat`, `devices-changed`, ...)
