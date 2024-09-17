import { PlaywrightTestConfig, defineConfig } from '@playwright/test';
import { devServerHost, devServerPort } from './webpack.config';

const config: PlaywrightTestConfig = defineConfig({
  testMatch: /test(\/.+)?\/[A-z]+-browser\.ts$/u,
  reporter: process.env.CI ? 'github' : 'list',
  preserveOutput: 'never',
  webServer: {
    command: 'webpack-dev-server',
    url: `http://${devServerHost}:${devServerPort}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

export { config };
export default config;
