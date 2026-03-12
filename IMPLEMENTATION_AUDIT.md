# Implementation vs Documentation Audit

**Goal**: Create parity between docs and implementation. Minimize lines of code.

**Last updated**: Current session
**Inventory date**: All files scanned; inventory is comprehensive.

---

## Summary

- **Total classes/objects in implementation**: 33
- **Documented in `/doc/features/*`**: 11
- **Undocumented but present**: 22
- **Candidates for elimination**: 3-4
- **Candidates for documentation**: 12-15
- **Candidates for consolidation**: 4-5

---

## Detailed Analysis by Category

### ✅ DOCUMENTED & CORRECTLY SCOPED

These are working as intended; maintain documentation.

| Component | Path | Status | Notes |
|-----------|------|--------|-------|
| ChartService | `src/features/music/chart-service.js` | ✅ Documented | Canonical chart owner; internally composes PlanLibrary |
| TimelineService | `src/features/music/timeline-service.js` | ✅ Documented | Canonical tempo/meter/transport owner |
| PlaybackService | `src/features/music/playback-service.js` | ✅ Documented | Sound rendering only (Web Audio API) |
| PerformanceService | `src/features/music/performance-service.js` | ✅ Documented | Session persistence via PracticeSessionManager |
| AudioContextManager | `src/features/audio/audio-context-manager.js` | ✅ Documented | Browser audio runtime |
| DetectorManager | `src/features/microphone/detector-manager.js` | ✅ Documented | Beat detection ownership; exposes detector instances |
| StorageManager | `src/features/base/storage-manager.js` | ⚠️ Partially documented | Mentioned in persistence.md but never owns domain semantics |
| Chart Visualizer | `src/features/visualizers/plan-visualizer.js` | ✅ Documented | Renders plan structure |
| Timeline Visualization | `src/features/visualizers/timeline-visualization.js` | ✅ Documented | Renders beat grid (both documented under "Chart Visualizer") |
| Main Root | `src/features/main/main.js` | ✅ Documented | Composition root and context provisioning |

---

## ❌ UNDOCUMENTED - ELIMINATE (Redundancy or Superseded Logic)

### 1. **Metronome** → ELIMINATE
- **File**: `src/features/plan-play/metronome.js`
- **Lines**: ~200
- **What it does**: Manages beat scheduling callbacks and click timing via `setInterval` lookahead.
- **Why eliminate**: 
  - Its core function (beat callbacks and timing) is superseded by `TimelineService` for transport state and `PlaybackService` for click rendering.
  - Currently used in `DrillSessionManager._setupMetronomeCallbacks()` and calibration orchestration (script.js).
  - Can be refactored away by having `TimelineService` own the scheduler loop and emit tick events; consumers subscribe to ticks instead of registering callbacks.
  - This eliminates ~200 LOC and simplifies orchestration.
- **Action**: 
  - **Priority**: HIGH
  - **Path**: Extend `TimelineService` to own audio-clock scheduler + tick event emission; refactor `DrillSessionManager` and calibration to subscribe to ticks; delete `metronome.js`.
  - **Effort**: 500-600 LOC refactor (not counting deletion savings)
  - **Validation**: Full test suite must pass including drill session and calibration flows

### 2. **PracticeSessionManager** → MIGRATE INTO PerformanceService (or eliminate wrapper)
- **File**: `src/features/plan-history/practice-session-manager.js`
- **Lines**: ~690
- **What it does**: Session persistence, history retrieval, analytics derivation.
- **Current ownership**: Owned internally by `PerformanceService`; should be exposed directly or consolidated.
- **Why consolidate**:
  - `PerformanceService` currently wraps every method and just delegates.
  - Domain logic lives in `PracticeSessionManager`; public API lives in `PerformanceService`.
  - This is good separation, BUT `PracticeSessionManager` is a private implementation detail that could be inlined/consolidated.
- **Action**:
  - **Priority**: MEDIUM
  - **Option A** (Recommended): Inline `PracticeSessionManager` entirely into `PerformanceService`. ~230 lines become one class. Document the combined class.
  - **Option B**: Leave as-is but document `PracticeSessionManager` as an internal module (not public service). Update `performance.md` to clarify ownership model.
  - **Effort**: 2-3 hours for Option A; 1 hour for Option B
  - **Current state**: Post-Phase 2 refactor, `PerformanceService` is already clean; inlining vs. wrapping is taste call

### 3. **PlanLibrary** → ELIMINATE (Owned within ChartService)
- **File**: `src/features/plan-edit/plan-library.js`
- **Lines**: ~378 (!) 
- **What it does**: Manages catalog of drill plans (built-in + custom).
- **Current ownership**: Owned internally by `ChartService.`
- **Why eliminate**:
  - It is already composed inside `ChartService` (private implementation detail).
  - Its public API is aliased by `ChartService` (`getAllCharts()`, `saveChart()`, `deleteChart()`).
  - The file is never directly imported anymore (post-Phase 2 refactor removed all direct usage).
  - It adds complexity without adding value; all its logic could move into `ChartService` or be broken into simpler helper functions.
