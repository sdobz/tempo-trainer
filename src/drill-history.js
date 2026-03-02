/**
 * DrillHistory manages drill session history tracking and display.
 * Stores a limited number of recent practice entries for quick reference.
 */
class DrillHistory {
  /**
   * Creates a new DrillHistory instance.
   * @param {HTMLUListElement} listElement - DOM list element to render history into
   */
  constructor(listElement) {
    this.listElement = listElement;
    this.history = [];
    this.maxEntries = 12;
  }

  /**
   * Adds a new entry to the drill history.
   * @param {boolean} completed - Whether the drill session was completed
   * @param {number} score - The score achieved (0-99)
   * @param {number} elapsedSeconds - Duration of the session in seconds
   */
  addEntry(completed, score, elapsedSeconds) {
    const now = new Date();
    const entry = {
      completed,
      score,
      elapsedSeconds,
      timeLabel: `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
    };

    this.history.unshift(entry);

    if (this.history.length > this.maxEntries) {
      this.history = this.history.slice(0, this.maxEntries);
    }

    this.render();
  }

  /**
   * Renders the history list to the DOM.
   * Updates the list element with current history entries.
   */
  render() {
    if (!this.listElement) return;

    this.listElement.innerHTML = "";

    this.history.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "history-item";
      item.textContent = `${entry.timeLabel} • ${entry.completed ? "Complete" : "Stopped"} • Score ${String(entry.score).padStart(2, "0")}`;
      this.listElement.appendChild(item);
    });
  }

  /**
   * Clears all history entries.
   */
  clear() {
    this.history = [];
    this.render();
  }

  /**
   * Gets a copy of the current history.
   * @returns {Array<Object>} Array of history entry objects
   */
  getHistory() {
    return [...this.history];
  }
}

export default DrillHistory;
