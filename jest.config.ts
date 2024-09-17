import type { Config } from 'jest';

const config: Config = {
  transform: {
    '^.+\\.ts$': [ 'ts-jest', {
      // Enabling this can fix issues when using prereleases of typings packages
      // isolatedModules: true
    }],
  },
  testRegex: [ '/test/.*-test.*.ts$' ],
  testTimeout: 20_000,
  testPathIgnorePatterns: [
    '.*.d.ts',
    // TODO: Remove this once solid-client-authn supports node 18.
    '.*QuerySparql-solid-test.ts',
  ],
  // TODO: Consider enabling this and fixing the leaks
  detectLeaks: false,
  errorOnDeprecated: true,
  moduleFileExtensions: [ 'ts', 'js' ],
  setupFilesAfterEnv: [ './jest.setup.ts' ],
  collectCoverage: true,
  coverageProvider: 'v8',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/mocks/',
    'index.js',
    '/engines/query-sparql/test/util.ts',
    '/test/util/',
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

export default config;
