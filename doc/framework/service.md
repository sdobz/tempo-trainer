# Service

A service is a named domain with a single canonical owner in the context tree.

## What a service is

A service:
- Holds state for a domain that multiple components share.
- Exposes named commands (methods) to change that state.
- Emits events when state changes.
- Has exactly one active provider at a given scope.

A service is **not**:
- A component (services have no DOM or lifecycle tied to visibility).
- A utility module (stateless helpers don't need context delivery).
- A global event bus (services own specific domains, not arbitrary message routing).

## Two levels of scope

**Root services** are provided by `main.js` and available to the entire component tree. These own cross-cutting domains: audio context, timeline, chart, performance data.

**Scoped services** are provided by a pane for its subtree. These own session-specific state that is only relevant while the pane is active. When the pane unmounts, the service and all subscriptions in its subtree are torn down together.

## The context boundary

Context is the mechanism for delivering a service to its consumers. It is not a state propagation channel.

**Context carries identity, not state.** The context callback fires when the service instance changes — for example, when initialization completes and the service becomes ready, or when a scoped service is replaced by a new instance.

State changes propagate through service events, not through context. If a context callback fires repeatedly during normal operation, the code is using context as a state channel — use events instead.

This boundary is also what makes components context-agnostic: a chart editor that consumes `ChartContext` doesn't know whether a root service or a pane-scoped service provides it. Both use the same token and the same interface. Only the provider changes.

## Consumer contract

Consume in `onMount()`. The callback fires immediately with the current service, and again when the service instance is replaced.

When the callback fires, update service subscriptions:
1. Unsubscribe from the previous service instance's events (if any).
2. Store the new service reference.
3. Subscribe to its events.

This prevents double-subscribe bugs when a service instance is replaced.

Unsubscribe from all service events in `onUnmount()`.

## Anti-patterns

**Component providing itself as context.** This merges UI lifetime with service lifetime. If the component unmounts, every descendant consumer silently loses the service with no notification. Services should outlive the components that render them.

**Two providers for the same token in the same subtree.** The lower provider intercepts the request first (events bubble up the DOM). The effective provider depends on DOM position — invisible from code inspection.

**Shadowing a root service inside a subtree.** Re-providing a root context token deeper in the tree is only valid when a scoped variant is intentionally replacing the root. Document the reason explicitly or it reads as a bug.

## Recommended service shape

Stateful class. Context is used only for delivery; the service itself takes its dependencies as constructor arguments.

- Public state snapshot.
- Command methods (`start`, `stop`, `setBpm`, etc.).
- `ready` event (if async initialization is required).
- Domain events (`beat`, `hit`, `devices-changed`, etc.) — add only when there is a demonstrated consumer.

## When to introduce a service

Promote to a service when:
- A second component needs the same state.
- The state must survive a component unmounting and remounting.
- Logic operates on the state without a DOM (scoring, calibration, analytics).

Keep it local when only one component uses the value.
