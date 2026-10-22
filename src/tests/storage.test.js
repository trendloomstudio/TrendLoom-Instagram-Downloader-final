/**
 * Tests for storage utility
 */

import {
  getFromStorage,
  setToStorage,
  removeFromStorage,
  clearStorage,
} from '../js/utils/storage.js';

describe('Storage Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('getFromStorage', () => {
    it('should return value from storage when key exists', async () => {
      const mockValue = { test: 'data' };
      chrome.storage.local.get.mockResolvedValue({ testKey: mockValue });

      const result = await getFromStorage('testKey');

      expect(chrome.storage.local.get).toHaveBeenCalledWith('testKey');
      expect(result).toEqual(mockValue);
    });

    it('should return default value when key does not exist', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const result = await getFromStorage('testKey', 'default');

      expect(result).toBe('default');
    });

    it('should return default value when storage throws error', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await getFromStorage('testKey', 'default');

      expect(result).toBe('default');
    });
  });

  describe('setToStorage', () => {
    it('should set value in storage', async () => {
      chrome.storage.local.set.mockResolvedValue();

      await setToStorage('testKey', { test: 'data' });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({ testKey: { test: 'data' } });
    });

    it('should throw error when storage fails', async () => {
      chrome.storage.local.set.mockRejectedValue(new Error('Storage error'));

      await expect(setToStorage('testKey', 'value')).rejects.toThrow('Storage error');
    });
  });

  describe('removeFromStorage', () => {
    it('should remove value from storage', async () => {
      chrome.storage.local.remove.mockResolvedValue();

      await removeFromStorage('testKey');

      expect(chrome.storage.local.remove).toHaveBeenCalledWith('testKey');
    });
  });

  describe('clearStorage', () => {
    it('should clear all storage', async () => {
      chrome.storage.local.clear.mockResolvedValue();

      await clearStorage();

      expect(chrome.storage.local.clear).toHaveBeenCalled();
    });
  });
});
