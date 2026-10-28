import { defineConfig } from '@playwright/test';
import config from './playwright.config';
import { isolatedEnvironment } from './scripts/readiness';

export default defineConfig<{ appOrigins: string[] }>({
  ...config,
  testDir: './readiness',
  outputDir: '../../generated-artifacts/predeploy-readiness/results',
  reporter: [['list'], ['html', { outputFolder: '../../generated-artifacts/predeploy-readiness/report', open: 'never' }]],
  use: { ...config.use, baseURL: 'http://127.0.0.1:4182', appOrigins: ['http://127.0.0.1:4182', 'http://127.0.0.1:4183'] },
  webServer: [{
    command: 'node scripts/readiness.ts prepare && node scripts/readiness.ts serve',
    url: 'http://127.0.0.1:4182/valid/sign-in',
    reuseExistingServer: false,
    timeout: 240_000,
    env: isolatedEnvironment(process.env, {}),
  }, {
    command: 'pnpm exec vite preview --host 127.0.0.1 --port 4183 --strictPort',
    url: 'http://127.0.0.1:4183/sign-in',
    reuseExistingServer: false,
    env: { PORT: '4183', BASE_PATH: '/' },
  }],
});
