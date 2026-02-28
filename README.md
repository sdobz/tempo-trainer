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

## Usage

### Basic Usage
1. Open `index.html` in a modern web browser
2. Set your desired BPM and time signature
3. Click **Start** to begin the metronome

### Training with Drill Plans
1. Select a preset plan or create a custom plan in the text area
2. Click **Start** to begin the drill
3. The metronome will automatically play and rest according to your plan

### Using Microphone Feedback
1. Click on the microphone selector to choose your input device
2. Grant microphone permissions when prompted
3. Adjust the threshold by clicking and dragging on the level meter
4. Start a drill and play along to see real-time scoring

### Calibrating Latency
1. Click **Start Calibration**
2. Play consistently along with the metronome clicks
3. Wait for the calibration to complete (shows confidence percentage)
4. The system will automatically apply the calculated offset to future drills

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

## Browser Compatibility

Requires a modern browser with support for:
- Web Audio API
- MediaDevices API (getUserMedia)
- Local Storage

Tested on Chrome, Firefox, and Edge.

## File Structure

- `index.html` - Main application interface
- `script.js` - Core application logic and audio processing
- `style.css` - Visual styling and dark theme

## License

No specific license provided.
