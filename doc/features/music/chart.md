# Chart

The chart is the intended practice structure. In current code this domain is mostly called `plan`.

## Current implementation

- Persistent plan catalog is managed by `src/features/plan-edit/plan-library.js`.
- Runtime selected plan is held in `SessionState.plan` (`src/features/base/session-state.js`).
- Timeline and scorer consume a flattened measure array (`planData.plan`) at playback time.

## Owned data

- Plan identity and metadata (`id`, `name`, `description`, `difficulty`, `tags`).
- Segment structure (`on`, `off`, `reps`).
- Derived drill measures used for playback.

## Storage

- Chart catalog persistence is owned by `PlanLibrary` and stored via browser persistence (`StorageManager`).
- Chart domain owns plan schema semantics; persistence only provides storage mechanics.

## Providers and consumers

- `plan-edit-pane` creates/edits/selects plans.
- `plan-play-pane` and visualizers consume selected plan via `SessionState`.
- `DrillSessionManager` and `Scorer` consume runtime drill measures.
- `PracticeSessionManager` stores the plan snapshot with each session record.

## Known seam

"Chart" and "plan" are the same semantic object but use mixed naming across code and docs.

## Migration target

Move to one owner and one term (`chart` or `plan`) across storage, runtime state, and docs.

## Minimal design target

### Canonical state

- `selectedChartId`
- `selectedChart`
- `chartCatalogRevision` (increments when catalog content changes)

### Commands

- `selectChart(id)`
- `saveChart(chart)`
- `deleteChart(id)`
- `projectToMeasures(id | chart)`

### Notifications

- One coarse invalidation notification (`changed`/`patched`) for selection/catalog changes.
- No dedicated fine-grained events by default.
- `fault` for asynchronous persistence failures.

### Invariants

- Selected chart is always either null or present in catalog.
- Projection output is deterministic for a given chart definition.

### Error handling

- Validation failures throw synchronously.
- Persistence failures emit `fault` and leave in-memory state consistent.