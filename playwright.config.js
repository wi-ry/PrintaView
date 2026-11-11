const { defineConfig } = require('playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  testIgnore: ['**/packaged.smoke.spec.js'],
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    actionTimeout: 5000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
});
