import { resolve } from 'node:path';
import { configuration } from '@comunica/actor-init-query/webpack.config';

configuration.entry = [ resolve(__dirname, 'lib/index-browser.js') ];
configuration.output = { ...configuration.output, path: __dirname };

export default configuration;
