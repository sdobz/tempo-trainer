/**
 * Bootstrap test environment with DOM APIs
 * This must be imported at the top of test files before other imports
 */

// deno-lint-ignore-file no-unused-vars no-explicit-any

// For Deno: inject DOM globals if not already available
if (typeof globalThis !== "undefined") {
  // Add HTMLElement and other DOM constructors to globalThis
  if (typeof HTMLElement === "undefined") {
    // Create minimal DOM stubs that components can extend
    globalThis.Node = class Node {
      constructor() {
        this.childNodes = [];
        this.parentNode = null;
      }
    };

    globalThis.EventTarget = class EventTarget {
      constructor() {
        this._listeners = {};
      }
      addEventListener(type, listener) {
        if (!this._listeners[type]) {
          this._listeners[type] = [];
        }
        this._listeners[type].push(listener);
      }
      removeEventListener(type, listener) {
        if (this._listeners[type]) {
          this._listeners[type] = this._listeners[type].filter((l) => l !== listener);
        }
      }
      dispatchEvent(event) {
        if (this._listeners[event.type]) {
          this._listeners[event.type].forEach((listener) => listener(event));
        }
      }
    };

    globalThis.Element = class Element extends EventTarget {
      constructor() {
        super();
        this.className = "";
        this.id = "";
        this.tagName = "";
        this.children = [];
        this.childNodes = [];
      }

      getAttribute(name) {
        return null;
      }

      setAttribute(name, value) {}

      removeAttribute(name) {}

      querySelector(selector) {
        return null;
      }

      querySelectorAll(selector) {
        return [];
      }

      appendChild(child) {
        return child;
      }

      removeChild(child) {
        return child;
      }

      addEventListener(type, listener) {
        super.addEventListener(type, listener);
      }
    };

    globalThis.HTMLElement = class HTMLElement extends Element {
      constructor() {
        super();
        this.shadowRoot = null;
        this.innerHTML = "";
        this.innerText = "";
      }

      attachShadow(options) {
        return {
          appendChild: () => {},
          querySelector: () => null,
          querySelectorAll: () => [],
        };
      }

      addEventListener(type, listener) {
        super.addEventListener(type, listener);
      }
    };

    // Create specific element types
    globalThis.HTMLDivElement = class HTMLDivElement extends HTMLElement {
      constructor() {
        super();
        this.tagName = "DIV";
      }
    };

    globalThis.HTMLSelectElement = class HTMLSelectElement extends HTMLElement {
      constructor() {
        super();
        this.tagName = "SELECT";
        this.value = "";
        this.options = [];
      }
    };

    globalThis.HTMLCanvasElement = class HTMLCanvasElement extends HTMLElement {
      constructor() {
        super();
        this.tagName = "CANVAS";
        this.width = 0;
        this.height = 0;
      }

      getContext(type) {
        return {
          fillStyle: "",
          strokeStyle: "",
          fillRect: () => {},
          clearRect: () => {},
          drawImage: () => {},
        };
      }
    };

    // Document object
    globalThis.Document = class Document extends EventTarget {
      constructor() {
        super();
        this.documentElement = new Element();
        this.body = new HTMLElement();
      }

      createElement(tagName) {
        // Check if this is a custom element that was defined
        const customElementClass = globalThis._customElements?.[tagName];
        if (customElementClass) {
          const instance = new customElementClass();
          instance.tagName = tagName.toUpperCase();
          return instance;
        }

        // Otherwise create a regular element
        const element = new HTMLElement();
        element.tagName = tagName.toUpperCase();
        return element;
      }

      createElementNS(ns, tagName) {
        return this.createElement(tagName);
      }

      querySelector(selector) {
        return null;
      }

      querySelectorAll(selector) {
        return [];
      }

      getElementById(id) {
        return null;
      }

      getElementsByClassName(className) {
        return [];
      }

      getElementsByTagName(tagName) {
        return [];
      }
    };

    // Create document instance
    if (typeof document === "undefined") {
      globalThis.document = new Document();
    }

    // CustomEvent
    if (typeof CustomEvent === "undefined") {
      globalThis.CustomEvent = class CustomEvent extends Event {
        constructor(type, options = {}) {
          super(type);
          this.detail = options.detail;
          this.bubbles = options.bubbles || false;
          this.cancelable = options.cancelable || false;
        }
      };
    }

    // Event
    if (typeof Event === "undefined") {
      globalThis.Event = class Event {
        constructor(type, options = {}) {
          this.type = type;
          this.bubbles = options.bubbles || false;
          this.cancelable = options.cancelable || false;
          this.composed = options.composed || false;
        }

        preventDefault() {}
        stopPropagation() {}
        stopImmediatePropagation() {}
      };
    }

    // CustomElementRegistry
    if (typeof CustomElementRegistry === "undefined") {
      globalThis.CustomElementRegistry = class CustomElementRegistry {
        define(name, constructor, options) {
          if (!globalThis._customElements) {
            globalThis._customElements = {};
          }
          globalThis._customElements[name] = constructor;
        }

        get(name) {
          if (!globalThis._customElements) {
            return undefined;
          }
          return globalThis._customElements[name];
        }

        whenDefined(name) {
          return Promise.resolve();
        }
      };
    }

    // Custom elements registry instance
    if (typeof customElements === "undefined") {
      globalThis.customElements = new (
        globalThis.CustomElementRegistry ||
        function CustomElementRegistry() {
          this.define = () => {};
          this.get = () => undefined;
          this.whenDefined = () => Promise.resolve();
        }
      )();
    }
  }
}
