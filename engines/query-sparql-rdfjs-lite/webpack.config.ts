import { createConfig } from '../../webpack.config';

const config = createConfig(__dirname);

if (typeof config.performance === 'object') {
  config.performance.maxAssetSize = 750000;
  config.performance.maxEntrypointSize = 750000;
}

export default config;
