import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const generated = path.resolve(import.meta.dirname, '../../generated-artifacts/browser-regression');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync('/repl/tools/bin/chromium') ? '/repl/tools/bin/chromium' : undefined);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(generated, 'results'),
  reporter: [['list'], ['html', { outputFolder: path.join(generated, 'report'), open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4181',
    browserName: 'chromium',
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'desktop-dark', use: { viewport: { width: 1440, height: 1024 } }, metadata: { theme: 'dark' } },
    { name: 'desktop-light', use: { viewport: { width: 1280, height: 1024 } }, metadata: { theme: 'light' } },
    { name: 'mobile-dark', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, metadata: { theme: 'dark' } },
    { name: 'mobile-light', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, metadata: { theme: 'light' } },
  ],
  webServer: {
    command: 'pnpm exec vite build --outDir ../../generated-artifacts/browser-regression/app --emptyOutDir && pnpm exec vite preview --outDir ../../generated-artifacts/browser-regression/app --host 127.0.0.1 --port 4181 --strictPort',
    url: 'http://127.0.0.1:4181/sign-in',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: '4181', BASE_PATH: '/',
      VITE_STUDIO_MODE: 'backend',
      VITE_SUPABASE_URL: 'https://luyyxblmtupmugtazgbr.supabase.co',
      // Intentionally non-functional. No real key/session is used by this build.
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_controlled_browser_test_only',
    },
  },
});
