# Migration Plan: Rebuild UI with Component Pattern

## Goal
Rebuild `index.html` and runtime wiring using the new component pattern while preserving current product behavior.

This plan is incremental by design: each step ends with a **Pause Point** where a human validates behavior in a real browser before continuing.

## Working Rules
- Keep behavior parity first; postpone UX changes until after parity.
- Migrate one semantic capability at a time.
- Keep old implementation available as reference until each migrated capability is verified.
- Use unit tests for safety, then require human browser checks for product fit.

## Reference Map (Current Implementation)
Use these as behavioral references while migrating:
- Product behavior and pane flow: `README.md`
- Current app shell and pane markup: `index.html`
- Main orchestration and control flow: `src/script.js`
- Pane routing semantics: `src/pane-manager.js`
- Plan editing interactions: `src/plan-editor-ui.js`
- History rendering and retry flow: `src/history-display-ui.js`
- Existing component base contract: `src/components/base/base-component.js`
- Existing component utility patterns: `src/components/base/component-utils.js`
- Existing component test bootstrap pattern: `src/components/base/setup-dom.ts`

---

## Step 1 — Establish Migration Harness and Dual-Run Baseline

### Agent Implementation Tasks
1. Add a migration-safe app entry path that can mount new components without deleting old code paths.
2. Introduce a compatibility shell in `index.html` for component-based panes, while preserving existing pane IDs and navigation anchors.
3. Add a feature flag (query param or constant) to switch between legacy orchestration and migrated orchestration.
4. Ensure no regressions in lint/check/test commands before changing behavior.

### Reference Implementation
- Legacy pane structure and IDs in `index.html`
- Legacy startup and wiring in `src/script.js`
- Routing assumptions in `src/pane-manager.js`

### Human Verification Pause Point
- Open the app in a browser and confirm both modes are runnable (legacy and migration mode).
- Confirm URL hash navigation still reaches all panes.
- Confirm no obvious visual regressions in static layout before interactions.

---

## Step 2 — Rebuild App Shell as Composed Pane Components

### Agent Implementation Tasks
1. Create top-level pane components for semantic sections (Onboarding, Plan Edit, Plan Play, Plan History).
2. Move pane-local markup from `index.html` into component templates while preserving user-facing structure and text intent.
3. Keep pane mounting/orchestration centralized (do not let panes directly control global navigation).
4. Keep component interfaces minimal: inputs as properties/methods, outputs as custom events.

### Reference Implementation
- Existing pane sections in `index.html`
- Navigation flow in `src/pane-manager.js`
- Cross-pane behavior currently handled in `src/script.js`

### Human Verification Pause Point
- In browser, verify all panes render with expected content and controls.
- Confirm pane switching via nav buttons and hash links still works.
- Confirm no pane appears empty or duplicated.

---

## Step 3 — Migrate Onboarding Capability (Mic + Calibration + Completion)

### Agent Implementation Tasks
1. Implement onboarding as component composition (microphone config, calibration status, completion action).
2. Reuse or wrap existing domain logic for microphone detection and calibration; do not re-implement core algorithms in UI components.
3. Standardize emitted events for onboarding progress (configured, calibrated, completed).
4. Preserve persisted settings behavior and initial-state restoration.

### Reference Implementation
- Onboarding pane markup and controls in `index.html`
- Runtime onboarding behavior in `src/script.js`
- Microphone and calibration domain modules under `src/`

### Human Verification Pause Point
- Confirm microphone list populates and device selection works.
- Confirm calibration run can start/stop and updates status/results.
- Confirm onboarding completion action routes to the plan editing flow.

---

## Step 4 — Migrate Plan Edit Capability (Library + Editor + Visualization)

### Agent Implementation Tasks
1. Componentize plan library selection, metadata display, segment editing, and editor actions.
2. Keep plan parsing/validation/storage logic in domain modules; UI components only surface controls and feedback.
3. Preserve URL-state behavior for selected plan where currently supported.
4. Keep visualization output parity for plan structure feedback.

