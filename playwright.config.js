const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './e2e',
    testIgnore: process.env.PLAYWRIGHT_PWA_BASE_URL ? [] : ['**/pwa-runtime.spec.js'],
    outputDir: process.env.PLAYWRIGHT_PWA_BASE_URL ? './test-results/pwa' : './test-results/e2e',
    reporter: 'list',
    use: {
        baseURL: process.env.PLAYWRIGHT_PWA_BASE_URL || 'http://127.0.0.1:4173',
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
