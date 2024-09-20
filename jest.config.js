/** @type {import('jest').Config} */
module.exports = {
  collectCoverage: true,
  coverageProvider: 'v8',
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  projects: [
    {
      displayName: 'engines',
      preset: 'ts-jest/presets/default',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/engines/*/test/**/*-test.ts',
      ],
      testPathIgnorePatterns: [
        'QuerySparql-solid-test.ts',
      ],
      coveragePathIgnorePatterns: [
        '<rootDir>/packages/',
        'engine-default.js',
        'node_modules',
        'util.js',
      ],
    },
    {
      displayName: 'packages',
      preset: 'ts-jest/presets/default',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/packages/*/test/**/*-test.ts',
      ],
      coveragePathIgnorePatterns: [
        '<rootDir>/engines/',
        'node_modules',
      ],
    },
  ],
  // The default test timeout is not enough for engine tests,
  // however it is enough for package tests
  testTimeout: 20_000,
};
