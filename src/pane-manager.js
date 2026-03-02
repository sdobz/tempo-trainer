/**
 * PaneManager manages hash-based pane navigation and callbacks.
 */
class PaneManager {
  /**
   * Creates a new PaneManager instance.
   */
  constructor() {
    this.currentPane = null;
    this.paneChangeCallbacks = [];

    // Listen for hash changes
    window.addEventListener("hashchange", () => this._onHashChange());

    // Initialize based on current URL
    this._onHashChange();
  }

  /**
   * Registers a callback to be invoked when the pane changes.
   * @param {Function} callback - Function to call with new pane name
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
    window.location.hash = hash;
  }

  /**
   * Gets the currently active pane name.
   * @returns {string} The name of the current pane
   */
  getCurrentPane() {
    return this.currentPane;
  }

  /**
   * Gets the URL parameters associated with the current pane.
   * @returns {Object} Key-value pairs of parameters
   */
  getCurrentParams() {
    const hash = window.location.hash.slice(1); // Remove #
    const [pane, queryString] = hash.split("?");
    const params = new URLSearchParams(queryString);
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
    const paramEntries = Object.entries(params).filter(([, v]) => v !== null && v !== undefined);
    if (paramEntries.length > 0) {
      const queryString = new URLSearchParams(Object.fromEntries(paramEntries)).toString();
      hash += `?${queryString}`;
    }
    return hash;
  }

  /**
   * Internal handler for hash changes.
   * Updates currentPane if the hash has changed.
   */
  _onHashChange() {
    const hash = window.location.hash.slice(1); // Remove #
    const [pane] = hash.split("?");
    const paneName = pane || "onboarding"; // Default to onboarding

    if (this.currentPane !== paneName) {
      this.currentPane = paneName;
      this._notifyListeners();
    }
  }

  /**
   * Notifies all registered callbacks of a pane change.
   */
  _notifyListeners() {
    this.paneChangeCallbacks.forEach((callback) => {
      callback(this.currentPane);
    });
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
