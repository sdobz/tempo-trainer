# Chart

Chart is the canonical domain term for practice structure.
Legacy code names (`plan-*`, `PlanLibrary`, `planData`) are aliases and migration debt.

## Current implementation [Phase 1]

- **Canonical owner**: `src/features/music/chart-service.js` (ChartService)
- **Persistent catalog**: Managed by ChartService, which composes PlanLibrary internally
- **Runtime selected chart**: Owned by ChartService.getSelectedChart() (canonical) + SessionState.plan (backward compatibility during Phase 2)
- **Consumers**: Panes receive charts through ChartServiceContext and call service methods

## Owned data

- Chart identity and metadata (`id`, `name`, `description`, `difficulty`, `tags`).
- Segment structure (`on`, `off`, `reps`).
- Derived drill measures used for playback (`projectChart()` output).
- Selected chart state.

## Storage

- ChartService composes PlanLibrary internally; chart catalog is persisted via browser localStorage through StorageManager.
- Chart domain owns schema semantics; persistence layer is encapsulated.

## Service interface

### Public API

```javascript
// Query
getAllCharts() → Chart[]
getCustomCharts() → Chart[]
getChartById(chartId) → Chart | null
getSelectedChart() → Chart | null

// Commands
selectChart(chart) → void   // Emits "chart-selected" event
saveChart(chart) → Chart    // Emits "chart-saved" event
deleteChart(chartId) → void // Emits "chart-deleted" event
cloneChart(sourceId, newName) → Chart

// Projection
projectChart(chart) → { plan: Measure[], segments: Segment[] }
```

### Events

- `chart-selected` { detail: { chart } }
- `chart-saved` { detail: { chart } }
- `chart-deleted` { detail: { chartId } }

### Context

- `ChartServiceContext` — provided by MainComponent, consumed by panes

## Providers and consumers

- **Provider**: `src/features/main/main.js` (MainComponent)
- **Consumers**: 
  - `plan-edit-pane` ← ChartServiceContext (CRUD operations)
  - `plan-play-pane` ← via PlaybackState and SessionState (backward compat)
  - Visualizers ← chart data passed through playback state
- **Internal**: DrillSessionManager and Scorer consume measure arrays, not charts directly

## Compatibility layer

**Phase 0/1 Bridge**: SessionState.plan still mirrors selected chart for backward compatibility.
- set by: plan-edit-pane after chartService.selectChart()
- consumed by: descendants who subscribe to SessionState
- **Removal**: Phase 2 when timeline becomes tempo owner; Phase 4 when SessionState is eliminated

## Invariants

- Selected chart is always either null or present in catalog.
- Projection output is deterministic for a given chart definition.
- ChartService is the sole canonical owner of selected chart state.

## Error handling

- Chart ID validation fails synchronously with exceptions.
- Save/delete failures are logged; state remains consistent.
- Future: async failures may emit fault events (undefined in Phase 1).