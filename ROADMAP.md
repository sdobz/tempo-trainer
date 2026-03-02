# Drum Tutor Development Roadmap

_A quantitative drum training system focused on measurable improvement_

---

# Vision

Build a browser-based drum tutor that:

- Quantifies timing accuracy with high fidelity
- Detects specific skill deficiencies (drift, consistency, rhythm, fatigue)
- Generates structured training schedules
- Tracks improvement across sessions
- Feels responsive and trustworthy (rhythm-game-level detection)

---

# System Philosophy

1. Accuracy before features
2. Signal quality before ML
3. Measurable improvement over gamification
4. Progressive overload like strength training
5. Long-term session analytics

---

# PHASE 1 — Reliable Hit Detection (Foundation)

## Goal

Achieve drum-kit-level onset detection fidelity.

## Replace RMS Detection With:

### 1. Spectral Flux Onset Detection

- FFT (1024 samples)
- Magnitude spectrum comparison
- Positive spectral flux calculation
- Peak picking with adaptive threshold

### 2. Adaptive Thresholding

- Rolling median of flux
- Median Absolute Deviation (MAD)
- Dynamic threshold = median + k \* MAD

### 3. Tempo-Scaled Refractory Period

```
minSeparation = beatDuration * 0.25
```

### 4. AudioWorklet Migration

- Move detection off main thread
- Timestamp at audio clock precision

## Deliverables

- Stable detection on full drum kit
- No double-triggering
- No cymbal wash false positives
- Reliable ghost note detection

---

# PHASE 2 — Instrument Classification

## Goal

Identify kick, snare, hi-hat independently.

## Approach

### Multi-Band Energy Analysis

| Instrument | Frequency Band |
| ---------- | -------------- |
| Kick       | 40–150 Hz      |
| Snare      | 150–4k Hz      |
| Hi-hat     | 5k–12k Hz      |

- Compute band energy from FFT
- Detect per-band transient
- Classify hit by dominant band energy spike

## Deliverables

- Per-limb scoring
- Backbeat accuracy detection
- Groove asymmetry metrics

---

# PHASE 3 — Advanced Timing Metrics

## 1. Drift Modeling

- Linear regression on hit timing error across measure
- Detect rushing vs dragging
- Severity tiers:
  - Low: <20ms
  - Medium: 20–50ms
  - High: >50ms

## 2. Subdivision Stability

- Measure IOI variance within measure
- Detect uneven 8ths / 16ths

## 3. Microtiming Bias

- Detect systematic early snare
- Detect late backbeat groove

## 4. Consistency Index

- Std dev of measure scores
- Flag instability

## Deliverables

- Detailed timing diagnostics
- Per-skill scoring breakdown

---

# PHASE 4 — Intelligent Scoring Model

## Replace Hard Cutoff With Probabilistic Curve

Instead of:

```
miss if outside window
```

Use:

```
score = exp(-(error^2) / (2 * sigma^2))
```

- Sigma scales with BPM
- Smooth score falloff
- Rhythm-game-grade feel

## Add Weighted Scoring

- Downbeats weighted higher
- Backbeats weighted high
- Ghost notes weighted lower

---

# PHASE 5 — Tempo Intelligence

## Real-Time Tempo Estimation

- Compute IOIs
- Median IOI per measure
- Compare against target BPM

Detect:

- Acceleration
- Deceleration
- Fill rushing
- Fatigue slowdown

## Dynamic Offset Correction

- Continuously refine latency calibration
- Adjust over session

---

# PHASE 6 — Longitudinal Progress Analytics

## Store Per Session:

- BPM
- All hit timestamps
- Per-measure scores
- Drift metrics
- Consistency index
- Instrument breakdown

## Derived Metrics Over Time

- Rolling 7-session average
- Skill-specific improvement slopes
- Plateau detection
- Fatigue sensitivity tracking

## Visualization

- Skill radar chart
- Accuracy vs BPM graph
- Consistency heatmap

---

# PHASE 7 — Training Engine

## Adaptive Training Scheduler

Inputs:

- Weakest metric
- Improvement slope
- Fatigue threshold
- Current skill ceiling

Outputs:

- Suggested BPM
- Suggested duration
- Suggested pattern focus

## Training Modes

### 1. Tempo Ladder

Increase BPM when:

- Accuracy > 85%
- Drift < 20ms
- Consistency stable

### 2. Subdivision Control

- 8th note stability drills
- 16th note isolation
- Triplet grid work

### 3. Limb Isolation

- Kick timing only
- Snare backbeat drill
- Hi-hat consistency drill

### 4. Groove Stability

- Long-session endurance
- Drift correction focus

---

# PHASE 8 — Quantitative Improvement Model

## Define Improvement As:

1. Reduced mean absolute timing error
2. Reduced drift slope
3. Reduced IOI variance
4. Increased BPM ceiling at 85%+ accuracy
5. Reduced performance decay over session

## Improvement Score

Weighted composite index:

- 30% accuracy
- 20% drift
- 20% consistency
- 20% tempo ceiling
- 10% endurance

Track monthly deltas.

---

# PHASE 9 — Expert-Level Features (Optional)

- Groove fingerprint analysis
- Style detection (swing vs straight)
- Ghost note density detection
- Dynamic range tracking
- AI-generated practice commentary
- Skill tree progression model

---

# Technical Architecture Summary

AudioWorklet
→ FFT
→ Spectral Flux
→ Adaptive Threshold
→ Multi-band Classification
→ Timestamp Queue
→ Scoring Engine
→ Session Storage
→ Analytics Engine
→ Training Recommender

---

# Milestone Order (Practical Build Order)

1. Spectral flux + adaptive threshold
2. AudioWorklet migration
3. Probabilistic scoring
4. Drift + IOI modeling
5. Multi-band classification
6. Longitudinal analytics
7. Adaptive scheduler

---

# Definition of Success

The system can:

- Detect real drum kit playing reliably
- Quantify timing issues precisely
- Show measurable improvement over weeks
- Recommend targeted training automatically
- Feel like a serious instrument, not a toy

---

# Long-Term Vision

A browser-based drum tutor that rivals:

- Rhythm games for detection fidelity
- Music conservatory pedagogy for structure
- Athletic training systems for measurable progression

Built in vanilla JS.
Fast.
Stable.
Long-lived.
