## Intent

Tempo Trainer is a browser-native app with explicit service contracts and minimal coupling.
This file summarizes architecture at a high level.
Detailed contracts live in `doc/**`.

## Documentation Topology

- Framework contracts: `doc/framework/*.md`
- Domain/workflow contracts: `doc/features/**/*.md`
- Migration and policy: `DOC.md`

If this file disagrees with `doc/**`, treat `doc/**` as canonical.

## System Shape

### Layers

1. UI components
- Render and user interaction only.
- Discover services via context.

2. Services (domain and infrastructure)
- Canonical state owners.
- Command methods mutate state.
- Notifications tell consumers to re-read canonical state.

3. Orchestration
- Wires relationships between services and panes.
- Owns startup and navigation flow.
- Does not own domain logic.

### Runtime today

- `src/bootstrap.js`: startup entrypoint and DOM boot.
- `src/app-orchestrator.js`: concrete orchestration layer.
- `src/features/main/main.js`: composition root and context bridge.

Wiring split:

- `main.js` owns root context provisioning and root-level inter-service wiring.
- app orchestrator owns inter-pane routing and workflow messaging.

No additional wiring layer is needed by default. Introduce a third layer only if one layer starts owning responsibilities from both categories and cannot be split cleanly.

## Core Architectural Rules

- One canonical owner per state domain.
- Context is for service identity delivery, not state propagation.
- Prefer independent service constructors; wire inter-service relationships in orchestration.
- Start with coarse invalidation notifications; add streams only when concretely required.
- Validation failures throw; async dependency/runtime failures emit `fault`.

## Domain Ownership (Target)

- `audio-context`: shared browser audio runtime readiness/identity.
- `timeline`: transport and musical time mapping.
- `playback`: sound rendering only.
- `detector`: hit detection stream and detector configuration.
- `performance`: scoring/session records and persistence handoff.
- `chart` (code seam: many `plan-*` names): practice structure and measure projection.
- `persistence`: storage mechanics only, no domain semantics.

## Relationship Pattern

1. Composition creates service instances.
2. Orchestration wires cross-service subscriptions and command routing.
3. Root context provides service instances.
4. Components read state on mount, subscribe to service invalidation, and expose UI updates through lifecycle-bound signal effects.

Component reactivity policy:

- Signal-first for new UI logic (`createSignalState` + `createEffect` in `BaseComponent`).
- `onStateChange` remains supported for legacy components during migration only.
- Service contracts remain event/context based; signals are component-local rendering mechanics.
- Prefer direct delegate/update callback to signal-setter binding in constructors when behavior is pass-through.
- Avoid dual state sources in components (no signal-to-`state` mirroring for render paths).
- Keep callback handlers mutation-only and effects render-only.

### Template Reference and Event Binding (data-ref / data-on-*)

DOM element references and event handlers are declared in templates using `data-ref` and `data-on-*` attributes:

**Template:**
```html
<button data-ref="submitBtn" data-on-click="handleSubmitClick">Submit</button>
<input data-ref="nameInput" data-on-change="handleNameChanged" />
```

**Component:**
```javascript
onMount() {
  this.createEffect(() => {
    this.refs.submitBtn.disabled = !this._getIsReady();
  });
}

handleSubmitClick(event, element) {
  this._submit();
}

handleNameChanged(event, element) {
  const name = this.refs.nameInput.value;
  this._setName(name);
}
```

**Benefits:**
- Eliminates repeated querySelector calls and field assignments.
- Automatic event listener cleanup via component lifecycle.
- Validates refs and handlers at init time (fail-fast).
- Checker (tools/check-refs) validates ref uniqueness and handler existence across templates.

References are auto-populated into `this.refs` during `_initialize()` after template attachment. Event handlers are automatically bound and cleaned up via the existing `listen()` method infrastructure.

## Complexity Controls

- Keep service APIs small and intention-oriented.
- Avoid duplicate ownership (derived input is not ownership transfer).
- Avoid event-name proliferation; prefer type-safe payload semantics.
- Keep workflow docs minimal and explicit about non-responsibilities.

## Open Migration Seams

- Plan/chart naming remains partially split between code and docs.
- `SessionState` still exists in runtime as a legacy mirror; timeline is now canonical for tempo/meter and chart is canonical for selection/catalog.
- `Metronome` remains a temporary scheduling shim; playback rendering now belongs to `PlaybackService`.
- Some legacy callback/delegate surfaces remain and are being normalized to contract-first service boundaries.
