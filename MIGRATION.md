# Migration Plan: Rebuild UI with Component Pattern

## Goal
Incrementally migrate the app to use Web Components while maintaining continuous functionality. Each step is tested in a browser before proceeding.

## Migration Strategy
Work directly in the codebase with incremental, testable changes:
- Migrate one capability at a time
- Commit after each verified step
- Keep domain logic modules unchanged (reuse scorer, metronome, timeline, etc.)
- New components wrap and compose existing business logic

## Reference Map
Current implementation behavioral references:
- Product features and flows: `README.md`
- Current markup structure: `index.html`
- Orchestration and wiring: `src/script.js`
- Pane routing: `src/pane-manager.js`
- Plan editing interactions: `src/plan-editor-ui.js`
- History display: `src/history-display-ui.js`
- Component base pattern: `src/components/base/base-component.js`
- Component utilities: `src/components/base/component-utils.js`
- Test environment: `src/components/base/setup-dom.ts`

---

## Step 1 — Create Microphone Component (Already Exists)

**Status**: ✅ Complete

The microphone detector component already exists with tests:
- `src/components/microphone/microphone-detector.js`
- `src/components/microphone/microphone-detector.html`
- `src/components/microphone/microphone.css`
- `src/components/microphone/microphone-detector.test.ts`

Tests passing: 19/19

---

## Step 2 — Migrate Onboarding Pane to Components

## Step 2 — Migrate Onboarding Pane to Components

### Implementation Tasks
1. Create onboarding pane component that composes:
   - Microphone selector and level display (reuse existing microphone component)
   - Calibration controls and status
   - Completion button and navigation
2. Replace onboarding pane content in `index.html` with `<onboarding-pane>` custom element
3. Update `src/script.js` to instantiate and wire onboarding component instead of direct DOM manipulation
4. Preserve all existing behavior: device selection, calibration flow, settings persistence

### Reference Implementation
- Current onboarding markup: `index.html` lines ~30-80
- Current onboarding logic: `src/script.js` onboarding setup section
- Microphone behavior: `src/microphone-detector.js`
- Calibration behavior: `src/calibration.js`

### Human Verification (Browser)
- ✓ Microphone list populates
- ✓ Device selection works
- ✓ Level meter shows audio input
- ✓ Threshold adjustment works
- ✓ Calibration starts/stops correctly
- ✓ Calibration result displays
- ✓ "Go to Plan Editor" button navigates to plan-edit pane
- ✓ Settings persist on reload

---

## Step 3 — Migrate Plan Edit Pane to Components

### Implementation Tasks
1. Create plan-edit pane component that composes:
   - Plan library selector
   - Plan info display (name, description, difficulty, stats)
   - Plan editor (metadata fields, segment editor)
   - Plan visualization (reuse existing `DrillPlan` or wrap it)
   - Action buttons (new, edit, clone, delete, start training)
2. Replace plan-edit pane content in `index.html` with `<plan-edit-pane>` custom element
3. Update `src/script.js` to wire plan-edit component
4. Preserve URL-based plan selection and all editor workflows

### Reference Implementation
- Current plan-edit markup: `index.html` lines ~90-220
- Current plan-edit logic: `src/plan-editor-ui.js`
- Plan storage: `src/plan-library.js`
- Plan visualization: `src/drill-plan.js`

### Human Verification (Browser)
- ✓ Plan library dropdown populates with built-in and custom plans
- ✓ Selecting plan shows details and visualization
- ✓ "New Plan" creates editable plan
- ✓ "Edit Plan" opens editor for existing plan
- ✓ "Clone Plan" duplicates selected plan
- ✓ Segment editor adds/removes/edits segments
- ✓ "Save Plan" persists changes
- ✓ "Delete Plan" removes custom plans
- ✓ "Start Training" navigates to plan-play with selected plan
- ✓ URL param `?plan=<id>` restores plan selection

---

## Step 4 — Migrate Plan Play Pane to Components

### Implementation Tasks
1. Create plan-play pane component that composes:
   - Session controls (BPM, time signature, start/stop)
   - Beat indicator display
   - Timeline visualization (reuse or wrap `Timeline`)
   - Score display
   - Finish/results navigation
