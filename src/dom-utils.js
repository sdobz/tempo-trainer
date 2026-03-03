/**
 * DOM utility functions for safe element access with non-null returns.
 * @module dom-utils
 */

/**
 * Gets a DOM element by ID and throws if not found.
 * @template {HTMLElement} T
 * @param {string} id - The element ID
 * @returns {T} The DOM element
 * @throws {Error} If element with given ID is not found
 */
export function getElementByID(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`DOM element with id "${id}" not found`);
  }
  return element;
}

/**
 * Gets a DOM element by CSS selector and throws if not found.
 * @template {Element} T
 * @param {string} selector - The CSS selector
 * @returns {T} The DOM element
 * @throws {Error} If element matching selector is not found
 */
export function getElementBySelector(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`DOM element matching selector "${selector}" not found`);
  }
  return element;
}

/**
 * Gets all DOM elements matching a selector.
 * @param {string} selector - The CSS selector
 * @returns {Element[]} Array of matching DOM elements
 */
export function getAllElements(selector) {
  return Array.from(document.querySelectorAll(selector));
}

/**
 * Gets an input element by ID with proper HTMLInputElement type.
 * @param {string} id - The element ID
 * @returns {HTMLInputElement} The input element
 * @throws {Error} If element is not found or is not an input
 */
export function getInputElement(id) {
  const element = getElementByID(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Element with id "${id}" is not an HTMLInputElement`);
  }
  return element;
}

/**
 * Gets a select element by ID with proper HTMLSelectElement type.
 * @param {string} id - The element ID
 * @returns {HTMLSelectElement} The select element
 * @throws {Error} If element is not found or is not a select
 */
export function getSelectElement(id) {
  const element = getElementByID(id);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`Element with id "${id}" is not an HTMLSelectElement`);
  }
  return element;
}

/**
 * Gets a button element by ID with proper HTMLButtonElement type.
 * @param {string} id - The element ID
 * @returns {HTMLButtonElement} The button element
 * @throws {Error} If element is not found or is not a button
 */
export function getButtonElement(id) {
  const element = getElementByID(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Element with id "${id}" is not an HTMLButtonElement`);
  }
  return element;
}
