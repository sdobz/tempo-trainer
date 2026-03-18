/**
 * PlanHistoryPane - Web component for displaying practice session history
 * @module plan-history-pane
 */

import BaseComponent from "../component/base-component.js";
import {
  dispatchEvent,
  querySelector,
} from "../component/component-utils.js";
import "./history-session-item.js";

/**
 * PlanHistoryPane component - manages practice session history display
 *
 * Events emitted (re-emitted from history-session-item children):
 * - 'retry-chart': When user clicks retry button (data: { chart: SessionPlan })
 * - 'navigate': When user wants to navigate (data: { pane: string })
 * - 'delete-session': When user clicks delete button (data: { sessionId: string })
 *
 * @extends BaseComponent
 */
export default class PlanHistoryPane extends BaseComponent {
  constructor() {
    super();

    [this._getSessions, this._setSessions] = this.createSignalState([]);
    [this._getExpandedSessionId, this._setExpandedSessionId] =
      this.createSignalState(null);

    /** @type {Map<string, HTMLElement>} sessionId → history-session-item */
    this._sessionItems = new Map();

    // DOM element references (set in onMount)
    this.historyList = null;

    // Read-through accessor for external callers
    /** @type {any[]} */
    this.sessions = [];
  }

  getTemplateUrl() {
    return new URL("./plan-history-pane.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./plan-history-pane.css", import.meta.url).href;
  }

  onMount() {
    this.historyList = querySelector(this, "[data-history-list]");

    // Effect 1: reconcile session item elements when session list changes
    this.createEffect(() => {
      const sessions = this._getSessions();
      this.sessions = sessions;

      if (sessions.length === 0) {
        this.historyList.innerHTML = `
          <div class="empty-history">
            <p>No practice sessions yet. Start a drill to see your progress!</p>
          </div>
        `;
        this._sessionItems.clear();
        return;
      }

      this._reconcileItems(sessions);
    });

    // Effect 2: push expanded state into each item (cheap, no DOM rebuild)
    this.createEffect(() => {
      const expandedId = this._getExpandedSessionId();
      this._sessionItems.forEach((item, id) => {
        item.setExpanded(id === expandedId);
      });
    });

    // item-toggle from any child item → toggle expand signal
    this.listen(this.historyList, "item-toggle", (e) => {
      const sessionId = e.detail?.sessionId;
      if (!sessionId) return;
      const current = this._getExpandedSessionId();
      this._setExpandedSessionId(current === sessionId ? null : sessionId);
    });

    // Re-emit events from items to the pane level
    this.listen(this.historyList, "retry-chart", (e) => {
      dispatchEvent(this, "retry-chart", e.detail);
    });
    this.listen(this.historyList, "navigate", (e) => {
      dispatchEvent(this, "navigate", e.detail);
    });
    this.listen(this.historyList, "delete-session", (e) => {
      dispatchEvent(this, "delete-session", e.detail);
    });
  }

  // --- Public Methods ---

  /**
   * Display sessions in the history list
   * @param {any[]} sessions
   * @param {string|null} [expandSessionId=null]
   */
  displaySessions(sessions, expandSessionId = null) {
    this._setSessions(sessions);
    const defaultId =
      expandSessionId ?? (sessions.length > 0 ? sessions[0].id : null);
    this._setExpandedSessionId(defaultId);
  }

  // --- Private Methods ---

  _reconcileItems(sessions) {
    const newIds = new Set(sessions.map((s) => s.id));

    // Remove stale items
    for (const [id, item] of this._sessionItems) {
      if (!newIds.has(id)) {
        item.remove();
        this._sessionItems.delete(id);
      }
    }

    // Insert/update items in session order (appendChild moves existing nodes)
    for (const session of sessions) {
      let item = this._sessionItems.get(session.id);
      if (!item) {
        item = document.createElement("history-session-item");
        this._sessionItems.set(session.id, item);
      }
      item._setSession(session);
      this.historyList.appendChild(item);
    }
  }
}

// Register the component
customElements.define("plan-history-pane", PlanHistoryPane);