2. Replace plan-play pane content in `index.html` with `<plan-play-pane>` custom element
3. Update `src/script.js` to wire play session through component events
4. Preserve metronome timing, hit detection, scoring, and timeline behavior

### Reference Implementation
- Current plan-play markup: `index.html` lines ~230-280
- Current play logic: `src/script.js` play session section
- Metronome: `src/metronome.js`
- Scoring: `src/scorer.js`
- Timeline: `src/timeline.js`
- Hit detection: `src/microphone-detector.js`

### Human Verification (Browser)
- ✓ Session parameters (BPM, time signature) are editable
- ✓ "Start" begins metronome and session
- ✓ Beat indicator updates in sync with metronome
- ✓ Hits register on timeline with color coding (green=accurate, red=missed)
- ✓ Score updates in real-time
- ✓ "Stop" halts session cleanly
- ✓ Session completion auto-saves to history
- ✓ "View Results" navigates to history

---

## Step 5 — Migrate History Pane to Components

### Implementation Tasks
1. Create plan-history pane component that composes:
   - Session list with expand/collapse
   - Session detail view (metrics, trends, recommendations)
   - Action buttons (retry plan, select different plan)
2. Replace plan-history pane content in `index.html` with `<plan-history-pane>` custom element
3. Update `src/script.js` to wire history display and retry flow
4. Preserve session data rendering and recommendation logic

### Reference Implementation
- Current history markup: `index.html` lines ~290-320
- Current history logic: `src/history-display-ui.js`
- Session data: `src/practice-session-manager.js`
- History storage: `src/drill-history.js`

### Human Verification (Browser)
- ✓ Completed sessions appear in list
- ✓ Session header shows score, plan name, status, date/time
- ✓ Click to expand/collapse session details
- ✓ Details show plan info, metrics, performance trends, recommendations
- ✓ "Retry This Plan" navigates to plan-play with that plan selected
- ✓ "Select Different Plan" navigates to plan-edit

---

## Step 6 — Consolidate Orchestration

### Implementation Tasks
1. Refactor `src/script.js` to orchestrate through component contracts (methods/events)
2. Remove direct DOM manipulation for pane content (keep only pane visibility logic)
3. Ensure one-way data flow: domain → component props, component events → orchestration handlers
4. Keep routing, persistence, and startup logic intact

### Reference Implementation
- Current orchestration: `src/script.js`
- Pane manager: `src/pane-manager.js`

### Human Verification (Browser)
- ✓ Full user journey works: onboarding → plan edit → play → history → retry
- ✓ Pane navigation via nav buttons, hash changes, back/forward
- ✓ Settings persistence across reloads
- ✓ Returning user starts at correct pane based on state
- ✓ No console errors during normal flows

---

## Step 7 — Remove Legacy UI Modules

### Implementation Tasks
1. Delete superseded UI-only modules:
   - `src/plan-editor-ui.js` → replaced by plan-edit component
   - `src/history-display-ui.js` → replaced by plan-history component
2. Keep domain modules unchanged:
   - `src/metronome.js`, `src/scorer.js`, `src/timeline.js`, etc.
3. Update documentation to reflect component architecture

### Human Verification (Browser)
- ✓ Final acceptance pass against all README features
- ✓ No regressions in core workflows

---

## Step 8 — Write Component Tests

### Implementation Tasks
1. Add unit tests for each new component similar to microphone-detector.test.ts
2. Test component state management, lifecycle, and event emission
3. Ensure tests use consolidated setup-dom.ts for environment

### Verification
- ✓ All component tests pass via `./tools/test`

---

## Quick Verification Checklist (Use at Every Step)
1. **Navigation**: Pane switching, URL hash updates, back/forward buttons
2. **Controls**: All buttons and inputs respond correctly
3. **Feedback**: Status messages and visual updates appear
4. **Persistence**: Settings saved and restored after reload
5. **Console**: No errors during normal operation

---

## Done Definition
Migration is complete when:
- All four panes are componentized
- All README features work identically
- Legacy UI modules removed
- Component tests passing
- Human verification signed off