- **Action**:
  - **Priority**: HIGH
  - **Path**: Inline `PlanLibrary` logic into `ChartService` or move to a simpler plan-persistence helper. Validate all references go through `ChartService` API only.
  - **Effort**: 3-4 hours. Requires careful merge of class methods and state.
  - **Validation**: All chart operations must still work; test that custom chart creation/deletion works end-to-end.
  - **Savings**: ~378 LOC eliminated, `ChartService` grows ~200 LOC (net -178 LOC)

### 4. **SessionState** → ELIMINATE or DOCUMENT AS DEPRECATED
- **File**: `src/features/base/session-state.js`
- **Lines**: ~80
- **What it does**: Mirrors BPM, time signature, and plan selection state.
- **Current ownership**: Provided at root but mostly deprecated. `TimelineService` owns tempo/meter; `ChartService` owns selected chart.
- **Why eliminate**:
  - Created as a legacy bridge during migration to services; its role is now superseded.
  - Still referenced in a few places (SessionState migration noted in timeline.md as "Phase 4 target").
  - Holding consumers: likely only old code paths or debug views.
- **Action**:
  - **Priority**: MEDIUM
  - **Path 1** (Quick): Document as "Deprecated: Phase 4 target for removal" in docs. Leave code as-is for now.
  - **Path 2** (Thorough): Grep all usages; replace them with direct `TimelineService` / `ChartService` calls; delete `SessionState.`
  - **Effort**: 1-2 hours (depends on usage count)
  - **Current state**: Unknown usage count; needs grep to decide

---

## ⚠️ UNDOCUMENTED - DOCUMENT (Supporting Services)

These should be documented in `/doc/features/` but are not critical to eliminate.

### Infrastructure / Framework

| Item | Path | Category | Action | Effort | Priority |
|------|------|----------|--------|--------|----------|
| **PaneManager** | `src/features/base/pane-manager.js` | Utility | Create `doc/framework/pane-manager.md` | 1 hour | MEDIUM |
| **BaseComponent** | `src/features/component/base-component.js` | Framework | Expand existing `doc/framework/component.md` with lifecycle detail | 1 hour | MEDIUM |
| **Context system** | `src/features/component/context.js` | Framework | Create `doc/framework/context-protocol.md` | 1.5 hours | MEDIUM |
| **detector-params.js** | `src/features/microphone/detector-params.js` | Utility | Create `doc/framework/detector-params.md` or expand into detector.md | 1 hour | LOW |

### Domain Models (Pure Logic)

| Item | Path | Category | Action | Effort | Priority |
|------|------|----------|--------|--------|----------|
| **Scorer** | `src/features/plan-play/scorer.js` | Domain | Documented as part of Performance (currently) | 0 | ✅ |
| **ThresholdDetector** | `src/features/microphone/threshold-detector.js` | Detector variant | Document in `doc/features/music/threshold-detector.md` | 1 hour | LOW |
| **AdaptiveDetector** | `src/features/microphone/adaptive-detector.js` | Detector variant | Document in `doc/features/music/adaptive-detector.md` | 1 hour | LOW |
| **CalibrationDetector** | `src/features/calibration/calibration-detector.js` | Domain | Create `doc/features/music/calibration.md` | 1.5 hours | MEDIUM |

### Session/Playback State

| Item | Path | Category | Action | Effort | Priority |
|------|------|----------|--------|--------|----------|
| **PlaybackState** | `src/features/plan-play/playback-state.js` | State Observable | Document in playback.md or new file `doc/framework/playback-state.md` | 1 hour | MEDIUM |
| **DrillSessionManager** | `src/features/plan-play/drill-session-manager.js` | Orchestrator | Create `doc/features/workflow/drill-session.md` | 2 hours | HIGH |

### Audio Hardware

| Item | Path | Category | Action | Effort | Priority |
|------|------|----------|--------|--------|----------|
| **AudioInputSource** | `src/features/microphone/audio-input-source.js` | Low-level manager | Create `doc/features/browser/microphone-input.md` | 1 hour | MEDIUM |

---

## 🔄 UNDOCUMENTED - CONSOLIDATE (Possible Refactoring)

### **DrillSessionManager** vs. workflow orchestration
- **Currently**: `DrillSessionManager` coordinates metronome, scorer, detector during a run. It's orchestration + state management.
- **Issue**: Overlaps with what app-orchestrator does; both manage session lifecycle.
- **Recommendation**: 
  - Keep `DrillSessionManager` as the "drill session state" machine (setup beat callbacks, manage scorer, manage detector subscriptions).
  - Move high-level session start/stop/pause logic into app-orchestrator instead.
  - Document clear boundary: app-orchestrator = workflow routing; DrillSessionManager = session-local state coordination.

