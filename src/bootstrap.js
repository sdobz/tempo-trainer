import "./features/main/main.js";
import "./features/plan-edit/plan-edit-pane.js";
import "./features/plan-play/plan-play-pane.js";
import "./features/plan-history/plan-history-pane.js";
import "./features/onboarding/onboarding-pane.js";
import "./features/audio/audio-context-overlay.js";

import MainComponent from "./features/main/main.js";
import { startAppOrchestrator } from "./app-orchestrator.js";

/** @typedef {import("./features/main/main.js").default} TempoTrainerMain */

document.addEventListener("DOMContentLoaded", () => {
  const mainRoot = /** @type {TempoTrainerMain|null} */ (
    document.querySelector("tempo-trainer-main")
  );
  if (!mainRoot || !(mainRoot instanceof MainComponent)) {
    throw new Error("tempo-trainer-main root component not found");
  }

  startAppOrchestrator(mainRoot);
});
