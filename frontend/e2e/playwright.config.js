// Basic Playwright config for the frontend e2e tests
// Run with: npm run e2e:install  (first time)
// then: npm run e2e:test

module.exports = {
  testDir: './',
  timeout: 30 * 1000,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    baseURL: 'http://localhost:5000'
  },
};
