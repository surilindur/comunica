import { resolve } from 'node:path';
import { ProgressPlugin } from 'webpack';
import type { Configuration } from 'webpack';
import type { Configuration as DevServerConfiguration } from 'webpack-dev-server';

// TODO: investigate the possibility of getting rid of this require via esModuleInterop
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

const bundleName = 'comunica-browser.js';

const devServerHost = process.env.WEBPACK_HOST ?? '127.0.0.1';
const devServerPort = process.env.WEBPACK_PORT ?? 4000;
const devServerUrl = `http://${devServerHost}:${devServerPort}`;

function config(packagePath: string): Configuration & DevServerConfiguration {
  return {
    devServer: {
      port: devServerPort,
      host: devServerHost,
      static: packagePath,
    },
    entry: resolve(packagePath, 'lib', 'index-browser.ts'),
    output: {
      filename: bundleName,
      path: packagePath,
      libraryTarget: 'var',
      library: 'Comunica',
    },
    mode: 'development',
    devtool: 'source-map',
    module: {
      rules: [
        {
          test: /\.ts$/u,
          use: 'ts-loader',
          exclude: /node_modules/u,
        },
      ],
    },
    plugins: [
      new ProgressPlugin(),
      // TODO: when the dependencies no longer require these, remove them
      new NodePolyfillPlugin({
        additionalAliases: [ 'process', 'Buffer' ],
      }),
    ],
    performance: {
      hints: 'error',
      maxAssetSize: 1750000,
      maxEntrypointSize: 1750000,
    },
    resolve: {
      extensions: [ '.ts', '.js' ],
      aliasFields: [ 'browser' ],
    },
  };
}

export { config, devServerUrl, bundleName };
export default config(__dirname);
