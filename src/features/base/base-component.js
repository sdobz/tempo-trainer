/**
 * BaseComponent - Abstract Web Component with lifecycle hooks and state management
 * @module base-component
 *
 * All UI components should extend this class. It provides:
 * - Template loading from separate .html files
 * - Style loading from separate .css files
 * - Lifecycle hooks (onMount, onUnmount, onStateChange, onShow, onHide)
 * - State management with mount guard and re-entrance protection
 * - Automatic event listener cleanup via this.listen()
 * - Custom event emission via this.emit()
 * - AbortController for fetch cancellation on disconnect
 * - Context protocol (provideContext / consumeContext / notifyContext)
 */

import { ContextRequestEvent } from "./context.js";

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
    /** @type {boolean} Whether the component's pane is currently visible */
    this._visible = false;
    /** @type {boolean} Re-entrance guard for setState */
    this._isUpdating = false;
    /** @type {Partial<ComponentState>|null} Queued setState updates during onStateChange */
    this._pendingUpdates = null;
    /** @type {Array<() => void>} Cleanup functions registered via this.listen() */
    this._cleanups = [];
    /** @type {AbortController} Used to cancel in-flight fetch calls on disconnect */
    this._initAbortController = new AbortController();
    /**
     * Context providers registered on this component.
     * Map<Context, { getValue: () => any, subscribers: Set<(value: any) => void> }>
     * @type {Map<import('./context.js').Context<any>, { getValue: () => any, subscribers: Set<(value: any) => void> }>}
     */
    this._contextProviders = new Map();
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
   * Lifecycle hook: called once after template + styles are loaded and DOM is ready.
   * Override to query DOM elements, bind event listeners via this.listen(), etc.
   * @virtual
   * @returns {Promise<void>}
   */
  async onMount() {
    // Override in subclasses
  }

  /**
   * Lifecycle hook: called when component is removed from DOM.
   * this.listen() cleanups run automatically before this hook.
   * Override for additional cleanup (e.g., stopping domain modules).
   * @virtual
   * @returns {void}
   */
  onUnmount() {
    // Override in subclasses
  }

  /**
   * Lifecycle hook: called by PaneManager when this component's pane becomes visible.
   * Override to resume expensive resources (mic streams, rAF loops, audio).
   * @virtual
   * @returns {void}
   */
  onShow() {
    // Override in subclasses
  }

  /**
   * Lifecycle hook: called by PaneManager when this component's pane is hidden.
   * Override to pause expensive resources. Must be synchronous.
   * @virtual
   * @returns {void}
   */
  onHide() {
    // Override in subclasses
  }

  /**
   * Lifecycle hook: called when state changes.
   * This is the ONLY place DOM updates should happen — never update the DOM
   * directly in event handlers or delegate callbacks; call setState() instead.
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
   *
   * Guards:
   * - No-op if component is not mounted (prevents stale async callbacks).
   * - Re-entrance safe: calls during onStateChange are queued and flushed after.
   *
   * @param {Partial<ComponentState>} updates Object with state changes to merge
   * @returns {void}
   */
  setState(updates) {
    if (!updates || typeof updates !== "object") {
      throw new Error("setState requires an object");
    }

    // Mount guard: ignore updates after unmount
    if (!this._mounted) {
      return;
    }

    // Re-entrance guard: queue updates triggered during onStateChange
    if (this._isUpdating) {
      this._pendingUpdates = this._pendingUpdates
        ? { ...this._pendingUpdates, ...updates }
        : { ...updates };
      return;
    }

    this._isUpdating = true;
    const oldState = { ...this.state };
    this.state = { ...this.state, ...updates };
    try {
      this.onStateChange(oldState, this.state);
    } finally {
      this._isUpdating = false;
    }

    // Flush any updates that were queued during onStateChange
    if (this._pendingUpdates) {
      const pending = this._pendingUpdates;
      this._pendingUpdates = null;
      this.setState(pending);
    }
  }

  /**
   * Bind an event listener and automatically remove it on unmount.
   * Prefer this over raw addEventListener inside components.
   *
   * @param {EventTarget} target Element or global target to bind to
   * @param {string} event Event name (e.g. 'click', 'input')
   * @param {EventListener} handler Event handler function
   * @param {AddEventListenerOptions|boolean} [options] addEventListener options
   * @returns {() => void} Cleanup function (also called automatically on unmount)
   */
  listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    const cleanup = () => target.removeEventListener(event, handler, options);
    this._cleanups.push(cleanup);
    return cleanup;
  }

  /**
   * Dispatch a bubbling CustomEvent from this element.
   * Prefer this.emit() over importing dispatchEvent from component-utils.
   *
   * @param {string} name Event name
   * @param {*} [detail] Event detail payload
   * @returns {boolean} False if defaultPrevented, otherwise true
   */
  emit(name, detail) {
    return this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true }),
    );
  }

  // ---------------------------------------------------------------------------
  // Context protocol (WCCG spec)
  // ---------------------------------------------------------------------------

  /**
   * Declare this component as a provider for the given context.
   * Must be called from onMount() so the element is connected to the DOM.
   *
   * When a 'context-request' event bubbles up from a descendant requesting this
   * context, the provider delivers the current value immediately.
   * If the request has subscribe=true the callback is retained and called again
   * whenever notifyContext(context) is called.
   *
   * @template T
   * @param {import('./context.js').Context<T>} context - The context token
   * @param {() => T} getValue - Returns the current value to deliver
   */
  provideContext(context, getValue) {
    const entry = { getValue, subscribers: new Set() };
    this._contextProviders.set(context, entry);

    const handler = (/** @type {ContextRequestEvent<T>} */ event) => {
      if (event.context !== context) return;
      event.stopPropagation();
      event.callback(getValue());
      if (event.subscribe) {
        entry.subscribers.add(event.callback);
      }
    };

    this.addEventListener("context-request", handler);
    this._cleanups.push(() => {
      this.removeEventListener("context-request", handler);
      this._contextProviders.delete(context);
    });
  }

  /**
   * Push an updated value to all subscribers of the given context.
   * Call this whenever the provided value changes.
   *
   * @template T
   * @param {import('./context.js').Context<T>} context
   */
  notifyContext(context) {
    const entry = this._contextProviders.get(context);
    if (!entry) return;
    const value = entry.getValue();
    for (const cb of entry.subscribers) {
      cb(value);
    }
  }

  /**
   * Request a context value from the nearest ancestor provider.
   * Must be called from onMount() so the element is connected and the event
   * can bubble up to the provider.
   *
   * The callback is invoked immediately when the provider responds, and again
   * on every future change (subscribe=true by default).
   *
   * @template T
   * @param {import('./context.js').Context<T>} context
   * @param {(value: T) => void} callback
   */
  consumeContext(context, callback) {
    const event = new ContextRequestEvent(context, callback, true);
    const dispatched = this.dispatchEvent(event);
    // If the event was not stopped, no provider was found
    if (dispatched) {
      console.warn(
        `[context] No provider found for context "${context.name}" requested by ${this.constructor.name}`,
      );
    }
  }

  /**
   * Initialize component: load template + styles, mount to DOM.
   * @private
   * @returns {Promise<void>}
   */
  async _initialize() {
    const signal = this._initAbortController.signal;
    try {
      // Load template
      const templateUrl = new URL(
        this.getTemplateUrl(),
        globalThis.location.origin,
      ).href;
      const templateHtml = await fetch(templateUrl, { signal }).then((r) =>
        r.text(),
      );

      // Create a temporary container to parse the HTML
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = templateHtml;

      // Extract content from the <template> element if present, otherwise use all children
      const templateElement = tempDiv.querySelector("template");
      const content = templateElement
        ? templateElement.content.cloneNode(true)
        : tempDiv.cloneNode(true);

      // Load and insert styles
      const styleUrl = new URL(this.getStyleUrl(), globalThis.location.origin)
        .href;
      const styleCss = await fetch(styleUrl, { signal }).then((r) => r.text());
      const style = document.createElement("style");
      style.textContent = styleCss;

      // Append template content and styles to light DOM
      this.appendChild(content);
      this.prepend(style);

      // Call onMount hook
      this._mounted = true;
      await this.onMount();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Component was disconnected before initialization completed — ignore
        return;
      }
      console.error(`Failed to initialize ${this.constructor.name}:`, error);
      throw error;
    }
  }

  /**
   * Run and clear all cleanup functions registered via this.listen().
   * @private
   */
  _runCleanups() {
    this._cleanups.forEach((fn) => fn());
    this._cleanups = [];
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
   * Cancels in-flight template fetches, runs listen() cleanups, then calls onUnmount.
   * @internal
   * @returns {void}
   */
  disconnectedCallback() {
    this._initAbortController.abort();
    this._mounted = false;
    this._runCleanups();
    this.onUnmount();
  }
}
