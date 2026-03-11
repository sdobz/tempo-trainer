# Tempo Trainer

A web-based metronome and rhythm training application designed for drummers and musicians to practice precise timing with real-time feedback and scoring.

## Features

### Core Metronome

- **Adjustable BPM**: Set tempo from 40 to 300 beats per minute
- **Time Signatures**: Support for 4/4, 3/4, 2/4, and 6/8 time signatures
- **Visual Beat Indicator**: Real-time beat display with distinct visual cues for downbeats
- **Audio Click Track**: High-precision Web Audio API-based metronome with lookahead scheduling

### Drill Plans

- **Preset Plans**: Pre-configured training patterns like Standard Pyramid (1-4) and Quick drills
- **Custom Plans**: Create your own training routines using the format: `on,off,reps;...`
  - Example: `1,1,4;2,2,4;3,3,4;4,4,4` (1 measure on, 1 off, repeat 4 times, then 2 on, 2 off, etc.)
- **Plan Visualization**: Visual representation of your drill structure showing active and rest periods

### Microphone-Based Hit Detection

- **Real-time Audio Input**: Monitor microphone levels with live visual feedback
- **Hit Detection**: Automatic detection of drum hits or instrument strikes
- **Adjustable Threshold**: Click and drag on the level meter to set the detection threshold
- **Device Selection**: Choose from available microphone inputs
- **Peak Hold Display**: Visual peak indicator to help set appropriate threshold levels

### Automatic Calibration

- **Latency Compensation**: Automatically measures and compensates for system audio latency
- **One-Click Calibration**: Simply click "Start Calibration" and play along with the clicks
- **Statistical Analysis**: Uses median absolute deviation (MAD) and drift detection for accurate offset calculation
- **Persistent Settings**: Calibration offset is saved between sessions

### Scoring System

- **Real-time Accuracy Tracking**: Measures timing precision for each hit in milliseconds
- **Per-Measure Scoring**: Individual scores for each measure (0-100 scale)
- **Overall Score**: Cumulative performance score across the entire drill
- **Visual Feedback**: Color-coded hit indicators on the timeline (green for accurate, red for missed)
- **Early/Late Detection**: Shows whether hits were early or late relative to the beat

### Timeline Visualization

- **Interactive Timeline**: Scrolling beat-by-beat visualization of drill progress
- **Now Line**: Moving indicator showing current position in the drill
- **Hit Markers**: Visual representation of your hits with accuracy color coding
- **Expected Beat Markers**: Shows where beats should occur
- **Auto-scrolling**: Timeline automatically scrolls to keep the current position centered

### Drill History

- **Session Tracking**: Records completed drills with timestamps
- **Score Archive**: View past drill scores and patterns
- **Performance Trends**: Track improvement over multiple sessions

### Settings Persistence

- **Local Storage**: Automatically saves:
  - Hit detection threshold
  - Calibration offset
  - Selected microphone device
- **Seamless Resume**: Settings are restored when you return to the application

## User Interface Architecture

The application follows a **multi-pane architecture** with intelligent routing to guide users through their training journey.

### Four Main Panes

#### 1. Onboarding Pane (`#onboarding`)

**Purpose**: First-time user setup and guidance.

**Features**:

- Microphone device selection
- Automatic system calibration
- Introduction to the app features
- One-time setup wizard

**Navigation**: After completing onboarding, users automatically advance to the Plan Edit pane.

#### 2. Plan Edit Pane (`#plan-edit`)

**Purpose**: Select or create training drill plans.

**Features**:

- Preset drill plan library
- Custom plan creator with syntax help
- Plan preview with visual structure
- Resume previous plans

**Navigation**: Select a plan, then click "Start Training" to proceed to the Play pane.

#### 3. Plan Play Pane (`#plan-play`)

**Purpose**: Active training session with real-time feedback.

**Features**:

- Live metronome and beat indicator
- Microphone input visualization
- Real-time hit detection and scoring
- Interactive timeline with progress tracking
- Session statistics

**Navigation**: Save results to advance to the History pane, or return to Plan Edit to choose a different plan.

#### 4. Plan History Pane (`#plan-history`)

**Purpose**: Review completed drills and track progress.

**Features**:

- Session archive with timestamps
- Past scores and patterns
- Performance trends across sessions
- Export/analyze session data

**Navigation**: Return to any previous plan or start a new training session.

### Intelligent Routing

The application automatically determines where to start based on user state:

- **First-time users**: Always start at Onboarding pane
  - After calibration, advance to Plan Edit
  - Then proceed through Plan Play and History as normal

- **Returning users**:
  - If calibration is complete: Start directly at Plan Play pane
  - If no calibration: Start at Plan Edit pane
  - This minimizes friction for experienced users

### URL-Based Navigation

All application state is reflected in the URL hash:

- `index.html#onboarding` - Onboarding pane
- `index.html#plan-edit` - Plan Edit pane
- `index.html#plan-play` - Plan Play pane
- `index.html#plan-history` - Plan History pane

**Benefits**:

- Bookmarkable application states
- Browser back/forward button support
- Session resumability via URL
- Shareable training states

## Usage

### Basic Usage for New Users

