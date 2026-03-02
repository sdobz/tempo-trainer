// --- ESM Module Imports ---
import StorageManager from "./storage-manager.js";
import Calibration from "./calibration.js";
import Metronome from "./metronome.js";
import Scorer from "./scorer.js";
import MicrophoneDetector from "./microphone-detector.js";
import PlanLibrary from "./plan-library.js";
import DrillPlan from "./drill-plan.js";
import Timeline from "./timeline.js";
import PaneManager from "./pane-manager.js";
import PlanEditorUI from "./plan-editor-ui.js";
import HistoryDisplayUI from "./history-display-ui.js";
import PracticeSessionManager from "./practice-session-manager.js";
import DrillHistory from "./drill-history.js";

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const bpmInput = document.getElementById("bpm");
  const timeSignatureSelect = document.getElementById("time-signature");
  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  const beatIndicator = document.querySelector(".beat-indicator");
  const statusDiv = document.getElementById("status");
  const planVisualizationContainer = document.getElementById("plan-visualization-container");
  const overallScoreDisplay = document.getElementById("overall-score");
  const drillHistoryList = document.getElementById("drill-history-list");
  const timelineViewport = document.getElementById("timeline-viewport");
  const timelineTrack = document.getElementById("timeline-track");
  const completeOnboardingBtn = document.getElementById("complete-onboarding-btn");
  const startPlanPlayBtn = document.getElementById("start-plan-play-btn");
  const finishPlayBtn = document.getElementById("finish-play-btn");
  const backToPlanBtn = document.getElementById("back-to-plan-btn");

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
  const planLibrary = new PlanLibrary();
  const metronome = new Metronome(null);
  const drillPlan = new DrillPlan(planVisualizationContainer);
  const timeline = new Timeline(timelineViewport, timelineTrack);
  const scorer = new Scorer(
    parseInt(timeSignatureSelect.value.split("/")[0], 10),
    60.0 / parseInt(bpmInput.value, 10)
  );
  const drillHistory = new DrillHistory(drillHistoryList);
  const practiceSessionManager = new PracticeSessionManager();
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
  const planEditorUI = new PlanEditorUI(planLibrary, drillPlan, bpmInput, timeSignatureSelect);

  // --- Pane Manager (after DOM elements ready) ---
  const paneManager = new PaneManager();

  // --- History Display UI (after DOM elements ready) ---
  const drillHistoryListEl = document.getElementById("drill-history-list");
  const historyDisplayUI = new HistoryDisplayUI(drillHistoryListEl, planEditorUI, paneManager);

  // --- Setup Feature Callbacks ---

  drillPlan.onPlanChange((plan) => {
    scorer.setDrillPlan(plan);
    timeline.setDrillPlan(plan);
  });

  drillPlan.onMeasureClick((measureIndex) => {
    if (!metronome.isRunning) {
      const beatsPerMeasure = parseInt(timeSignatureSelect.value.split("/")[0], 10);
      timeline.centerAt(measureIndex * beatsPerMeasure);
    }
  });

  metronome.onBeat((beatInMeasure, time, timeUntilBeat) => {
    const measureType = drillPlan.getMeasureType(currentMeasureInTotal);

    if (measureType === "silent") {
      return false;
    }

    const clickInFreq = 660.0;
    const downbeatFreq = 880.0;
    const beatFreq = 440.0;
    const freq =
      measureType === "click-in" ? clickInFreq : beatInMeasure === 0 ? downbeatFreq : beatFreq;

    metronome.scheduleClick(time, freq);

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
        metronome.beatDuration
      );

      timeline.addDetection(detectedBeatPosition);
      scorer.registerHit(detectedBeatPosition);
    }

    if (calibration.isCalibrating) {
      calibration.registerHit(hitAudioTime);
    }
  });

  calibration.onStop(() => {
    // Update onboarding status after calibration completes
    updateOnboardingStatus();
  });

  //--- Onboarding Status Update ---

  function updateOnboardingStatus() {
    const micStatusEl = document.getElementById("mic-status");
    const calibStatusEl = document.getElementById("calibration-status-indicator");
    const micStepEl = document.getElementById("step-microphone");
    const calibStepEl = document.getElementById("step-calibration");

    // Check if microphone threshold has been adjusted (not default 52)
    const hasAdjustedThreshold = micDetector.threshold !== 52;
    if (micStatusEl) {
      if (hasAdjustedThreshold) {
        micStatusEl.textContent = "✓ Configured";
        micStatusEl.classList.add("complete");
      } else {
        micStatusEl.textContent = "⚠️ Not configured";
        micStatusEl.classList.remove("complete");
      }
    }
    if (micStepEl) {
      micStepEl.classList.toggle("complete", hasAdjustedThreshold);
    }

    // Check if calibration has been completed (non-zero offset)
    const hasCalibrated = calibration.getOffsetMs() !== 0;
    if (calibStatusEl) {
      if (hasCalibrated) {
        calibStatusEl.textContent = "✓ Calibrated";
        calibStatusEl.classList.add("complete");
      } else {
        calibStatusEl.textContent = "⚠️ Not calibrated";
        calibStatusEl.classList.remove("complete");
      }
    }
    if (calibStepEl) {
      calibStepEl.classList.toggle("complete", hasCalibrated);
    }
  }

  // --- Pane Navigation ---

  let hasInitialized = false;

  const updatePaneVisibility = async (pane) => {
    // Hide all panes
    document.querySelectorAll(".pane").forEach((el) => {
      el.style.display = "none";
    });

    // Show current pane
    const currentPaneEl = document.getElementById(`pane-${pane}`);
    if (currentPaneEl) {
      currentPaneEl.style.display = "block";
    }

    // Update nav button states
    document.querySelectorAll(".pane-link").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.pane === pane);
    });

    // Only start mic after app is fully initialized
    if (!hasInitialized) return;

    // Handle pane-specific setup
    if (pane === "onboarding") {
      // Update onboarding status indicators
      updateOnboardingStatus();

      // Ensure AudioContext exists for microphone access
      if (!audioContext) {
        try {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          metronome.audioContext = audioContext;
          micDetector.audioContext = audioContext;
          calibration.audioContext = audioContext;
        } catch (e) {
          console.error("Web Audio API not available:", e);
        }
      }

      // Start microphone detector to show levels and enumerate devices
      if (audioContext && !micDetector.isRunning) {
        try {
          await micDetector.start();
        } catch (err) {
          console.error("Failed to start microphone detector:", err);
        }
      }
    } else if (pane !== "plan-play" && micDetector.isRunning && !calibration.isCalibrating) {
      // Stop microphone detector when leaving onboarding (but not when going to play)
      // Keep it running during play
      micDetector.stop();
    }
  };

  paneManager.onPaneChange(updatePaneVisibility);

  // Don't show pane yet - wait for init() to set hasInitialized
  // Just hide all panes initially
  document.querySelectorAll(".pane").forEach((el) => {
    el.style.display = "none";
  });

  // Setup navigation button click handlers
  document.querySelectorAll("[data-pane]").forEach((btn) => {
    btn.addEventListener("click", () => {
      paneManager.navigate(btn.dataset.pane);
    });
  });

  // Override complete onboarding to set flag
  completeOnboardingBtn.addEventListener("click", () => {
    StorageManager.set("tempoTrainer.hasCompletedOnboarding", "true");
    paneManager.navigate("plan-edit");
  });

  // --- Event Listeners ---

  startBtn.addEventListener("click", startDrill);
  stopBtn.addEventListener("click", stopDrill);

  // Listen for microphone threshold adjustments
  const micLevelEl = document.getElementById("mic-level");
  if (micLevelEl) {
    micLevelEl.addEventListener("pointerup", () => {
      // Update onboarding status after threshold adjustment
      setTimeout(() => updateOnboardingStatus(), 100);
    });
  }

  // Intercept calibration button to ensure audioContext exists
  const calibrationBtn = document.getElementById("calibration-btn");
  if (calibrationBtn) {
    calibrationBtn.addEventListener(
      "click",
      async (e) => {
        if (!audioContext && !calibration.isCalibrating) {
          try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            metronome.audioContext = audioContext;
            micDetector.audioContext = audioContext;
            calibration.audioContext = audioContext;

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
      true
    );
  }

  bpmInput.addEventListener("input", () => {
    const bpm = parseInt(bpmInput.value, 10);
    metronome.setBPM(bpm);
    scorer.setBeatDuration(60.0 / bpm);
    calibration.setBeatDuration(60.0 / bpm);
  });

  timeSignatureSelect.addEventListener("change", () => {
    const beatsPerMeasure = parseInt(timeSignatureSelect.value.split("/")[0], 10);
    metronome.setTimeSignature(beatsPerMeasure);
    scorer.setBeatsPerMeasure(beatsPerMeasure);
    timeline.setBeatsPerMeasure(beatsPerMeasure);
    calibration.setBeatsPerMeasure(beatsPerMeasure);
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

    if (!micDetector.isRunning) {
      await micDetector.start();
    }

    const bpm = parseInt(bpmInput.value, 10);
    const beatsPerMeasure = parseInt(timeSignatureSelect.value.split("/")[0], 10);

    metronome.setBPM(bpm);
    metronome.setTimeSignature(beatsPerMeasure);
    scorer.setBeatsPerMeasure(beatsPerMeasure);
    scorer.setBeatDuration(60.0 / bpm);
    timeline.setBeatsPerMeasure(beatsPerMeasure);
    calibration.setBeatsPerMeasure(beatsPerMeasure);
    calibration.setBeatDuration(60.0 / bpm);

    // Plan is already parsed by planEditorUI when selected
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
      Math.round((scorer.lateHitAssignmentWindowBeats + 0.5) * metronome.beatDuration * 1000)
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

    // Save detailed session data with metrics and recommendations
    const sessionData = {
      plan: planEditorUI.getCurrentPlan(),
      bpm: parseInt(bpmInput.value, 10),
      timeSignature: timeSignatureSelect.value,
      completed,
      durationSeconds: elapsedSeconds,
      measureHits: scorer.measureHits,
      measureScores: scorer.getAllScores(),
      drillPlan: drillPlan.plan,
      overallScore: scorer.getOverallScore(),
    };

    const session = practiceSessionManager.saveSession(sessionData);

    // Update history display and navigate to history pane with expanded session
    if (session) {
      const allSessions = practiceSessionManager.getSessions();
      historyDisplayUI.displaySessions(allSessions, session.id);
      paneManager.navigate("plan-history");
    }

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

    // Initialize plan editor UI
    planEditorUI.init();

    // Determine which pane to show
    const hasCompletedOnboarding = StorageManager.get("tempoTrainer.hasCompletedOnboarding");
    const hasCalibration = calibration.getOffsetMs() !== 0;

    let initialPane = "onboarding";
    if (hasCompletedOnboarding) {
      initialPane = hasCalibration ? "plan-play" : "plan-edit";
    }

    timeline.centerAt(0);
    updateScoreDisplay();
    drillHistory.render();

    // Display existing sessions from history
    const sessions = practiceSessionManager.getSessions();
    if (sessions.length > 0) {
      historyDisplayUI.displaySessions(sessions);
    }

    statusDiv.textContent = "Ready.";

    // Mark initialization complete and navigate to initial pane
    // This will trigger updatePaneVisibility which will now handle mic setup
    hasInitialized = true;

    // Navigate to appropriate pane (will trigger paneChange which shows the pane)
    if (window.location.hash === "" || window.location.hash === "#") {
      paneManager.navigate(initialPane);
    } else {
      // Hash is already set, trigger updatePaneVisibility manually
      await updatePaneVisibility(paneManager.getCurrentPane());
    }
  }

  init();

  // Animation frame for timeline scrolling during playback
  function updateTimelineScroll() {
    // Keep timeline active during drill AND during grace period
    if ((metronome.isRunning || isCompletingRun) && audioContext) {
      const beatPosition = calibration.getCalibratedBeatPosition(
        audioContext.currentTime,
        timelineRunStartAudioTime,
        metronome.beatDuration
      );
      timeline.centerAt(beatPosition);
    }
    requestAnimationFrame(updateTimelineScroll);
  }
  updateTimelineScroll();
});
