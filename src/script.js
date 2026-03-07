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
  const calibrationMetronome = new Metronome(
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
  detectorManager.setSessionBpm(sessionState.bpm);

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
    calibrationMetronome.audioContext = ctx;
    detectorManager.audioContext = ctx;
  });

  // Wait for components to be ready
  let calibration;
  let timeline; // Direct ref for imperative playback: centerAt, addDetection, clearDetections
  let calibrationTimeline;
  let drillSessionManager; // Will be initialized after all components ready
  let playPreviewActivationCleanup = null;
  let playPreviewActivationInFlight = false;

  const CALIBRATION_TIMELINE_WINDOW_MEASURES = 64;
  const CALIBRATION_TIMELINE_REBASE_MARGIN_MEASURES = 8;
  let calibrationTimelineWindowStartMeasure = 0;
  let calibrationTimelineRunStartAudioTime = 0;
  let calibrationTimelineActive = false;
  let calibrationTimelineRafId = null;

  const onboardingReady = onboardingPane.componentReady.then(() => {
    // Get calibration instance from calibration-control sub-component
    if (onboardingPane.calibrationControl) {
      calibration = onboardingPane.calibration;

      // AudioContext must reach calibration once created.
      // Done here (after onboardingReady) so the reference is valid.
      audioContextManager.onContextCreated((ctx) => {
        calibration.audioContext = ctx;
      });
    }

    const timelineEl = resolveCalibrationTimeline();
    if (timelineEl?.componentReady) {
      return timelineEl.componentReady;
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
    StorageManager.set("tempoTrainer.hasCompletedOnboarding", "true");
    paneManager.navigate("plan-edit");
  });

  onboardingPane.addEventListener(
    "setup-status-changed",
    (/** @type {CustomEvent} */ event) => {
      const { calibrated } = event.detail;
      planPlayPane.setCalibrationWarningVisible(!calibrated);
    },
  );

  const removeHitListener = detectorManager.addHitListener((hitAudioTime) => {
    const activeCalibrationTimeline = resolveCalibrationTimeline();

    timeline?.flashNowLine?.();
    activeCalibrationTimeline?.flashNowLine?.();

    if (!activeCalibrationTimeline) {
      return;
    }

    if (!calibrationTimelineActive) {
      startCalibrationTimeline();
    }

    const beatPosition = getCalibrationBeatPositionFromAudioTime(hitAudioTime);
    maybeRebaseCalibrationTimeline(beatPosition);
    activeCalibrationTimeline.addDetection(beatPosition);
  });

  async function ensurePlayPreviewMonitoring() {
    if (playPreviewActivationInFlight) return;
    if (detectorManager.isRunning) return;

    playPreviewActivationInFlight = true;
    try {
      await audioContextManager.ensureContext();
      if (!detectorManager.isRunning) {
        await detectorManager.start();
      }
      if (detectorManager.isRunning) {
        playPreviewActivationCleanup?.();
      }
    } catch {
      // Ignore startup failures here; session-start will surface actionable errors.
    } finally {
      playPreviewActivationInFlight = false;
    }
  }

  function bindPlayPreviewActivation() {
    if (playPreviewActivationCleanup || !planPlayPane) return;

    const onUserGesture = () => {
      ensurePlayPreviewMonitoring();
    };

    const eventTypes = ["pointerdown", "keydown", "touchstart"];
    eventTypes.forEach((type) => {
      planPlayPane.addEventListener(type, onUserGesture, { passive: true });
    });

    playPreviewActivationCleanup = () => {
      eventTypes.forEach((type) => {
        planPlayPane.removeEventListener(type, onUserGesture);
      });
      playPreviewActivationCleanup = null;
    };
  }

  onboardingPane.addEventListener(
    "calibration-start-request",
    async (/** @type {CustomEvent} */ event) => {
      if (calibration && calibration.isCalibrating) return;

      try {
        await audioContextManager.ensureContext();

        if (!detectorManager.isRunning) {
          await detectorManager.start();
        }
      } catch {
        alert("Web Audio API is not supported in this browser");
        event.preventDefault();
      }
    },
  );

  onboardingPane.addEventListener("calibration-state-changed", () => {
    if (calibration?.isCalibrating) {
      resolveCalibrationTimeline()?.clearDetections?.();
      startCalibrationMetronome();
    } else {
      stopCalibrationMetronome();
    }

    if (!calibrationTimeline || !calibrationTimelineActive) return;
    buildCalibrationTimelineWindow(calibrationTimelineWindowStartMeasure);
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

      if (audioContextManager.getContext()) {
        if (!detectorManager.isRunning) {
          try {
            await detectorManager.start();
          } catch {
            // Defer to explicit user gesture activation when auto-start fails.
          }
        }
      } else {
        bindPlayPreviewActivation();
      }
    }

    // Handle pane-specific setup
    if (pane === "onboarding") {
      playPreviewActivationCleanup?.();

      // Wait for onboarding component to be ready before accessing detectors
      await onboardingReady;
      onboardingPane.refreshSetupStatus();

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

      startCalibrationTimeline();

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
      stopCalibrationTimeline();
      stopCalibrationMetronome();
      // Stop microphone detector when leaving onboarding (but not when going to play)
      detectorManager.stop();
    } else {
      stopCalibrationTimeline();
      stopCalibrationMetronome();
      playPreviewActivationCleanup?.();
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

  // Setup BPM and time signature change handlers after plan-play pane is ready
  // NOTE: BPM/time-sig input listeners now live inside plan-play-pane (via consumeContext).

  function getCalibrationBeatPositionFromAudioTime(audioTime) {
    const beatDuration = sessionState.beatDuration;
    return Math.max(
      0,
      (audioTime - calibrationTimelineRunStartAudioTime) / beatDuration,
    );
  }

  function startCalibrationMetronome() {
    if (!calibrationMetronome.audioContext || !calibration) return;

    calibrationMetronome.stop();
    calibrationMetronome.setBPM(sessionState.bpm);
    calibrationMetronome.setTimeSignature(sessionState.beatsPerMeasure);
    calibrationMetronome.onBeat((beatInMeasure, time) => {
      if (!calibration.isCalibrating) return false;
      const freq = beatInMeasure === 0 ? 880.0 : 440.0;
      calibrationMetronome.scheduleClick(time, freq);
      calibration.registerExpectedBeat(time);
      return true;
    });
    calibrationMetronome.start();
    calibrationTimelineRunStartAudioTime = calibrationMetronome.nextNoteTime;
  }

  function stopCalibrationMetronome() {
    if (!calibrationMetronome.isRunning) return;
    calibrationMetronome.stop();
  }

  function buildCalibrationTimelineWindow(startMeasure) {
    const activeCalibrationTimeline = resolveCalibrationTimeline();
    if (!activeCalibrationTimeline) return;

    const beatsPerMeasure = sessionState.beatsPerMeasure;
    const measureType = calibration?.isCalibrating ? "click" : "silent";
    const plan = Array.from(
      { length: CALIBRATION_TIMELINE_WINDOW_MEASURES },
      () => ({ type: measureType }),
    );

    activeCalibrationTimeline.setBeatsPerMeasure(beatsPerMeasure);
    activeCalibrationTimeline.setDisplayStartBeat(
      startMeasure * beatsPerMeasure,
    );
    activeCalibrationTimeline.setDrillPlan(plan);
  }

  function maybeRebaseCalibrationTimeline(absoluteBeatPosition) {
    if (!resolveCalibrationTimeline()) return;

    const beatsPerMeasure = sessionState.beatsPerMeasure;
    const currentMeasure = Math.floor(absoluteBeatPosition / beatsPerMeasure);
    const minVisibleMeasure =
      calibrationTimelineWindowStartMeasure +
      CALIBRATION_TIMELINE_REBASE_MARGIN_MEASURES;
    const maxVisibleMeasure =
      calibrationTimelineWindowStartMeasure +
      CALIBRATION_TIMELINE_WINDOW_MEASURES -
      CALIBRATION_TIMELINE_REBASE_MARGIN_MEASURES;

    if (
      currentMeasure >= minVisibleMeasure &&
      currentMeasure <= maxVisibleMeasure
    ) {
      return;
    }

    const nextWindowStartMeasure = Math.max(
      0,
      currentMeasure - Math.floor(CALIBRATION_TIMELINE_WINDOW_MEASURES / 2),
    );

    if (nextWindowStartMeasure === calibrationTimelineWindowStartMeasure) {
      return;
    }

    calibrationTimelineWindowStartMeasure = nextWindowStartMeasure;
    buildCalibrationTimelineWindow(calibrationTimelineWindowStartMeasure);
  }

  function calibrationTimelineLoop() {
    if (!calibrationTimelineActive) return;

    const audioContext = audioContextManager.getContext();
    const activeCalibrationTimeline = resolveCalibrationTimeline();
    if (audioContext && activeCalibrationTimeline) {
      const beatPosition = getCalibrationBeatPositionFromAudioTime(
        audioContext.currentTime,
      );
      maybeRebaseCalibrationTimeline(beatPosition);
      activeCalibrationTimeline.centerAt(beatPosition);
    }

    calibrationTimelineRafId = requestAnimationFrame(calibrationTimelineLoop);
  }

  function startCalibrationTimeline() {
    const activeCalibrationTimeline = resolveCalibrationTimeline();
    if (!activeCalibrationTimeline || calibrationTimelineActive) return;

    const audioContext = audioContextManager.getContext();
    calibrationTimelineRunStartAudioTime = audioContext?.currentTime ?? 0;
    calibrationTimelineWindowStartMeasure = 0;
    calibrationTimelineActive = true;

    buildCalibrationTimelineWindow(calibrationTimelineWindowStartMeasure);
    activeCalibrationTimeline.clearDetections();

    calibrationTimelineRafId = requestAnimationFrame(calibrationTimelineLoop);
  }

  function stopCalibrationTimeline() {
    calibrationTimelineActive = false;
    if (calibrationTimelineRafId) {
      cancelAnimationFrame(calibrationTimelineRafId);
      calibrationTimelineRafId = null;
    }
  }

  function resolveCalibrationTimeline() {
    if (calibrationTimeline && calibrationTimeline.isConnected) {
      return calibrationTimeline;
    }

    calibrationTimeline = onboardingPane.querySelector(
      "[data-calibration-timeline]",
    );

    if (!calibrationTimeline && onboardingPane.calibrationControl) {
      calibrationTimeline = onboardingPane.calibrationControl.querySelector(
        "[data-calibration-timeline]",
      );
    }

    return calibrationTimeline;
  }

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
        calibrationMetronome.setBPM(bpm);
        scorer.setBeatDuration(60.0 / bpm);
        if (calibration) calibration.setBeatDuration(60.0 / bpm);
        detectorManager.setSessionBpm(bpm);
      },
      onBeatsPerMeasureChange: (n) => {
        metronome.setTimeSignature(n);
        calibrationMetronome.setTimeSignature(n);
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
    const hasCalibration = onboardingPane.hasCalibrationData();

    let initialPane = "onboarding";
    if (hasCompletedOnboarding) {
      initialPane = hasCalibration ? "plan-play" : "onboarding";
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

  globalThis.addEventListener("beforeunload", () => {
    removeHitListener();
    stopCalibrationTimeline();
  });
});
