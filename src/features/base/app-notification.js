import BaseComponent from "../component/base-component.js";
import { dispatchEvent, querySelector } from "../component/component-utils.js";

export default class AppNotification extends BaseComponent {
  constructor() {
    super();

    [this._getConfig, this._setConfig] = this.createSignalState({
      visible: false,
      type: "info",
      message: "",
      actionLabel: "",
      actionDetail: null,
    });

    this.root = null;
    this.messageEl = null;
    this.actionBtn = null;

    this._onAction = () => {
      dispatchEvent(
        this,
        "notification-action",
        this._getConfig().actionDetail,
      );
    };
  }

  getTemplateUrl() {
    return new URL("./app-notification.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./app-notification.css", import.meta.url).href;
  }

  onMount() {
    this.root = querySelector(this, "[data-notification-root]");
    this.messageEl = querySelector(this, "[data-notification-message]");
    this.actionBtn = querySelector(this, "[data-notification-action-btn]");

    this.listen(this.actionBtn, "click", () => this._onAction());

    this.createEffect(() => {
      const { visible, type, message, actionLabel } = this._getConfig();

      this.root.classList.remove("info", "warning", "success");
      this.root.hidden = !visible;

      if (!visible) {
        this.messageEl.textContent = "";
        this.actionBtn.hidden = true;
        this.actionBtn.textContent = "";
        return;
      }

      this.root.classList.add(type);
      this.messageEl.textContent = message;
      this.actionBtn.hidden = !actionLabel;
      this.actionBtn.textContent = actionLabel || "";
    });
  }

  show({
    type = "info",
    message = "",
    actionLabel = "",
    actionDetail = null,
  } = {}) {
    this._setConfig({
      visible: true,
      type,
      message,
      actionLabel,
      actionDetail,
    });
  }

  hide() {
    this._setConfig({
      visible: false,
      type: "info",
      message: "",
      actionLabel: "",
      actionDetail: null,
    });
  }
}

if (!customElements.get("app-notification")) {
  customElements.define("app-notification", AppNotification);
}
