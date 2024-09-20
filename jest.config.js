/** @type {import('jest').Config} */
module.exports = {
  collectCoverage: true,
  coverageProvider: 'babel',
  // TODO: bump these to 100 after the additional tests have been added
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
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
        'util.ts',
      ],
    },
    {
      displayName: 'packages',
      preset: 'ts-jest/presets/default',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/packages/*/test/**/*-test.ts',
      ],
      testPathIgnorePatterns: [
        // TODO: figure out why this test is suddenly failing
        'QuerySourceHypermedia-test.ts',
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
