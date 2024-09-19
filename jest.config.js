/** @type {import('jest').Config} */
module.exports = {
  transform: {
    '^.+\\.ts$': [ 'ts-jest', {
      // Enabling this can fix issues when using prereleases of typings packages
      // isolatedModules: true
    }],
  },
  testMatch: [ '**/test/**/*-test.ts' ],
  testTimeout: 20_000,
  testPathIgnorePatterns: [
    'node_modules',
    // TODO: Remove this once solid-client-authn supports node 18.
    'QuerySparql-solid-test.ts',
    // TODO: Figure out why this fails, then re-enable
    'QuerySourceHypermedia-test.ts',
  ],
  clearMocks: true,
  // TODO: Enable this and fix the leaks
  detectLeaks: false,
  errorOnDeprecated: true,
  moduleFileExtensions: [ 'ts', 'js' ],
  collectCoverage: true,
  coverageProvider: 'v8',
  coveragePathIgnorePatterns: [
    'node_modules',
    'mocks',
    'engine-default.js',
  ],
  testEnvironment: 'node',
  reporters: process.env.CI ? [[ 'github-actions', { silent: false }], 'summary' ] : undefined,
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};
