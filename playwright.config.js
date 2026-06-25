const { defineConfig } = require('playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    actionTimeout: 5000
  }
});
