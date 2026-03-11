# Chart Edit Workflow

Chart edit is the process of creating, cloning, and modifying plan definitions.

## Current flow

- `plan-edit-pane` (class `PlanEditPane`, element `<plan-edit-pane>`) drives user edits.
- `ChartService` (`src/features/music/chart-service.js`) owns chart catalog persistence and selection.
- Selected chart is made available via `ChartServiceContext` for downstream consumers.
- Saves emit a `chart-saved` event with `{ chart }` payload.

## Data model

- Segment-based structure: `{ on, off, reps }[]`.
- Metadata: name, description, difficulty, tags, timestamps.

## Known seam

The edit workflow owns plan authoring, while playback consumes a flattened measure projection; the projection contract should be explicitly versioned.

## Minimal design target

### Workflow state

- `editingDraft`
- `selectedChartId`

### Input intents

- `chart-select`
- `chart-save`
- `chart-delete`

### Output effects

- Update chart service/catalog.
- Update selected chart in shared runtime state.
- Emit `chart-saved` (payload: `{ chart }`) on successful save.

### Notifications

- Coarse invalidation notification is sufficient for most edit consumers.
- No fine-grained edit event taxonomy by default.

