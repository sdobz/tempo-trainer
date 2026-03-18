import BaseComponent from "../component/base-component.js";
import { dispatchEvent } from "../component/component-utils.js";

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
  }

  getTemplateUrl() {
    return new URL("./app-notification.html", import.meta.url).href;
  }

  getStyleUrl() {
    return new URL("./app-notification.css", import.meta.url).href;
  }

  /**
   * Handle action button click
   * @param {Event} event
   * @param {HTMLElement} element
   */
  handleAction(event, element) {
    const detail = this._getConfig().actionDetail;
    dispatchEvent(this, "notification-action", detail);
  }

  onMount() {
    this.createEffect(() => {
      const { visible, type, message, actionLabel } = this._getConfig();

      this.refs.root.classList.remove("info", "warning", "success");
      this.refs.root.hidden = !visible;

      if (!visible) {
        this.refs.messageEl.textContent = "";
        this.refs.actionBtn.hidden = true;
        this.refs.actionBtn.textContent = "";
        return;
      }

      this.refs.root.classList.add(type);
      this.refs.messageEl.textContent = message;
      this.refs.actionBtn.hidden = !actionLabel;
      this.refs.actionBtn.textContent = actionLabel || "";
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
