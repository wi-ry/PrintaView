const { defineConfig } = require('playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  testMatch: '**/packaged.smoke.spec.js',
  timeout: 90000,
  expect: {
    timeout: 10000
  },
  workers: 1,
  reporter: 'list'
});
