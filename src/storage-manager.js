/**
 * StorageManager - Utility for managing localStorage persistence
 * Provides type-safe access to localStorage with fallback to default values
 */
class StorageManager {
  /**
   * Get a string value from localStorage
   * @param {string} key - The storage key
   * @param {string|null} [defaultValue=null] - Default value if key not found
   * @returns {string|null} The stored value or defaultValue
   */
  static get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? value : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Get a number value from localStorage
   * @param {string} key - The storage key
   * @param {number} [defaultValue=0] - Default value if key not found or invalid
   * @returns {number} The parsed number or defaultValue
   */
  static getNumber(key, defaultValue = 0) {
    const value = this.get(key);
    if (value === null) return defaultValue;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Get an integer value from localStorage
   * @param {string} key - The storage key
   * @param {number} [defaultValue=0] - Default value if key not found or invalid
   * @returns {number} The parsed integer or defaultValue
   */
  static getInt(key, defaultValue = 0) {
    const value = this.get(key);
    if (value === null) return defaultValue;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Set a value in localStorage
   * @param {string} key - The storage key
   * @param {unknown} value - The value to store (will be converted to string)
   * @returns {boolean} True if successful, false if storage error occurred
   */
  static set(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  }
}

export default StorageManager;
