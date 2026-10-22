module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
  testMatch: ['**/src/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/js/bulk-history.js',
    'src/js/background.js',
    'src/js/utils/**/*.js',
    '!src/js/**/*.test.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['js', 'json'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  testTimeout: 10000,
};
