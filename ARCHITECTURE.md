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

- `src/script.js`: concrete orchestration layer.
- `src/features/main/main.js`: partial composition root and context bridge.
- Migration target: reduce `script.js` to minimal app wiring as service boundaries harden.

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
4. Components read state on mount, subscribe, and re-render on notifications.

## Complexity Controls

- Keep service APIs small and intention-oriented.
- Avoid duplicate ownership (derived input is not ownership transfer).
- Avoid event-name proliferation; prefer type-safe payload semantics.
- Keep workflow docs minimal and explicit about non-responsibilities.

## Open Migration Seams

- `script.js` still owns substantial wiring and some mixed responsibilities.
- Plan/chart naming remains partially split between code and docs.
- `SessionState` still exists in runtime as a legacy mirror; timeline is now canonical for tempo/meter and chart is canonical for selection/catalog.
- `Metronome` remains a temporary scheduling shim; playback rendering now belongs to `PlaybackService`.
- Some legacy callback/delegate surfaces remain and are being normalized to contract-first service boundaries.
