/**
 * Minimal test framework for component tests
 * Provides describe/it/beforeEach/assert patterns
 * @module test-framework
 */

/**
 * @typedef {Object} TestError
 * @property {string} suite
 * @property {string} test
 * @property {Error} error
 */

/**
 * Test results tracker
 */
const testResults = {
  passed: 0,
  failed: 0,
  /** @type {TestError[]} */
  errors: [],
};

/**
 * Current test context
 */
/** @type {string|null} */
let currentDescribe = null;
/** @type {Array<() => void|Promise<void>>} */
let beforeEachHooks = [];

/**
 * Define a test suite
 * @param {string} name Suite name
 * @param {() => void} fn Suite function
 */
export function describe(name, fn) {
  const previousDescribe = currentDescribe;
  const previousHooks = beforeEachHooks;

  currentDescribe = name;
  beforeEachHooks = [];

  console.log(`\n${name}`);

  try {
    fn();
  } catch (error) {
    testResults.failed++;
    const err = error instanceof Error ? error : new Error(String(error));
    testResults.errors.push({ suite: name, test: "suite setup", error: err });
    console.error(`  ✗ Suite setup failed: ${err.message}`);
  }

  currentDescribe = previousDescribe;
  beforeEachHooks = previousHooks;
}

/**
 * Register a beforeEach hook
 * @param {() => void|Promise<void>} fn Hook function
 */
export function beforeEach(fn) {
  beforeEachHooks.push(fn);
}

/**
 * Define a test case
 * @param {string} name Test name
 * @param {(done?: () => void) => void|Promise<void>} fn Test function
 */
export async function it(name, fn) {
  try {
    // Run beforeEach hooks
    for (const hook of beforeEachHooks) {
      await hook();
    }

    // Check if test uses done callback
    if (fn.length > 0) {
      // Test expects done callback
      await new Promise((resolve, reject) => {
        /** @param {Error|null|undefined} [err] */
        const done = (err) => {
          if (err) reject(err);
          else resolve(undefined);
        };

        try {
          fn(done);
        } catch (error) {
          reject(error);
        }

        // Timeout after 5 seconds
        setTimeout(() => reject(new Error("Test timeout")), 5000);
      });
    } else {
      // Regular async test
      await fn();
    }

    testResults.passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    testResults.failed++;
    const err = error instanceof Error ? error : new Error(String(error));
    testResults.errors.push({
      suite: currentDescribe || "unknown",
      test: name,
      error: err,
    });
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) {
      const stack = err.stack.split("\n").slice(1, 4).join("\n");
      console.error(`    ${stack}`);
    }
  }
}

/**
 * Export the results and exit
 */
export function finish() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Tests: ${testResults.passed} passed, ${testResults.failed} failed`);

  if (testResults.failed > 0) {
    console.log("\nFailed tests:");
    testResults.errors.forEach(({ suite, test, error }) => {
      console.log(`  ${suite} > ${test}`);
      console.log(`    ${error.message}`);
    });
    // @ts-ignore - process exists in Node.js
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed");
    // @ts-ignore - process exists in Node.js
    process.exit(0);
  }
}

/**
 * Auto-finish when module is done loading (after a tick)
 */
// @ts-ignore - process exists in Node.js
if (typeof process !== 'undefined') {
  // @ts-ignore - process exists in Node.js
  process.nextTick(() => {
    // Give tests time to register
    setTimeout(() => {
      if (testResults.passed + testResults.failed > 0) {
        finish();
      }
    }, 100);
  });
}
