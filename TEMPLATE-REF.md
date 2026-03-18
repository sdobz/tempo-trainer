# TEMPLATE-REF.md: Refactoring Plan for Declarative Template Refs and Event Bindings

## 1. Intent and Success Criteria

This plan exists to reduce component LOC by removing repetitive DOM query and listener wiring while keeping behavior explicit, mechanically checkable, and easy for both humans and LLMs to maintain.

Current pain points:

- Components spend many lines on `querySelector(...)` assignments for stable elements.
- Components spend many lines on `this.listen(...)` boilerplate for simple UI events.
- Template structure and component code can drift because refs and handlers are connected only by string selectors and ad-hoc code.
- The codebase is JS-first, so safety must come from explicit machine checks rather than trust.

Success means:

- Less component code, not just different component code.
- Most stable element lookup disappears from component `onMount()` bodies.
- Most simple DOM event wiring disappears from component `onMount()` bodies.
- Templates become the canonical declaration site for stable refs and simple UI events.
- HTML-to-component connections are machine checked.
- Incremental migration is possible with no big-bang framework rewrite.

Non-goals:

- No move to framework-owned virtual DOM.
- No runtime template compilation step in production.
- No replacement of explicit event delegation where delegation is the simpler pattern.
- No introduction of literal inline handler attributes like `onclick="..."`.

## 2. Core Runtime Model

The target model is declarative in HTML but remains component-owned at runtime.

Recommended template syntax:

- `data-ref="savePlanBtn"` for stable element references
- `data-on-click="handleSavePlan"` for DOM event binding to component methods
- `data-on-change="handlePlanSelected"` for non-click DOM events
- optional `data-ref-group="segmentRow"` later if repeated collections need structured access

Example:

```html
<select data-ref="planLibrarySelect" data-on-change="handlePlanSelected"></select>
<button data-ref="newPlanBtn" data-on-click="handleNewPlan">New</button>
```

BaseComponent responsibilities:

1. After template load, scan the component subtree for `data-ref` and `data-on-*` attributes.
2. Build `this.refs` as the canonical stable-element map.
3. Attach event listeners with `this.listen(...)` so cleanup remains automatic.
4. Bind handlers to the component instance and fail fast if a named method is missing.
5. Keep event registration centralized so components only implement methods.

Component responsibilities:

- Implement methods such as `handleNewPlan(event)`.
- Use `this.refs.planLibrarySelect` instead of repeated `querySelector(...)` calls.
- Keep explicit code for service subscriptions, context consumption, and dynamic delegation where needed.

## 3. Why `data-on-*` Instead of Literal Inline Handlers

This refactor should not use real inline handler attributes such as `onclick="handleSomethingClick"`.

Reasons:

- Inline DOM handlers do not naturally dispatch to the owning custom element instance.
- They mix executable behavior strings into HTML and weaken refactor safety.
- They complicate method validation, argument handling, and cleanup semantics.
- They make it harder to preserve the current `BaseComponent` lifecycle contract.

`data-on-*` preserves the desired authoring style while keeping the actual binding logic in `BaseComponent`.

## 4. Phase 1: Declarative Binding Spec and BaseComponent Support

### 4.1 Deliverables

1. Extend `src/features/component/base-component.js` with:
   - subtree scan for `data-ref`
   - subtree scan for `data-on-*`
   - `this.refs` object populated during initialization
   - event binding through existing `listen(...)`
   - descriptive runtime errors for duplicate refs, missing methods, and unsupported event declarations
2. Define minimal runtime rules:
   - each `data-ref` within a component must be unique
   - each `data-on-*` value must be a method name on the component instance
   - handlers are invoked as `this[methodName](event, element)`
   - bindings are scoped to the component subtree only
3. Add focused tests for:
   - refs are collected correctly
   - click/change handlers are bound and cleaned up
   - duplicate ref names throw
   - missing handler methods throw

### 4.2 Scope Constraints

Phase 1 supports only simple stable bindings:

- stable single-element refs
- simple DOM events on elements present in initial template

Phase 1 does not attempt:

- dynamic repeated-item binding
- argument expressions in HTML
- conditional bindings
- arbitrary code execution from templates

### 4.3 LOC Impact

- Adds base infrastructure first
- Expected short-term delta: positive LOC in BaseComponent and tests
- Creates a reusable mechanism that reduces per-component code in later phases

Completion gate:

- BaseComponent can populate refs and bind declared handlers
- Cleanup remains automatic through existing lifecycle paths
- No pilot component migration yet

## 5. Phase 2: Authoritative Template Check and Context-Friendly Diagnostics

This phase is required. The refactor should not depend only on runtime errors.

### 5.1 Goal

Make HTML declarations participate in machine checking so the project can prove:

- a declared ref name is valid and unique
- the component uses the right ref names
- ref usage stays aligned with declared elements strongly enough to catch mistakes early
- a declared handler name exists on the component

### 5.2 Recommended Checking Architecture

Use a standalone checker tool as the source of truth, not committed generated artifacts.

1. Parse each component `.html` template.
2. Extract:
   - `data-ref` names
   - declaring tag names
   - `data-on-*` event names and handler method names
3. Infer DOM element types from tag names:
   - `button -> HTMLButtonElement`
   - `select -> HTMLSelectElement`
   - `textarea -> HTMLTextAreaElement`
   - `input -> HTMLInputElement`
   - fallback -> `HTMLElement`
4. Resolve each template to its owning component class and class methods.
5. Validate refs and handlers directly from source files.
6. Emit context-friendly diagnostics with:
   - `path:line:column`
   - short code frame
   - clear expected/actual wording
   - did-you-mean suggestions for nearby ref and method names
