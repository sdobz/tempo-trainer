// Simple utility for managing localStorage persistence
class StorageManager {
  static get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? value : defaultValue;
    } catch (_err) {
      return defaultValue;
    }
  }

  static getNumber(key, defaultValue = 0) {
    const value = this.get(key);
    if (value === null) return defaultValue;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  static getInt(key, defaultValue = 0) {
    const value = this.get(key);
    if (value === null) return defaultValue;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch (_err) {
      return false;
    }
  }
}
