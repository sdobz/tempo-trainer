// --- ESM Module Imports ---
import StorageManager from "./features/base/storage-manager.js";
import SessionState, {
  SessionStateContext,
} from "./features/base/session-state.js";
import DetectorManager from "./features/microphone/detector-manager.js";
import { DetectorManagerContext } from "./features/microphone/detector-manager.js";
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
  const onboardingPane = /** @type {OnboardingPane} */ (
    document.querySelector("onboarding-pane")
  );
  const planEditPane = /** @type {PlanEditPane} */ (
    document.querySelector("plan-edit-pane")
  );
  const planHistoryPane = /** @type {PlanHistoryPane} */ (
    document.querySelector("plan-history-pane")
  );
  const planPlayPane = /** @type {PlanPlayPane} */ (
    document.querySelector("plan-play-pane")
  );

  // --- Feature Instances ---
  const planLibrary = new PlanLibrary();
  const metronome = new Metronome(
    /** @type {AudioContext} */ (/** @type {unknown} */ (null)),
  );
  const scorer = new Scorer(4, 0.5); // Will be configured when session starts
  const practiceSessionManager = new PracticeSessionManager();
  const audioContextManager = new AudioContextManager();
  const paneManager = new PaneManager();
  const sessionState = new SessionState(); // owns BPM, beatsPerMeasure, drill plan

  // Create DetectorManager and register as a global service before components mount.
  // Components call Services.get("detectorManager") in their onMount() hooks, which
  // run after template fetches complete — always after this synchronous registration.
  const detectorManager = new DetectorManager(StorageManager);

  // Provide SessionStateContext and DetectorManagerContext at document root.
  // Synchronous registration; runs before any component's async onMount().
  document.documentElement.addEventListener("context-request", (event) => {
    if (event.context === SessionStateContext) {
      event.stopPropagation();
      event.callback(sessionState);
    } else if (event.context === DetectorManagerContext) {
      event.stopPropagation();
      event.callback(detectorManager);
    }
  });

  // Register audioContextManager once. Wire it to dependent objects when the
  // AudioContext is first created — one call site instead of three.
  audioContextManager.onContextCreated((ctx) => {
    metronome.audioContext = ctx;
    detectorManager.audioContext = ctx;
  });

  // Wait for components to be ready
  let calibration;
  let timeline; // Direct ref for imperative playback: centerAt, addDetection, clearDetections
  let drillSessionManager; // Will be initialized after all components ready

  const onboardingReady = onboardingPane.componentReady.then(() => {
    // Get calibration instance from calibration-control sub-component
    if (onboardingPane.calibrationControl) {
      calibration = onboardingPane.calibration;

      // Setup calibration callback
      calibration.onStop(() => {
        updateOnboardingStatus();
      });

      // AudioContext must reach calibration once created.
      // Done here (after onboardingReady) so the reference is valid.
      audioContextManager.onContextCreated((ctx) => {
        calibration.audioContext = ctx;
      });
    }
  });

  const planEditReady = planEditPane.componentReady;

  const planPlayReady = planPlayPane.componentReady.then(() => {
    // Get the timeline-visualization component for imperative playback operations only
    const timelineVizComponent = planPlayPane.querySelector(
      "timeline-visualization",
    );
    if (!timelineVizComponent) {
      throw new Error("timeline-visualization component not found");
    }
    timeline = timelineVizComponent;

    // Handle navigation
    planPlayPane.addEventListener(
      "navigate",
      (/** @type {CustomEvent} */ event) => {
        const { pane, params } = event.detail;
        if (pane) {
          paneManager.navigate(pane, params || {});
        }
      },
    );
  });

  // Initialize plan-history-pane event listeners
  const planHistoryReady = planHistoryPane.componentReady.then(() => {
    // Handle retry plan
    planHistoryPane.addEventListener(
      "retry-plan",
      (/** @type {CustomEvent} */ event) => {
        const { plan } = event.detail;
        planEditPane.selectPlanByObject(plan);
        paneManager.navigate("plan-play");
      },
    );

    // Handle navigation
    planHistoryPane.addEventListener(
      "navigate",
      (/** @type {CustomEvent} */ event) => {
        const { pane } = event.detail;
        if (pane) {
          paneManager.navigate(pane);
        }
      },
    );

    // Handle deleting a session from history
    planHistoryPane.addEventListener(
      "delete-session",
      (/** @type {CustomEvent} */ event) => {
        const { sessionId } = event.detail;
        if (!sessionId) return;

        const deleted = practiceSessionManager.deleteSession(sessionId);
        if (!deleted) return;

        const allSessions = practiceSessionManager.getSessions();
        planHistoryPane.displaySessions(allSessions);
      },
    );
  });

  // Handle onboarding completion
  onboardingPane.addEventListener("complete", () => {
    paneManager.navigate("plan-edit");
  });

  // Handle navigation from plan-edit-pane
  planEditPane.addEventListener(
    "navigate",
    (/** @type {CustomEvent} */ event) => {
      const { pane } = event.detail;
      if (pane) {
        paneManager.navigate(pane);
      }
    },
  );

  //--- Onboarding Status Update ---

  function updateOnboardingStatus() {
    if (!calibration) return;

    // Check whether the user has explicitly adjusted sensitivity from the type-appropriate default
    // threshold detector default: 0.594 (= 1 - 52/128), adaptive default: 0.5
    const defaultSensitivity =
      detectorManager.getParams().type === "adaptive" ? 0.5 : 0.594;
    const hasAdjustedThreshold =
      Math.abs(detectorManager.sensitivity - defaultSensitivity) > 0.01;

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

    // Ensure play pane timeline and visualizer are populated when switching to play tab
    if (pane === "plan-play") {
      timeline.centerAt(0);
    }

    // Handle pane-specific setup
    if (pane === "onboarding") {
      // Wait for onboarding component to be ready before accessing detectors
      await onboardingReady;

      // Update onboarding status indicators
      updateOnboardingStatus();

      // Ensure AudioContext exists for microphone access
      try {
        await audioContextManager.ensureContext();
      } catch (e) {
        console.error("Web Audio API not available:", e);
      }

      // Start microphone detector to show levels and enumerate devices
      if (!detectorManager.isRunning) {
        try {
          await detectorManager.start();
        } catch (err) {
          console.error("Failed to start microphone detector:", err);
        }
      }

      const params = paneManager.getCurrentParams();
      if (params.target === "calibration") {
        const calibrationStep =
          onboardingPane.querySelector("#step-calibration");
        if (
          calibrationStep &&
          typeof calibrationStep.scrollIntoView === "function"
        ) {
          calibrationStep.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }

        const calibrationButton = onboardingPane.querySelector(
          "[data-calibration-btn]",
        );
        if (
          calibrationButton &&
          typeof calibrationButton.focus === "function"
        ) {
          calibrationButton.focus();
        }
      }
    } else if (
      pane !== "plan-play" &&
      detectorManager.isRunning &&
      calibration &&
      !calibration.isCalibrating
    ) {
      // Stop microphone detector when leaving onboarding (but not when going to play)
      detectorManager.stop();
    }
  };

  paneManager.onPaneChange(updatePaneVisibility);

  // Initialize pane manager after all callbacks are registered.
  // This reads the current URL hash and fires the first pane-change callback.
  // Must come after onPaneChange() registrations so listeners are in place.
  // NOTE: hasInitialized is still false here, so updatePaneVisibility returns
  // early — the actual first render happens at the end of init().
  paneManager.initialize();

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

  // Listen for microphone sensitivity adjustments
  onboardingPane.componentReady.then(() => {
    if (
      onboardingPane.microphoneControl &&
      onboardingPane.microphoneControl.level
    ) {
      onboardingPane.microphoneControl.level.addEventListener(
        "pointerup",
        () => {
          // Update onboarding status after sensitivity adjustment
          setTimeout(() => updateOnboardingStatus(), 100);
        },
      );
    }
  });

  // Intercept calibration button to ensure audioContext exists
  onboardingPane.componentReady.then(() => {
    if (
      onboardingPane.calibrationControl &&
      onboardingPane.calibrationControl.button
    ) {
      onboardingPane.calibrationControl.button.addEventListener(
        "click",
        async (e) => {
          if (calibration && !calibration.isCalibrating) {
            try {
              await audioContextManager.ensureContext();

              if (!detectorManager.isRunning) {
                await detectorManager.start();
              }
            } catch {
              alert("Web Audio API is not supported in this browser");
              e.stopPropagation();
              e.preventDefault();
              return;
            }
          }
        },
        true,
      );
    }
  });

  // Setup BPM and time signature change handlers after plan-play pane is ready
  // NOTE: BPM/time-sig input listeners now live inside plan-play-pane (via consumeContext).

  // --- Initialization ---

  async function init() {
    // Wait for all components to be ready
    await Promise.all([
      onboardingReady,
      planEditReady,
      planPlayReady,
      planHistoryReady,
    ]);

    // Create DrillSessionManager now that all components are ready
    drillSessionManager = new DrillSessionManager(
      metronome,
      scorer,
      timeline,
      calibration,
      detectorManager,
      sessionState,
      planPlayPane.playbackState,
    );

    // Wire SessionState subscribers — single fan-out for BPM and time signature.
    // plan-play-pane self-wires planData and beatsPerMeasure via consumeContext.
    sessionState.subscribe({
      onBPMChange: (bpm) => {
        metronome.setBPM(bpm);
        scorer.setBeatDuration(60.0 / bpm);
        if (calibration) calibration.setBeatDuration(60.0 / bpm);
      },
      onBeatsPerMeasureChange: (n) => {
        metronome.setTimeSignature(n);
        scorer.setBeatsPerMeasure(n);
        if (calibration) calibration.setBeatsPerMeasure(n);
      },
      onPlanChange: (planData) => {
        const measures =
          planData?.plan ?? (Array.isArray(planData) ? planData : []);
        scorer.setDrillPlan(measures);
      },
    });

    // Register session-start/stop here — drillSessionManager is guaranteed to be
    // defined at this point (constructed above), eliminating the late-binding hazard.
    planPlayPane.addEventListener("session-start", async () => {
      try {
        const audioContext = await audioContextManager.ensureContext();
        scorer.reset();
        await drillSessionManager.startSession(audioContext);
        planPlayPane.playbackState.update({ isPlaying: true });
      } catch (error) {
        console.error("Failed to start session:", error);
        alert("Web Audio API is not supported in this browser");
      }
    });

    planPlayPane.addEventListener("session-stop", () => {
      drillSessionManager.stopSession();
      planPlayPane.playbackState.update({ isPlaying: false });
    });

    // DrillSessionManager now updates PlaybackState directly for beat/highlight/score/status.

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
      }

      // Update history display and navigate to history pane with expanded session
      if (session) {
        const allSessions = practiceSessionManager.getSessions();
        planHistoryPane.displaySessions(allSessions, session.id);
        paneManager.navigate("plan-history");
      }
    });

    // Initialize plan editor pane — must be after Promise.all so planLibrary is ready
    if (planEditPane) {
      planEditPane.init(planLibrary);
    }

    // Determine which pane to show
    const hasCompletedOnboarding = StorageManager.get(
      "tempoTrainer.hasCompletedOnboarding",
    );
    const hasCalibration = calibration
      ? typeof calibration.hasCalibrationData === "function"
        ? calibration.hasCalibrationData()
        : calibration.getOffsetMs() !== 0
      : false;

    let initialPane = "onboarding";
    if (hasCompletedOnboarding) {
      initialPane = hasCalibration ? "plan-play" : "plan-edit";
    }

    // Initialize display — push current plan through SessionState so all subscribers
    // (scorer, timeline, planVisualizer) receive it via the subscription wired above.
    if (sessionState.plan) {
      sessionState.setPlan(sessionState.plan);
    }

    planPlayPane.reset();
    planPlayPane.setCalibrationWarningVisible(!hasCalibration);

    // Display existing sessions from history
    const sessions = practiceSessionManager.getSessions();
    if (sessions.length > 0) {
      planHistoryPane.displaySessions(sessions);
    }

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