### **Microphone stack**: AudioInputSource + DetectorManager + Detectors
- **Currently**: Three layers (hardware access, detector lifecycle, detector algorithms).
- **Issue**: Unclear ownership; AudioInputSource is never mentioned in docs.
- **Recommendation**:
  - Document AudioInputSource as "internal infrastructure" used only by DetectorManager.
  - Simplify DetectorManager public API to hide AudioInputSource (it's an implementation detail).
  - Detectors (Threshold, Adaptive, Calibration) are algorithm implementations; document as variants.

---

## 📋 All UI Components (Panes, Controls, Overlays, Visualizations)

**Status**: Not all documented. Not critical for architecture audit, but for completeness:

| Component | Path | Doc Status | Suggested Action |
|-----------|------|-----------|------------------|
| PlanPlayPane | `src/features/plan-play/plan-play-pane.js` | Implied in chart-play.md | Document workflow |
| PlanEditPane | `src/features/plan-edit/plan-edit-pane.js` | Implied in chart-edit.md | Document workflow |
| PlanHistoryPane | `src/features/plan-history/plan-history-pane.js` | Implied in chart-review.md | Document workflow |
| MicrophoneControl | `src/features/microphone/microphone-control.js` | Implied in detector.md | Light doc |
| CalibrationControl | `src/features/calibration/calibration-control.js` | Not documented | Create `doc/features/workflow/calibration.md` |
| OnboardingPane | `src/features/onboarding/onboarding-pane.js` | Mentioned in onboarding.md | Expand doc |
| AudioContextOverlay | `src/features/audio/audio-context-overlay.js` | Implied in audio-context.md | Light doc |
| AppNotification | `src/features/base/app-notification.js` | Not documented | Light utility doc or skip |
| TimelineVisualization | `src/features/visualizers/timeline-visualization.js` | ✅ Documented | |
| PlanVisualizer | `src/features/visualizers/plan-visualizer.js` | ✅ Documented | |

---

## 🎯 Recommended Action Plan (Prioritized)

### **Phase A: Eliminate Redundancy** (High ROI, High Impact)

1. **METRONOME elimination** → Refactor `TimelineService` to own scheduler + emit ticks
   - Eliminates: ~200 LOC
   - Refactors: DrillSessionManager + orchestrator + calibration (app-specific, ~100 LOC changes)
   - Payoff: Clearer ownership, no more callback shim
   - **Time**: 4-6 hours
   - **Risk**: Medium (lots of integration points; needs full test validation)

2. **PLANLIBRARY elimination** → Inline into ChartService
   - Eliminates: ~378 LOC (PlanLibrary file)
   - Refactors: ChartService grows ~200 LOC (net -178)
   - Payoff: One less file, clear single owner for chart catalog
   - **Time**: 2-3 hours
   - **Risk**: Low (mostly internal refactor; public API unchanged)

3. **SESSIONSTATE check** → Grep usage; if <5 references, inline/eliminate
   - Eliminates: ~80 LOC + cleanup
   - Payoff: Remove deprecated bridge class
   - **Time**: 1-2 hours
   - **Risk**: Low; replacement paths are documented

### **Phase B: Document Core Undocumented Services** (Parity)

1. **DrillSessionManager** → `doc/features/workflow/drill-session.md` (clarify boundary with orchestrator)
2. **CalibrationDetector** → `doc/features/music/calibration.md`
3. **AudioInputSource** → `doc/features/browser/microphone-input.md` (internal infrastructure)
4. Expand **detector.md** to cover Threshold / Adaptive variants

### **Phase C: Framework Documentation** (Optional but Useful)

- **PaneManager** → `doc/framework/pane-manager.md`
- **Context Protocol** → `doc/framework/context-protocol.md`
- **PlaybackState** → `doc/framework/playback-state.md`

---

## Key Metrics (Before/After Objectives)

| Metric | Current | Target | Effort |
|--------|---------|--------|--------|
| Implementation files (LOC in src/) | ~5500 | ~5200 | Eliminate phase |
| Public-facing services (not internal) | 7 | 6-7 | Consolidate phase |
| Undocumented services | 12-15 | 0-3 | Document phase |
| Service docs coverage | 65% | 95%+ | Document phase |

---

## Notes

- **Post-Phase 2 Status**: Service ownership is mostly clean. PracticeSessionManager consolidation is optional (wrapper is well-structured).
- **Critical path**: Metronome elimination opens the door to clearer TimelineService ownership and removes a major orchestration shim.
- **Testing strategy**: Each phase should validate with full test suite + manual playback/calibration workflow.

