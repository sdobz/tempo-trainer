## Intent

Organizing code such that agents can efficiently implement and update features without reading massive files or managing build complexity.

**Core goals:**
1. LLM-parseable: Each component file ≤ 250 lines, templates separate from logic
2. Modular: Update one feature without touching unrelated code
3. Testable: Components instantiate independently, no globals
4. No dependencies: Only native browser APIs
5. No build step: Type checking and linting are cheap checks

---

## Architecture Overview

**Three layers** (from abstract to concrete):

### Layer 1: Semantic Concepts
High-level intent: "Using a microphone to detect and score the timing of drum beats in order to teach drumming skills"

Semantic concepts break down as:
- **microphone** → audio input, detection, classification
- **detect** → onset analysis, peak picking
- **score** → accuracy measurement, metric derivation
- **timing** → latency, phase relationships
- **drum** → instrument classification
- **beat** → metronome reference, measure subdivision
- **teach** → feedback, recommendations
- **skills** → tracked competencies (drift, consistency, rhythm)

### Layer 2: Feature Organization
Features are **Web Components** organized in a directory tree:

```
src/
  components/              # UI components (Web Components)
    base/                  # BaseComponent abstract class + utilities
    microphone/            # Microphone selection + level display
    plan-editor/           # Plan creation, editing, cloning
    timeline/              # Beat-by-beat visualization
    history/               # Session review, metrics, recommendations
    drill-plan/            # Plan playback visualization
  features/                # Business logic, non-UI (plain classes)
    scorer.js              # Accuracy calculation
    metronome.js           # Tempo reference
    calibration.js         # Latency measurement
    microphone-detector.js # Onset detection algorithm
    plan-library.js        # Plan persistence
    practice-session-manager.js  # Session data + derived metrics
  styles/
    theme.css              # CSS custom properties (colors, timing, spacing)
    globals.css            # App-level layout, reset, responsive
    components.css         # Import point for all component styles
  script.js                # Wiring layer: instantiate + connect components & features
```

### Layer 3: Component Implementation
Each component is a **Web Component** (native `HTMLElement` subclass):

```javascript
class MicrophoneDetector extends BaseComponent {
  // Template URL (separate .html file)
  getTemplateUrl() { return './microphone-detector.html'; }
  
  // Styles URL (separate .css file, scoped with BEM)
  getStyleUrl() { return './microphone.css'; }
  
  // Lifecycle hooks from BaseComponent
  async onMount() { /* DOM is ready, bind events */ }
  onUnmount() { /* cleanup */ }
  onStateChange(oldState, newState) { /* update DOM based on state */ }
  
  // Public API for wiring (events + methods)
  setThreshold(value) { this.setState({ threshold: value }); }
  
  // Events dispatched to parent
  dispatchEvent(new CustomEvent('threshold-change', { detail: value }));
}
```

---

## Design Rules

### 1. Semantic Scope
Each component represents **one semantic concept**. If it handles two, refactor into two components.

**Examples:**
- ✅ `<microphone-detector>` → microphone selection + level visualization
- ❌ `<microphone-timeline-plan>` → too many concerns, split into three

### 2. Component Boundaries
- **Components handle**: UI rendering, user interaction, DOM lifecycle
- **Features handle**: business logic, state machines, computation, persistence
- **Components call features**, not vice versa

**Pattern:**
```javascript
// GOOD: Feature is side-effect-free
class Scorer {
  recordHit(timestamp) { this.hits.push(timestamp); }
  getScore() { return Math.round(100 * accuracy); }  // pure computation
}

// Component consumes feature
<scorer-display>  instanceof BaseComponent
  displayScore(scorer.getScore());  // reactive update
```

### 3. State Management
Components have **local state** + **state change callbacks**:

```javascript
// Local state (plain object)
this.state = { threshold: 52, isConnected: false };

// State updates trigger side effects
setState(newState) {
  const oldState = this.state;
  this.state = newState;
  this.onStateChange(oldState, newState);  // app updates DOM
}

// Parent listens for changes
microphone.addEventListener('threshold-change', (e) => {
  sessionManager.updateThreshold(e.detail);
});
```

### 4. No Ad-Hoc DOM Access
Components don't reach outside their boundary:

```javascript
// ❌ BAD: Component queries global DOM
const globalButton = document.getElementById('start-btn');

// ✅ GOOD: Parent passes element reference or data down
class DrillSessionComponent extends BaseComponent {
  setStartButton(btn) { this.startBtn = btn; }
}
```

### 5. Styling Isolation
Styles are scoped per component using **BEM naming** + **CSS custom properties**:

