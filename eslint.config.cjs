const config = require('@rubensworks/eslint-config');

module.exports = config([
  {
    files: [ '**/*.ts' ],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
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
    },
  },
  {
    // Karma configuration
    files: [
      'karma.conf.ts',
      'karma.setup.cjs',
    ],
    rules: {
      'import/extensions': 'off',
      'import/no-extraneous-dependencies': 'off',
    },
  },
  {
    files: [
      // Lerna custom scripts
      'lerna.scripts.cjs',
      // Some mocks for tests
      'packages/*/__mocks__/*.js',
    ],
    rules: {
      'import/no-nodejs-modules': 'off',
    },
  },
  {
    // Specific rules for NodeJS-specific files
    files: [
      '**/test/**/*-test.ts',
      'packages/actor-dereference-file/**/*.ts',
      'packages/actor-http-native/**/*.ts',
      'packages/logger-bunyan/**/*.ts',
      'packages/packager/**/*.ts',
    ],
    rules: {
      'import/no-nodejs-modules': 'off',
      // 'unused-imports/no-unused-vars': 'off',
      'ts/no-require-imports': 'off',
      'ts/no-var-requires': 'off',
    },
  },
  {
    // The spec engines use .js extension
    files: [
      'engines/*/spec/*.js',
    ],
    rules: {
      'import/extensions': 'off',
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
    // Some test files import 'jest-rdf' which triggers this
    // Some jest tests import '../../lib' which triggers this
    files: [
      '**/test/*-test.ts',
      '**/test/*-util.ts',
      'packages/jest/test/matchers/*-test.ts',
    ],
    rules: {
      'import/no-unassigned-import': 'off',
    },
  },
  {
    // Webpack configurations
    files: [
      '**/webpack.config.ts',
    ],
    rules: {
      'import/extensions': 'off',
      'import/no-nodejs-modules': 'off',
      'ts/no-var-requires': 'off',
      'ts/no-require-imports': 'off',
    },
  },
  {
    files: [
      // Webpack browser alternatives
      '**/*-browser.ts',
      // The funding YAML which needs to be specifically named
      '.github/FUNDING.yml',
    ],
    rules: {
      'unicorn/filename-case': 'off',
    },
  },
  {
    ignores: [
      // The engine files are auto-generated
      '**/engine-default.js',
      '**/engine-browser.js',
      // The performance combinations are auto-generated
      '**/performance/*/combinations/**',
      // TODO: Remove this once solid-client-authn supports node 18.
      '**/QuerySparql-solid-test.ts',
    ],
  },
]);
