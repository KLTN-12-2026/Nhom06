'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9_]+$/;
const POSTGRES_PROTOCOLS = new Set(['postgresql:', 'postgres:']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

function maskPostgresUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return trimmed.replace(/:\/\/([^:/@\s]+):([^@\s]+)@/, '://$1:***@');
  }
}

function parsePostgresUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('Chặn chạy E2E: URL kết nối PostgreSQL không được để trống.');
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `Chặn chạy E2E: E2E_DATABASE_URL không đúng định dạng URL hợp lệ (${maskPostgresUrl(trimmed)}).`,
    );
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `Chặn chạy E2E: E2E_DATABASE_URL phải dùng giao thức postgresql:// hoặc postgres:// (${maskPostgresUrl(trimmed)}).`,
    );
  }

  const rawDbPath = parsed.pathname.replace(/^\/+/, '');
  if (!rawDbPath || rawDbPath.includes('/')) {
    throw new Error(
      `Chặn chạy E2E: không xác định được tên database hợp lệ trong E2E_DATABASE_URL (${maskPostgresUrl(trimmed)}).`,
    );
  }

  const databaseName = decodeURIComponent(rawDbPath);
  if (!SAFE_IDENTIFIER_REGEX.test(databaseName)) {
    throw new Error(
      `Chặn chạy E2E: tên database "${databaseName}" chứa ký tự không hợp lệ (chỉ chấp nhận chữ, số và dấu gạch dưới).`,
    );
  }

  const schema = (parsed.searchParams.get('schema') || 'public').trim();
  if (!SAFE_IDENTIFIER_REGEX.test(schema)) {
    throw new Error(`Chặn chạy E2E: tên schema "${schema}" không hợp lệ trong E2E_DATABASE_URL.`);
  }

  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Chặn chạy E2E: cổng kết nối không hợp lệ trong E2E_DATABASE_URL (${maskPostgresUrl(trimmed)}).`,
    );
  }

  return {
    rawUrl: trimmed,
    sanitizedUrl: maskPostgresUrl(trimmed),
    protocol: parsed.protocol,
    host: parsed.hostname.toLowerCase(),
    port,
    databaseName,
    schema,
  };
}

function normalizeHost(host) {
  const lower = host.toLowerCase();
  return LOOPBACK_HOSTS.has(lower) ? 'localhost' : lower;
}

function isSamePostgresTarget(a, b) {
  return (
    normalizeHost(a.host) === normalizeHost(b.host) &&
    a.port === b.port &&
    a.databaseName.toLowerCase() === b.databaseName.toLowerCase() &&
    a.schema.toLowerCase() === b.schema.toLowerCase()
  );
}

/**
 * Rào chắn an toàn tuyệt đối cho E2E:
 * - Bắt buộc có E2E_DATABASE_URL hợp lệ.
 * - Tên database phải kết thúc bằng "_test" (khớp quy ước T-026, ví dụ kho_ai_e2e_test).
 * - Không được trùng DB dev (POSTGRES_DB / DATABASE_URL).
 */
function assertSafeE2eDatabaseUrl({ e2eDatabaseUrl, devDatabaseUrl, devDatabaseName }) {
  const raw = String(e2eDatabaseUrl || '').trim();
  if (!raw) {
    throw new Error(
      'Chặn chạy E2E: thiếu E2E_DATABASE_URL. Hãy dùng database riêng có tên kết thúc bằng "_test" (ví dụ kho_ai_e2e_test).',
    );
  }

  const target = parsePostgresUrl(raw);

  if (!target.databaseName.endsWith('_test')) {
    throw new Error(
      `Chặn chạy E2E: tên database "${target.databaseName}" (${target.sanitizedUrl}) phải kết thúc bằng "_test" để tránh ghi đè dữ liệu dev.`,
    );
  }

  const devName = String(devDatabaseName || '').trim();
  if (devName && target.databaseName.toLowerCase() === devName.toLowerCase()) {
    throw new Error(
      `Chặn chạy E2E: E2E_DATABASE_URL (${target.sanitizedUrl}) đang trùng tên DB dev "${devName}".`,
    );
  }

  const devRaw = String(devDatabaseUrl || '').trim();
  if (devRaw) {
    let devTarget = null;
    try {
      devTarget = parsePostgresUrl(devRaw);
    } catch {
      devTarget = null;
    }
    if ((devTarget && isSamePostgresTarget(target, devTarget)) || raw === devRaw) {
      throw new Error(
        `Chặn chạy E2E: E2E_DATABASE_URL (${target.sanitizedUrl}) đang trỏ trùng DATABASE_URL của DB dev.`,
      );
    }
  }

  return target;
}

function buildDockerDatabaseUrl(rawUrl) {
  const parsed = new URL(String(rawUrl).trim());
  parsed.hostname = 'db';
  parsed.port = '5432';
  return parsed.toString();
}

function detectExecutionMode(repoRoot, processEnv = process.env) {
  const forced = String(processEnv.E2E_RUNTIME || '').trim().toLowerCase();
  if (forced === 'host' || forced === 'docker') {
    return forced;
  }
  const isWin = process.platform === 'win32';
  const tsNodeBin = path.join(repoRoot, 'api', 'node_modules', '.bin', isWin ? 'ts-node.cmd' : 'ts-node');
  const viteBin = path.join(repoRoot, 'web', 'node_modules', '.bin', isWin ? 'vite.cmd' : 'vite');
  if (fs.existsSync(tsNodeBin) && fs.existsSync(viteBin)) {
    return 'host';
  }
  return 'docker';
}

function detectComposeProject(dbPort, processEnv = process.env) {
  const explicit = String(processEnv.E2E_COMPOSE_PROJECT || processEnv.COMPOSE_PROJECT_NAME || '').trim();
  if (explicit) {
    return explicit;
  }
  try {
    const out = execFileSync(
      'docker',
      ['ps', '--filter', `publish=${dbPort}`, '--format', '{{.Label "com.docker.compose.project"}}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 },
    );
    const firstLine = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (firstLine) {
      return firstLine;
    }
  } catch {
    // Fallback sang tên project mặc định trong docker-compose.yml
  }
  return 'kho-ai';
}

function resolveE2eConfig(processEnv = process.env, repoRoot = path.resolve(__dirname, '../..')) {
  const dotenvValues = parseEnvFile(path.join(repoRoot, '.env'));

  const pick = (key, fallback) => {
    const fromEnv = processEnv[key];
    if (fromEnv !== undefined && String(fromEnv).trim() !== '') {
      return String(fromEnv).trim();
    }
    const fromFile = dotenvValues[key];
    if (fromFile !== undefined && String(fromFile).trim() !== '') {
      return String(fromFile).trim();
    }
    return fallback;
  };

  const postgresUser = pick('POSTGRES_USER', 'kho_ai');
  const postgresPassword = pick('POSTGRES_PASSWORD', 'kho_ai_dev');
  const devDatabaseName = pick('POSTGRES_DB', 'kho_ai');
  const dbPort = pick('DB_PORT', '5432');
  const mlPort = pick('ML_PORT', '8000');

  const e2eDbName = pick('E2E_POSTGRES_DB', 'kho_ai_e2e_test');
  const devDatabaseUrl =
    processEnv.DATABASE_URL && String(processEnv.DATABASE_URL).trim() !== ''
      ? String(processEnv.DATABASE_URL).trim()
      : `postgresql://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}@localhost:${dbPort}/${devDatabaseName}?schema=public`;

  const e2eDatabaseUrl =
    processEnv.E2E_DATABASE_URL && String(processEnv.E2E_DATABASE_URL).trim() !== ''
      ? String(processEnv.E2E_DATABASE_URL).trim()
      : `postgresql://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}@localhost:${dbPort}/${e2eDbName}?schema=public`;

  const target = assertSafeE2eDatabaseUrl({
    e2eDatabaseUrl,
    devDatabaseUrl,
    devDatabaseName,
  });

  const apiPort = Number(pick('E2E_API_PORT', '3099'));
  const webPort = Number(pick('E2E_WEB_PORT', '5199'));
  const mlServiceUrl =
    processEnv.E2E_ML_SERVICE_URL && String(processEnv.E2E_ML_SERVICE_URL).trim() !== ''
      ? String(processEnv.E2E_ML_SERVICE_URL).trim()
      : `http://127.0.0.1:${mlPort}`;

  const jwtSecret = pick('JWT_SECRET', 'e2e-local-jwt-secret-key-min-16');
  const demoPassword = pick('SEED_DEMO_PASSWORD', '123456');
  const runtimeMode = detectExecutionMode(repoRoot, processEnv);
  const composeProject = runtimeMode === 'docker' ? detectComposeProject(dbPort, processEnv) : null;

  return {
    repoRoot,
    runtimeMode,
    composeProject,
    e2eDatabaseUrl: target.rawUrl,
    e2eDatabaseDockerUrl: buildDockerDatabaseUrl(target.rawUrl),
    e2eDatabaseSanitized: target.sanitizedUrl,
    e2eDatabaseName: target.databaseName,
    devDatabaseUrl,
    devDatabaseDockerUrl: buildDockerDatabaseUrl(devDatabaseUrl),
    devDatabaseName,
    mlServiceUrl: mlServiceUrl.replace(/\/$/, ''),
    apiPort,
    webPort,
    apiUrl: `http://127.0.0.1:${apiPort}`,
    apiBaseUrl: `http://127.0.0.1:${apiPort}/api`,
    webUrl: `http://127.0.0.1:${webPort}`,
    jwtSecret,
    demoPassword,
    mlTimeoutMs: pick('ML_TIMEOUT_MS', '20000'),
  };
}

module.exports = {
  parseEnvFile,
  maskPostgresUrl,
  parsePostgresUrl,
  assertSafeE2eDatabaseUrl,
  buildDockerDatabaseUrl,
  detectExecutionMode,
  detectComposeProject,
  resolveE2eConfig,
};