```css
/* src/components/microphone/microphone.css */
:root {
  --color-primary: #4caf50;
  --color-bg: #1e1e1e;
}

.microphone { background-color: var(--color-bg); }
.microphone__level { border: 1px solid var(--border-color); }
.microphone__level-bar { background-color: var(--color-primary); }
.microphone--over-threshold { border-color: #ff6b6b; }
```

No inline `<style>` tags in components. No `innerHTML` with CSS.

### 6. Testing
Each component has a `.test.js` file colocated:

```javascript
// src/components/microphone/microphone-detector.test.js
describe('MicrophoneDetector', () => {
  it('should set threshold on setState', () => {
    const comp = new MicrophoneDetector();
    comp.setState({ threshold: 75 });
    assert.equal(comp.state.threshold, 75);
  });
});
```

Run via: `./tools/test`

---

## Wiring Layer ([script.js](src/script.js))

Minimal orchestration code. Maps semantic components to wiring:

```javascript
// 1. Instantiate components
const microphone = document.createElement('microphone-detector');
const timeline = document.createElement('timeline-component');

// 2. Instantiate features
const scorer = new Scorer();
const metronome = new Metronome();

// 3. Connect them (data flow)
microphone.addEventListener('hit', (e) => {
  scorer.recordHit(e.detail.timestamp);
});

scorer.onStateChange((oldMetrics, newMetrics) => {
  timeline.updateScore(newMetrics.overall);
});

// 4. Mount to DOM
document.body.appendChild(microphone);
document.body.appendChild(timeline);
```

Target size: **< 200 lines**.

---

## Directory Structure Details

### `src/components/base/`
- **base-component.js**: Abstract `HTMLElement` subclass with lifecycle hooks
- **component-utils.js**: Utilities for loading templates, event binding, emitting custom events

### `src/components/{feature}/`
Each feature gets its own directory with three files:

```
src/components/microphone/
  ├── microphone-detector.js     # Web Component class + customElements.define()
  ├── microphone-detector.html   # Template with light DOM structure
  ├── microphone.css             # Scoped styles (BEM naming)
  └── microphone-detector.test.js  # Unit tests
```

**File size targets:**
- `.js`: 100–200 lines (template logic + lifecycle)
- `.html`: 20–50 lines (just markup, no logic)
- `.css`: 80–150 lines (BEM-scoped for one component)
- `.test.js`: 30–100 lines

### `src/features/`
Plain JavaScript classes, no Web Component overhead:

```
src/features/
  ├── scorer.js
  ├── metronome.js
  ├── microphone-detector.js     # Audio processing (different from UI component)
  ├── plan-library.js
  └── practice-session-manager.js
```

### `src/styles/`
- **theme.css**: CSS custom properties (`--color-primary`, `--spacing-base`, etc.)
- **globals.css**: App-level layout, reset, responsive breakpoints
- **components.css**: Single import point that `@import` all component `.css` files

```css
/* src/styles/components.css */
@import url('../components/microphone/microphone.css');
@import url('../components/timeline/timeline.css');
/* etc. */
```

---

## Complexity Management

**Principle:** Minimize connections between components.

Each component declares its **public interface**:

```javascript
class MyComponent extends BaseComponent {
  // Public API (documented with JSDoc)
  /**
   * Called when user performs action
   * @callback onChange
   * @param {Object} data
   */
  onThresholdChange(callback) { /* */ }
  
  setThreshold(value) { /* */ }
}
```

**Connections flow through wiring layer** (script.js), not through imports:

```javascript
// ❌ BAD: Direct import creates tight coupling
import MicrophoneDetector from './microphone/microphone-detector.js';
import TimelineComponent from './timeline/timeline.js';
microphone.updateTimeline = (data) => timeline.update(data);

// ✅ GOOD: Loose coupling via events
microphone.addEventListener('threshold-change', (e) => {
  timeline.dispatchEvent(new CustomEvent('update-threshold', { detail: e.detail }));
});
```

---

## Validation

**Lint & Type Checking** (run frequently, they're cheap):
```bash
./tools/lint   # ESLint checks code style
./tools/check  # TypeScript checks JSDoc types
./tools/test   # Run component unit tests
```

**File Size Validation**:
```bash
wc -l src/components/**/*.js src/script.js
# Each file should be ≤ 250 lines
```

**Test Coverage**:
Each component should have a `.test.js` with:
- State transitions
- Event emission
- Lifecycle hooks
- Error cases

---

## Next: See AGENT.md
For implementation details and phased breakdown, see [AGENT.md](AGENT.md).
