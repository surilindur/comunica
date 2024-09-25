import type { Config } from 'jest';

const config: Config = {
  transform: {
    '^.+\\.ts$': [ 'ts-jest', {
      // Enabling this can fix issues when using prereleases of typings packages
      // isolatedModules: true
    }],
  },
  testRegex: [ '/test/.*-test.*.ts$' ],
  testPathIgnorePatterns: [
    '.*.d.ts',
    // TODO: Remove this once solid-client-authn supports node 18.
    '.*QuerySparql-solid-test.ts',
  ],
  moduleFileExtensions: [
    'ts',
    'js',
  ],
  collectCoverage: true,
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/mocks/',
    'index.js',
    '/engines/query-sparql/test/util.ts',
    '/test/util/',
    'engine-default.js',
  ],
  testEnvironment: 'node',
  // The default timeout is too short for the engine tests
  testTimeout: 20_000,
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};

export default config;
