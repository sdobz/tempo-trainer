/**
 * Test mocks for browser APIs not available in Deno
 * These mocks provide minimal implementations for testing component logic
 * without requiring real browser environment or hardware access.
 *
 * @module test-mocks
 *
 * Usage in tests:
 *   import { setupGlobalMocks } from "../base/test-mocks.js";
 *   setupGlobalMocks();
 */

/**
 * Mock AudioContext for Web Audio API testing
 * Provides minimal interface for metronome, calibration tests
 */
export class MockAudioContext {
  constructor() {
    /** @type {number} */
    this.currentTime = 0;
    /** @type {Object} */
    this.destination = {};
    /** @type {number} */
    this.sampleRate = 44100;
  }

  /**
   * Create mock oscillator node
   * @returns {Object} Mock oscillator
   */
  createOscillator() {
    return {
      connect: () => {},
      disconnect: () => {},
      start: (/** @type {number} */ when = 0) => {},
      stop: (/** @type {number} */ when = 0) => {},
      frequency: { value: 440 },
      type: "sine",
    };
  }

  /**
   * Create mock gain node
   * @returns {Object} Mock gain node
   */
  createGain() {
    return {
      connect: () => {},
      disconnect: () => {},
      gain: {
        value: 1,
        setValueAtTime: (/** @type {number} */ value, /** @type {number} */ time) => {},
      },
    };
  }

  /**
   * Create mock analyser node
   * @returns {Object} Mock analyser
   */
  createAnalyser() {
    const dataArray = new Uint8Array(2048);
    return {
      connect: () => {},
      disconnect: () => {},
      fftSize: 2048,
      frequencyBinCount: 1024,
      getByteTimeDomainData: (/** @type {Uint8Array} */ array) => {
        // Fill with mock data (can be overridden in tests)
        for (let i = 0; i < array.length; i++) {
          array[i] = 128 + Math.random() * 10;
        }
      },
      getByteFrequencyData: (/** @type {Uint8Array} */ array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.random() * 255;
        }
      },
    };
  }

  /**
   * Create mock script processor (deprecated but used in some code)
   * @param {number} bufferSize Buffer size
   * @param {number} inputChannels Input channel count
   * @param {number} outputChannels Output channel count
   * @returns {Object} Mock script processor
   */
  createScriptProcessor(bufferSize, inputChannels, outputChannels) {
    return {
      connect: () => {},
      disconnect: () => {},
      onaudioprocess: null,
    };
  }

  /**
   * Resume audio context (for user gesture requirement)
   * @returns {Promise<void>}
   */
  async resume() {
    return Promise.resolve();
  }

  /**
   * Suspend audio context
   * @returns {Promise<void>}
   */
  async suspend() {
    return Promise.resolve();
  }

  /**
   * Close audio context
   * @returns {Promise<void>}
   */
  async close() {
    return Promise.resolve();
  }
}

/**
 * Mock MediaStream for getUserMedia testing
 */
export class MockMediaStream {
  constructor() {
    /** @type {Array} */
    this.tracks = [];
  }

  /**
   * Get all tracks
   * @returns {Array} Track list
   */
  getTracks() {
    return this.tracks;
  }

  /**
   * Get audio tracks
   * @returns {Array} Audio track list
   */
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }

  /**
   * Get video tracks
   * @returns {Array} Video track list
   */
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }

  /**
   * Add track
   * @param {Object} track Track to add
   */
  addTrack(track) {
    this.tracks.push(track);
  }

  /**
   * Remove track
   * @param {Object} track Track to remove
   */
  removeTrack(track) {
    const index = this.tracks.indexOf(track);
    if (index > -1) {
      this.tracks.splice(index, 1);
    }
  }
}

/**
 * Mock MediaDevices for microphone testing
 */
export class MockNavigatorMediaDevices {
  constructor() {
    /** @type {Array<{deviceId: string, kind: string, label: string, groupId: string}>} */
    this.mockDevices = [
      {
        deviceId: "default",
        kind: "audioinput",
        label: "Mock Microphone",
        groupId: "default-group",
      },
      {
        deviceId: "mock-mic-1",
        kind: "audioinput",
        label: "Test Microphone 1",
        groupId: "test-group",
      },
    ];
  }

  /**
   * Mock getUserMedia
   * @param {Object} constraints Media constraints
   * @returns {Promise<MockMediaStream>} Mock media stream
   */
  async getUserMedia(constraints) {
    const stream = new MockMediaStream();
    if (constraints.audio) {
      stream.addTrack({
        kind: "audio",
        id: "mock-audio-track",
        enabled: true,
        stop: () => {},
      });
    }
    return stream;
  }

