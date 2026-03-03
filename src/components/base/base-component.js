/**
 * BaseComponent - Abstract Web Component with lifecycle hooks and state management
 * @module base-component
 *
 * All UI components should extend this class. It provides:
 * - Template loading from separate .html files
 * - Style loading from separate .css files
 * - Lifecycle hooks (onMount, onUnmount, onStateChange)
 * - State management with change detection
 * - Custom event dispatching
 */

/**
 * @typedef {Object.<string, *>} ComponentState
 */

/**
 * Abstract base class for Web Components.
 * Handles template + style loading, state management, and lifecycle.
 * @abstract
 * @extends HTMLElement
 */
export default class BaseComponent extends HTMLElement {
  /**
   * Creates a new BaseComponent instance.
   * Initializes state and sets up lifecycle tracking.
   */
  constructor() {
    super();
    /** @type {ComponentState} */
    this.state = {};
    /** @type {boolean} */
    this._mounted = false;
    /** @type {Promise<void>} */
    this.componentReady = this._initialize();
  }

  /**
   * Override to provide template URL. Must return relative path to .html file.
   * Example: './microphone-detector.html'
   * @abstract
   * @returns {string} Path to template file relative to component directory
   */
  getTemplateUrl() {
    throw new Error(`${this.constructor.name} must implement getTemplateUrl()`);
  }

  /**
   * Override to provide style URL. Must return relative path to .css file.
   * Example: './microphone.css'
   * @abstract
   * @returns {string} Path to CSS file relative to component directory
   */
  getStyleUrl() {
    throw new Error(`${this.constructor.name} must implement getStyleUrl()`);
  }

  /**
   * Lifecycle hook: called when component DOM is ready.
   * Override to bind event listeners, initialize subcomponents, etc.
   * @virtual
   * @returns {Promise<void>}
   */
  async onMount() {
    // Override in subclasses
  }

  /**
   * Lifecycle hook: called when component is removed from DOM.
   * Override to cleanup event listeners, abort pending requests, etc.
   * @virtual
   * @returns {void}
   */
  onUnmount() {
    // Override in subclasses
  }

  /**
   * Lifecycle hook: called when state changes.
   * Override to update DOM based on new state.
   * @virtual
   * @param {ComponentState} oldState Previous state
   * @param {ComponentState} newState New state
   * @returns {void}
   */
  onStateChange(oldState, newState) {
    // Override in subclasses
  }

  /**
   * Update component state and trigger onStateChange hook.
   * @param {Partial<ComponentState>} updates Object with state changes
   * @returns {void}
   */
  setState(updates) {
    if (!updates || typeof updates !== "object") {
      throw new Error("setState requires an object");
    }
    const oldState = { ...this.state };
    this.state = { ...this.state, ...updates };
    this.onStateChange(oldState, this.state);
  }

  /**
   * Initialize component: load template + styles, mount to DOM.
   * @private
   * @returns {Promise<void>}
   */
  async _initialize() {
    try {
      // Determine component directory (relative to src/components/)
      const componentDir = this._getComponentDir();

      // Load template
      const templateUrl = new URL(this.getTemplateUrl(), componentDir).href;
      const templateHtml = await fetch(templateUrl).then((r) => r.text());
      const template = document.createElement("template");
      template.innerHTML = templateHtml;

      // Load and insert styles
      const styleUrl = new URL(this.getStyleUrl(), componentDir).href;
      const styleCss = await fetch(styleUrl).then((r) => r.text());
      const style = document.createElement("style");
      style.textContent = styleCss;

      // Append to light DOM (or shadowRoot if you prefer encapsulation)
      this.appendChild(template.content.cloneNode(true));
      this.prepend(style);

      // Call onMount hook
      this._mounted = true;
      await this.onMount();
    } catch (error) {
      console.error(`Failed to initialize ${this.constructor.name}:`, error);
      throw error;
    }
  }

  /**
   * Get the component's directory path (where .html and .css files live).
   * Infers from the component's tagName and typical directory structure:
   * <microphone-detector> => src/components/microphone/
   * <timeline-component> => src/components/timeline/
   * @private
   * @returns {URL} Directory URL
   */
  _getComponentDir() {
    // Map tag names to directory names
    // Tag name convention: kebab-case => src/components/{first-part}/
    const tagName = this.tagName.toLowerCase();
    const parts = tagName.split("-");

    // Remove trailing "component" or "detector" to get feature name
    let featureName = parts[0];
    if (parts.length > 1 && parts[parts.length - 1] === "component") {
      featureName = parts.slice(0, -1).join("-");
    } else if (parts.length > 1) {
      featureName = parts[0]; // use first part if multiple parts
    }

    // Use document.currentScript as fallback for import.meta
    const currentScript = /** @type {HTMLScriptElement|null} */ (document.currentScript);
    const baseUrl = new URL(currentScript?.src || window.location.href);
    const basePath = baseUrl.pathname.split("/").slice(0, -3).join("/");
    const componentDir = `${baseUrl.origin}${basePath}/${featureName}/`;
    return new URL(componentDir);
  }

  /**
   * Called when element is inserted into DOM.
   * @internal
   * @returns {void}
   */
  connectedCallback() {
    // Subclasses can override, but should call super
  }

  /**
   * Called when element is removed from DOM.
   * @internal
   * @returns {void}
   */
  disconnectedCallback() {
    this.onUnmount();
  }
}
