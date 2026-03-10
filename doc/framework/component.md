A component is how the DOM is manipulated

## Naming

Component files follow feature naming: `*-pane.js`, `*-control.js`, `*-overlay.js`, `*-visualization.js`.
No files use the `*.component.js` pattern.

Component classes use PascalCase matching the file: `PlanPlayPane`, `PlanEditPane`, `MicrophoneControl`, `AudioContextOverlay`, `TimelineVisualization`.

The shared base class is `BaseComponent` at `src/features/component/base-component.js`.

## Lifecycle

1. When imported in `main.js` the web component is registered
2. onMount looks up dom elements and creates event callbacks
3. The component recieves events if it is mounted, and runs methods that update the dom, and accesses services
4. onUnmount fires, cleanup is run, and references are removed

## Context

Context forms the relationships between components and services.

- Components consume services in `onMount()`.
- A context callback means "service instance updated" — not "service state changed".
- When the callback fires: unsubscribe from the previous service's events, store the new reference, subscribe to its events. This prevents double-subscribe accumulation when an instance is replaced.
- Components should subscribe to service events and update DOM from those events.

## Root context

- The root context catches all unhandled context requests.
- It is the primary way that components get access to global services
- Root context is owned by `main.js` and provides service instances.
- When a service identity/readiness changes, root calls `notifyContext(...)`.

## State

Components can be state machines if they follow the conventions of `state.md`

- Prefer closure-based handlers and `listen(...)` cleanup over retaining extra mutable references.

## DOM

Components have a typed `dom` property which is initialized to `{}`. This is the ONLY way they can access elements.

Elements are almost always typed to be `SomeTimeOfElement` so that we don't consider if they are undefined

It contains either direct references to elements, or functions that perform query selectors

`onMount` populates it, and `onUnmount` erases it. This means that any attempt to access the DOM fails if code runs while unmounted
