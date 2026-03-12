# Performance

Performance is the observed user output during and after a run.

## Current implementation [Phase 1]

**Canonical owner**: `src/features/music/performance-service.js` (PerformanceService)

PerformanceService composes two internal subsystems:

- **Scorer** (`src/features/plan-play/scorer.js`)
  - Session-time hit registration and measure scoring
  - Maintains `measureHits` array and computes overall score per measure
  - Math-only; no state mutations outside of hit registration
  
- **Session manager** (`src/features/plan-history/practice-session-manager.js`)
  - Persists completed sessions to localStorage
  - Derives metrics (drift, missed, rhythm variance, consistency, completion)
  - Internal dependency; not exposed in public API

## Service interface

### Public API

```javascript
// Configuration
configure(beatsPerMeasure, beatDuration) → void
setDrillPlan(measures) → void

// Live hit recording
registerHit(beatPosition) → void           // Emits "hit" event
finalizeMeasure(measureIndex) → void       // Emits "measure-finalized" event
reset() → void                              // Clear for new session

// Score retrieval (immutable during session)
getScores() → number[]                      // All measure scores 0-99
getScore(measureIndex) → number            // Single measure score
getOverallScore() → number                 // Average non-click-in score (0-99)

// Session persistence
recordSession(sessionData) → void           // Save + derive metrics, emit "session-ended"

// History queries
getSessions() → Session[]                   // All saved sessions (newest first)
getSessionsForChart(chartId) → Session[]   // Sessions for specific chart
getSession(sessionId) → Session | null     // Single session

// Cleanup
deleteSession(sessionId) → void
clearAllSessions() → void
getOverallStats() → Object                 // Aggregate statistics
```

### Events

- `hit` { detail: { beatPosition: number } } — hit registered during live playback
- `measure-finalized` { detail: { measureIndex: number, score: number } } — measure completed and scored
- `session-ended` { detail: { sessionData: Session } } — session persisted and metrics derived

### Context

- `PerformanceServiceContext` — provided by MainComponent, consumed by panes and managers

## Data flow

1. **During playback**:
   - DetectorManager emits hit times
   - SessionManager calls `performanceService.registerHit(time)`
   - SessionManager calls `performanceService.finalizeMeasure(index)` at measure boundary
   - Scores update playback state for UI

2. **On session complete**:
   - SessionManager calls `performanceService.recordSession(sessionData)`
   - PerformanceService derives metrics via internal TrainingManager
   - Event emitted; history pane receives update

3. **On history view**:
   - PlanHistoryPane calls `performanceService.getSessions()`
   - Displays records with derived metrics

## Input dependencies

- Detector hit timings (from DetectorManager through SessionManager)
- Session timing config: BPM and beats-per-measure (from SessionState; Phase 2→timeline-service)
- Chart measures/plan structure (passed to `setDrillPlan()`)

## Storage

- Session persistence is internal to PerformanceService
- Transport: browser localStorage via StorageManager (limited to ~100 sessions)
- Performance domain owns session record schema and metric derivation

## Compatibility layer

**Phase 0/1 Bridge**: SessionManager still takes direct scorer instance.
- set by: script.js passes scorer to SessionManager constructor
- consumed by: SessionManager for timing-critical hit registration
- **Removal target**: Phase 2+ when SessionManager migrated to call performanceService API directly

## Invariants

- Scoring state within a run is append-only until reset
- Completed sessions are immutable once persisted
- Overall score is computed as mean of non-click-in measure scores

## Error handling

- Configuration validation throws synchronously
- Persistence failures log and leave in-memory state queryable
- Future: async failures may emit fault events (reserved for Phase 2+)