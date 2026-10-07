import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // every test drives several phones with heavy animations: more workers starve the timers
  workers: 2,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4173',
    locale: 'he-IL',
    trace: 'retain-on-failure',
    // emulator mode: the page (localhost:4173) talks to the emulator (127.0.0.1:8080); Chrome's local-network
    // checks block that once requests are intercepted, which never happens on the real site
    launchOptions: process.env.FIRESTORE_EMULATOR_HOST
      ? { args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResults'] }
      : {},
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: true,
  },
});
