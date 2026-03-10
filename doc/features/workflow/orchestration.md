# Workflow Orchestration

Workflow orchestration coordinates panes, services, and startup sequencing for the concrete Tempo Trainer app.

## Current owner

- `src/script.js` is the concrete orchestrator.

It currently coordinates:

- root service injection into `main`
- pane navigation and visibility updates
- session start/stop lifecycle wiring
- calibration and preview monitoring setup
- persistence handoff to history

## Responsibilities

- Interpret pane-level intent events (`session-start`, `session-stop`, `navigate`, etc.).
- Route data between runtime domains (detector, playback, timeline visualizer, performance persistence).
- Keep startup ordering safe (component ready, service ready, context ready).

## Non-responsibilities

- Should not own domain rules for timing math, scoring, or detection logic.
- Should not become a second composition root once service graph migration is complete.

## Migration target

- Reduce orchestration to minimal app wiring.
- Push domain behavior behind service interfaces and event contracts.

## Minimal design target

### Canonical state

- `activePane`
- `startupPhase` (`booting | ready | degraded`)

### Inputs (intent events)

- Pane intents only (`navigate`, `session-start`, `session-stop`, onboarding completion).

### Outputs

- Service command invocations (timeline/playback/detector/performance/chart).
- No domain computation in orchestration.

### Notifications

- Optional coarse orchestration invalidation (`changed`) if a top-level shell needs it.
- `fault` for startup/routing coordination failures.

### Invariants

- Orchestration does not become a domain state owner.
- Domain state transitions happen inside owning services.
- Pane transitions are serial and explicit.