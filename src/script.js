// --- ESM Module Imports ---
import StorageManager from "./storage-manager.js";
import Metronome from "./metronome.js";
import Scorer from "./scorer.js";
import MicrophoneDetector from "./microphone-detector.js";
import PlanLibrary from "./plan-library.js";
import DrillPlan from "./drill-plan.js";
import Timeline from "./timeline.js";
import PaneManager from "./pane-manager.js";
import PlanEditPane from "./components/plan-edit/plan-edit-pane.js";
import HistoryDisplayUI from "./history-display-ui.js";
import PracticeSessionManager from "./practice-session-manager.js";
import DrillHistory from "./drill-history.js";
import OnboardingPane from "./components/onboarding/onboarding-pane.js";
import CalibrationControl from "./components/calibration/calibration-control.js";
import {
  getElementByID,
  getElementBySelector,
  getAllElements,
  getInputElement,
  getSelectElement,
  getButtonElement,
} from "./dom-utils.js";

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const bpmInput = getInputElement("bpm");
  const timeSignatureSelect = getSelectElement("time-signature");
  const startBtn = getButtonElement("start-btn");
  const stopBtn = getButtonElement("stop-btn");
  const beatIndicator = /** @type {HTMLElement} */ (getElementBySelector(".beat-indicator"));
  const statusDiv = getElementByID("status");
  const planVisualizationContainer = getElementByID("plan-visualization-container");
  const overallScoreDisplay = getElementByID("overall-score");
  const drillHistoryList = /** @type {HTMLUListElement} */ (getElementByID("drill-history-list"));
  const timelineViewport = getElementByID("timeline-viewport");
  const timelineTrack = getElementByID("timeline-track");
  const onboardingPane = /** @type {OnboardingPane} */ (document.querySelector("onboarding-pane"));
  const planEditPane = /** @type {PlanEditPane} */ (document.querySelector("plan-edit-pane"));

  // --- Audio Context ---
  /** @type {AudioContext|null} */
  let audioContext = null;

  // --- Application State ---
  let currentMeasureInTotal = 0;
  /** @type {number|null} */
  let runStartedAt = null;
  let runFinalized = false;
  let isCompletingRun = false;
  /** @type {number|undefined} */
  let completionTimeoutId;
  let timelineRunStartAudioTime = 0;

  // --- Feature Instances ---
  const planLibrary = new PlanLibrary();
  const metronome = new Metronome(/** @type {AudioContext} */ (/** @type {unknown} */ (null)));
  const drillPlan = new DrillPlan(planVisualizationContainer);
  const timeline = new Timeline(timelineViewport, timelineTrack);
  const scorer = new Scorer(
    parseInt(timeSignatureSelect.value.split("/")[0], 10),
    60.0 / parseInt(bpmInput.value, 10)
  );
  const drillHistory = new DrillHistory(drillHistoryList);
  const practiceSessionManager = new PracticeSessionManager();

  // Wait for onboarding component to be ready
  let micDetector;
  let calibration;

  const onboardingReady = onboardingPane.componentReady.then(() => {
    // Get microphone detector from microphone-control sub-component
    if (onboardingPane.microphoneControl) {
      micDetector = onboardingPane.microphoneControl.micDetector;
    }

    // Get calibration instance from calibration-control sub-component
    if (onboardingPane.calibrationControl) {
      calibration = onboardingPane.calibrationControl.calibration;

      // Setup calibration callback
      calibration.onStop(() => {
        updateOnboardingStatus();
      });
    }

    // Setup microphone detector callback
    if (micDetector) {
      micDetector.onHit((/** @type {number} */ hitAudioTime) => {
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
    }
  });

  // --- Pane Manager (after DOM elements ready) ---
  const paneManager = new PaneManager();

  // --- History Display UI (after DOM elements ready) ---
  const drillHistoryListEl = drillHistoryList;
  const historyDisplayUI = new HistoryDisplayUI(drillHistoryListEl, planEditPane, paneManager);

  // --- Setup Feature Callbacks ---

  drillPlan.onPlanChange((/** @type {any[]} */ plan) => {
    scorer.setDrillPlan(plan);
    timeline.setDrillPlan(plan);
  });

  drillPlan.onMeasureClick((/** @type {number} */ measureIndex) => {
    if (!metronome.isRunning) {
      const beatsPerMeasure = parseInt(timeSignatureSelect.value.split("/")[0], 10);
      timeline.centerAt(measureIndex * beatsPerMeasure);
    }
  });

  metronome.onBeat(
    (
      /** @type {number} */ beatInMeasure,
      /** @type {number} */ time,
      /** @type {number} */ timeUntilBeat
    ) => {
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
        beatIndicator.textContent = String(beatNumber);
        beatIndicator.className = "beat-indicator";
        if (shouldShowBeat) {
          beatIndicator.classList.add(beatNumber === 1 ? "downbeat" : "active");
        }
      }, timeUntilBeat * 1000);

      return true;
    }
  );

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

  // Handle onboarding completion
  onboardingPane.addEventListener("complete", () => {
    paneManager.navigate("plan-edit");
  });

  //--- Onboarding Status Update ---

  function updateOnboardingStatus() {
    if (!micDetector || !calibration) return;

    // Check if microphone threshold has been adjusted (not default 52)
    const hasAdjustedThreshold = micDetector.threshold !== 52;

    // Check if calibration has been completed (non-zero offset)
    const hasCalibrated = calibration.getOffsetMs() !== 0;

    // Update component status
    onboardingPane.updateStatus(hasAdjustedThreshold, hasCalibrated);
  }

  // --- Pane Navigation ---

  let hasInitialized = false;

  /** @param {string} pane */
  const updatePaneVisibility = async (pane) => {
    // Hide all panes
    getAllElements(".pane").forEach((el) => {
      const paneEl = /** @type {HTMLElement} */ (el);
      paneEl.style.display = "none";
    });

    // Show current pane
    const currentPaneEl = getElementByID(`pane-${pane}`);
    currentPaneEl.style.display = "block";

    // Update nav button states
    getAllElements(".pane-link").forEach((btn) => {
      const buttonEl = /** @type {HTMLElement} */ (btn);
      buttonEl.classList.toggle("active", buttonEl.dataset.pane === pane);
    });

    // Only start mic after app is fully initialized
    if (!hasInitialized) return;

    // Handle pane-specific setup
    if (pane === "onboarding") {
      // Wait for onboarding component to be ready before accessing detectors
      await onboardingReady;

      // Update onboarding status indicators
      updateOnboardingStatus();

      // Ensure AudioContext exists for microphone access
      if (!audioContext) {
        try {
          const webkitWindow =
            /** @type {Window & { webkitAudioContext?: typeof AudioContext }} */ (window);
          const AudioContextClass = window.AudioContext || webkitWindow.webkitAudioContext;
          if (!AudioContextClass) {
            throw new Error("Web Audio API not available");
          }
          audioContext = new AudioContextClass();
          metronome.audioContext = audioContext;
          if (micDetector) micDetector.audioContext = audioContext;
          if (calibration) calibration.audioContext = audioContext;
        } catch (e) {
          console.error("Web Audio API not available:", e);
        }
      }

      // Start microphone detector to show levels and enumerate devices
      if (audioContext && micDetector && !micDetector.isRunning) {
        try {
          await micDetector.start();
        } catch (err) {
          console.error("Failed to start microphone detector:", err);
        }
      }
    } else if (
      pane !== "plan-play" &&
      micDetector &&
      micDetector.isRunning &&
      calibration &&
      !calibration.isCalibrating
    ) {
      // Stop microphone detector when leaving onboarding (but not when going to play)
      // Keep it running during play
      micDetector.stop();
    }
  };

  paneManager.onPaneChange(updatePaneVisibility);

  // Don't show pane yet - wait for init() to set hasInitialized
  // Just hide all panes initially
  getAllElements(".pane").forEach((el) => {
    const paneEl = /** @type {HTMLElement} */ (el);
    paneEl.style.display = "none";
  });

  // Setup navigation button click handlers
  getAllElements("[data-pane]").forEach((btn) => {
    const navEl = /** @type {HTMLElement} */ (btn);
    navEl.addEventListener("click", () => {
      paneManager.navigate(navEl.dataset.pane || "onboarding");
    });
  });

  // Override complete onboarding to set flag
  onboardingPane.componentReady.then(() => {
    if (onboardingPane.completeBtn) {
      onboardingPane.completeBtn.addEventListener("click", () => {
        StorageManager.set("tempoTrainer.hasCompletedOnboarding", "true");
        paneManager.navigate("plan-edit");
      });
    }
  });

  // --- Event Listeners ---

  startBtn.addEventListener("click", startDrill);
  stopBtn.addEventListener("click", stopDrill);

  // Listen for microphone threshold adjustments
  onboardingPane.componentReady.then(() => {
    if (onboardingPane.microphoneControl && onboardingPane.microphoneControl.level) {
      onboardingPane.microphoneControl.level.addEventListener("pointerup", () => {
        // Update onboarding status after threshold adjustment
        setTimeout(() => updateOnboardingStatus(), 100);
      });
    }
  });

  // Intercept calibration button to ensure audioContext exists
  onboardingPane.componentReady.then(() => {
    if (onboardingPane.calibrationControl && onboardingPane.calibrationControl.button) {
      onboardingPane.calibrationControl.button.addEventListener(
        "click",
        async (e) => {
          if (!audioContext && calibration && !calibration.isCalibrating) {
            try {
              const webkitWindow =
                /** @type {Window & { webkitAudioContext?: typeof AudioContext }} */ (window);
              const AudioContextClass = window.AudioContext || webkitWindow.webkitAudioContext;
              if (!AudioContextClass) {
                throw new Error("Web Audio API not available");
              }
              audioContext = new AudioContextClass();
              metronome.audioContext = audioContext;
              if (micDetector) micDetector.audioContext = audioContext;
              if (calibration) calibration.audioContext = audioContext;

              if (micDetector && !micDetector.isRunning) {
                await micDetector.start();
              }
            } catch {
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
  });

  bpmInput.addEventListener("input", () => {
    const bpm = parseInt(bpmInput.value, 10);
    metronome.setBPM(bpm);
    scorer.setBeatDuration(60.0 / bpm);
    if (calibration) calibration.setBeatDuration(60.0 / bpm);
  });

  timeSignatureSelect.addEventListener("change", () => {
    const beatsPerMeasure = parseInt(timeSignatureSelect.value.split("/")[0], 10);
    metronome.setTimeSignature(beatsPerMeasure);
    scorer.setBeatsPerMeasure(beatsPerMeasure);
    timeline.setBeatsPerMeasure(beatsPerMeasure);
    if (calibration) calibration.setBeatsPerMeasure(beatsPerMeasure);
  });

  // --- Main Functions ---

  async function startDrill() {
    if (calibration && calibration.isCalibrating) {
      calibration.stop("Calibration stopped: drill start requested.");
    }

    if (!audioContext) {
      try {
        const webkitWindow = /** @type {Window & { webkitAudioContext?: typeof AudioContext }} */ (
          window
        );
        const AudioContextClass = window.AudioContext || webkitWindow.webkitAudioContext;
        if (!AudioContextClass) {
          throw new Error("Web Audio API not available");
        }
        audioContext = new AudioContextClass();
        metronome.audioContext = audioContext;
        if (micDetector) micDetector.audioContext = audioContext;
        if (calibration) calibration.audioContext = audioContext;
      } catch {
        alert("Web Audio API is not supported in this browser");
        return;
      }
    }

    if (micDetector && !micDetector.isRunning) {
      await micDetector.start();
    }

    const bpm = parseInt(bpmInput.value, 10);
    const beatsPerMeasure = parseInt(timeSignatureSelect.value.split("/")[0], 10);

    metronome.setBPM(bpm);
    metronome.setTimeSignature(beatsPerMeasure);
    scorer.setBeatsPerMeasure(beatsPerMeasure);
    scorer.setBeatDuration(60.0 / bpm);
    timeline.setBeatsPerMeasure(beatsPerMeasure);
    if (calibration) {
      calibration.setBeatsPerMeasure(beatsPerMeasure);
      calibration.setBeatDuration(60.0 / bpm);
    }

    // Plan is already parsed by planEditPane when selected
    scorer.reset();
    drillPlan.updateAllScores(scorer.getAllScores().map((score) => score ?? 0));

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

  /** @param {boolean} completed */
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
    const currentPlan = planEditPane.getCurrentPlan();
    const sessionPlan = currentPlan
      ? {
          id: currentPlan.id || "",
          name: currentPlan.name,
          description: currentPlan.description || "",
          difficulty: currentPlan.difficulty || "",
          segments: currentPlan.segments,
        }
      : {
          id: "",
          name: "",
          description: "",
          difficulty: "",
          segments: [],
        };
    const sessionData = {
      plan: sessionPlan,
      bpm: parseInt(bpmInput.value, 10),
      timeSignature: timeSignatureSelect.value,
      completed,
      durationSeconds: elapsedSeconds,
      measureHits: scorer.measureHits,
      measureScores: scorer.getAllScores().map((score) => score ?? 0),
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
    drillPlan.updateAllScores(scorer.getAllScores().map((score) => score ?? 0));

    if (overallScoreDisplay) {
      const overall = scorer.getOverallScore();
      overallScoreDisplay.textContent = `Overall Score: ${String(overall).padStart(2, "0")}`;
    }
  }

  // --- Initialization ---

  async function init() {
    stopBtn.disabled = true;

    // Initialize plan editor pane
    if (planEditPane) {
      planEditPane.init(planLibrary, drillPlan, bpmInput, timeSignatureSelect);
    }

    // Determine which pane to show
    const hasCompletedOnboarding = StorageManager.get("tempoTrainer.hasCompletedOnboarding");
    const hasCalibration = calibration ? calibration.getOffsetMs() !== 0 : false;

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
      await updatePaneVisibility(paneManager.getCurrentPane() || "onboarding");
    }
  }

  init();

  // Animation frame for timeline scrolling during playback
  function updateTimelineScroll() {
    // Keep timeline active during drill AND during grace period
    if ((metronome.isRunning || isCompletingRun) && audioContext && calibration) {
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
