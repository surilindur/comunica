import { defineConfig } from '@playwright/test';
import type { PlaywrightTestConfig } from '@playwright/test';
import { devServerUrl } from './webpack.config';

const config: PlaywrightTestConfig = defineConfig({
  testDir: 'test',
  testMatch: /[A-z]+-browser.ts$/u,
  reporter: process.env.CI ? 'github' : 'list',
  preserveOutput: 'failures-only',
  use: {
    actionTimeout: 1_000,
    baseURL: devServerUrl,
    headless: true,
  },
  webServer: {
    command: 'webpack-dev-server',
    url: devServerUrl,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

export { config };
