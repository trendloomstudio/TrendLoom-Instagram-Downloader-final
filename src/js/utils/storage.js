/**
 * Storage utility for chrome.storage operations
 */

const STORAGE_KEY = {
  DOWNLOAD_HISTORY: 'turboDownloadHistory',
};

/**
 * Maximum number of download history entries kept in storage.
 * Single source of truth for every writer of the history list.
 */
export const DOWNLOAD_HISTORY_LIMIT = 250;

/**
 * Get value from chrome.storage.local
 * @param {string} key - Storage key
 * @param {any} defaultValue - Default value if key doesn't exist
 * @returns {Promise<any>}
 */
export async function getFromStorage(key, defaultValue = null) {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] !== undefined ? result[key] : defaultValue;
  } catch (error) {
    console.error(`Error reading from storage for key ${key}:`, error);
    return defaultValue;
  }
}

/**
 * Set value in chrome.storage.local
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @returns {Promise<void>}
 */
export async function setToStorage(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (error) {
    console.error(`Error writing to storage for key ${key}:`, error);
    throw error;
  }
}

/**
 * Remove value from chrome.storage.local
 * @param {string} key - Storage key
 * @returns {Promise<void>}
 */
export async function removeFromStorage(key) {
  try {
    await chrome.storage.local.remove(key);
  } catch (error) {
    console.error(`Error removing from storage for key ${key}:`, error);
    throw error;
  }
}

/**
 * Clear all data from chrome.storage.local
 * @returns {Promise<void>}
 */
export async function clearStorage() {
  try {
    await chrome.storage.local.clear();
  } catch (error) {
    console.error('Error clearing storage:', error);
    throw error;
  }
}

/**
 * Get download history
 * @returns {Promise<Array>}
 */
export async function getDownloadHistory() {
  return getFromStorage(STORAGE_KEY.DOWNLOAD_HISTORY, []);
}

/**
 * Save download history
 * @param {Array} history - History array
 * @param {number} maxItems - Maximum items to keep
 * @returns {Promise<void>}
 */
export async function saveDownloadHistory(history, maxItems = DOWNLOAD_HISTORY_LIMIT) {
  const trimmedHistory = history.slice(-maxItems);
  await setToStorage(STORAGE_KEY.DOWNLOAD_HISTORY, trimmedHistory);
}

export { STORAGE_KEY };
