# Chart Review Workflow

Chart review is the post-session workflow for inspecting completed runs and derived metrics.

Code name: `plan-history-pane` (class `PlanHistoryPane`, element `<plan-history-pane>`). The code uses "history"; this doc uses "review" as the target term for the workflow concept.

## Current flow

- Sessions are saved via `PracticeSessionManager.saveSession(...)`.
- `plan-history-pane` renders sessions from `PracticeSessionManager.getSessions()`.
- User can retry a plan from history, delete sessions, or navigate back to editing/play.

## Metrics currently derived

- Drift tendency (early/late)
- Missed and partial measures
- Rhythm variability
- Consistency bands
- Completion status

## Known seam

Metric computation and review UI are coupled through shared session shape; schema changes require synchronized updates in manager, pane rendering, and docs.