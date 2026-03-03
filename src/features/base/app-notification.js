import BaseComponent from "./base-component.js";
import { querySelector, bindEvent, dispatchEvent } from "./component-utils.js";

export default class AppNotification extends BaseComponent {
  constructor() {
    super();

    this._cleanups = [];
    this._actionDetail = null;
    this._isVisible = false;
    this._pendingConfig = { type: "info", message: "", actionLabel: "", actionDetail: null };

    this.root = null;
    this.messageEl = null;
    this.actionBtn = null;
  }

  getTemplateUrl() {
    return "/src/features/base/app-notification.html";
  }

  getStyleUrl() {
    return "/src/features/base/app-notification.css";
  }

  onMount() {
    this.root = querySelector(this, "[data-notification-root]");
    this.messageEl = querySelector(this, "[data-notification-message]");
    this.actionBtn = querySelector(this, "[data-notification-action-btn]");

    this._cleanups.push(bindEvent(this.actionBtn, "click", () => this._onAction()));

    if (this._isVisible) {
      this._applyShow(this._pendingConfig);
    } else {
      this._applyHide();
    }
  }

  onUnmount() {
    this._cleanups.forEach((cleanup) => cleanup());
    this._cleanups = [];
  }

  show({ type = "info", message = "", actionLabel = "", actionDetail = null } = {}) {
    this._isVisible = true;
    this._pendingConfig = { type, message, actionLabel, actionDetail };
    if (!this.root) return;
    this._applyShow(this._pendingConfig);
  }

  hide() {
    this._isVisible = false;
    this._pendingConfig = { type: "info", message: "", actionLabel: "", actionDetail: null };
    if (!this.root) return;
    this._applyHide();
  }

  _applyShow({ type, message, actionLabel, actionDetail }) {
    this.root.classList.remove("info", "warning", "success");
    this.root.classList.add(type);
    this.root.hidden = false;

    this.messageEl.textContent = message;
    this._actionDetail = actionDetail;

    if (actionLabel) {
      this.actionBtn.hidden = false;
      this.actionBtn.textContent = actionLabel;
    } else {
      this.actionBtn.hidden = true;
      this.actionBtn.textContent = "";
    }
  }

  _applyHide() {
    this.root.hidden = true;
    this.messageEl.textContent = "";
    this.actionBtn.hidden = true;
    this.actionBtn.textContent = "";
    this._actionDetail = null;
  }

  _onAction() {
    dispatchEvent(this, "notification-action", this._actionDetail);
  }
}

if (!customElements.get("app-notification")) {
  customElements.define("app-notification", AppNotification);
}
