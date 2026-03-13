/**
 * Minimal fine-grained reactive primitives.
 *
 * API:
 * - createSignal(initialValue): [get, set]
 * - createEffect(callback): dispose
 */

/** @typedef {{
 *   deps: Set<Set<ReactiveEffect>>,
 *   disposed: boolean,
 *   cleanup: (() => void)|null,
 *   run: () => void,
 * }} ReactiveEffect */

/** @type {ReactiveEffect|null} */
let activeEffect = null;

/**
 * @template T
 * @param {T} initialValue
 * @returns {[() => T, (nextValue: T) => T]}
 */
export function createSignal(initialValue) {
  /** @type {T} */
  let value = initialValue;
  /** @type {Set<ReactiveEffect>} */
  const subscribers = new Set();

  const get = () => {
    if (activeEffect && !activeEffect.disposed) {
      subscribers.add(activeEffect);
      activeEffect.deps.add(subscribers);
    }
    return value;
  };

  const set = (nextValue) => {
    if (Object.is(value, nextValue)) {
      return value;
    }
    value = nextValue;

    // Snapshot to avoid iteration issues if effects mutate subscriptions while running.
    const pending = Array.from(subscribers);
    pending.forEach((effect) => effect.run());
    return value;
  };

  return [get, set];
}

/**
 * @param {() => void} fn
 */
function runSafely(fn) {
  try {
    fn();
  } catch (error) {
    // Keep runtime resilient; surface error asynchronously.
    queueMicrotask(() => {
      throw error;
    });
  }
}

/**
 * Create an effect and return its disposer.
 * The callback can optionally return a cleanup function.
 *
 * @param {() => void|(() => void)} callback
 * @returns {() => void}
 */
export function createEffect(callback) {
  /** @type {ReactiveEffect} */
  const effect = {
    deps: new Set(),
    disposed: false,
    cleanup: null,
    run() {
      if (effect.disposed) return;

      effect.deps.forEach((dep) => dep.delete(effect));
      effect.deps.clear();

      if (effect.cleanup) {
        const cleanup = effect.cleanup;
        effect.cleanup = null;
        runSafely(cleanup);
      }

      const previousEffect = activeEffect;
      activeEffect = effect;
      try {
        const maybeCleanup = callback();
        effect.cleanup =
          typeof maybeCleanup === "function" ? maybeCleanup : null;
      } finally {
        activeEffect = previousEffect;
      }
    },
  };

  effect.run();

  return () => {
    if (effect.disposed) return;
    effect.disposed = true;

    effect.deps.forEach((dep) => dep.delete(effect));
    effect.deps.clear();

    if (effect.cleanup) {
      const cleanup = effect.cleanup;
      effect.cleanup = null;
      runSafely(cleanup);
    }
  };
}
