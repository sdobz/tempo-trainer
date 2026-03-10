# Onboarding Workflow

Onboarding prepares the runtime so performance feedback is trustworthy.

## Current flow

- User grants audio access through `audio-context-overlay`.
- Microphone device list and input monitoring are managed through `DetectorManager`.
- Calibration captures expected metronome beats and detected hits to estimate timing offset.
- Completion sets `tempoTrainer.hasCompletedOnboarding` in storage.

## Responsibilities

- Hardware readiness (audio context + input device).
- Detector sensitivity and mode setup.
- Calibration status that gates playback warning visibility.

## Known seam

Calibration timeline windowing and calibration metronome orchestration are currently implemented in `script.js`.