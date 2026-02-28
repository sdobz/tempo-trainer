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
  const micLevel = document.getElementById("mic-level");
  const micLevelBar = document.getElementById("mic-level-bar");
  const micPeakHold = document.getElementById("mic-peak-hold");
  const hitThresholdLine = document.getElementById("hit-threshold-line");
  const hitThresholdLabel = document.getElementById("hit-threshold-label");
  const hitsList = document.getElementById("hits-list");
  const calibrationBtn = document.getElementById("calibration-btn");
  const calibrationStatus = document.getElementById("calibration-status");
  const calibrationResult = document.getElementById("calibration-result");
  const micSelect = document.getElementById("mic-select");
  const timelineViewport = document.getElementById("timeline-viewport");
  const timelineTrack = document.getElementById("timeline-track");

  // --- Audio Context ---
  let audioContext;
  const lookahead = 25.0;
  const scheduleAheadTime = 0.1;

  // --- Metronome State ---
  let isRunning = false;
  let schedulerIntervalID;
  let nextNoteTime = 0.0;
  let currentBeatInMeasure = 0;
  let beatsPerMeasure = 4;
  let beatDuration = 0.5;

  // --- Drill State ---
  let drillPlan = [];
  let currentMeasureInTotal = 0;
  let measureScores = [];
  let measureHits = [];
  let finalizedMeasureScores = [];
  let drillHistory = [];
  let runStartedAt = null;
  let runFinalized = false;
  let isCompletingRun = false;
  let completionTimeoutId;

  // --- Mic Test State ---
  let isMicTestRunning = false;
  let micStream;
  let analyserNode;
  let dataArray;
  let lastHitTime = 0;
  let rafId;
  let hitThreshold = 52;
  let isAdjustingThreshold = false;
  let peakHoldValue = 0;
  let peakHoldUntil = 0;
  let lastDetectTime = 0;
  const thresholdStorageKey = "tempoTrainer.hitThreshold";
  const hitCooldown = 100; // ms
  const maxVisibleHits = 6;
  const peakHoldMs = 180;
  const peakFallPerSecond = 140;
  const calibrationStorageKey = "tempoTrainer.calibrationOffsetMs";
  const micDeviceStorageKey = "tempoTrainer.micDeviceId";
  let selectedMicDeviceId = "";

  // --- Calibration State ---
  let isCalibrating = false;
  let calibrationSchedulerIntervalID;
  let calibrationNextNoteTime = 0;
  let calibrationBeatInMeasure = 0;
  let calibrationExpectedBeats = [];
  let calibrationOffsetsMs = [];
  let calibrationGoodHits = 0;
  let calibrationStableWindows = 0;
  let calibrationConfidence = 0;
  let calibrationStartedAt = 0;
  let calibrationOffsetMs = 0;
  const calibrationMinHits = 10;
  const calibrationWindowSize = 12;
  const calibrationRequiredStableWindows = 4;
  const calibrationMinHitsRelaxed = 18;
  const calibrationConfidenceTarget = 100;
  const calibrationConfidenceRelaxedTarget = 65;
  const calibrationMaxDurationMs = 120000;
  const calibrationEarlyWindowMs = 180;
  const calibrationLateWindowMs = 420;
  const calibrationMadThresholdMs = 26;
  const calibrationDriftThresholdMs = 10;
  const calibrationMadRelaxedThresholdMs = 36;
  const calibrationDriftRelaxedThresholdMs = 18;

  // --- Timeline State ---
  const timelinePxPerBeat = 18;
  const defaultTimelineMeasures = 64;
  const timelineTailBeats = 1;
  const bestFeasibleErrorMs = 18;
  const maxScorableErrorMs = 220;
  const lateHitAssignmentWindowBeats = 0.65;
  let timelineRunStartAudioTime = 0;
  let timelineLastBeatPosition = 0;

  // --- Event Listeners ---
  startBtn.addEventListener("click", startStop);
  stopBtn.addEventListener("click", startStop);
  bpmInput.addEventListener("input", () => {
    beatDuration = 60.0 / parseInt(bpmInput.value, 10);
  });
  timeSignatureSelect.addEventListener("change", () => {
    beatsPerMeasure = parseInt(timeSignatureSelect.value.split("/")[0], 10);
  });
  planSelect.addEventListener("change", () => {
    if (planSelect.value !== "custom") {
      customPlanText.value = planSelect.value;
    }
    parseDrillPlan();
  });
  customPlanText.addEventListener("input", parseDrillPlan);
  micLevel.addEventListener("pointerdown", (event) => {
    isAdjustingThreshold = true;
    setThresholdFromPointer(event.clientX);
    if (micLevel.setPointerCapture) {
      micLevel.setPointerCapture(event.pointerId);
    }
  });
  micLevel.addEventListener("pointermove", (event) => {
    if (!isAdjustingThreshold) return;
    setThresholdFromPointer(event.clientX);
  });
  window.addEventListener("pointerup", () => {
    isAdjustingThreshold = false;
  });
  if (calibrationBtn) {
    calibrationBtn.addEventListener("click", toggleCalibration);
  }
  if (micSelect) {
    micSelect.addEventListener("change", onMicSelectionChanged);
  }

  // --- Metronome Functions ---
  function startStop() {
    if (isCalibrating) {
      stopCalibration("Calibration stopped: drill start requested.");
    }
    if (isRunning) {
      // Stop
      if (completionTimeoutId) {
        window.clearTimeout(completionTimeoutId);
        completionTimeoutId = undefined;
      }
      isCompletingRun = false;
      finalizeRunScoring(false);
      window.clearInterval(schedulerIntervalID);
      isRunning = false;
      startBtn.disabled = false;
      stopBtn.disabled = true;
      statusDiv.textContent = "Stopped.";
      beatIndicator.textContent = "";
      beatIndicator.className = "beat-indicator";
      updateVisualizationHighlight(-1);
    } else {
      // Start
      if (!audioContext) {
        try {
          audioContext = new (
            window.AudioContext || window.webkitAudioContext
          )();
        } catch (e) {
          alert("Web Audio API is not supported in this browser");
          return;
        }
      }
      audioContext.resume();

      isRunning = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;

      beatDuration = 60.0 / parseInt(bpmInput.value, 10);
      beatsPerMeasure = parseInt(timeSignatureSelect.value.split("/")[0], 10);

      nextNoteTime = audioContext.currentTime + 0.1;
      currentBeatInMeasure = 0;
      currentMeasureInTotal = 0;
      runStartedAt = Date.now();
      runFinalized = false;
      isCompletingRun = false;

      parseDrillPlan();
      resetRunScoring();
      updateVisualizationHighlight(0);
      timelineRunStartAudioTime = audioContext.currentTime;
      timelineLastBeatPosition = 0;
      centerTimelineAtBeat(0);

      schedulerIntervalID = window.setInterval(scheduler, lookahead);
      statusDiv.textContent = "Running...";
    }
  }

  function median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
  }

  function mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function computeMad(values, medianValue) {
    if (values.length === 0) return 0;
    const absDeviations = values.map((value) => Math.abs(value - medianValue));
    return median(absDeviations);
  }

  function setCalibrationStatus(message) {
    if (calibrationStatus) {
      calibrationStatus.textContent = message;
    }
  }

  function setCalibrationResult(message) {
    if (calibrationResult) {
      calibrationResult.textContent = message;
    }
  }

  function updateCalibrationResultLabel() {
    const roundedOffset = Math.round(calibrationOffsetMs);
    setCalibrationResult(`Offset compensation: ${roundedOffset} ms`);
  }

  function toggleCalibration() {
    if (isCalibrating) {
      stopCalibration("Calibration stopped by user.");
      return;
    }
    startCalibration();
  }

  function scheduleCalibrationClick(time) {
    const isDownbeat = calibrationBeatInMeasure === 0;
    const freq = isDownbeat ? 880.0 : 440.0;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.00001, time + 0.05);
    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(time);
    osc.stop(time + 0.05);

    calibrationExpectedBeats.push({ time, matched: false });
    calibrationBeatInMeasure = (calibrationBeatInMeasure + 1) % beatsPerMeasure;
  }

  function calibrationScheduler() {
    while (
      calibrationNextNoteTime <
      audioContext.currentTime + scheduleAheadTime
    ) {
      scheduleCalibrationClick(calibrationNextNoteTime);
      calibrationNextNoteTime += beatDuration;
    }

    const staleBefore = audioContext.currentTime - 1.5;
    calibrationExpectedBeats = calibrationExpectedBeats.filter(
      (entry) => entry.time >= staleBefore || !entry.matched,
    );

    if (Date.now() - calibrationStartedAt > calibrationMaxDurationMs) {
      stopCalibration(
        calibrationGoodHits >= calibrationMinHits
          ? "Calibration ended on time limit with best estimate."
          : "Calibration timed out before enough consistent hits.",
      );
    }
  }

  async function startCalibration() {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      await audioContext.resume();

      if (!isMicTestRunning) {
        await startMicTest();
      }

      if (isRunning) {
        startStop();
      }

      beatDuration = 60.0 / parseInt(bpmInput.value, 10);
      beatsPerMeasure = parseInt(timeSignatureSelect.value.split("/")[0], 10);

      isCalibrating = true;
      calibrationGoodHits = 0;
      calibrationStableWindows = 0;
      calibrationConfidence = 0;
      calibrationOffsetsMs = [];
      calibrationExpectedBeats = [];
      calibrationBeatInMeasure = 0;
      calibrationNextNoteTime = audioContext.currentTime + 0.1;
      calibrationStartedAt = Date.now();

      if (calibrationBtn) {
        calibrationBtn.textContent = "Stop Calibration";
      }
      setCalibrationStatus(
        "Calibration running: play along with clicks. Needs ≥10 hits, then confidence builds until stable.",
      );

      calibrationSchedulerIntervalID = window.setInterval(
        calibrationScheduler,
        lookahead,
      );
    } catch (_error) {
      setCalibrationStatus(
        "Calibration failed to start: microphone or audio unavailable.",
      );
    }
  }

  function stopCalibration(message) {
    if (calibrationSchedulerIntervalID) {
      window.clearInterval(calibrationSchedulerIntervalID);
      calibrationSchedulerIntervalID = undefined;
    }
    isCalibrating = false;
    if (calibrationBtn) {
      calibrationBtn.textContent = "Start Calibration";
    }
    setCalibrationStatus(message);
    updateCalibrationResultLabel();
  }

  function maybeFinishCalibration() {
    if (calibrationGoodHits < calibrationMinHits) {
      setCalibrationStatus(
        `Calibration: hits ${calibrationGoodHits}/${calibrationMinHits} | learning timing pattern...`,
      );
      return;
    }

    const recentOffsets = calibrationOffsetsMs.slice(-calibrationWindowSize);
    if (recentOffsets.length < 8) {
      return;
    }

    const recentMedian = median(recentOffsets);
    const recentMad = computeMad(recentOffsets, recentMedian);
    const previousOffsets = calibrationOffsetsMs.slice(
      -calibrationWindowSize * 2,
      -calibrationWindowSize,
    );
    const previousMean =
      previousOffsets.length > 0 ? mean(previousOffsets) : recentMedian;
    const driftMs = Math.abs(recentMedian - previousMean);

    const strictStable =
      recentMad <= calibrationMadThresholdMs &&
      driftMs <= calibrationDriftThresholdMs;
    const relaxedStable =
      recentMad <= calibrationMadRelaxedThresholdMs &&
      driftMs <= calibrationDriftRelaxedThresholdMs;

    if (strictStable) {
      calibrationStableWindows++;
      calibrationConfidence = Math.min(
        calibrationConfidenceTarget,
        calibrationConfidence + 14,
      );
    } else if (relaxedStable) {
      calibrationStableWindows = Math.max(0, calibrationStableWindows - 1);
      calibrationConfidence = Math.min(
        calibrationConfidenceTarget,
        calibrationConfidence + 7,
      );
    } else {
      calibrationStableWindows = Math.max(0, calibrationStableWindows - 1);
      calibrationConfidence = Math.max(0, calibrationConfidence - 4);
    }

    calibrationOffsetMs = recentMedian;
    try {
      localStorage.setItem(calibrationStorageKey, String(calibrationOffsetMs));
    } catch (_err) {}

    const stabilityPercent = Math.round(calibrationConfidence);

    setCalibrationStatus(
      `Calibration: hits ${calibrationGoodHits}/${calibrationMinHits}+ | median ${Math.round(recentMedian)} ms | spread ${Math.round(recentMad)} ms | confidence ${stabilityPercent}%`,
    );

    const strictDone =
      calibrationStableWindows >= calibrationRequiredStableWindows &&
      calibrationConfidence >= calibrationConfidenceTarget;
    const relaxedDone =
      calibrationGoodHits >= calibrationMinHitsRelaxed &&
      calibrationConfidence >= calibrationConfidenceRelaxedTarget;

    if (strictDone || relaxedDone) {
      stopCalibration("Calibration complete: stable offset acquired.");
    }
  }

  function registerCalibrationHit(hitAudioTime) {
    if (!isCalibrating) return;

    let bestIndex = -1;
    let bestDistanceMs = Number.POSITIVE_INFINITY;
    let bestOffsetMs = 0;

    calibrationExpectedBeats.forEach((entry, index) => {
      if (entry.matched) return;
      const offsetMs = (hitAudioTime - entry.time) * 1000;
      if (
        offsetMs < -calibrationEarlyWindowMs ||
        offsetMs > calibrationLateWindowMs
      ) {
        return;
      }

      const distanceMs = Math.abs(offsetMs);
      if (distanceMs < bestDistanceMs) {
        bestDistanceMs = distanceMs;
        bestIndex = index;
        bestOffsetMs = offsetMs;
      }
    });

    if (bestIndex === -1) {
      return;
    }

    calibrationExpectedBeats[bestIndex].matched = true;
    calibrationOffsetsMs.push(bestOffsetMs);
    calibrationGoodHits++;
    maybeFinishCalibration();
  }

  function getCalibratedBeatPosition(audioTime) {
    const rawBeatPosition =
      (audioTime - timelineRunStartAudioTime) / beatDuration;
    const offsetBeats = calibrationOffsetMs / (beatDuration * 1000);
    return Math.max(0, rawBeatPosition - offsetBeats);
  }

  function scheduler() {
    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) {
      scheduleNote(nextNoteTime);
      updateBeat();
    }
  }

  function scheduleNote(time) {
    const currentMeasureType =
      drillPlan[currentMeasureInTotal]?.type || "click";

    // Don't play for "silent" type, but always play for "click" and "click-in"
    if (currentMeasureType === "silent") {
      return;
    }

    const isDownbeat = currentBeatInMeasure === 0;
    const clickInFreq = 660.0;
    const downbeatFreq = 880.0;
    const beatFreq = 440.0;
    const freq =
      currentMeasureType === "click-in"
        ? clickInFreq
        : isDownbeat
          ? downbeatFreq
          : beatFreq;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.00001, time + 0.05);
    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(time);
    osc.stop(time + 0.05);
  }

  function updateBeat() {
    if (isCompletingRun) {
      return;
    }

    const beatNumber = (currentBeatInMeasure % beatsPerMeasure) + 1;
    const currentMeasureType =
      drillPlan[currentMeasureInTotal]?.type || "click";
    const shouldShowBeat = currentMeasureType !== "silent";

    const timeUntilBeat = (nextNoteTime - audioContext.currentTime) * 1000;
    setTimeout(() => {
      if (!isRunning) return;
      beatIndicator.textContent = beatNumber;
      beatIndicator.className = "beat-indicator";
      if (shouldShowBeat) {
        beatIndicator.classList.add(beatNumber === 1 ? "downbeat" : "active");
      }
    }, timeUntilBeat);

    nextNoteTime += beatDuration;
    currentBeatInMeasure++;

    if (currentBeatInMeasure >= beatsPerMeasure) {
      currentBeatInMeasure = 0;
      currentMeasureInTotal++;
      updateVisualizationHighlight(currentMeasureInTotal);

      const finalizedWithLagMeasureIndex = currentMeasureInTotal - 2;
      finalizeMeasureScore(finalizedWithLagMeasureIndex);
      updateOverallScoreDisplay();

      if (currentMeasureInTotal >= drillPlan.length) {
        isCompletingRun = true;
        window.clearInterval(schedulerIntervalID);
        schedulerIntervalID = undefined;

        const finalHitGraceMs = Math.max(
          160,
          Math.round(
            (lateHitAssignmentWindowBeats + 0.15) * beatDuration * 1000,
          ),
        );
        statusDiv.textContent = "Drill complete. Capturing final hits...";

        completionTimeoutId = window.setTimeout(() => {
          finalizeMeasureScore(drillPlan.length - 2);
          finalizeMeasureScore(drillPlan.length - 1);
          updateOverallScoreDisplay();
          finalizeRunScoring(true);

          isRunning = false;
          isCompletingRun = false;
          completionTimeoutId = undefined;
          startBtn.disabled = false;
          stopBtn.disabled = true;
          beatIndicator.textContent = "";
          beatIndicator.className = "beat-indicator";
          updateVisualizationHighlight(-1);
          statusDiv.textContent = "Drill complete!";
        }, finalHitGraceMs);
      }
    }
  }

  // --- Drill Functions ---
  function parseDrillPlan() {
    drillPlan = [];
    // Always add click-in first
    drillPlan.push({ type: "click-in" });

    const planString = customPlanText.value.trim();
    if (!planString) {
      // Default: 64 continuous clicks
      for (let i = 0; i < 64; i++) {
        drillPlan.push({ type: "click" });
      }
    } else {
      const steps = planString.split(";");
      steps.forEach((step) => {
        const parts = step
          .trim()
          .split(",")
          .map((p) => parseInt(p.trim(), 10));
        if (parts.length === 3 && !parts.some(isNaN)) {
          const [on, off, reps] = parts;
          for (let rep = 0; rep < reps; rep++) {
            for (let i = 0; i < on; i++) {
              drillPlan.push({ type: "click" });
            }
            for (let i = 0; i < off; i++) {
              drillPlan.push({ type: "silent" });
            }
          }
        }
      });
    }
    renderPlanVisualization();
    buildTimeline();
    resetRunScoring();
  }

  // --- Visualization Functions ---
  function renderPlanVisualization() {
    let oldViz = document.getElementById("plan-visualization");
    if (oldViz) oldViz.remove();
    if (drillPlan.length === 0) return;

    const viz = document.createElement("div");
    viz.id = "plan-visualization";

    drillPlan.forEach((measure, index) => {
      const block = document.createElement("div");
      block.className = `measure-block ${measure.type}`;
      block.dataset.measureIndex = String(index);
      block.textContent =
        measure.type === "click-in"
          ? ""
          : String(measureScores[index] ?? 0).padStart(2, "0");
      block.addEventListener("click", onPlanMeasureClick);
      viz.appendChild(block);
    });
    planVisualizationContainer.appendChild(viz);
  }

  function resetRunScoring() {
    measureScores = Array.from(
      { length: drillPlan.length },
      (_unused, index) => (drillPlan[index]?.type === "click-in" ? null : 0),
    );
    measureHits = Array.from({ length: drillPlan.length }, () => []);
    finalizedMeasureScores = Array.from(
      { length: drillPlan.length },
      () => false,
    );
    updateMeasureScoreDisplay();
    updateOverallScoreDisplay();
  }

  function updateMeasureScoreDisplay() {
    const blocks = document.querySelectorAll(
      "#plan-visualization .measure-block",
    );
    blocks.forEach((block, index) => {
      const measureType = drillPlan[index]?.type;
      if (measureType === "click-in") {
        block.textContent = "";
        delete block.dataset.score;
        return;
      }
      const score = Math.max(0, Math.min(99, measureScores[index] ?? 0));
      block.textContent = String(score).padStart(2, "0");
      block.dataset.score = String(score);
    });
  }

  function scoreFromErrorMs(errorMs) {
    const adjustedErrorMs = Math.max(0, errorMs - bestFeasibleErrorMs);
    const normalized = Math.min(1, adjustedErrorMs / maxScorableErrorMs);
    const curved = Math.pow(normalized, 0.85);
    return Math.max(0, Math.min(99, Math.round((1 - curved) * 99)));
  }

  function findClosestScoringMeasure(beatPosition) {
    const roughIndex = Math.floor(beatPosition / beatsPerMeasure);
    const candidates = [roughIndex - 1, roughIndex, roughIndex + 1];
    let bestMeasureIndex = -1;
    let bestBeatDistance = Number.POSITIVE_INFINITY;

    candidates.forEach((measureIndex) => {
      if (measureIndex < 0 || measureIndex >= drillPlan.length) return;
      if (drillPlan[measureIndex]?.type === "click-in") return;

      const measureStartBeat = measureIndex * beatsPerMeasure;
      for (let beatOffset = 0; beatOffset < beatsPerMeasure; beatOffset++) {
        const expectedBeat = measureStartBeat + beatOffset;
        const distance = Math.abs(beatPosition - expectedBeat);
        if (distance < bestBeatDistance) {
          bestBeatDistance = distance;
          bestMeasureIndex = measureIndex;
        }
      }
    });

    if (bestBeatDistance > lateHitAssignmentWindowBeats) {
      return -1;
    }

    return bestMeasureIndex;
  }

  function finalizeMeasureScore(measureIndex) {
    if (measureIndex < 0 || measureIndex >= drillPlan.length) return;
    if (finalizedMeasureScores[measureIndex]) return;

    const measureType = drillPlan[measureIndex]?.type;
    if (measureType === "click-in") {
      measureScores[measureIndex] = null;
      finalizedMeasureScores[measureIndex] = true;
      updateMeasureScoreDisplay();
      return;
    }

    const hits = [...(measureHits[measureIndex] || [])].sort((a, b) => a - b);
    if (hits.length === 0) {
      measureScores[measureIndex] = 0;
      finalizedMeasureScores[measureIndex] = true;
      updateMeasureScoreDisplay();
      return;
    }

    const expectedBeats = [];
    const measureStartBeat = measureIndex * beatsPerMeasure;
    for (let beatOffset = 0; beatOffset < beatsPerMeasure; beatOffset++) {
      expectedBeats.push(measureStartBeat + beatOffset);
    }

    const usedHitIndices = new Set();
    let scoreSum = 0;

    expectedBeats.forEach((expectedBeat) => {
      let bestHitIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;

      hits.forEach((hitBeat, hitIndex) => {
        if (usedHitIndices.has(hitIndex)) return;
        const distance = Math.abs(hitBeat - expectedBeat);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestHitIndex = hitIndex;
        }
      });

      if (bestHitIndex === -1) {
        return;
      }

      usedHitIndices.add(bestHitIndex);
      const errorMs = bestDistance * beatDuration * 1000;
      scoreSum += scoreFromErrorMs(errorMs);
    });

    measureScores[measureIndex] = Math.max(
      0,
      Math.min(99, Math.round(scoreSum / beatsPerMeasure)),
    );
    finalizedMeasureScores[measureIndex] = true;
    updateMeasureScoreDisplay();
  }

  function getOverallScore() {
    if (drillPlan.length === 0) return 0;
    let total = 0;
    let count = 0;
    drillPlan.forEach((measure, index) => {
      if (measure.type === "click-in") return;
      total += measureScores[index] ?? 0;
      count++;
    });
    if (count === 0) return 0;
    return Math.max(0, Math.min(99, Math.round(total / count)));
  }

  function updateOverallScoreDisplay() {
    if (!overallScoreDisplay) return;
    const overall = getOverallScore();
    overallScoreDisplay.textContent = `Overall Score: ${String(overall).padStart(2, "0")}`;
  }

  function renderDrillHistory() {
    if (!drillHistoryList) return;
    drillHistoryList.innerHTML = "";
    drillHistory.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "history-item";
      item.textContent = `${entry.timeLabel} • ${entry.completed ? "Complete" : "Stopped"} • Score ${String(entry.score).padStart(2, "0")}`;
      drillHistoryList.appendChild(item);
    });
  }

  function finalizeRunScoring(completed) {
    if (runFinalized || drillPlan.length === 0) return;

    for (let index = 0; index < drillPlan.length; index++) {
      finalizeMeasureScore(index);
    }
    updateOverallScoreDisplay();

    const now = new Date();
    const elapsedSeconds = runStartedAt
      ? Math.max(0, Math.round((Date.now() - runStartedAt) / 1000))
      : 0;

    drillHistory.unshift({
      completed,
      score: getOverallScore(),
      elapsedSeconds,
      timeLabel: `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
    });
    if (drillHistory.length > 12) {
      drillHistory = drillHistory.slice(0, 12);
    }
    renderDrillHistory();
    runFinalized = true;
  }

  function onPlanMeasureClick(event) {
    if (isRunning) return;
    const measureIndex = parseInt(
      event.currentTarget.dataset.measureIndex || "",
      10,
    );
    if (Number.isNaN(measureIndex)) return;
    timelineLastBeatPosition = measureIndex * beatsPerMeasure;
    centerTimelineAtBeat(measureIndex * beatsPerMeasure);
  }

  function buildTimeline() {
    renderTimelineStructure();
    if (!isRunning) {
      centerTimelineAtBeat(timelineLastBeatPosition);
    }
  }

  function renderTimelineStructure() {
    timelineTrack.innerHTML = "";

    if (drillPlan.length === 0) return;

    const viewportWidth = timelineViewport.clientWidth;
    const totalBeats = drillPlan.length * beatsPerMeasure + timelineTailBeats;
    const contentWidth = totalBeats * timelinePxPerBeat;
    const paddingWidth = viewportWidth;
    const totalWidth = paddingWidth + contentWidth + paddingWidth;

    timelineTrack.style.width = `${totalWidth}px`;

    // Create 4 layers
    const groupsLayer = document.createElement("div");
    groupsLayer.className = "timeline-layer timeline-groups";

    const gridLayer = document.createElement("div");
    gridLayer.className = "timeline-layer timeline-grid";

    const expectationsLayer = document.createElement("div");
    expectationsLayer.className = "timeline-layer timeline-expectations";

    const detectionsLayer = document.createElement("div");
    detectionsLayer.className = "timeline-layer timeline-detections";

    const offsetX = paddingWidth;

    // Render groups and grid
    drillPlan.forEach((measure, measureIndex) => {
      const startBeat = measureIndex * beatsPerMeasure;
      const endBeat = startBeat + beatsPerMeasure;
      const colorClass = measure.type;

      // Group background
      const groupElement = document.createElement("div");
      groupElement.className = `timeline-group timeline-group-${colorClass}`;
      groupElement.style.left = `${offsetX + startBeat * timelinePxPerBeat}px`;
      groupElement.style.width = `${beatsPerMeasure * timelinePxPerBeat}px`;
      groupsLayer.appendChild(groupElement);

      // Grid line at start of measure
      const gridLine = document.createElement("div");
      gridLine.className = "timeline-grid-line";
      gridLine.style.left = `${offsetX + startBeat * timelinePxPerBeat}px`;
      gridLayer.appendChild(gridLine);

      // Expectation circles for each beat
      for (let beat = startBeat; beat < endBeat; beat++) {
        const circle = document.createElement("div");
        // Filled circles for click-in (no hits expected), empty for click/silent
        circle.className =
          measure.type === "click-in"
            ? "timeline-expectation timeline-expectation-filled"
            : "timeline-expectation";
        circle.style.left = `${offsetX + beat * timelinePxPerBeat}px`;
        expectationsLayer.appendChild(circle);
      }
    });

    timelineTrack.appendChild(groupsLayer);
    timelineTrack.appendChild(gridLayer);
    timelineTrack.appendChild(expectationsLayer);
    timelineTrack.appendChild(detectionsLayer);
  }

  function beatToX(beatPosition) {
    const viewportWidth = timelineViewport.clientWidth;
    const offsetX = viewportWidth;
    return offsetX + beatPosition * timelinePxPerBeat;
  }

  function addTimelineDetection(beatPosition) {
    const detectionsLayer = timelineTrack.querySelector(".timeline-detections");
    if (!detectionsLayer) return;
    const dot = document.createElement("div");
    dot.className = "timeline-detection";
    dot.style.left = `${beatToX(beatPosition)}px`;
    detectionsLayer.appendChild(dot);
  }

  function centerTimelineAtBeat(beatPosition) {
    const viewportWidth = timelineViewport.clientWidth;
    const trackWidth = timelineTrack.offsetWidth;
    const targetX = beatToX(beatPosition);

    let left = viewportWidth / 2 - targetX;
    const minLeft = Math.min(0, viewportWidth - trackWidth);
    left = Math.max(minLeft, Math.min(0, left));

    timelineTrack.style.transform = `translateX(${left}px)`;
  }

  function updateVisualizationHighlight(currentMeasure) {
    const blocks = document.querySelectorAll(
      "#plan-visualization .measure-block",
    );
    blocks.forEach((block, index) => {
      if (index === currentMeasure) {
        block.classList.add("current");
      } else {
        block.classList.remove("current");
      }
    });
  }

  // --- Mic Test Functions ---
  function updateThresholdUI() {
    const thresholdPercent = (hitThreshold / 128) * 100;
    hitThresholdLine.style.left = `${thresholdPercent}%`;
    hitThresholdLabel.textContent = `Threshold: ${hitThreshold}`;
  }

  function setThresholdFromPointer(clientX) {
    const rect = micLevel.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    hitThreshold = Math.round(ratio * 128);
    try {
      localStorage.setItem(thresholdStorageKey, String(hitThreshold));
    } catch (_err) {}
    updateThresholdUI();
  }

  function stopCurrentMicStream() {
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      micStream = undefined;
    }
  }

  async function populateMicDevices() {
    if (!micSelect || !navigator.mediaDevices?.enumerateDevices) return;

    let devices;
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch (_err) {
      return;
    }

    const inputDevices = devices.filter(
      (device) => device.kind === "audioinput",
    );
    const previousValue = micSelect.value;
    micSelect.innerHTML = "";

    if (inputDevices.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No microphone found";
      micSelect.appendChild(option);
      micSelect.disabled = true;
      return;
    }

    micSelect.disabled = false;
    inputDevices.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${index + 1}`;
      micSelect.appendChild(option);
    });

    const candidateId =
      selectedMicDeviceId || previousValue || inputDevices[0].deviceId;
    const exists = inputDevices.some(
      (device) => device.deviceId === candidateId,
    );
    micSelect.value = exists ? candidateId : inputDevices[0].deviceId;
    selectedMicDeviceId = micSelect.value;
    try {
      localStorage.setItem(micDeviceStorageKey, selectedMicDeviceId);
    } catch (_err) {}
  }

  async function onMicSelectionChanged() {
    if (!micSelect) return;
    selectedMicDeviceId = micSelect.value;
    try {
      localStorage.setItem(micDeviceStorageKey, selectedMicDeviceId);
    } catch (_err) {}

    if (isMicTestRunning) {
      await startMicTest();
    }
  }

  async function startMicTest() {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      stopCurrentMicStream();

      const audioConstraints = selectedMicDeviceId
        ? { deviceId: { exact: selectedMicDeviceId } }
        : true;
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      isMicTestRunning = true;
      hitsList.innerHTML = "";

      const source = audioContext.createMediaStreamSource(micStream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0;

      dataArray = new Uint8Array(analyserNode.frequencyBinCount);

      source.connect(analyserNode);

      await populateMicDevices();
      const activeTrack = micStream.getAudioTracks()[0];
      if (activeTrack && activeTrack.getSettings) {
        const settings = activeTrack.getSettings();
        if (settings.deviceId) {
          selectedMicDeviceId = settings.deviceId;
          if (micSelect) {
            micSelect.value = selectedMicDeviceId;
          }
          try {
            localStorage.setItem(micDeviceStorageKey, selectedMicDeviceId);
          } catch (_err) {}
        }
      }

      if (!rafId) {
        rafId = requestAnimationFrame(detectHit);
      }
    } catch (err) {
      hitsList.textContent = `Mic unavailable: ${err.message}`;
    }
  }

  function detectHit() {
    if (!analyserNode || !dataArray) {
      rafId = requestAnimationFrame(detectHit);
      return;
    }

    const now = performance.now();
    if (!lastDetectTime) {
      lastDetectTime = now;
    }
    const deltaSeconds = (now - lastDetectTime) / 1000;
    lastDetectTime = now;

    analyserNode.getByteTimeDomainData(dataArray);

    let maxVal = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const val = Math.abs(dataArray[i] - 128); // Center the waveform
      if (val > maxVal) {
        maxVal = val;
      }
    }

    const micLevelPercent = (maxVal / 128) * 100;
    micLevelBar.style.width = `${micLevelPercent}%`;

    if (isRunning && audioContext) {
      const beatPosition =
        (audioContext.currentTime - timelineRunStartAudioTime) / beatDuration;
      timelineLastBeatPosition = beatPosition;
      centerTimelineAtBeat(beatPosition);
    }

    if (maxVal >= peakHoldValue) {
      peakHoldValue = maxVal;
      peakHoldUntil = now + peakHoldMs;
    } else if (now > peakHoldUntil) {
      peakHoldValue = Math.max(
        maxVal,
        peakHoldValue - peakFallPerSecond * deltaSeconds,
      );
    }
    micPeakHold.style.left = `${(peakHoldValue / 128) * 100}%`;

    micLevel.classList.toggle("over-threshold", maxVal >= hitThreshold);

    if (maxVal >= hitThreshold && now - lastHitTime > hitCooldown) {
      lastHitTime = now;
      const hitElement = document.createElement("div");
      hitElement.className = "hit-entry";
      hitElement.setAttribute("aria-label", "Hit detected");
      hitElement.title = "Hit detected";
      hitsList.appendChild(hitElement);

      if (isRunning && audioContext) {
        const detectedBeatPosition = getCalibratedBeatPosition(
          audioContext.currentTime,
        );
        addTimelineDetection(detectedBeatPosition);
        const scoredMeasureIndex =
          findClosestScoringMeasure(detectedBeatPosition);
        if (scoredMeasureIndex >= 0) {
          measureHits[scoredMeasureIndex].push(detectedBeatPosition);
        }
      }

      if (isCalibrating && audioContext) {
        registerCalibrationHit(audioContext.currentTime);
      }

      while (hitsList.children.length > maxVisibleHits) {
        hitsList.removeChild(hitsList.firstElementChild);
      }

      setTimeout(() => {
        hitElement.remove();
      }, 2400);
    }

    rafId = requestAnimationFrame(detectHit);
  }

  // --- Initialization ---
  function init() {
    stopBtn.disabled = true;

    try {
      const savedThreshold = localStorage.getItem(thresholdStorageKey);
      if (savedThreshold !== null) {
        const parsedThreshold = parseInt(savedThreshold, 10);
        if (!Number.isNaN(parsedThreshold)) {
          hitThreshold = Math.max(0, Math.min(128, parsedThreshold));
        }
      }

      const savedMicDevice = localStorage.getItem(micDeviceStorageKey);
      if (savedMicDevice) {
        selectedMicDeviceId = savedMicDevice;
      }

      const savedCalibrationOffset = localStorage.getItem(
        calibrationStorageKey,
      );
      if (savedCalibrationOffset !== null) {
        const parsedOffset = parseFloat(savedCalibrationOffset);
        if (!Number.isNaN(parsedOffset)) {
          calibrationOffsetMs = parsedOffset;
        }
      }
    } catch (_err) {}

    updateThresholdUI();
    micPeakHold.style.left = "0%";
    startMicTest();
    parseDrillPlan();
    centerTimelineAtBeat(0);
    updateOverallScoreDisplay();
    renderDrillHistory();
    updateCalibrationResultLabel();
  }

  init();
});
