/**
 * PaneManager manages hash-based pane navigation and callbacks.
 */

import { getAllElements, getElementByID } from "../component/dom-utils.js";

class PaneManager {
  /**
   * Creates a new PaneManager instance.
   * Does NOT fire initial pane callbacks — call initialize() after registering
   * all onPaneChange listeners to avoid a race where callbacks run before
   * the wiring layer has registered them.
   */
  constructor() {
    /** @type {string|null} */
    this.currentPane = null;
    /** @type {string|null} */
    this._previousPane = null;
    /** @type {((pane: string) => void)[]} */
    this.paneChangeCallbacks = [];

    // Listen for subsequent hash changes
    globalThis.addEventListener("hashchange", () => this._onHashChange());
  }

  /**
   * Called once by the wiring layer after all onPaneChange callbacks are registered.
   * Reads the current URL hash and fires callbacks, ensuring listeners are in place first.
   */
  initialize() {
    this._onHashChange();
  }

  /**
   * Registers a callback to be invoked when the pane changes.
   * @param {(pane: string) => void} callback - Function to call with new pane name
   */
  onPaneChange(callback) {
    this.paneChangeCallbacks.push(callback);
  }

  /**
   * Navigates to a different pane by updating the URL hash.
   * @param {string} paneName - The name of the pane to navigate to
   * @param {Object} [params={}] - Optional URL parameters to include
   */
  navigate(paneName, params = {}) {
    const hash = this._buildHash(paneName, params);
    globalThis.location.hash = hash;
  }

  /**
   * Gets the currently active pane name.
   * @returns {string|null} The name of the current pane
   */
  getCurrentPane() {
    return this.currentPane;
  }

  /**
   * Gets the URL parameters associated with the current pane.
   * @returns {Object} Key-value pairs of parameters
   */
  getCurrentParams() {
    const hash = globalThis.location.hash.slice(1); // Remove #
    const [, queryString] = hash.split("?");
    const params = new URLSearchParams(queryString);
    /** @type {Record<string, string>} */
    const result = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Builds a hash string from a pane name and parameters.
   * @param {string} paneName - The pane name
   * @param {Object} [params={}] - URL parameters to include
   * @returns {string} Formatted hash string
   */
  _buildHash(paneName, params = {}) {
    let hash = paneName;
    const paramEntries = Object.entries(params).filter(
      ([, v]) => v !== null && v !== undefined,
    );
    if (paramEntries.length > 0) {
      const queryString = new URLSearchParams(
        Object.fromEntries(paramEntries),
      ).toString();
      hash += `?${queryString}`;
    }
    return hash;
  }

  /**
   * Internal handler for hash changes.
   * Updates currentPane if the hash has changed.
   */
  _onHashChange() {
    const hash = globalThis.location.hash.slice(1); // Remove #
    const [paneName] = hash.split("?");
    const currentPaneName = paneName || "onboarding"; // Default to onboarding

    if (this.currentPane !== currentPaneName) {
      this._previousPane = this.currentPane;
      this.currentPane = currentPaneName;
      this._notifyListeners();
    }
  }

  /**
   * Notifies all registered callbacks of a pane change.
   */
  _notifyListeners() {
    this.paneChangeCallbacks.forEach((callback) => {
      if (this.currentPane) {
        callback(this.currentPane);
      }
    });
  }

  /**
   * Updates DOM visibility for the specified pane and fires visibility lifecycle hooks.
   * Calls onHide() on all BaseComponent instances in the outgoing pane and onShow() on
   * all BaseComponent instances in the incoming pane.
   * Detection uses duck-typing: any element with onHide/onShow methods is notified.
   * @param {string} pane - The pane name to display
   */
  updateVisibility(pane) {
    // Notify outgoing pane components
    if (this._previousPane) {
      const outgoingEl = document.getElementById(`pane-${this._previousPane}`);
      if (outgoingEl) {
        outgoingEl.querySelectorAll("*").forEach((el) => {
          if (typeof /** @type {any} */ (el).onHide === "function") {
            /** @type {any} */ (el).onHide();
          }
        });
      }
    }

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

    // Notify incoming pane components
    currentPaneEl.querySelectorAll("*").forEach((el) => {
      if (typeof /** @type {any} */ (el).onShow === "function") {
        /** @type {any} */ (el).onShow();
      }
    });

    this._previousPane = pane;
  }

  /**
   * Determines the initial pane to display for a user.
   * Logic: unboarded → onboarding; boarded+calibrated → plan-play; boarded only → onboarding
   * @param {Object} userState - User state object
   * @param {boolean} userState.hasCompletedOnboarding - Whether user completed onboarding
   * @param {boolean} userState.hasCalibration - Whether user has calibration data
   * @returns {string} The recommended pane name: "onboarding" or "plan-play"
   */
  static getInitialPane(userState) {
    const { hasCompletedOnboarding, hasCalibration } = userState;

    // If never onboarded, show onboarding
    if (!hasCompletedOnboarding) {
      return "onboarding";
    }

    // If returning user with calibration, go to plan-play
    if (hasCalibration) {
      return "plan-play";
    }

    // If onboarded but no calibration, go to onboarding
    return "onboarding";
  }
}

export default PaneManager;
