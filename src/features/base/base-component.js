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
  onStateChange(_oldState, _newState) {
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
      // Load template
      const templateUrl =
        new URL(this.getTemplateUrl(), globalThis.location.origin).href;
      const templateHtml = await fetch(templateUrl).then((r) => r.text());

      // Create a temporary container to parse the HTML
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = templateHtml;

      // Extract content from the <template> element if present, otherwise use all children
      const templateElement = tempDiv.querySelector("template");
      const content = templateElement
        ? templateElement.content.cloneNode(true)
        : tempDiv.cloneNode(true);

      // Load and insert styles
      const styleUrl =
        new URL(this.getStyleUrl(), globalThis.location.origin).href;
      const styleCss = await fetch(styleUrl).then((r) => r.text());
      const style = document.createElement("style");
      style.textContent = styleCss;

      // Append template content and styles to light DOM
      this.appendChild(content);
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
