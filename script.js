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
  const micLevel = document.getElementById("mic-level");
  const micLevelBar = document.getElementById("mic-level-bar");
  const micPeakHold = document.getElementById("mic-peak-hold");
  const hitThresholdLine = document.getElementById("hit-threshold-line");
  const hitThresholdLabel = document.getElementById("hit-threshold-label");
  const hitsList = document.getElementById("hits-list");

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
  let currentDrillStep = 0;
  let measuresInCurrentStep = 0;
  let repsInCurrentStep = 0;
  let isMutedForDrill = false;
  let totalMeasuresInDrill = 0;
  let currentMeasureInTotal = 0;

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

  // --- Metronome Functions ---
  function startStop() {
    if (isRunning) {
      // Stop
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

      nextNoteTime = audioContext.currentTime + 0.1;
      currentBeatInMeasure = 0;
      currentMeasureInTotal = 0;
      beatDuration = 60.0 / parseInt(bpmInput.value, 10);
      beatsPerMeasure = parseInt(timeSignatureSelect.value.split("/")[0], 10);

      parseDrillPlan();
      setupCurrentDrillStep();
      updateVisualizationHighlight(0);

      schedulerIntervalID = window.setInterval(scheduler, lookahead);
      statusDiv.textContent = "Running...";
    }
  }

  function scheduler() {
    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) {
      scheduleNote(nextNoteTime);
      updateBeat();
    }
  }

  function scheduleNote(time) {
    if (!isMutedForDrill) {
      const isDownbeat = currentBeatInMeasure === 0;
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
    }
  }

  function updateBeat() {
    const beatNumber = (currentBeatInMeasure % beatsPerMeasure) + 1;

    const timeUntilBeat = (nextNoteTime - audioContext.currentTime) * 1000;
    setTimeout(() => {
      if (!isRunning) return;
      beatIndicator.textContent = beatNumber;
      beatIndicator.className = "beat-indicator";
      if (!isMutedForDrill) {
        beatIndicator.classList.add(beatNumber === 1 ? "downbeat" : "active");
      }
    }, timeUntilBeat);

    nextNoteTime += beatDuration;
    currentBeatInMeasure++;

    if (currentBeatInMeasure >= beatsPerMeasure) {
      currentBeatInMeasure = 0;
      advanceDrill();
    }
  }

  // --- Drill Functions ---
  function parseDrillPlan() {
    drillPlan = [];
    const planString = customPlanText.value.trim();
    if (!planString) {
      renderPlanVisualization();
      return;
    }
    const steps = planString.split(";");
    steps.forEach((step) => {
      const parts = step
        .trim()
        .split(",")
        .map((p) => parseInt(p.trim(), 10));
      if (parts.length === 3 && !parts.some(isNaN)) {
        drillPlan.push({ on: parts[0], off: parts[1], reps: parts[2] });
      }
    });
    renderPlanVisualization();
  }

  function setupCurrentDrillStep() {
    currentDrillStep = 0;
    repsInCurrentStep = 0;
    measuresInCurrentStep = 0;

    if (drillPlan.length === 0) {
      isMutedForDrill = false;
      statusDiv.textContent = "Running (Continuous Click)";
      return;
    }

    isMutedForDrill = false;
    updateStatusDisplay();
  }

  function advanceDrill() {
    if (drillPlan.length === 0) return;

    currentMeasureInTotal++;
    updateVisualizationHighlight(currentMeasureInTotal);

    measuresInCurrentStep++;
    const step = drillPlan[currentDrillStep];

    if (!isMutedForDrill && measuresInCurrentStep >= step.on) {
      isMutedForDrill = true;
      measuresInCurrentStep = 0;
    } else if (isMutedForDrill && measuresInCurrentStep >= step.off) {
      repsInCurrentStep++;
      if (repsInCurrentStep >= step.reps) {
        currentDrillStep++;
        repsInCurrentStep = 0;
        if (currentDrillStep >= drillPlan.length) {
          statusDiv.textContent = "Drill complete!";
          startStop();
          return;
        }
      }
      isMutedForDrill = false;
      measuresInCurrentStep = 0;
    }
    updateStatusDisplay();
  }

  function updateStatusDisplay() {
    if (drillPlan.length === 0 || currentDrillStep >= drillPlan.length) return;

    const step = drillPlan[currentDrillStep];
    const state = isMutedForDrill ? "SILENCE" : "CLICK";
    const totalMeasuresInPart = isMutedForDrill ? step.off : step.on;

    statusDiv.textContent = `Step ${currentDrillStep + 1}/${drillPlan.length} | Rep ${repsInCurrentStep + 1}/${step.reps} | ${state}: Measure ${measuresInCurrentStep + 1}/${totalMeasuresInPart}`;
  }

  // --- Visualization Functions ---
  function renderPlanVisualization() {
    let oldViz = document.getElementById("plan-visualization");
    if (oldViz) oldViz.remove();
    if (drillPlan.length === 0) return;

    const viz = document.createElement("div");
    viz.id = "plan-visualization";

    totalMeasuresInDrill = 0;
    drillPlan.forEach((step) => {
      for (let i = 0; i < step.reps; i++) {
        for (let j = 0; j < step.on; j++) {
          const block = document.createElement("div");
          block.className = "measure-block on";
          viz.appendChild(block);
          totalMeasuresInDrill++;
        }
        for (let j = 0; j < step.off; j++) {
          const block = document.createElement("div");
          block.className = "measure-block off";
          viz.appendChild(block);
          totalMeasuresInDrill++;
        }
      }
    });
    planVisualizationContainer.appendChild(viz);
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
    } catch (_err) {
    }
    updateThresholdUI();
  }

  async function startMicTest() {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
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

      rafId = requestAnimationFrame(detectHit);
    } catch (err) {
      hitsList.textContent = `Mic unavailable: ${err.message}`;
    }
  }

  function detectHit() {
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

    if (maxVal >= peakHoldValue) {
      peakHoldValue = maxVal;
      peakHoldUntil = now + peakHoldMs;
    } else if (now > peakHoldUntil) {
      peakHoldValue = Math.max(maxVal, peakHoldValue - peakFallPerSecond * deltaSeconds);
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
    } catch (_err) {
    }

    updateThresholdUI();
    micPeakHold.style.left = "0%";
    startMicTest();
    parseDrillPlan();
  }

  init();
});