7. Optionally run an in-memory TypeScript pass (no file emission) to strengthen checks around JS + JSDoc usage.

### 5.3 Why Checker-First Instead of Generated Files

Committed generated files can drift, add review noise, and become stale during LLM-heavy iteration loops.

The template should be canonical for:

- ref names
- simple event declarations

The checker should be canonical for:

- machine-readable proof that HTML and JS agree at check time
- deterministic diagnostics for local runs and CI
- context-friendly hints that speed autonomous patch loops

### 5.4 Checker Responsibilities

Add a dedicated check step, for example `tools/check-template-refs`, that fails when:

- two elements in one template declare the same `data-ref`
- a `data-on-*` handler method is missing from the component class
- a component accesses a non-existent `this.refs.someName`
- ref usage and inferred element type usage disagree strongly enough for static checks to catch
- template and component file pairing cannot be resolved

Checker output modes:

- `--compact` for terminal usage
- `--json` for LLM-friendly machine parsing and downstream tooling

### 5.5 Type System Integration Standard

The project is JS-first, so this phase should rely on:

- JSDoc annotations in component JS
- checker-owned semantic validation
- optional TypeScript programmatic checks in memory (`allowJs` + `checkJs`, no generated file output) as part of `./tools/check`

This keeps the runtime dependency-free while still getting machine checking.

Completion gate:

- `./tools/check` fails on broken refs, missing handlers, or invalid `this.refs` usage
- checker diagnostics include actionable source locations and hints
- no generated artifacts are required to keep checks accurate

## 6. Phase 3: Pilot Migration

Pilot targets should be small enough to prove the pattern, but representative enough to expose real friction.

Recommended order:

1. `src/features/audio/audio-context-overlay.js`
2. `src/features/microphone/microphone-control.js`
3. `src/features/calibration/calibration-control.js`

Pilot conversion rules:

1. Replace stable `querySelector(...)` fields with `data-ref` and `this.refs` access.
2. Replace simple element-level `this.listen(...)` calls with `data-on-*` declarations.
3. Keep explicit code for:
   - service event subscriptions
   - context consumption
   - delegated listeners on dynamic lists
4. Remove old selector fields when `this.refs` makes them redundant.

Expected pilot savings:

- small components: `10 to 25` LOC saved
- medium components: `25 to 60` LOC saved

What to measure during pilot:

- LOC reduction
- readability of the resulting component methods
- quality of checker diagnostics in both human and JSON modes
- number of cases where explicit code remains preferable

Completion gate:

- pilot component tests pass unchanged or with minimal updates
- checker output is clear enough for rapid manual and LLM fixes
- no evidence that runtime magic is obscuring control flow

## 7. Phase 4: Expand to High-Boilerplate Components

After the pilot proves the pattern, migrate components where stable refs and simple handlers consume the most space.

High-value candidates:

1. `src/features/plan-edit/plan-edit-pane.js`
2. `src/features/onboarding/onboarding-pane.js`
3. `src/features/plan-play/plan-play-pane.js`
4. `src/features/calibration/calibration-control.js` if not used as pilot

Likely eliminations in these files:

- long DOM lookup blocks in `onMount()`
- repeated `this.listen(button, "click", ...)` patterns
- selector strings duplicated between HTML and JS

Important exception:

- keep event delegation for dynamic/repeated structures such as editable segment rows unless a later pattern proves simpler without hiding behavior

## 8. Phase 5: Documentation Lock-In and Enforcement

Once the pattern is stable, document it as the default component authoring style for new code.

Required doc updates:

1. `ARCHITECTURE.md`
   - describe template refs and declarative event bindings as the standard for simple component-local DOM wiring
2. `doc/framework/component.md` or equivalent framework doc location
   - canonical example with `data-ref`, `data-on-*`, checker expectations, and runtime cleanup semantics
3. `README.md` or contributor doc
   - explain how to run the template-ref checker and how to consume compact/JSON diagnostics

Enforcement direction:

- New components should default to `data-ref` and `data-on-*` for stable local DOM wiring.
- Raw `querySelector(...)` in components should remain allowed for exceptional cases, but no longer be the default.
- Literal inline handler attributes remain disallowed.

## 9. Net Outcome Expectation

This effort is justified only if it reduces code and improves mechanical confidence at the same time.

Expected project-level outcomes:

- lower component LOC in UI-heavy files
- fewer duplicated selector strings
- easier autonomous editing because templates declare refs and simple events directly
- stronger machine validation of HTML/JS coupling than the current manual pattern

This should be treated as a code reduction and maintenance-simplification initiative, not as a framework feature exercise.

## 10. Guardrails

- Prefer explicit methods over clever binding expressions.
- Keep the template language declarative and intentionally small.
- Do not hide service wiring, async flows, or dynamic list behavior behind template magic.
- Runtime behavior must remain understandable from reading one template and one component file.
- Checker results must be deterministic and stable between local and CI runs.
- If a check requires too much bespoke annotation, simplify the pattern rather than adding more ceremony.

## 11. Open Design Decisions to Resolve During Phase 1

These must be decided early and documented before broad rollout:

1. Whether `this.refs` is a plain object or a frozen object.
2. Whether handler names are public methods or may include underscore-prefixed internal methods.
3. Whether the optional in-memory TypeScript pass is enabled by default or only in CI.
4. Whether the checker validates method signatures beyond existence.
5. Whether a later `data-ref-group` pattern is worth supporting, or whether repeated structures should stay delegation-first.