// --- ESM Module Imports ---
import StorageManager from "./features/base/storage-manager.js";
import Metronome from "./features/plan-play/metronome.js";
import Scorer from "./features/plan-play/scorer.js";
import PlanLibrary from "./features/plan-edit/plan-library.js";
import PaneManager from "./features/base/pane-manager.js";
import AudioContextManager from "./features/base/audio-context-manager.js";
import DrillSessionManager from "./features/plan-play/drill-session-manager.js";
import "./features/plan-edit/plan-edit-pane.js";
import "./features/plan-play/plan-play-pane.js";
import "./features/plan-history/plan-history-pane.js";
import PracticeSessionManager from "./features/plan-history/practice-session-manager.js";
import "./features/onboarding/onboarding-pane.js";
import { getAllElements } from "./features/base/dom-utils.js";

/** @typedef {import("./features/plan-edit/plan-edit-pane.js").default} PlanEditPane */
/** @typedef {import("./features/plan-play/plan-play-pane.js").default} PlanPlayPane */
/** @typedef {import("./features/plan-history/plan-history-pane.js").default} PlanHistoryPane */
/** @typedef {import("./features/onboarding/onboarding-pane.js").default} OnboardingPane */

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const onboardingPane = /** @type {OnboardingPane} */ (document.querySelector("onboarding-pane"));
  const planEditPane = /** @type {PlanEditPane} */ (document.querySelector("plan-edit-pane"));
  const planHistoryPane = /** @type {PlanHistoryPane} */ (
    document.querySelector("plan-history-pane")
  );
  const planPlayPane = /** @type {PlanPlayPane} */ (document.querySelector("plan-play-pane"));

  // --- Feature Instances ---
  const planLibrary = new PlanLibrary();
  const metronome = new Metronome(/** @type {AudioContext} */ (/** @type {unknown} */ (null)));
  const scorer = new Scorer(4, 0.5); // Will be configured when session starts
  const practiceSessionManager = new PracticeSessionManager();
  const audioContextManager = new AudioContextManager();
  const paneManager = new PaneManager();

  // Wait for components to be ready
  let micDetector;
  let calibration;
  let drillPlan; // Will be initialized after plan-edit-pane is ready
  let timeline; // Will be initialized after plan-play-pane is ready
  let drillSessionManager; // Will be initialized after all components ready

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
  });

  const planEditReady = planEditPane.componentReady.then(() => {
    // Get the drill-plan-visualization component
    const drillPlanVizComponent = planEditPane.querySelector("drill-plan-visualization");
    if (!drillPlanVizComponent) {
      throw new Error("drill-plan-visualization component not found");
    }

    // Use the component directly
    drillPlan = drillPlanVizComponent;

    // Setup feature callbacks for drill plan
    drillPlan.onPlanChange((/** @type {any[]} */ plan) => {
      scorer.setDrillPlan(plan);
      timeline.setDrillPlan(plan);
    });

    drillPlan.onMeasureClick((/** @type {number} */ measureIndex) => {
      if (!metronome.isRunning) {
        const beatsPerMeasure = planPlayPane.getBeatsPerMeasure();
        timeline.centerAt(measureIndex * beatsPerMeasure);
      }
    });
  });

  const planPlayReady = planPlayPane.componentReady.then(() => {
    // Get the timeline-visualization component
    const timelineVizComponent = planPlayPane.querySelector("timeline-visualization");
    if (!timelineVizComponent) {
      throw new Error("timeline-visualization component not found");
    }

    // Use the component directly
    timeline = timelineVizComponent;

    // Initialize plan-play pane with dependencies
    planPlayPane.init(drillPlan, scorer);

    // Handle session start
    planPlayPane.addEventListener("session-start", async (/** @type {CustomEvent} */ event) => {
      const { bpm, beatsPerMeasure } = event.detail;

      // Ensure AudioContext exists
      try {
        const audioContext = await audioContextManager.ensureContext();
        audioContextManager.setContextForComponents(metronome, micDetector, calibration);

        // Start the drill session
        await drillSessionManager.startSession(bpm, beatsPerMeasure, audioContext);
        planPlayPane.setPlaying(true);
      } catch (error) {
        console.error("Failed to start session:", error);
        alert("Web Audio API is not supported in this browser");
      }
    });

    // Handle session stop
    planPlayPane.addEventListener("session-stop", () => {
      drillSessionManager.stopSession();
      planPlayPane.setPlaying(false);
      planPlayPane.clearBeatIndicator();
    });

    // Handle navigation
    planPlayPane.addEventListener("navigate", (/** @type {CustomEvent} */ event) => {
      const { pane, params } = event.detail;
      if (pane) {
        paneManager.navigate(pane, params || {});
      }
    });
  });

  // Initialize plan-history-pane event listeners
  const planHistoryReady = planHistoryPane.componentReady.then(() => {
    // Handle retry plan
    planHistoryPane.addEventListener("retry-plan", (/** @type {CustomEvent} */ event) => {
      const { plan } = event.detail;
      planEditPane.selectPlanByObject(plan);
      paneManager.navigate("plan-play");
    });

    // Handle navigation
    planHistoryPane.addEventListener("navigate", (/** @type {CustomEvent} */ event) => {
      const { pane } = event.detail;
      if (pane) {
        paneManager.navigate(pane);
      }
    });

    // Handle deleting a session from history
    planHistoryPane.addEventListener("delete-session", (/** @type {CustomEvent} */ event) => {
      const { sessionId } = event.detail;
      if (!sessionId) return;

      const deleted = practiceSessionManager.deleteSession(sessionId);
      if (!deleted) return;

      const allSessions = practiceSessionManager.getSessions();
      planHistoryPane.displaySessions(allSessions);
    });
  });

  // Handle onboarding completion
  onboardingPane.addEventListener("complete", () => {
    paneManager.navigate("plan-edit");
  });

  // Handle navigation from plan-edit-pane
  planEditPane.addEventListener("navigate", (/** @type {CustomEvent} */ event) => {
    const { pane } = event.detail;
    if (pane) {
      paneManager.navigate(pane);
    }
  });

  //--- Onboarding Status Update ---

  function updateOnboardingStatus() {
    if (!calibration) return;

    // Check if microphone threshold has been adjusted (not default 52)
    const hasAdjustedThreshold = micDetector ? micDetector.threshold !== 52 : false;

    // Check if calibration data exists in storage (offset can be legitimately 0 ms)
    const hasCalibrated =
      typeof calibration.hasCalibrationData === "function"
        ? calibration.hasCalibrationData()
        : calibration.getOffsetMs() !== 0;

    // Update component status
    onboardingPane.updateStatus(hasAdjustedThreshold, hasCalibrated);
    planPlayPane.setCalibrationWarningVisible(!hasCalibrated);
  }

  // --- Pane Navigation ---

  let hasInitialized = false;

  /** @param {string} pane */
  const updatePaneVisibility = async (pane) => {
    // Use PaneManager to handle DOM visibility
    paneManager.updateVisibility(pane);

    // Only start mic after app is fully initialized
    if (!hasInitialized) return;

    // Handle pane-specific setup
    if (pane === "onboarding") {
      // Wait for onboarding component to be ready before accessing detectors
      await onboardingReady;

      // Update onboarding status indicators
      updateOnboardingStatus();

      // Ensure AudioContext exists for microphone access
      try {
        await audioContextManager.ensureContext();
        audioContextManager.setContextForComponents(metronome, micDetector, calibration);
      } catch (e) {
        console.error("Web Audio API not available:", e);
      }

      // Start microphone detector to show levels and enumerate devices
      if (micDetector && !micDetector.isRunning) {
        try {
          await micDetector.start();
        } catch (err) {
          console.error("Failed to start microphone detector:", err);
        }
      }

      const params = paneManager.getCurrentParams();
      if (params.target === "calibration") {
        const calibrationStep = onboardingPane.querySelector("#step-calibration");
        if (calibrationStep && typeof calibrationStep.scrollIntoView === "function") {
          calibrationStep.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        const calibrationButton = onboardingPane.querySelector("[data-calibration-btn]");
        if (calibrationButton && typeof calibrationButton.focus === "function") {
          calibrationButton.focus();
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

  // Trigger callback for initial pane if already set
  const initialCurrentPane = paneManager.getCurrentPane();
  if (initialCurrentPane) {
    updatePaneVisibility(initialCurrentPane);
  }

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
          if (calibration && !calibration.isCalibrating) {
            try {
              await audioContextManager.ensureContext();
              audioContextManager.setContextForComponents(metronome, micDetector, calibration);

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

  // Setup BPM and time signature change handlers after plan-play pane is ready
  planPlayPane.componentReady.then(() => {
    planPlayPane.bpmInput.addEventListener("input", () => {
      const bpm = parseInt(planPlayPane.bpmInput.value, 10);
      metronome.setBPM(bpm);
      scorer.setBeatDuration(60.0 / bpm);
      if (calibration) calibration.setBeatDuration(60.0 / bpm);
    });

    planPlayPane.timeSignatureSelect.addEventListener("change", () => {
      const beatsPerMeasure = parseInt(planPlayPane.timeSignatureSelect.value.split("/")[0], 10);
      metronome.setTimeSignature(beatsPerMeasure);
      scorer.setBeatsPerMeasure(beatsPerMeasure);
      timeline.setBeatsPerMeasure(beatsPerMeasure);
      if (calibration) calibration.setBeatsPerMeasure(beatsPerMeasure);
    });
  });

  // --- Initialization ---

  async function init() {
    // Wait for all components to be ready
    await Promise.all([onboardingReady, planEditReady, planPlayReady, planHistoryReady]);

    // Create DrillSessionManager now that all components are ready
    drillSessionManager = new DrillSessionManager(
      metronome,
      scorer,
      timeline,
      drillPlan,
      calibration,
      micDetector
    );

    // Wire DrillSessionManager callbacks to UI
    drillSessionManager.onBeatUpdate((beatNum, _measureIndex, shouldShow) => {
      planPlayPane.updateBeatIndicator(beatNum, beatNum === 1, shouldShow);
    });

    drillSessionManager.onScoreUpdate((overallScore) => {
      planPlayPane.updateScore(overallScore);
    });

    drillSessionManager.onStatusUpdate((status) => {
      planPlayPane.setStatus(status);
    });

    drillSessionManager.onSessionComplete((sessionData) => {
      // Augment session data with plan info from plan editor
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

      const fullSessionData = {
        ...sessionData,
        plan: sessionPlan,
        bpm: planPlayPane.getBPM(),
        timeSignature: planPlayPane.timeSignatureSelect.value,
      };

      const session = practiceSessionManager.saveSession(fullSessionData);

      if (sessionData.completed) {
        planPlayPane.reset();
        scorer.reset();
        drillPlan.updateAllScores(scorer.getAllScores().map((score) => score ?? 0));
        drillPlan.setHighlight(-1);
        timeline.centerAt(0);
      }

      // Update history display and navigate to history pane with expanded session
      if (session) {
        const allSessions = practiceSessionManager.getSessions();
        planHistoryPane.displaySessions(allSessions, session.id);
        paneManager.navigate("plan-history");
      }
    });

    // Initialize plan editor pane
    if (planEditPane) {
      planEditPane.init(planLibrary, planPlayPane.bpmInput, planPlayPane.timeSignatureSelect);
    }

    // Determine which pane to show
    const hasCompletedOnboarding = StorageManager.get("tempoTrainer.hasCompletedOnboarding");
    const hasCalibration = calibration
      ? typeof calibration.hasCalibrationData === "function"
        ? calibration.hasCalibrationData()
        : calibration.getOffsetMs() !== 0
      : false;

    let initialPane = "onboarding";
    if (hasCompletedOnboarding) {
      initialPane = hasCalibration ? "plan-play" : "plan-edit";
    }

    // Initialize display
    timeline.centerAt(0);
    drillPlan.updateAllScores(scorer.getAllScores().map((score) => score ?? 0));
    planPlayPane.updateScore(scorer.getOverallScore());
    planPlayPane.setCalibrationWarningVisible(!hasCalibration);

    // Display existing sessions from history
    const sessions = practiceSessionManager.getSessions();
    if (sessions.length > 0) {
      planHistoryPane.displaySessions(sessions);
    }

    planPlayPane.setStatus("Ready.");

    // Mark initialization complete and navigate to initial pane
    // This will trigger updatePaneVisibility which will now handle mic setup
    hasInitialized = true;

    // Navigate to appropriate pane
    if (globalThis.location.hash === "" || globalThis.location.hash === "#") {
      // Keep URL state consistent, then force initial render in case pane manager
      // already has the same current pane and doesn't emit a change callback.
      paneManager.navigate(initialPane);
      await updatePaneVisibility(initialPane);
    } else {
      // Hash is already set, trigger updatePaneVisibility manually
      await updatePaneVisibility(paneManager.getCurrentPane() || "onboarding");
    }
  }

  init();

  // Animation frame for timeline scrolling during playback
  function updateTimelineScroll() {
    const audioContext = audioContextManager.getContext();
    if (drillSessionManager && audioContext) {
      drillSessionManager.updateTimelineScroll(audioContext);
    }
    requestAnimationFrame(updateTimelineScroll);
  }
  updateTimelineScroll();
});
