import { resolve } from 'node:path';
import * as NodePolyfillPlugin from 'node-polyfill-webpack-plugin';
import { ProgressPlugin } from 'webpack';
import type { Configuration } from 'webpack';
import type { Configuration as DevServerConfiguration } from 'webpack-dev-server';

const configuration: Configuration & DevServerConfiguration = {
  devServer: {
    port: 4000,
    host: '127.0.0.1',
    static: __dirname,
  },
  entry: {
    index: resolve(__dirname, 'lib/index-browser.js'),
  },
  output: {
    filename: 'comunica-browser.js',
    path: __dirname,
    libraryTarget: 'var',
    library: 'Comunica',
  },
  mode: 'production',
  devtool: 'source-map',
  module: {
    rules: [
      // {
      // test: /\.js$/u,
      // loader: 'babel-loader',
      // exclude: /node_modules/u,
      // },
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
      onlyAliases: [ 'process', 'Buffer' ],
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

export { configuration };
export default configuration;
