# Chart Edit Workflow

Chart edit is the process of creating, cloning, and modifying plan definitions.

## Current flow

- `plan-edit-pane` (class `PlanEditPane`, element `<plan-edit-pane>`) drives user edits.
- `PlanLibrary` (`src/features/plan-edit/plan-library.js`) owns persistence for built-in and custom plans.
- Selected/active plan is pushed into `SessionState.setPlan(...)` for playback consumers.

## Data model

- Segment-based structure: `{ on, off, reps }[]`.
- Metadata: name, description, difficulty, tags, timestamps.

## Known seam

The edit workflow owns plan authoring, while playback consumes a flattened measure projection; the projection contract should be explicitly versioned.

