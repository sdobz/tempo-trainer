/**
 * Minimal assertion library for testing
 * Simple, zero-dependency test assertions
 */

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
  // Deep equality check for objects and arrays
  if (!deepEquals(actual, expected)) {
    throw new AssertionError(
      message ||
        `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`
    );
  }
}

function deepEquals(a: unknown, b: unknown): boolean {
  // Handle primitives and null/undefined
  if (a === b) return true;
  
  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEquals(val, b[idx]));
  }
  
  // Handle objects
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(
      (key) =>
        deepEquals(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
    );
  }
  
  return false;
}

export function assertNotEquals<T>(actual: T, expected: T, message?: string): void {
  if (Object.is(actual, expected)) {
    throw new AssertionError(
      message || `Expected not to equal ${JSON.stringify(expected)}`
    );
  }
}

export function assertTrue(value: unknown, message?: string): void {
  if (value !== true) {
    throw new AssertionError(message || `Expected true but got ${value}`);
  }
}

export function assertFalse(value: unknown, message?: string): void {
  if (value !== false) {
    throw new AssertionError(message || `Expected false but got ${value}`);
  }
}

export function assertThrows(
  fn: () => void | Promise<void>,
  ErrorType?: typeof Error,
  message?: string
): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      throw new AssertionError(
        "assertThrows does not support async functions. Use 'await assertRejects()' instead"
      );
    }
    throw new AssertionError(
      message || `Expected function to throw, but it did not`
    );
  } catch (err) {
    if (ErrorType && !(err instanceof ErrorType)) {
      throw new AssertionError(
        message ||
          `Expected ${ErrorType.name} but got ${err instanceof Error ? err.constructor.name : typeof err}`
      );
    }
  }
}

export function assert(value: unknown, message?: string): void {
  if (!value) {
    throw new AssertionError(message || `Assertion failed: ${value}`);
  }
}
