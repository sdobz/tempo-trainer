import StorageManager from "./features/base/storage-manager.js";
import DrillSessionManager from "./features/plan-play/drill-session-manager.js";
import CalibrationOrchestrator from "./features/calibration/calibration-orchestrator.js";
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
    chartService,
    performanceService,
    scorer,
    audioContextService,
    paneManager,
    timelineService,
    playbackService,
    detectorManager,
  } = mainRoot.getRuntime();

  let timeline;
  /** @type {DrillSessionManager|null} */
  let drillSessionManager = null;
  /** @type {CalibrationOrchestrator|null} */
  let calibrationOrchestrator = null;
  let playPreviewActivationCleanup = null;
  let playPreviewActivationInFlight = false;

  const onboardingReady = onboardingPane.componentReady;

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

        const deleted = performanceService.deleteSession(sessionId);
        if (!deleted) return;

        const allSessions = performanceService.getSessions();
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

  async function ensurePlayPreviewMonitoring() {
    if (playPreviewActivationInFlight) return;
    if (detectorManager.isRunning) return;
    if (!audioContextService.getContext()) return;

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
      await calibrationOrchestrator?.enterOnboarding();

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
    } else if (pane !== "plan-play") {
      calibrationOrchestrator?.leaveOnboarding({ stopDetector: true });
    } else {
      calibrationOrchestrator?.leaveOnboarding({ stopDetector: false });
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

  async function init() {
    await Promise.all([
      onboardingReady,
      planEditReady,
      planPlayReady,
      planHistoryReady,
    ]);

    calibrationOrchestrator = new CalibrationOrchestrator({
      onboardingPane,
      planTimeline: timeline,
      timelineService,
      playbackService,
      audioContextService,
      detectorManager,
    });

    drillSessionManager = new DrillSessionManager(
      playbackService,
      scorer,
      detectorManager,
      chartService,
      planPlayPane.playbackState,
      timelineService,
    );

    drillSessionManager.setVisualizer(timeline);
    const calibration = calibrationOrchestrator.getCalibration();
    drillSessionManager.setCalibration(calibration);
    if (calibration?.getCalibratedBeatPosition) {
      drillSessionManager.setBeatPositionMapper(
        (hitAudioTime, runStartAudioTime, beatDuration) =>
          calibration.getCalibratedBeatPosition(
            hitAudioTime,
            runStartAudioTime,
            beatDuration,
          ),
      );
    }
    drillSessionManager.attach(planPlayPane, { audioContextService });

    const applyChartPlanToScorer = (chart) => {
      const projected = chartService.projectChart(chart);
      scorer.setDrillPlan(projected.plan ?? []);
    };

    const selectedChart = chartService.getSelectedChart();
    if (selectedChart) {
      applyChartPlanToScorer(selectedChart);
    }

    chartService.addEventListener(
      "chart-selected",
      (/** @type {CustomEvent<{ chart: any }>} */ event) => {
        applyChartPlanToScorer(event.detail.chart);
      },
    );

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

      const session = performanceService.saveSession(fullSessionData);

      if (sessionData.completed) {
        planPlayPane.reset();
        scorer.reset();
      }

      if (session) {
        const allSessions = performanceService.getSessions();
        planHistoryPane.displaySessions(allSessions, session.id);
        paneManager.navigate("plan-history");
      }
    });

    const hasCompletedOnboarding = StorageManager.get(
      "tempoTrainer.hasCompletedOnboarding",
    );
    const hasCalibration = onboardingPane.hasCalibrationData();

    let initialPane = "onboarding";
    if (hasCompletedOnboarding) {
      initialPane = hasCalibration ? "plan-play" : "onboarding";
    }

    planPlayPane.reset();
    planPlayPane.setCalibrationWarningVisible(!hasCalibration);

    const sessions = performanceService.getSessions();
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
    drillSessionManager?.detach();
    calibrationOrchestrator?.dispose();
  });
}
