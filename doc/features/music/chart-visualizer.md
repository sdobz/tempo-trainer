# Chart Visualizer

Chart visualization is responsible for rendering plan/chart structure for user comprehension.

## Current implementation

- `src/features/visualizers/plan-visualizer.js` renders plan segments and structure.
- `src/features/visualizers/timeline-visualization.js` renders measure-by-measure timeline during play/calibration.

## Data contract

- Expects normalized runtime measures (`{ type: string }[]`) for timeline rendering.
- Expects segment-based plan definition for plan overview rendering.

## Non-responsibilities

- Does not own scoring logic.
- Does not own detector configuration.
- Does not own session persistence.

