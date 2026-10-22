// Jest setup file
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    getManifest: () => ({
      name: 'TrendLoom Instagram Downloader',
      version: '4.12.16',
    }),
    getURL: (path) => `chrome-extension://test-id/${path}`,
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
      clear: jest.fn(() => Promise.resolve()),
    },
    sync: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
      clear: jest.fn(() => Promise.resolve()),
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
};

// jsdom already provides a full DOM (document, window, location, crypto),
// so it is intentionally not mocked here.
