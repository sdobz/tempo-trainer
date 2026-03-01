// Manages pane navigation and URL state
class PaneManager {
  constructor() {
    this.currentPane = null;
    this.paneChangeCallbacks = [];

    // Listen for hash changes
    window.addEventListener("hashchange", () => this._onHashChange());

    // Initialize based on current URL
    this._onHashChange();
  }

  onPaneChange(callback) {
    this.paneChangeCallbacks.push(callback);
  }

  navigate(paneName, params = {}) {
    const hash = this._buildHash(paneName, params);
    window.location.hash = hash;
  }

  getCurrentPane() {
    return this.currentPane;
  }

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

  _onHashChange() {
    const hash = window.location.hash.slice(1); // Remove #
    const [pane] = hash.split("?");
    const paneName = pane || "onboarding"; // Default to onboarding

    if (this.currentPane !== paneName) {
      this.currentPane = paneName;
      this._notifyListeners();
    }
  }

  _notifyListeners() {
    this.paneChangeCallbacks.forEach((callback) => {
      callback(this.currentPane);
    });
  }

  // Determine which pane to show for new vs returning users
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
