import path from 'node:path';
import { defineConfig } from '@playwright/test';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveE2eConfig } = require('./scripts/e2e-env.cjs') as {
  resolveE2eConfig: (env?: NodeJS.ProcessEnv, repoRoot?: string) => {
    repoRoot: string;
    runtimeMode: 'host' | 'docker';
    composeProject: string | null;
    e2eDatabaseUrl: string;
    e2eDatabaseDockerUrl: string;
    mlServiceUrl: string;
    apiPort: number;
    webPort: number;
    apiUrl: string;
    apiBaseUrl: string;
    webUrl: string;
    jwtSecret: string;
    demoPassword: string;
    mlTimeoutMs: string;
  };
};

const repoRoot = path.resolve(__dirname, '..');
const e2eConfig = resolveE2eConfig(process.env, repoRoot);

const apiRoot = path.join(repoRoot, 'api');
const webRoot = path.join(repoRoot, 'web');
const isWin = process.platform === 'win32';
const viteBin = path.join(webRoot, 'node_modules', '.bin', isWin ? 'vite.cmd' : 'vite');
const corsOrigin = `${e2eConfig.webUrl},http://localhost:${e2eConfig.webPort}`;

const hostWebServers = [
  {
    command: 'node dist/main',
    cwd: apiRoot,
    url: `${e2eConfig.apiBaseUrl}/health`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(e2eConfig.apiPort),
      DATABASE_URL: e2eConfig.e2eDatabaseUrl,
      TEST_DATABASE_URL: e2eConfig.e2eDatabaseUrl,
      JWT_SECRET: e2eConfig.jwtSecret,
      JWT_EXPIRES_IN: '8h',
      ML_SERVICE_URL: e2eConfig.mlServiceUrl,
      ML_TIMEOUT_MS: e2eConfig.mlTimeoutMs,
      LLM_PROVIDER: 'mock',
      LLM_DEMO_TOGGLE: 'true',
      EXPIRY_CRON_ENABLED: 'false',
      ANALYSIS_CRON_ENABLED: 'false',
      ANALYSIS_AUTO_ENABLED: 'false',
      ANALYSIS_AUTO_DEBOUNCE_MS: '0',
      CORS_ORIGIN: corsOrigin,
    },
  },
  {
    command: `"${viteBin}" --host 127.0.0.1 --port ${e2eConfig.webPort} --strictPort`,
    cwd: webRoot,
    url: `${e2eConfig.webUrl}/login`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      ...process.env,
      VITE_API_URL: e2eConfig.apiBaseUrl,
    },
  },
];

const composeProject = e2eConfig.composeProject ?? 'kho-ai';
const dockerWebServers = [
  {
    command: [
      `docker compose -p ${composeProject} run --rm -T --no-deps`,
      `--name ${composeProject}-e2e-api`,
      `-p 127.0.0.1:${e2eConfig.apiPort}:${e2eConfig.apiPort}`,
      `-e NODE_ENV=development`,
      `-e PORT=${e2eConfig.apiPort}`,
      `-e "DATABASE_URL=${e2eConfig.e2eDatabaseDockerUrl}"`,
      `-e "TEST_DATABASE_URL=${e2eConfig.e2eDatabaseDockerUrl}"`,
      `-e "JWT_SECRET=${e2eConfig.jwtSecret}"`,
      `-e JWT_EXPIRES_IN=8h`,
      `-e ML_SERVICE_URL=http://ml:8000`,
      `-e ML_TIMEOUT_MS=${e2eConfig.mlTimeoutMs}`,
      `-e LLM_PROVIDER=mock`,
      `-e LLM_DEMO_TOGGLE=true`,
      `-e EXPIRY_CRON_ENABLED=false`,
      `-e ANALYSIS_CRON_ENABLED=false`,
      `-e ANALYSIS_AUTO_ENABLED=false`,
      `-e ANALYSIS_AUTO_DEBOUNCE_MS=0`,
      `-e "CORS_ORIGIN=${corsOrigin}"`,
      `api node dist/main`,
    ].join(' '),
    cwd: repoRoot,
    url: `${e2eConfig.apiBaseUrl}/health`,
    reuseExistingServer: false,
    timeout: 90_000,
  },
  {
    command: [
      `docker compose -p ${composeProject} run --rm -T --no-deps`,
      `--name ${composeProject}-e2e-web`,
      `-p 127.0.0.1:${e2eConfig.webPort}:${e2eConfig.webPort}`,
      `-e "VITE_API_URL=${e2eConfig.apiBaseUrl}"`,
      `web ./node_modules/.bin/vite --host 0.0.0.0 --port ${e2eConfig.webPort} --strictPort`,
    ].join(' '),
    cwd: repoRoot,
    url: `${e2eConfig.webUrl}/login`,
    reuseExistingServer: false,
    timeout: 90_000,
  },
];

export default defineConfig({
  testDir: './tests',
  globalTeardown: './tests/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  outputDir: './artifacts/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: './artifacts/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: e2eConfig.webUrl,
    viewport: { width: 1440, height: 900 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
  webServer: e2eConfig.runtimeMode === 'host' ? hostWebServers : dockerWebServers,
});
