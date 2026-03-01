document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const bpmInput = document.getElementById("bpm");
  const timeSignatureSelect = document.getElementById("time-signature");
  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  const planSelect = document.getElementById("plan-select");
  const customPlanText = document.getElementById("custom-plan");
  const beatIndicator = document.querySelector(".beat-indicator");
  const statusDiv = document.getElementById("status");
  const planVisualizationContainer = document.getElementById(
    "plan-visualization-container",
  );
  const overallScoreDisplay = document.getElementById("overall-score");
  const drillHistoryList = document.getElementById("drill-history-list");
  const timelineViewport = document.getElementById("timeline-viewport");
  const timelineTrack = document.getElementById("timeline-track");

  // --- Audio Context ---
  let audioContext;

  // --- Application State ---
  let currentMeasureInTotal = 0;
  let runStartedAt = null;
  let runFinalized = false;
  let isCompletingRun = false;
  let completionTimeoutId;
  let timelineRunStartAudioTime = 0;

  // --- Feature Instances ---
  const metronome = new Metronome(null); // Will set audioContext on first start

  const drillPlan = new DrillPlan(planVisualizationContainer);

  const timeline = new Timeline(timelineViewport, timelineTrack);

  const scorer = new Scorer(
    parseInt(timeSignatureSelect.value.split("/")[0], 10),
    60.0 / parseInt(bpmInput.value, 10),
  );

  const drillHistory = new DrillHistory(drillHistoryList);

  const micDetector = new MicrophoneDetector(null, {
    level: document.getElementById("mic-level"),
    levelBar: document.getElementById("mic-level-bar"),
    peakHold: document.getElementById("mic-peak-hold"),
    thresholdLine: document.getElementById("hit-threshold-line"),
    thresholdLabel: document.getElementById("hit-threshold-label"),
    hitsList: document.getElementById("hits-list"),
    select: document.getElementById("mic-select"),
  });

  const calibration = new Calibration(null, {
    button: document.getElementById("calibration-btn"),
    status: document.getElementById("calibration-status"),
    result: document.getElementById("calibration-result"),
  });

  // --- Setup Feature Callbacks ---

  drillPlan.onPlanChange((plan) => {
    scorer.setDrillPlan(plan);
    timeline.setDrillPlan(plan);
  });

  drillPlan.onMeasureClick((measureIndex) => {
    if (!metronome.isRunning) {
      const beatsPerMeasure = parseInt(
        timeSignatureSelect.value.split("/")[0],
        10,
      );
      timeline.centerAt(measureIndex * beatsPerMeasure);
    }
  });

  metronome.onBeat((beatInMeasure, time, timeUntilBeat) => {
    const measureType = drillPlan.getMeasureType(currentMeasureInTotal);

    // Don't play for "silent" type
    if (measureType === "silent") {
      return false;
    }

    // Schedule audio
    const clickInFreq = 660.0;
    const downbeatFreq = 880.0;
    const beatFreq = 440.0;
    const freq =
      measureType === "click-in"
        ? clickInFreq
        : beatInMeasure === 0
          ? downbeatFreq
          : beatFreq;

    metronome.scheduleClick(time, freq);

    // Update UI
    const beatNumber = (beatInMeasure % metronome.beatsPerMeasure) + 1;
    const shouldShowBeat = measureType !== "silent";

    setTimeout(() => {
      if (!metronome.isRunning) return;
      beatIndicator.textContent = beatNumber;
      beatIndicator.className = "beat-indicator";
      if (shouldShowBeat) {
        beatIndicator.classList.add(beatNumber === 1 ? "downbeat" : "active");
      }
    }, timeUntilBeat * 1000);

    return true;
  });

  metronome.onMeasureComplete(() => {
    if (isCompletingRun) return;

    currentMeasureInTotal++;
    drillPlan.setHighlight(currentMeasureInTotal);

    // Finalize previous measures with lag
    const finalizedWithLagMeasureIndex = currentMeasureInTotal - 2;
    scorer.finalizeMeasure(finalizedWithLagMeasureIndex);
    updateScoreDisplay();

    if (currentMeasureInTotal >= drillPlan.getLength()) {
      handleDrillComplete();
    }
  });

  micDetector.onHit((hitAudioTime) => {
    // Accept hits during normal run or during completion grace period
    if (metronome.isRunning || isCompletingRun) {
      const detectedBeatPosition = calibration.getCalibratedBeatPosition(
        hitAudioTime,
        timelineRunStartAudioTime,
        metronome.beatDuration,
      );

      timeline.addDetection(detectedBeatPosition);
      scorer.registerHit(detectedBeatPosition);
    }

    if (calibration.isCalibrating) {
      calibration.registerHit(hitAudioTime);
    }
  });

  calibration.onStop(() => {
    // No action needed when calibration stops
  });

  // --- Event Listeners ---

  startBtn.addEventListener("click", startDrill);
  stopBtn.addEventListener("click", stopDrill);

  // Intercept calibration button to ensure audioContext exists
  const calibrationBtn = document.getElementById("calibration-btn");
  if (calibrationBtn) {
    calibrationBtn.addEventListener(
      "click",
      async (e) => {
        // Ensure audioContext is created before calibration starts
        if (!audioContext && !calibration.isCalibrating) {
          try {
            audioContext = new (
              window.AudioContext || window.webkitAudioContext
            )();
            metronome.audioContext = audioContext;
            micDetector.audioContext = audioContext;
            calibration.audioContext = audioContext;

            // Start microphone if not running
            if (!micDetector.isRunning) {
              await micDetector.start();
            }
          } catch (error) {
            alert("Web Audio API is not supported in this browser");
            e.stopPropagation();
            e.preventDefault();
            return;
          }
        }
      },
      true,
    ); // Use capture phase to run before Calibration's listener
  }

  bpmInput.addEventListener("input", () => {
    const bpm = parseInt(bpmInput.value, 10);
    metronome.setBPM(bpm);
    scorer.setBeatDuration(60.0 / bpm);
    calibration.setBeatDuration(60.0 / bpm);
  });

  timeSignatureSelect.addEventListener("change", () => {
    const beatsPerMeasure = parseInt(
      timeSignatureSelect.value.split("/")[0],
      10,
    );
    metronome.setTimeSignature(beatsPerMeasure);
    scorer.setBeatsPerMeasure(beatsPerMeasure);
    timeline.setBeatsPerMeasure(beatsPerMeasure);
    calibration.setBeatsPerMeasure(beatsPerMeasure);
  });

  planSelect.addEventListener("change", () => {
    if (planSelect.value !== "custom") {
      customPlanText.value = planSelect.value;
    }
    drillPlan.parse(customPlanText.value);
  });

  customPlanText.addEventListener("input", () => {
    drillPlan.parse(customPlanText.value);
  });

  // --- Main Functions ---

  async function startDrill() {
    if (calibration.isCalibrating) {
      calibration.stop("Calibration stopped: drill start requested.");
    }

    if (!audioContext) {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        metronome.audioContext = audioContext;
        micDetector.audioContext = audioContext;
        calibration.audioContext = audioContext;
      } catch (e) {
        alert("Web Audio API is not supported in this browser");
        return;
      }
    }

    // Start microphone if not already running
    if (!micDetector.isRunning) {
      await micDetector.start();
    }

    const bpm = parseInt(bpmInput.value, 10);
    const beatsPerMeasure = parseInt(
      timeSignatureSelect.value.split("/")[0],
      10,
    );

    metronome.setBPM(bpm);
    metronome.setTimeSignature(beatsPerMeasure);
    scorer.setBeatsPerMeasure(beatsPerMeasure);
    scorer.setBeatDuration(60.0 / bpm);
    timeline.setBeatsPerMeasure(beatsPerMeasure);
    calibration.setBeatsPerMeasure(beatsPerMeasure);
    calibration.setBeatDuration(60.0 / bpm);

    drillPlan.parse(customPlanText.value);
    scorer.reset();
    drillPlan.updateAllScores(scorer.getAllScores());

    currentMeasureInTotal = 0;
    runStartedAt = Date.now();
    runFinalized = false;
    isCompletingRun = false;
    timelineRunStartAudioTime = audioContext.currentTime;

    drillPlan.setHighlight(0);
    timeline.centerAt(0);

    metronome.start();

    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusDiv.textContent = "Running...";
  }

  function stopDrill() {
    if (completionTimeoutId) {
      window.clearTimeout(completionTimeoutId);
      completionTimeoutId = undefined;
    }

    isCompletingRun = false;
    finalizeRun(false);

    metronome.stop();

    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusDiv.textContent = "Stopped.";
    beatIndicator.textContent = "";
    beatIndicator.className = "beat-indicator";
    drillPlan.setHighlight(-1);
  }

  function handleDrillComplete() {
    isCompletingRun = true;
    metronome.stop();

    // Give extra time for final hits - need full late window plus some margin
    const finalHitGraceMs = Math.max(
      300,
      Math.round(
        (scorer.lateHitAssignmentWindowBeats + 0.5) *
          metronome.beatDuration *
          1000,
      ),
    );

    statusDiv.textContent = "Drill complete. Capturing final hits...";

    completionTimeoutId = window.setTimeout(() => {
      scorer.finalizeMeasure(drillPlan.getLength() - 2);
      scorer.finalizeMeasure(drillPlan.getLength() - 1);
      updateScoreDisplay();
      finalizeRun(true);

      isCompletingRun = false;
      completionTimeoutId = undefined;
      startBtn.disabled = false;
      stopBtn.disabled = true;
      beatIndicator.textContent = "";
      beatIndicator.className = "beat-indicator";
      drillPlan.setHighlight(-1);
      statusDiv.textContent = "Drill complete!";
    }, finalHitGraceMs);
  }

  function finalizeRun(completed) {
    if (runFinalized || drillPlan.getLength() === 0) return;

    for (let index = 0; index < drillPlan.getLength(); index++) {
      scorer.finalizeMeasure(index);
    }
    updateScoreDisplay();

    const elapsedSeconds = runStartedAt
      ? Math.max(0, Math.round((Date.now() - runStartedAt) / 1000))
      : 0;

    drillHistory.addEntry(completed, scorer.getOverallScore(), elapsedSeconds);
    runFinalized = true;
  }

  function updateScoreDisplay() {
    drillPlan.updateAllScores(scorer.getAllScores());

    if (overallScoreDisplay) {
      const overall = scorer.getOverallScore();
      overallScoreDisplay.textContent = `Overall Score: ${String(overall).padStart(2, "0")}`;
    }
  }

  // --- Initialization ---

  async function init() {
    stopBtn.disabled = true;

    // Don't create AudioContext here - it must be created after user gesture
    // AudioContext will be created when user clicks Start or Start Calibration

    drillPlan.parse(customPlanText.value);
    timeline.centerAt(0);
    updateScoreDisplay();
    drillHistory.render();
    statusDiv.textContent = "Ready.";
  }

  init();

  // Animation frame for timeline scrolling during playback
  function updateTimelineScroll() {
    // Keep timeline active during drill AND during grace period
    if ((metronome.isRunning || isCompletingRun) && audioContext) {
      const beatPosition = calibration.getCalibratedBeatPosition(
        audioContext.currentTime,
        timelineRunStartAudioTime,
        metronome.beatDuration,
      );
      timeline.centerAt(beatPosition);
    }
    requestAnimationFrame(updateTimelineScroll);
  }
  updateTimelineScroll();
});