### Reference Implementation
- Plan editing pane structure in `index.html`
- Existing behavior in `src/plan-editor-ui.js`
- Orchestration touchpoints in `src/script.js`

### Human Verification Pause Point
- Confirm selecting a plan updates plan details and visualization.
- Confirm create/edit/clone/delete flows work end-to-end.
- Confirm Start Training transitions with the intended selected plan.

---

## Step 5 — Migrate Plan Play Capability (Metronome + Timeline + Scoring)

### Agent Implementation Tasks
1. Build play-session components for transport controls, beat display, timeline display, and score summary.
2. Preserve metronome timing and session control semantics by reusing existing domain modules.
3. Preserve hit detection integration path from microphone/calibration into scoring and timeline updates.
4. Keep stop/finish behavior and completion handling consistent with current experience.

### Reference Implementation
- Play pane controls and display in `index.html`
- Session runtime orchestration in `src/script.js`
- Domain behavior in `src/metronome.js`, `src/scorer.js`, `src/timeline.js`, related modules

### Human Verification Pause Point
- Confirm Start/Stop behavior, beat display, and timeline motion feel correct.
- Confirm hits visibly register and affect score during active play.
- Confirm session completion transitions and result visibility are coherent.

---

## Step 6 — Migrate History Capability (Session Review + Retry)

### Agent Implementation Tasks
1. Componentize history list, expandable session details, recommendations summary, and action buttons.
2. Preserve retry-plan and select-different-plan flows through orchestration rather than direct peer coupling.
3. Keep presentation concerns local; keep recommendation computation in domain logic.

### Reference Implementation
- History pane structure in `index.html`
- Existing behavior in `src/history-display-ui.js`
- Navigation and plan handoff in `src/script.js` + `src/pane-manager.js`

### Human Verification Pause Point
- Confirm completed sessions appear with meaningful detail.
- Confirm expand/collapse behavior and action buttons work.
- Confirm retrying a prior plan routes back into a playable flow correctly.

---

## Step 7 — Unify Orchestration Around Component Contracts

### Agent Implementation Tasks
1. Replace legacy direct DOM orchestration with component event/method contracts.
2. Remove redundant glue code once parity is confirmed for each capability.
3. Keep one-way data flow: domain state → component props/methods, component events → orchestration handlers.
4. Ensure routing, persistence, and startup heuristics still match product intent.

### Reference Implementation
- Legacy orchestrator in `src/script.js`
- Routing semantics in `src/pane-manager.js`

### Human Verification Pause Point
- Run through full user journey (first-time setup, training run, history review, repeat run).
- Confirm no dead controls, race conditions, or pane-routing anomalies.
- Confirm returning-user startup behavior still feels correct.

---

## Step 8 — Remove Legacy UI Path and Finalize Parity

### Agent Implementation Tasks
1. Remove migration flags and obsolete legacy pane markup once parity is accepted.
2. Delete superseded UI-only legacy modules that are no longer referenced.
3. Update documentation to reflect final component contracts and orchestration boundaries.
4. Keep tests green and add/adjust tests around new component contracts where needed.

### Reference Implementation
- Legacy references tracked throughout prior steps
- Architecture constraints in `ARCHITECTURE.md`

### Human Verification Pause Point
- Perform final acceptance pass in browser against README feature expectations.
- Validate that the migrated app feels equivalent for core workflows.
- Sign off on parity before cleanup of any remaining compatibility artifacts.

---

## Suggested Verification Script for Human QA (Each Milestone)
Use this quick checklist at every pause point:
1. Navigation: pane switch, URL hash behavior, back/forward behavior
2. Controls: all primary buttons/inputs respond
3. Feedback: visible status/messages update for key actions
4. Persistence: reload preserves expected settings/state
5. Regression scan: no console errors during core flow

---

## Done Definition (Feature Parity)
Migration is complete when all are true:
- All four semantic pane capabilities are componentized.
- User-visible behavior matches current product goals in `README.md`.
- Legacy UI path is removed.
- Test suite passes and human browser validation is signed off.
