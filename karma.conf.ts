import { createConfig as createWebpackConfig } from './webpack.config';

const testFiles = [
  'engines/query-sparql/test/QuerySparql-test.ts',
];

// Based on https://github.com/tom-sherman/blog/blob/main/posts/02-running-jest-tests-in-a-browser.md
function setConfig(config: any): void {
  config.set({
    basePath: __dirname,
    plugins: [
      'karma-webpack',
      'karma-jasmine',
      'karma-chrome-launcher',
      'karma-firefox-launcher',
      'karma-sourcemap-loader',
      'karma-jasmine-html-reporter',
    ],
    frameworks: [ 'jasmine', 'webpack' ],
    files: [ './karma-setup.js', ...testFiles ],
    client: {
      args: [ '--grep', '/^(?!.*no browser).*$/' ],
    },
    preprocessors: {
      './karma.setup.cjs': [ 'webpack' ],
      ...Object.fromEntries(testFiles.map(key => [ key, [ 'webpack', 'sourcemap' ]])),
    },
    webpack: createWebpackConfig(__dirname),
    browsers: [
      'ChromeHeadless',
      'FirefoxHeadless',
    ],
  });
};

export default setConfig;
