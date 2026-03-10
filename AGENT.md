# AGENT Guide

This file is a compact operating guide for contributors and coding agents.
Detailed contracts live in `doc/**`.

## Source Of Truth

When guidance conflicts, use this precedence order:

1. `doc/framework/*.md`
2. `doc/features/**/*.md`
3. `DOC.md`
4. `AGENT.md` and `ARCHITECTURE.md`

`AGENT.md` and `ARCHITECTURE.md` summarize; they do not define low-level contracts.

## Working Model

- One canonical owner per state domain.
- Context carries service identity, not runtime state.
- Services emit notifications; consumers re-read canonical state.
- Start coarse (`changed`/`patched`), add stream events only with concrete need.
- Validation failures throw synchronously; async dependency/runtime failures emit `fault`.

## Composition And Wiring

- Composition root creates service instances.
- Preferred default: services use independent constructors.
- Cross-service relationships are wired at orchestration/composition level.
- Components discover services through context and render only.
- Components do not subscribe to each other directly.

## Current Migration Reality

- `src/script.js` is still the concrete orchestrator.
- `src/features/main/main.js` is a partial composition root/context bridge.
- Continue moving domain behavior into service contracts documented in `doc/features/**`.

## Naming Notes

- Code still uses `plan-*` in many places.
- Docs use `chart` as the target domain term in several files.
- Treat this as an active migration seam; do not create new mixed terminology.

## Agent Checklist (Per Change)

1. Read the relevant `doc/framework/*` and `doc/features/*` contracts first.
2. Keep changes within one ownership boundary when possible.
3. Prefer the smallest API/event surface that satisfies the use case.
4. Update docs and code together when contracts change.
5. Verify no new hidden coupling was introduced.

## When Unsure

If a task is ambiguous, resolve these questions before broad edits:

- Which service canonically owns this state?
- Is this a command, a notification, or a stream?
- Can this stay coarse, or is a fine-grained stream proven necessary?
- Should this be wired in orchestration instead of direct service coupling?
