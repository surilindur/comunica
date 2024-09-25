import { resolve } from 'node:path';
import * as NodePolyfillPlugin from 'node-polyfill-webpack-plugin';
import { ProgressPlugin } from 'webpack';
import type { Configuration } from 'webpack';

const nodePolyfillPlugin = new NodePolyfillPlugin();

function createConfig(packagePath: string): Configuration {
  return {
    devtool: 'source-map',
    entry: resolve(packagePath, 'lib', 'index-browser.ts'),
    mode: 'development',
    module: {
      rules: [
        {
          test: /\.ts$/u,
          loader: 'ts-loader',
          exclude: /node_modules/u,
        },
      ],
    },
    output: {
      filename: 'engine-browser.js',
      path: packagePath,
      libraryTarget: 'var',
      library: 'Comunica',
    },
    plugins: [
      new ProgressPlugin(),
      nodePolyfillPlugin,
    ],
    performance: {
      hints: 'error',
      maxAssetSize: 1750000,
      maxEntrypointSize: 1750000,
    },
  };
}

export { createConfig, nodePolyfillPlugin };
