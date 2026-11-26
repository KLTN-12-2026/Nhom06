import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { resolveE2eConfig } = require('./e2e-env.cjs');

const repoRoot = path.resolve(__dirname, '../..');
const apiRoot = path.join(repoRoot, 'api');
const isWin = process.platform === 'win32';
const tsNodeBin = path.join(apiRoot, 'node_modules', '.bin', isWin ? 'ts-node.cmd' : 'ts-node');
const npmBin = isWin ? 'npm.cmd' : 'npm';

function getLatestMtimeMs(dirPath) {
  let latest = 0;
  if (!fs.existsSync(dirPath)) {
    return latest;
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      latest = Math.max(latest, getLatestMtimeMs(fullPath));
    } else {
      const stat = fs.statSync(fullPath);
      latest = Math.max(latest, stat.mtimeMs);
    }
  }
  return latest;
}

async function checkMlHealth(mlServiceUrl) {
  const healthUrl = `${mlServiceUrl}/health`;
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Dịch vụ ML chưa sẵn sàng tại ${healthUrl} (${reason}). Hãy khởi động dịch vụ trước (ví dụ: docker compose up -d).`,
    );
  }
}

function cleanupStaleDockerContainers(composeProject) {
  const names = [`${composeProject}-e2e-api`, `${composeProject}-e2e-web`];
  try {
    execFileSync('docker', ['rm', '-f', ...names], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  } catch {
    // Không có container cũ để dọn
  }
}

function needsApiBuild() {
  const distMain = path.join(apiRoot, 'dist', 'main.js');
  return (
    !fs.existsSync(distMain) ||
    fs.statSync(distMain).mtimeMs < getLatestMtimeMs(path.join(apiRoot, 'src'))
  );
}

function runHostPrepare(config) {
  console.log('[e2e-db] Bước 1/3 (host): Tạo DB (nếu thiếu), migrate deploy và seed cơ bản...');
  execFileSync(tsNodeBin, ['scripts/test-db.ts'], {
    cwd: apiRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: config.devDatabaseUrl,
      TEST_DATABASE_URL: config.e2eDatabaseUrl,
      SEED_DEMO_PASSWORD: config.demoPassword,
    },
  });

  console.log('[e2e-db] Bước 2/3 (host): Nạp dữ liệu demo (seed:demo --reset) lên DB E2E...');
  execFileSync(tsNodeBin, ['prisma/seed/demo.ts', '--reset'], {
    cwd: apiRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_URL: config.e2eDatabaseUrl,
      TEST_DATABASE_URL: config.e2eDatabaseUrl,
      ALLOW_DEMO_SEED: 'true',
      JWT_SECRET: config.jwtSecret,
      SEED_DEMO_PASSWORD: config.demoPassword,
      ML_SERVICE_URL: config.mlServiceUrl,
      ML_TIMEOUT_MS: config.mlTimeoutMs,
      LLM_PROVIDER: 'mock',
      LLM_DEMO_TOGGLE: 'true',
      EXPIRY_CRON_ENABLED: 'false',
      ANALYSIS_CRON_ENABLED: 'false',
      ANALYSIS_AUTO_ENABLED: 'false',
      ANALYSIS_AUTO_DEBOUNCE_MS: '0',
    },
  });

  console.log('[e2e-db] Bước 3/3 (host): Kiểm tra bản build api/dist/main.js...');
  if (needsApiBuild()) {
    console.log('[e2e-db] Build lại api/dist/main.js cho tiến trình API E2E...');
    execFileSync(npmBin, ['run', 'build'], {
      cwd: apiRoot,
      stdio: 'inherit',
    });
  }
}

function runDockerPrepare(config) {
  const project = config.composeProject;
  cleanupStaleDockerContainers(project);

  console.log(
    `[e2e-db] Bước 1/3 (docker:${project}): Tạo DB (nếu thiếu), migrate deploy và seed cơ bản...`,
  );
  execFileSync(
    'docker',
    [
      'compose',
      '-p',
      project,
      'exec',
      '-T',
      '-e',
      'NODE_ENV=test',
      '-e',
      `DATABASE_URL=${config.devDatabaseDockerUrl}`,
      '-e',
      `TEST_DATABASE_URL=${config.e2eDatabaseDockerUrl}`,
      '-e',
      `SEED_DEMO_PASSWORD=${config.demoPassword}`,
      'api',
      './node_modules/.bin/ts-node',
      'scripts/test-db.ts',
    ],
    { cwd: repoRoot, stdio: 'inherit' },
  );

  console.log(
    `[e2e-db] Bước 2/3 (docker:${project}): Nạp dữ liệu demo (seed:demo --reset) lên DB E2E...`,
  );
  execFileSync(
    'docker',
    [
      'compose',
      '-p',
      project,
      'exec',
      '-T',
      '-e',
      'NODE_ENV=development',
      '-e',
      `DATABASE_URL=${config.e2eDatabaseDockerUrl}`,
      '-e',
      `TEST_DATABASE_URL=${config.e2eDatabaseDockerUrl}`,
      '-e',
      'ALLOW_DEMO_SEED=true',
      '-e',
      `JWT_SECRET=${config.jwtSecret}`,
      '-e',
      `SEED_DEMO_PASSWORD=${config.demoPassword}`,
      '-e',
      'ML_SERVICE_URL=http://ml:8000',
      '-e',
      `ML_TIMEOUT_MS=${config.mlTimeoutMs}`,
      '-e',
      'LLM_PROVIDER=mock',
      '-e',
      'LLM_DEMO_TOGGLE=true',
      '-e',
      'EXPIRY_CRON_ENABLED=false',
      '-e',
      'ANALYSIS_CRON_ENABLED=false',
      '-e',
      'ANALYSIS_AUTO_ENABLED=false',
      '-e',
      'ANALYSIS_AUTO_DEBOUNCE_MS=0',
      'api',
      './node_modules/.bin/ts-node',
      'prisma/seed/demo.ts',
      '--reset',
    ],
    { cwd: repoRoot, stdio: 'inherit' },
  );

  console.log(`[e2e-db] Bước 3/3 (docker:${project}): Kiểm tra bản build api/dist/main.js...`);
  if (needsApiBuild()) {
    console.log('[e2e-db] Build lại api/dist/main.js trong container api...');
    execFileSync('docker', ['compose', '-p', project, 'exec', '-T', 'api', 'npm', 'run', 'build'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  }
}

async function main() {
  const startedAt = Date.now();
  const config = resolveE2eConfig(process.env, repoRoot);

  console.log(
    `[e2e-db] Chuẩn bị DB riêng cho E2E (${config.runtimeMode}): ${config.e2eDatabaseSanitized}`,
  );
  console.log(`[e2e-db] ML service: ${config.mlServiceUrl}`);

  await checkMlHealth(config.mlServiceUrl);

  if (config.runtimeMode === 'host') {
    runHostPrepare(config);
  } else {
    runDockerPrepare(config);
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[e2e-db] Hoàn tất chuẩn bị DB E2E (${config.e2eDatabaseName}) trong ${elapsedSec}s.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[e2e-db] Lỗi: ${message}`);
  process.exit(1);
});
