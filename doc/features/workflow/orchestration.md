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