  /**
   * Mock enumerateDevices
   * @returns {Promise<Array>} Mock device list
   */
  async enumerateDevices() {
    return Promise.resolve([...this.mockDevices]);
  }

  /**
   * Add a mock device (for testing device changes)
   * @param {{deviceId: string, kind: string, label: string}} device Device info
   */
  addMockDevice(device) {
    this.mockDevices.push({ ...device, groupId: device.groupId || "test-group" });
  }

  /**
   * Remove a mock device
   * @param {string} deviceId Device ID to remove
   */
  removeMockDevice(deviceId) {
    const index = this.mockDevices.findIndex((d) => d.deviceId === deviceId);
    if (index > -1) {
      this.mockDevices.splice(index, 1);
    }
  }
}

/**
 * Setup global mocks for testing
 * Call this at the beginning of test files that need browser APIs
 * @returns {void}
 */
export function setupGlobalMocks() {
  // Mock AudioContext
  // @ts-ignore - Adding to globalThis for tests
  globalThis.AudioContext = MockAudioContext;
  // @ts-ignore - webkit prefix
  globalThis.webkitAudioContext = MockAudioContext;

  // Mock navigator.mediaDevices
  if (!globalThis.navigator) {
    // @ts-ignore - Creating navigator for tests
    globalThis.navigator = {};
  }
  // @ts-ignore - Adding mediaDevices
  globalThis.navigator.mediaDevices = new MockNavigatorMediaDevices();

  // Mock localStorage if not available
  if (!globalThis.localStorage) {
    const storage = new Map();
    // @ts-ignore - Mock localStorage
    globalThis.localStorage = {
      getItem: (/** @type {string} */ key) => storage.get(key) || null,
      setItem: (/** @type {string} */ key, /** @type {string} */ value) =>
        storage.set(key, value),
      removeItem: (/** @type {string} */ key) => storage.delete(key),
      clear: () => storage.clear(),
      get length() {
        return storage.size;
      },
      key: (/** @type {number} */ index) => Array.from(storage.keys())[index] || null,
    };
  }

  // Mock window object
  if (!globalThis.window) {
    // @ts-ignore - Mock window
    globalThis.window = globalThis;
    // Mock location with realistic path structure for components
    // Simulates: http://localhost/src/components/test/test.js (not file:// to avoid origin issues)
    globalThis.window.location = {
      href: "http://localhost/src/components/test/test.js",
      protocol: "http:",
      host: "localhost",
      hostname: "localhost",
      port: "",
      pathname: "/src/components/test/test.js",
      search: "",
      hash: "",
      origin: "http://localhost",
    };
  }

  // Mock fetch for component template/style loading
  // Always override fetch (even if it exists) for testing
  const originalFetch = globalThis.fetch;
  // @ts-ignore - Override fetch
  globalThis.fetch = async (/** @type {string} */ url) => {
    // Return mock content based on file extension
    if (url.endsWith(".html")) {
      return {
        ok: true,
        status: 200,
        text: async () => "<div></div>",
        json: async () => ({}),
      };
    } else if (url.endsWith(".css")) {
      return {
        ok: true,
        status: 200,
        text: async () => "/* mock styles */",
        json: async () => ({}),
      };
    }
    // For other URLs, fallback to original fetch if available
    if (originalFetch) {
      return originalFetch(url);
    }
    // Default mock response
    return {
      ok: false,
      status: 404,
      text: async () => "",
      json: async () => ({}),
    };
  };

  // Mock document if not available (basic structure)
  if (!globalThis.document) {
    // @ts-ignore - Mock document
    globalThis.document = {
      createElement: (/** @type {string} */ tag) => {
        const element = {
          tagName: tag.toUpperCase(),
          children: [],
          appendChild: function (child) {
            this.children.push(child);
            return child;
          },
          prepend: function (...nodes) {
            this.children.unshift(...nodes);
          },
          removeChild: function (child) {
            const index = this.children.indexOf(child);
            if (index > -1) this.children.splice(index, 1);
            return child;
          },
          querySelector: () => null,
          querySelectorAll: () => [],
          addEventListener: () => {},
          removeEventListener: () => {},
          style: {},
          classList: {
            add: () => {},
            remove: () => {},
            contains: () => false,
            toggle: () => false,
          },
        };

        // Special handling for <template> elements
        if (tag.toLowerCase() === "template") {
          element.content = {
            childNodes: [],
            cloneNode: (deep) => {
              // Return a mock document fragment
              return {
                childNodes: deep ? [...element.content.childNodes] : [],
                appendChild: function (child) {
                  this.childNodes.push(child);
                  return child;
                },
              };
            },
          };
          // When innerHTML is set on template, parse and add to content
          Object.defineProperty(element, "innerHTML", {
            set: function (html) {
              // Mock parsing: just create a text node (good enough for tests)
              element.content.childNodes = [{ nodeType: 3, textContent: html }];
            },
            get: function () {
              return element.content.childNodes.map((n) => n.textContent || "").join("");
            },
          });
        } else if (tag.toLowerCase() === "style") {
          // Special handling for <style> elements
          Object.defineProperty(element, "textContent", {
            value: "",
            writable: true,
          });
        }

        return element;
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      currentScript: null,
    };
  }

  // Mock HTMLElement for custom elements
  if (!globalThis.HTMLElement) {
    //  Store the expected tagName for the next instance creation
    let nextElementTagName = null;

    // @ts-ignore - Mock HTMLElement
    globalThis.HTMLElement = class {
      constructor() {
        this.children = [];
        this.style = {};
        this.classList = {
          add: () => {},
          remove: () => {},
          contains: () => false,
          toggle: () => false,
        };
        // Set tagName from the pending value if available
        if (nextElementTagName) {
          this.tagName = nextElementTagName;
          nextElementTagName = null; // Clear after use
        } else {
          this.tagName = "DIV"; // Default fallback
        }
      }
      appendChild(child) {
        this.children.push(child);
        return child;
      }
      prepend(...nodes) {
        this.children.unshift(...nodes);
      }
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index > -1) this.children.splice(index, 1);
        return child;
      }
      querySelector() {
        return null;
      }
      querySelectorAll() {
        return [];
      }
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() {
        return true;
      }
      setAttribute(/** @type {string} */ name, /** @type {string} */ value) {
        // Store attributes for testing
        if (!this.attributes) this.attributes = {};
        this.attributes[name] = value;
      }
      getAttribute(/** @type {string} */ name) {
        return this.attributes?.[name] || null;
      }
    };

    // Store reference to set tagName before construction
    // @ts-ignore - Add setter for next element tag
    globalThis.HTMLElement._setNextElementTagName = (tagName) => {
      nextElementTagName = tagName;
    };
  }

  // Mock customElements registry
  if (!globalThis.customElements) {
    const registry = new Map();
    // @ts-ignore - Mock customElements
    globalThis.customElements = {
      define: (/** @type {string} */ name, /** @type {Function} */ constructor) => {
        registry.set(name, constructor);
      },
      get: (/** @type {string} */ name) => registry.get(name),
      whenDefined: (/** @type {string} */ name) =>
        Promise.resolve(registry.get(name) || class {}),
    };
  }

  // Enhance document.createElement to support custom elements
  if (globalThis.document && globalThis.customElements) {
    const originalCreateElement = globalThis.document.createElement;
    globalThis.document.createElement = (/** @type {string} */ tagName) => {
      const lowerTag = tagName.toLowerCase();
      const CustomElementClass = globalThis.customElements.get(lowerTag);

      if (CustomElementClass) {
        // Set tagName BEFORE creating instance (so it's available during construction)
        const tagNameUpper = tagName.toUpperCase();
        if (globalThis.HTMLElement._setNextElementTagName) {
          globalThis.HTMLElement._setNextElementTagName(tagNameUpper);
        }

        // Create instance - constructor will pick up the tagName we just set
        const instance = new CustomElementClass();
        return instance;
      }

      // Fall back to original or mock implementation
      const element = originalCreateElement
        ? originalCreateElement.call(globalThis.document, tagName)
        : {
            tagName: tagName.toUpperCase(),
            children: [],
            appendChild: function (child) {
              this.children.push(child);
              return child;
            },
            removeChild: function (child) {
              const index = this.children.indexOf(child);
              if (index > -1) this.children.splice(index, 1);
              return child;
            },
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {},
            removeEventListener: () => {},
            style: {},
            classList: {
              add: () => {},
              remove: () => {},
              contains: () => false,
              toggle: () => false,
            },
          };
      return element;
    };
  }
}

/**
 * Clear all mocks (for test isolation)
 * @returns {void}
 */
export function clearGlobalMocks() {
  // Clear localStorage
  if (globalThis.localStorage) {
    globalThis.localStorage.clear();
  }

  // Reset navigator.mediaDevices to fresh state
  if (globalThis.navigator?.mediaDevices) {
    // @ts-ignore
    globalThis.navigator.mediaDevices = new MockNavigatorMediaDevices();
  }
}
