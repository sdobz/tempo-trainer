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

# PHASE 10 — Plan & Pedagogy Enhancement (Bonus Features)

_Optional features that enhance plan variety and learning experience. These are nice-to-have enhancements that complement phases 1-9._

## 10a: Variable Difficulty Patterns (High Priority)

### Variable BPM (Tempo Progression)

- Each segment can specify BPM increase/decrease
- Use Case: Gradual tempo building (e.g., 80 → 85 → 90 BPM)
- Benefits: Muscle memory at increasing speeds, common in classical/jazz pedagogy

### Progressive Silence (Click Track Fading)

- Gradually reduce metronome volume or beats per measure
- Use Case: Internalization training - learn to keep time without external clicks
- Example: Start with all 4 beats, then only 1 and 3, then only 1, then silence
- Benefits: Develops internal clock, crucial for live performance

### Time Signature Variations

- Different time signatures per segment
- Use Case: Polyrhythmic training, odd-time practice (3/4 → 4/4 → 5/4 → 7/8)
- Benefits: Advanced rhythm literacy, prepares for complex compositions

## 10b: Plan UI/UX (High Priority)

### Visual Pattern Preview

- Graphical timeline showing on/off/tempo/accent patterns before drill starts
- Benefits: Easier to understand complex patterns at a glance

### Plan Templates

- Preset structures that users fill in (e.g., "Pyramid", "Ladder", "Endurance")
- Benefits: Reduces cognitive load, standardizes effective practice patterns

### Plan Sharing (Export/Import)

- Export plans as shareable text/JSON, import from others
- Use Case: Teachers sharing exercises, online communities
- Benefits: Community building, standardized exercises

## 10c: Pedagogical Features (Medium Priority)

### Technique Focus Tags

- Tag plans with specific techniques (singles, doubles, paradiddles, etc.)
- Use Case: Filter plans by what you want to practice
- Benefits: Organized practice library, targeted improvement

### Guided Practice Mode

- On-screen instructions/tips during rest periods
- Use Case: Self-guided lessons with contextual coaching
- Benefits: Educational, keeps user engaged during rest

### Warmup & Cooldown Segments

- Special segment types with built-in patterns
- Use Case: Structured practice session start/end
- Example: 2-minute gradual tempo increase warmup, 1-minute cooldown
- Benefits: Injury prevention, holistic practice routine

## 10d: Audio Enhancements (Medium Priority)

### Custom Click Sounds

- Choose from multiple metronome sounds or upload custom
- Example: Wood block for jazz, electronic beep for EDM
- Benefits: Personalization, reduces ear fatigue

### Click Track Variations

- Different sounds for downbeat vs. other beats
- Benefits: Clearer musical context, easier to track position

---

# PHASE 11 — Advanced Features (Optional Nice-to-Have)

_Engagement and accessibility features that extend the platform._

### Practice Logging & Goals

- Track plan usage over time, set goals (e.g., "Complete this plan 5 times")
- Use Case: Long-term progress tracking, habit formation
- Benefits: Motivation, data-driven practice decisions

### Adaptive Difficulty (Auto-Progression)

- System adjusts BPM or rest periods based on scoring
- Example: If user scores >90% three times, suggest increasing BPM by 5
- Benefits: Optimal challenge level, prevents plateaus

### Achievements & Milestones

- Unlock badges for consistency, difficulty progression, accuracy
- Example: "7-Day Streak", "100 Plans Completed", "Expert Level Unlocked"
- Benefits: Increased engagement, long-term retention

### Cloud Sync & PWA (Technical)

- Optional account system to sync plans across devices
- Full offline functionality with installable app
- Benefits: Multi-device usage, backup safety, reliability

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

## Core Pathway (Phases 1-9)

1. Spectral flux + adaptive threshold
2. AudioWorklet migration
3. Probabilistic scoring
4. Drift + IOI modeling
5. Multi-band classification
6. Longitudinal analytics
7. Adaptive scheduler

## Enhancement Pathway (Phases 10-11, as time permits)

8. Variable BPM & Progressive Silence (Phase 10a)
9. Visual Pattern Preview & Plan Templates (Phase 10b)
10. Technique Tags & Guided Practice (Phase 10c)
11. Custom Click Sounds (Phase 10d)
12. Practice Logging & Adaptive Difficulty (Phase 11)
13. Achievements & Cloud Sync (Phase 11)

---

# Definition of Success (Core Phases 1-9)

The system can:

- Detect real drum kit playing reliably
- Quantify timing issues precisely
- Show measurable improvement over weeks
- Recommend targeted training automatically
- Feel like a serious instrument, not a toy

---

# Enhancement Goals (Phases 10-11)

With optional features:

- Provide varied, customizable practice experiences
- Scaffold learning with pedagogical guidance
- Build long-term engagement through community and progression tracking
- Rival commercial drum training platforms in usability and feature depth

---

# Feature Priority Matrix

| Feature | Phase | Priority | Impact | Effort |
|---------|-------|----------|--------|--------|
| Spectral flux detection | 1 | Critical | High | High |
| AudioWorklet migration | 1 | Critical | High | High |
| Drift/IOI metrics | 3 | Critical | High | Medium |
| Multi-band classification | 2 | High | Medium | High |
| Adaptive training scheduler | 7 | High | High | High |
| **Variable BPM** | **10a** | **High** | **Medium** | **Low** |
| **Visual Pattern Preview** | **10b** | **High** | **Medium** | **Low** |
| **Plan Templates** | **10b** | **High** | **Medium** | **Low** |
| **Technique Tags** | **10c** | **Medium** | **Medium** | **Low** |
| **Custom Click Sounds** | **10d** | **Medium** | **Low** | **Low** |
| Practice Logging | 11 | Medium | Medium | Medium |
| Gamification | 11 | Low | Low | Medium |
| Cloud Sync | 11 | Low | Low | High |

---

# Notes on Design Philosophy

**Core Hypothesis**: Accurate detection + measurable feedback = measurable improvement

**Enhancement Hypothesis**: Pedagogical variety + community features = sustained engagement

The core pathway (Phases 1-9) builds a solid foundation as a serious training tool. Enhancement features (Phases 10-11) add personality and engagement without compromising the core mission.

---

# Long-Term Vision

A browser-based drum tutor that rivals:

- Rhythm games for detection fidelity
- Music conservatory pedagogy for structure
- Athletic training systems for measurable progression
- Professional drum training platforms for feature depth and community

Built in vanilla JS.
Fast.
Stable.
Long-lived.
Community-driven.
