import StorageManager from "./features/base/storage-manager.js";
import DrillSessionManager from "./features/plan-play/drill-session-manager.js";
import { getAllElements } from "./features/component/dom-utils.js";

/** @typedef {import("./features/plan-edit/plan-edit-pane.js").default} PlanEditPane */
/** @typedef {import("./features/plan-play/plan-play-pane.js").default} PlanPlayPane */
/** @typedef {import("./features/plan-history/plan-history-pane.js").default} PlanHistoryPane */
/** @typedef {import("./features/onboarding/onboarding-pane.js").default} OnboardingPane */
/** @typedef {import("./features/main/main.js").default} TempoTrainerMain */

/**
 * App workflow orchestrator.
 * Wires pane intents and runtime service command routing.
 *
 * @param {TempoTrainerMain} mainRoot
 */
export function startAppOrchestrator(mainRoot) {
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

  const {
    planLibrary,
    metronome,
    calibrationMetronome,
    scorer,
    practiceSessionManager,
    audioContextService,
    paneManager,
    sessionState,
    timelineService,
    playbackService,
    detectorManager,
  } = mainRoot.getRuntime();

  let calibration;

  const applyAudioContext = () => {
    const ctx = audioContextService.getContext();
    if (!ctx) return false;
    playbackService.audioContext = ctx;
    metronome.audioContext = ctx;
    calibrationMetronome.audioContext = ctx;
    detectorManager.audioContext = ctx;
    if (calibration) {
      calibration.audioContext = ctx;
    }
    return true;
  };

  audioContextService.addEventListener("ready", applyAudioContext);
  applyAudioContext();

  // Wait for components to be ready
  let timeline;
  let calibrationTimeline;
  let drillSessionManager;
  let playPreviewActivationCleanup = null;
  let playPreviewActivationInFlight = false;

  const CALIBRATION_TIMELINE_WINDOW_MEASURES = 64;
  const CALIBRATION_TIMELINE_REBASE_MARGIN_MEASURES = 8;
  let calibrationTimelineWindowStartMeasure = 0;
  let calibrationTimelineRunStartAudioTime = 0;
  let calibrationTimelineActive = false;
  let calibrationTimelineRafId = null;

  const onboardingReady = onboardingPane.componentReady.then(() => {
    if (onboardingPane.calibrationControl) {
      calibration = onboardingPane.calibration;
      applyAudioContext();
    }

    const timelineEl = resolveCalibrationTimeline();
    if (timelineEl?.componentReady) {
      return timelineEl.componentReady;
    }
  });

  const planEditReady = planEditPane.componentReady;

  const planPlayReady = planPlayPane.componentReady.then(() => {
    const timelineVizComponent = planPlayPane.querySelector(
      "timeline-visualization",
    );
    if (!timelineVizComponent) {
      throw new Error("timeline-visualization component not found");
    }
    timeline = timelineVizComponent;

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

  const planHistoryReady = planHistoryPane.componentReady.then(() => {
    planHistoryPane.addEventListener(
      "retry-chart",
      (/** @type {CustomEvent} */ event) => {
        const { chart } = event.detail;
        planEditPane.selectChartByObject(chart);
        paneManager.navigate("plan-play");
      },
    );

    planHistoryPane.addEventListener(
      "navigate",
      (/** @type {CustomEvent} */ event) => {
        const { pane } = event.detail;
        if (pane) {
          paneManager.navigate(pane);
        }
      },
    );

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
    if (!applyAudioContext()) return;

    playPreviewActivationInFlight = true;
    try {
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
      if (!applyAudioContext()) {
        alert("Microphone access is required before calibration");
        event.preventDefault();
        return;
      }

      try {
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

  planEditPane.addEventListener(
    "navigate",
    (/** @type {CustomEvent} */ event) => {
      const { pane } = event.detail;
      if (pane) {
        paneManager.navigate(pane);
      }
    },
  );

  let hasInitialized = false;

  /** @param {string} pane */
  const updatePaneVisibility = async (pane) => {
    paneManager.updateVisibility(pane);

    if (!hasInitialized) return;

    if (pane === "plan-play") {
      timeline.centerAt(0);

      if (audioContextService.getContext()) {
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

    if (pane === "onboarding") {
      playPreviewActivationCleanup?.();

      await onboardingReady;
      onboardingPane.refreshSetupStatus();

      if (!applyAudioContext()) return;

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
      detectorManager.stop();
    } else {
      stopCalibrationTimeline();
      stopCalibrationMetronome();
      playPreviewActivationCleanup?.();
    }
  };

  paneManager.onPaneChange(updatePaneVisibility);
  paneManager.initialize();

  getAllElements("[data-pane]").forEach((btn) => {
    const navEl = /** @type {HTMLElement} */ (btn);
    navEl.addEventListener("click", () => {
      paneManager.navigate(navEl.dataset.pane || "onboarding");
    });
  });

  function getCalibrationBeatPositionFromAudioTime(audioTime) {
    const beatDuration = timelineService.beatDuration;
    return Math.max(
      0,
      (audioTime - calibrationTimelineRunStartAudioTime) / beatDuration,
    );
  }

  function startCalibrationMetronome() {
    if (!calibrationMetronome.audioContext || !calibration) return;

    calibrationMetronome.stop();
    calibrationMetronome.setBPM(timelineService.tempo);
    calibrationMetronome.setTimeSignature(timelineService.beatsPerMeasure);
    calibrationMetronome.onBeat((beatInMeasure, time) => {
      if (!calibration.isCalibrating) return false;
      const freq = beatInMeasure === 0 ? 880.0 : 440.0;
      playbackService.renderClick(time, { frequency: freq });
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

    const beatsPerMeasure = timelineService.beatsPerMeasure;
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

    const beatsPerMeasure = timelineService.beatsPerMeasure;
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

    const audioContext = audioContextService.getContext();
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

    const audioContext = audioContextService.getContext();
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

  async function init() {
    await Promise.all([
      onboardingReady,
      planEditReady,
      planPlayReady,
      planHistoryReady,
    ]);

    drillSessionManager = new DrillSessionManager(
      metronome,
      playbackService,
      scorer,
      timeline,
      calibration,
      detectorManager,
      sessionState,
      planPlayPane.playbackState,
      timelineService,
    );

    timelineService.addEventListener(
      "changed",
      (/** @type {CustomEvent} */ event) => {
        const { field, value } = event.detail;
        if (field === "tempo") {
          const bpm = /** @type {number} */ (value);
          metronome.setBPM(bpm);
          calibrationMetronome.setBPM(bpm);
          scorer.setBeatDuration(60.0 / bpm);
          if (calibration) calibration.setBeatDuration(60.0 / bpm);
          detectorManager.setSessionBpm(bpm);
        }
        if (field === "beatsPerMeasure") {
          const n = /** @type {number} */ (value);
          metronome.setTimeSignature(n);
          calibrationMetronome.setTimeSignature(n);
          scorer.setBeatsPerMeasure(n);
          if (calibration) calibration.setBeatsPerMeasure(n);
        }
      },
    );

    sessionState.subscribe({
      onPlanChange: (planData) => {
        const measures =
          planData?.plan ?? (Array.isArray(planData) ? planData : []);
        scorer.setDrillPlan(measures);
      },
    });

    metronome.setBPM(timelineService.tempo);
    metronome.setTimeSignature(timelineService.beatsPerMeasure);
    calibrationMetronome.setBPM(timelineService.tempo);
    calibrationMetronome.setTimeSignature(timelineService.beatsPerMeasure);
    scorer.setBeatDuration(timelineService.beatDuration);
    scorer.setBeatsPerMeasure(timelineService.beatsPerMeasure);
    detectorManager.setSessionBpm(timelineService.tempo);

    planPlayPane.addEventListener("session-start", async () => {
      try {
        const audioContext = audioContextService.getContext();
        if (!audioContext) {
          alert("Microphone access is required before starting a session");
          return;
        }
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

    drillSessionManager.onSessionComplete((sessionData) => {
      const currentPlan = planEditPane.getCurrentChart();
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
        bpm: timelineService.tempo,
        timeSignature: `${timelineService.beatsPerMeasure}/4`,
      };

      const session = practiceSessionManager.saveSession(fullSessionData);

      if (sessionData.completed) {
        planPlayPane.reset();
        scorer.reset();
      }

      if (session) {
        const allSessions = practiceSessionManager.getSessions();
        planHistoryPane.displaySessions(allSessions, session.id);
        paneManager.navigate("plan-history");
      }
    });

    if (planEditPane) {
      planEditPane.init(planLibrary);
    }

    const hasCompletedOnboarding = StorageManager.get(
      "tempoTrainer.hasCompletedOnboarding",
    );
    const hasCalibration = onboardingPane.hasCalibrationData();

    let initialPane = "onboarding";
    if (hasCompletedOnboarding) {
      initialPane = hasCalibration ? "plan-play" : "onboarding";
    }

    if (sessionState.plan) {
      sessionState.setPlan(sessionState.plan);
    }

    planPlayPane.reset();
    planPlayPane.setCalibrationWarningVisible(!hasCalibration);

    const sessions = practiceSessionManager.getSessions();
    if (sessions.length > 0) {
      planHistoryPane.displaySessions(sessions);
    }

    hasInitialized = true;

    if (globalThis.location.hash === "" || globalThis.location.hash === "#") {
      paneManager.navigate(initialPane);
      await updatePaneVisibility(initialPane);
    } else {
      await updatePaneVisibility(paneManager.getCurrentPane() || "onboarding");
    }
  }

  init();

  function updateTimelineScroll() {
    const audioContext = audioContextService.getContext();
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
}
