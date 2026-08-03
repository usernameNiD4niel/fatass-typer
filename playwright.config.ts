import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (spec §19, build step G4).
 *
 * Desktop only, and one browser. The game requires a physical keyboard and a
 * viewport of at least 1024px (CLAUDE.md §1), so a mobile project would only
 * ever assert that the width guard appears — which a unit test already does,
 * faster.
 *
 * The tests run against the production build rather than the dev server: code
 * splitting, the Suspense boundaries, and asset paths are all things only the
 * built output actually exercises, and they are exactly what step G3 changed.
 */

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,

  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    // Wide enough to be above the 1024px minimum with room to spare.
    viewport: { width: 1280, height: 900 },
    trace: 'on-first-retry',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `npm run build && npm run preview -- --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
