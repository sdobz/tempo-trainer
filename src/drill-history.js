// Manages drill history tracking and display
class DrillHistory {
  constructor(listElement) {
    this.listElement = listElement;
    this.history = [];
    this.maxEntries = 12;
  }

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

  clear() {
    this.history = [];
    this.render();
  }

  getHistory() {
    return [...this.history];
  }
}
