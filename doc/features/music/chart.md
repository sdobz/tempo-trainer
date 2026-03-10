# Chart

Chart is the canonical domain term for practice structure.
Legacy code names (`plan-*`, `PlanLibrary`, `planData`) are aliases and migration debt.

## Current implementation

- Persistent chart catalog is currently managed by `src/features/plan-edit/plan-library.js` (legacy name).
- Runtime selected chart is currently mirrored through `SessionState.plan` (`src/features/base/session-state.js`) as migration debt.
- Timeline and scorer consume a flattened measure array (`planData.plan`) at playback time (legacy field name).

## Owned data

- Chart identity and metadata (`id`, `name`, `description`, `difficulty`, `tags`).
- Segment structure (`on`, `off`, `reps`).
- Derived drill measures used for playback.

## Storage

- Chart catalog persistence is currently implemented by `PlanLibrary` and stored via browser persistence (`StorageManager`).
- Chart domain owns chart schema semantics; persistence only provides storage mechanics.

## Providers and consumers

- `plan-edit-pane` (legacy name) creates/edits/selects charts.
- `plan-play-pane` and visualizers consume selected chart through legacy session wiring.
- `DrillSessionManager` and `Scorer` consume runtime drill measures.
- `PracticeSessionManager` stores the chart snapshot with each session record.

## Known seam

Legacy naming and ownership mirrors still exist in code (`plan-*`, `SessionState.plan`).

## Migration target

Use one term (`chart`) and one owner (chart service) across docs and runtime.

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
- No non-chart service owns selected chart as canonical state.

### Error handling

- Validation failures throw synchronously.
- Persistence failures emit `fault` and leave in-memory state consistent.