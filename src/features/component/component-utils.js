/**
 * Component utilities for common tasks
 * @module component-utils
 */

/**
 * Query a single element within a component using CSS selector.
 * Throws if not found.
 * @template {Element} T
 * @param {Element|Document} context DOM element to search within
 * @param {string} selector CSS selector
 * @returns {T} The found element
 * @throws {Error} If element not found
 */
export function querySelector(context, selector) {
  const element = context.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return /** @type {T} */ (element);
}

/**
 * Query multiple elements within a component.
 * @param {Element|Document} context DOM element to search within
 * @param {string} selector CSS selector
 * @returns {Element[]} Array of found elements (may be empty)
 */
export function querySelectorAll(context, selector) {
  return Array.from(context.querySelectorAll(selector));
}

/**
 * Safe element cast with type assertion.
 * @template {Element} T
 * @param {Element|null|undefined} element Element to cast
 * @param {string} [expectedType] Expected element type for error message
 * @returns {T} Casted element
 * @throws {Error} If element is null or undefined
 */
export function assertElement(element, expectedType = "Element") {
  if (!element) {
    throw new Error(`Expected ${expectedType}, got null or undefined`);
  }
  return /** @type {T} */ (element);
}

/**
 * Bind event listener and return cleanup function.
 * For use OUTSIDE of BaseComponent subclasses. Inside components, prefer this.listen().
 * @param {EventTarget} element Element or global target to bind to
 * @param {string} eventName Event name (e.g., 'click', 'input')
 * @param {EventListener} handler Event handler
 * @param {AddEventListenerOptions|boolean} [options] addEventListener options (supports capture, once, passive)
 * @returns {() => void} Cleanup function to unbind event
 */
export function bindEvent(element, eventName, handler, options) {
  element.addEventListener(eventName, handler, options);
  return () => element.removeEventListener(eventName, handler, options);
}

/**
 * Bind multiple events at once, return cleanup function.
 * @param {EventTarget} element Element or global target to bind to
 * @param {Object<string, EventListener>} handlers Map of eventName => handler
 * @returns {() => void} Cleanup function
 */
export function bindEvents(element, handlers) {
  const unbinders = Object.entries(handlers).map(([name, handler]) =>
    bindEvent(element, name, handler)
  );
  return () => unbinders.forEach((fn) => fn());
}

/**
 * Dispatch custom event with detail.
 * @param {Element} element Element to dispatch from
 * @param {string} eventName Custom event name
 * @param {*} [detail] Event detail data
 * @returns {boolean} Whether defaultAction wasn't prevented
 */
export function dispatchEvent(element, eventName, detail) {
  const event = new CustomEvent(eventName, {
    detail,
    bubbles: true,
    composed: true,
  });
  return element.dispatchEvent(event);
}

/**
 * Safely get input element's current value.
 * @param {HTMLInputElement} input Input element
 * @returns {string} Input value
 */
export function getInputValue(input) {
  return input.value || "";
}

/**
 * Safely get select element's current value.
 * @param {HTMLSelectElement} select Select element
 * @returns {string} Selected value
 */
export function getSelectValue(select) {
  return select.value || "";
}

/**
 * Set text content, safely handling null values.
 * @param {Element} element Element to update
 * @param {string|number|null} text Text to set (null = empty string)
 * @returns {void}
 */
export function setText(element, text) {
  element.textContent = String(text ?? "");
}

/**
 * Update class list based on condition.
 * @param {Element} element Element to update
 * @param {string} className Class name to add/remove
 * @param {boolean} condition True to add, false to remove
 * @returns {void}
 */
export function toggleClass(element, className, condition) {
  if (condition) {
    element.classList.add(className);
  } else {
    element.classList.remove(className);
  }
}

/**
 * Clear all children of an element.
 * @param {Element} element Element to clear
 * @returns {void}
 */
export function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Create a list item with text and optional classes.
 * @param {string} text Item text
 * @param {string[]} [classes] CSS classes to add
 * @returns {HTMLLIElement} New list item
 */
export function createListItem(text, classes = []) {
  const li = document.createElement("li");
  li.textContent = text;
  classes.forEach((cls) => li.classList.add(cls));
  return li;
}

/**
 * Create a button with text, classes, and click handler.
 * @param {string} text Button text
 * @param {(e: Event) => void} onClick Click handler
 * @param {string[]} [classes] CSS classes
 * @returns {HTMLButtonElement} New button
 */
export function createButton(text, onClick, classes = []) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  classes.forEach((cls) => btn.classList.add(cls));
  return btn;
}

/**
 * Returns the keys whose values differ between two state objects.
 * Useful in onStateChange to determine which slice of state changed.
 *
 * @param {Object.<string, *>} oldState
 * @param {Object.<string, *>} newState
 * @returns {string[]} Array of changed key names
 *
 * @example
 * onStateChange(oldState, newState) {
 *   const changed = changedKeys(oldState, newState);
 *   if (changed.includes('isPlaying')) {
 *     this.startBtn.disabled = newState.isPlaying;
 *   }
 * }
 */
export function changedKeys(oldState, newState) {
  const keys = new Set([
    ...Object.keys(oldState),
    ...Object.keys(newState),
  ]);
  return [...keys].filter((k) => oldState[k] !== newState[k]);
}
