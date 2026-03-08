## Third Clock

Never take two clocks to sea, always take one or three

A semantic with three independent descriptions is stable, the other two can be used to verify the third

This project has three implementations

- `src/**/*.js` - the reference implementation that the user experiences
- `*.test.ts` - a way to exercise the code in isolation and 
- `doc/**/*.md` - the natural language description of what features are

## Linting

#todo

./tools/semantic-lint 

File by file assert that the three implementations align

Use one agent per file to scan the codebase, tell each agent to summarize what it needed in a file, or perhaps discover an optimal path through it to use a context window

## Migration

Currently the project is not organized like this. We should create the doc structure first with empty files, then go through them in an order. Could structure as a linting pass?

Migration is complete when `main.js` is implemented, all components follow the patterns, and `script.js` is deprecated

### Current refactor scope (small steps)

We are intentionally keeping scope small and iterative.

#### Phase 1: Root component/context (now)

- Implement `src/main.js` as the root component.
- The root component provides shared services through context.
- `script.js` creates domain objects and injects them into the root component.
- Replace ad-hoc document-level context handling with root-provided context.

#### Phase 2: Audio context rewrite (next)

- Refactor audio context manager into an explicit service shape.
- Consume the service via context from components.
- Add the audio overlay component that blocks interaction until audio/mic is ready.

#### Boy scouting intention (ongoing, bounded)

- Prefer events over callbacks/delegates when touching existing code.
- Do not expand scope solely to remove every callback/delegate in one pass.
- Opportunistically normalize service/component communication to event-driven patterns during nearby refactors.