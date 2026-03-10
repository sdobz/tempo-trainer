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

This boundary is also what makes components context-agnostic: a chart editor that consumes `SessionStateContext` for plan access doesn't know whether a root service or a pane-scoped service provides it. Both use the same token and the same interface. Only the provider changes.

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

## Required contract sections

Every service doc must include these sections before implementation starts:

- Command contract: command names and intent-level behavior.
- Event contract: required events, emit triggers, and ordering expectations.
- Invariants: conditions that must be true after every command.
- Error handling: validation/dependency/runtime failures and resulting state.

Without these four sections, the service spec is considered incomplete.

## Event contract baseline

Event design starts from consumer intent, not from a fixed list of event names.

Design process:

1. List consumer decisions, not UI updates.
	- Example: "show paused badge", "recompute beat grid", "react to each hit".
2. For each decision, ask whether polling canonical state on a coarse notification is enough.
	- If yes, keep coarse.
	- If no (high-frequency stream or strict edge semantics), add a domain event.
3. Prefer one discriminated event shape over many synonymous event names.
	- Example: one lifecycle event with `state` enum payload instead of separate `started/paused/stopped` events.
4. Stop adding events when each event maps to a distinct consumer decision.
	- If two events are always handled together, merge them.

Minimum baseline for stateful services:

- One coarse "state may have changed" notification (`patched` or equivalent).
- Optional domain events only where coarse notifications are insufficient.

The type system should enforce event semantics through discriminated payloads, not through proliferation of event names.

## Event ordering rule

For a single command execution:

1. Update internal state.
2. Emit domain edge event(s) for that transition (if any).
3. Emit `patched`.

If command validation fails, throw synchronously and do not emit domain events or `patched`.

Asynchronous dependency/runtime failures should emit `fault` with domain code/context.

## Consumer bootstrap protocol

Events are notifications to read canonical state. Consumers should follow this sequence:

1. Acquire service instance (usually via context callback in `onMount()`).
2. Read canonical snapshot immediately and render from it.
3. Subscribe to service notifications/events.
4. On each notification, re-read canonical snapshot (or apply stream payload for high-frequency paths).

This provides a deterministic initial render and keeps event handlers simple.

## Bootstrap caveats

- Lost-update window: if state can change between initial read and subscription, service API should offer an atomic `subscribeAndReplay`/`subscribeImmediate` style path, or guarantee same-tick ordering.
- Duplicate work: coarse notifications can trigger full recompute. Accept this by default; optimize only on measured hotspots.
- Late subscribers: if consumers need the latest edge event, encode that in canonical state so initial read is sufficient.

## Example: Hit Lifecycle (Mic -> UI -> Storage)

This example shows one end-to-end flow and how relationships are managed without duplicating ownership.

### Ownership map

- `audio-context` owns browser audio runtime readiness and shared `AudioContext` identity.
- `detector` owns hit detection and emits hit timing stream.
- `timeline` owns tempo/meter/transport and time-division mapping.
- `performance` owns scoring/session records and persistence handoff.
- Components own rendering only.
- Orchestration owns wiring only.

### Startup and wiring

1. Composition root creates service instances with independent constructors.
	- Preferred default: services do not hold direct references to other services.
	- Cross-service interaction is wired at composition/orchestration level through subscriptions and command calls.
	- Exception: infrastructure wrappers (for example browser APIs) can be injected as narrow ports/adapters.
2. Composition root wires cross-service subscriptions.
	- detector `hit` -> performance `registerHit(...)`
	- timeline coarse change -> detector `setBpm(...)` (derived input, not ownership transfer)
3. Root provides service instances via context tokens.
	- Components discover services through context.

### Runtime flow for one hit

1. User enables microphone.
	- `audio-context-overlay` component calls `audioContext.ensureContext()`.
	- audio-context transitions to ready and emits coarse invalidation.
2. Detector starts.
	- Orchestration (or owning workflow service) calls detector `start()`.
3. Physical hit occurs.
	- detector emits `hit` stream event with hit timing.
4. Fan-out by wiring layer.
	- performance receives hit and updates canonical run state (`registerHit(...)`).
	- Optional visualization adapter receives hit and updates transient UI overlays.
5. UI refresh.
	- Components subscribed to performance read canonical state and re-render score/status.
6. Session completion.
	- workflow/orchestration calls performance `completeRun(...)`.
	- performance persists session through persistence service.

### Relationship rules demonstrated

- detector does not persist sessions.
- performance does not detect hits; it consumes detector output.
- timeline remains canonical for tempo/meter even if detector accepts derived `setBpm(...)` input.
- components do not subscribe to each other; they subscribe to services.
- context delivers service identity; events/streams carry runtime change notifications.

## When to introduce a service

Promote to a service when:
- A second component needs the same state.
- The state must survive a component unmounting and remounting.
- Logic operates on the state without a DOM (scoring, calibration, analytics).

Keep it local when only one component uses the value.
