const config = require('@rubensworks/eslint-config');

module.exports = config([
  {
    files: [ '**/*.ts' ],
    languageOptions: {
      parserOptions: {
        project: [ './tsconfig.eslint.json' ],
      },
    },
  },
  {
    rules: {
      // Default
      'unicorn/consistent-destructuring': 'off',
      'unicorn/no-array-callback-reference': 'off',

      // TODO: check if these can be enabled
      'ts/naming-convention': 'off',
      'ts/no-unsafe-return': 'off',
      'ts/no-unsafe-argument': 'off',
      'ts/no-unsafe-assignment': 'off',

      'ts/no-require-imports': [ 'error', { allow: [
        'web-streams-ponyfill',
        'is-stream',
        'readable-stream-node-to-web',
      ]}],
      'ts/no-var-requires': [ 'error', { allow: [
        'web-streams-ponyfill',
        'is-stream',
        'readable-stream-node-to-web',
      ]}],
    },
  },
  {
    // Specific rules for NodeJS-specific files
    files: [
      '**/test/**/*.ts',
      'packages/actor-dereference-file/**/*.ts',
      'packages/actor-http-native/**/*.ts',
      'packages/logger-bunyan/**/*.ts',
      'packages/packager/**/*.ts',
    ],
    rules: {
      'import/no-nodejs-modules': 'off',
      'unused-imports/no-unused-vars': 'off',
      'ts/no-require-imports': 'off',
      'ts/no-var-requires': 'off',
    },
  },
  {
    // Webpack config-specific overrides
    files: [
      '**/webpack.config.ts',
    ],
    rules: {
      'import/extensions': 'off',
      'import/no-nodejs-modules': 'off',
      'import/no-extraneous-dependencies': 'off',
      'ts/no-var-requires': 'off',
      'ts/no-require-imports': 'off',
    },
  },
  {
    // Playwright-specific overrides
    files: [
      '**/playwright.config.ts',
      '**/test/*-browser.ts',
    ],
    rules: {
      'import/extensions': 'off',
      'import/no-extraneous-dependencies': 'off',
    },
  },
  {
    // Jest-specific overrides
    files: [
      'jest.setup.ts',
    ],
    rules: {
      'import/no-extraneous-dependencies': 'off',
    },
  },
  {
    // The browser alternatives end in -browser.ts and cannot follow camelCase
    files: [
      '**/lib/*-browser.ts',
    ],
    rules: {
      'unicorn/filename-case': 'off',
    },
  },
  {
    // Only the packager makes use of dynamic require
    files: [
      'packages/packager/bin/package.ts',
    ],
    rules: {
      'import/no-dynamic-require': 'off',
    },
  },
  {
    // The config packages use an empty index.ts
    files: [
      'engines/config-*/lib/index.ts',
    ],
    rules: {
      'import/unambiguous': 'off',
    },
  },
  {
    // Some packages make use of 'export default'
    files: [
      'packages/actor-http-*/lib/*.ts',
      'packages/jest/**/*.ts',
    ],
    rules: {
      'import/no-anonymous-default-export': 'off',
      'import/no-default-export': 'off',
    },
  },
  {
    // Some test files import 'jest-rdf' or '@comunica/jest' which triggers this
    // Some jest tests import '../../lib' which triggers this
    files: [
      '**/test/**/*-test.ts',
      '**/test/**/*-util.ts',
    ],
    rules: {
      'import/no-unassigned-import': 'off',
    },
  },
  {
    // Expression evaluator benchmark is not meant for actual use/distribution
    files: [
      'packages/expression-evaluator/benchmarks/*',
    ],
    rules: {
      'import/no-extraneous-dependencies': 'off',
    },
  },
  {
    files: [ '**/*.js' ],
    rules: {
      'ts/no-require-imports': 'off',
      'ts/no-var-requires': 'off',
      'import/no-nodejs-modules': 'off',
      'import/no-extraneous-dependencies': 'off',
      'import/extensions': 'off',
    },
  },
  {
    // Files that cannot follow the standard casing
    files: [
      '.github/FUNDING.yml',
    ],
    rules: {
      'unicorn/filename-case': 'off',
    },
  },
  {
    ignores: [
      // Performance benchmark combinations are automatically generated
      'performance/*/combinations/*/jbr-experiment.json',
      // TODO: after fixing the Solid tests, remove this
      'engines/query-sparql/test/QuerySparql-solid-test.ts',
    ],
  },
]);