1. Open `index.html` in a modern web browser
2. **Onboarding** will load automatically
3. Follow the setup wizard:
   - Select your microphone device
   - Complete automatic calibration
   - Review feature overview
4. Click **Complete Setup** to proceed to Plan Edit

### Training with Drill Plans

1. **Plan Edit pane**: Select a preset plan or enter a custom plan
   - Preset plans: Standard Pyramid (1-4), Pyramid (1-8), Quick drills
   - Custom format: `on,off,reps;...` (e.g., `1,1,4;2,2,4;3,3,4;4,4,4`)
2. Click **Start Training** to open the Plan Play pane
3. In **Plan Play**:
   - Hit the drum/instrument along with the metronome
   - Watch the timeline and score update in real-time
   - Green hits = accurate, Red hits = missed or off-time
4. After completing the plan, results are saved to **Plan History**
5. Click **New Training** to select another plan

### Using Microphone Feedback

1. In **Onboarding** (first use only), select your microphone device
2. In **Plan Edit**, adjust your hit detection threshold if needed:
   - Click and drag on the level meter to set sensitivity
   - The threshold is saved for future sessions
3. Start a training session and play along
4. The app shows:
   - Green markers: Accurate hits (within ±18ms)
   - Red markers: Missed or off-time hits
   - Real-time score percentage

### Calibrating Latency

**Automatic (First-Time Users)**:

- Onboarding pane automatically runs calibration
- Just play along with the metronome clicks
- The system calculates your system's audio latency

**Manual Recalibration**:

- From any pane, click Settings → Recalibrate
- Follow the same process as automatic calibration
- This is rarely needed unless you change audio hardware

**What It Does**:

- Compensates for system audio input/output latency
- Ensures hit detection is accurate to actual playing time
- Saves the offset for all future sessions

## Technical Details

- **Web Audio API**: High-precision audio scheduling with 25ms lookahead
- **MediaDevices API**: Real-time microphone input processing
- **Scoring Algorithm**:
  - Best feasible error: ±18ms
  - Maximum scorable error: 220ms
  - Exponential scoring curve for timing accuracy
- **Calibration Requirements**:
  - Minimum 10 consistent hits
  - MAD threshold: 26ms (relaxed: 36ms)
  - 4 stable windows required

### Detector Regression Fixtures

- Sample under test: `src/features/microphone/__samples__/mic-taps.wav`
- Golden outputs: `src/features/microphone/__samples__/mic-taps.expected-hits.json`

The detector regression tests extract deterministic threshold/adaptive frame streams
directly from the WAV file at runtime, run parameter presets (`params -> expected hit list`),
and compare detector hit timestamps to fixed golden results with a small tolerance
window (currently `±15ms`).

Current extractor input format is WAV. If recordings arrive in another format (e.g. mp3),
convert once to WAV and keep the WAV fixture as the canonical test input.

When detector algorithms are intentionally changed:

1. Keep `mic-taps.wav` unchanged (or replace intentionally with review).
2. Recompute expected hits for each preset.
3. Update `mic-taps.expected-hits.json` in one commit with a short rationale.

## Browser Compatibility

Requires a modern browser with support for:

- Web Audio API
- MediaDevices API (getUserMedia)
- Local Storage

Tested on Chrome, Firefox, and Edge.

## File Structure

### Root Files

- `index.html` - Main application interface with four semantic pane sections
- `src/styles/theme.css` + `src/styles/globals.css` - Global theme tokens and app-wide layout styles
- `.nojekyll` - Prevents GitHub Pages from processing files through Jekyll

### Source Code (`src/`)

#### Main Orchestration

- `bootstrap.js` - Browser startup entrypoint
- `app-orchestrator.js` - Main application logic and pane coordination
- `pane-manager.js` - Navigation controller with hash-based routing and intelligent pane selection

#### Feature Modules

- `metronome.js` - High-precision Web Audio API-based metronome with lookahead scheduling
- `drill-plan.js` - Training plan parser, manager, and visualization
- `scorer.js` - Hit detection algorithm and per-measure scoring system
- `timeline.js` - Interactive visual timeline with beat markers and hit history
- `microphone-detector.js` - Audio input processing and real-time level analysis
- `calibration.js` - Automatic latency calibration system with statistical analysis
- `drill-history.js` - Session tracking and performance archive
- `storage-manager.js` - Local storage utilities for persistent state management

### Architecture Notes

**No External Dependencies**: Everything is vanilla JavaScript with no build tools required. The application runs directly from `file://` URLs without a web server.

**Global Scope Pattern**: All feature classes are instantiated in global scope (no ES6 modules) for maximum compatibility and simplicity.

**Event-Driven Architecture**: Components communicate via callbacks rather than direct dependencies, allowing loose coupling and independent testing.

## Deployment

### GitHub Pages

This project is configured for deployment on GitHub Pages:

1. **Push your code** to GitHub:

   ```bash
   git add .
   git commit -m "Prepare for GitHub Pages deployment"
   git push origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository on GitHub
   - Navigate to Settings → Pages
   - Under "Source", select the `main` branch
   - Click Save

3. **Access your app**: Your app will be available at `https://yourusername.github.io/tempo-trainer/`

The `.nojekyll` file ensures that GitHub Pages serves all files correctly without Jekyll processing.

## License

No specific license provided.
