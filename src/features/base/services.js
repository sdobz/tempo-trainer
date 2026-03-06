/**
 * Services — Named registry for global singletons.
 *
 * Avoids prop-drilling and circular imports for shared application services
 * (e.g. DetectorManager) that are created once and consumed in many places.
 *
 * Usage:
 *   // Registration (script.js, before component init):
 *   Services.register("detectorManager", new DetectorManager(StorageManager));
 *
 *   // Consumption (any module):
 *   const detectorManager = Services.get("detectorManager");
 *
 * Re-registration is allowed (useful in tests for injecting mocks).
 */

/** @type {Map<string, any>} */
const _registry = new Map();

const Services = {
  /**
   * Register a named service instance.
   * Overwrites any previously registered instance with the same name.
   * @param {string} name
   * @param {any} instance
   */
  register(name, instance) {
    _registry.set(name, instance);
  },

  /**
   * Retrieve a registered service by name.
   * @param {string} name
   * @returns {any}
   * @throws {Error} if the service has not been registered
   */
  get(name) {
    if (!_registry.has(name)) {
      throw new Error(
        `Service "${name}" is not registered. Call Services.register() before use.`,
      );
    }
    return _registry.get(name);
  },

  /**
   * Check whether a service is registered.
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return _registry.has(name);
  },
};

export default Services;
