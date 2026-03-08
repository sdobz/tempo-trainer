/**
 * WCCG Context Protocol implementation.
 * Spec: https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md
 *
 * Usage pattern:
 *
 *   // 1. Define a context token (object identity is the key):
 *   export const MyContext = createContext('my-context', defaultValue);
 *
 *   // 2. Provider (ancestor) calls provideContext() in onMount():
 *   this.provideContext(MyContext, () => this._myValue);
 *   // When value changes, call notifyContext(MyContext) to push to subscribers.
 *
 *   // 3. Consumer (descendant) calls consumeContext() in onMount():
 *   this.consumeContext(MyContext, (value) => { this._myValue = value; });
 *   // Callback is invoked immediately with current value, then on every change.
 *
 * State flows DOWN via context (provider → consumer).
 * Changes bubble UP via standard CustomEvents (consumer → ancestor listener).
 */

/**
 * A context token. Object identity is the lookup key.
 * @template T
 */
export class Context {
  /**
   * @param {string} name - Debug name shown in warnings
   * @param {T} [initialValue] - Optional default (unused at runtime; documents intent)
   */
  constructor(name, initialValue) {
    this.name = name;
    this.initialValue = initialValue;
  }
}

/**
 * Event fired by a consumer (child) to request a context value from the nearest
 * provider (ancestor). Bubbles up the DOM tree; the first ancestor that holds the
 * matching context intercepts it via stopPropagation().
 *
 * @template T
 * @extends Event
 */
export class ContextRequestEvent extends Event {
  /**
   * @param {Context<T>} context - The context token being requested
   * @param {(value: T) => void} callback - Invoked immediately with current value; also
   *   stored and called again on every future change if subscribe is true
   * @param {boolean} [subscribe=false] - If true, callback is retained for future updates
   */
  constructor(context, callback, subscribe = false) {
    super("context-request", { bubbles: true, composed: true });
    this.context = context;
    this.callback = callback;
    this.subscribe = subscribe;
  }
}

/**
 * Create a named context token.
 * @template T
 * @param {string} name
 * @param {T} [initialValue]
 * @returns {Context<T>}
 */
export function createContext(name, initialValue) {
  return new Context(name, initialValue);
}
