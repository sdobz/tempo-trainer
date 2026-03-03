/**
 * Setup DOM environment for tests using jsdom
 * Must be imported before any component code
 */

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck

import { JSDOM } from "npm:jsdom@23.0.0";

// Create a JSDOM instance
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

// Inject DOM globals from jsdom into globalThis
const keys = Object.getOwnPropertyNames(dom.window) as any[];
for (const key of keys) {
  if (
    key !== "window" &&
    key !== "self" &&
    key !== "top" &&
    key !== "parent" &&
    key !== "frames" &&
    key !== "length" &&
    key !== "frameElement"
  ) {
    try {
      globalThis[key] = dom.window[key];
    } catch (e) {
      // Some properties might be read-only or throw
    }
  }
}

// Explicitly set commonly-used globals
globalThis.window = dom.window as any;
globalThis.document = dom.window.document as any;
globalThis.HTMLElement = dom.window.HTMLElement as any;
globalThis.Element = dom.window.Element as any;
globalThis.Document = dom.window.Document as any;
globalThis.Event = dom.window.Event as any;
globalThis.CustomEvent = dom.window.CustomEvent as any;
globalThis.DOMParser = dom.window.DOMParser as any;
