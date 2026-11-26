import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { runSeed } from '../prisma/seed';

export const TEST_DB_BOOTSTRAPPED_ENV = '__KHO_AI_TEST_DB_BOOTSTRAPPED';

const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9_]+$/;
const POSTGRES_PROTOCOLS = new Set(['postgresql:', 'postgres:']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface ParsedPostgresUrl {
  rawUrl: string;
  sanitizedUrl: string;
  protocol: 'postgresql:' | 'postgres:';
  host: string;
  port: number;
  databaseName: string;
  schema: string;
}

export interface SafeTestDbCheckOptions {
  testDatabaseUrl?: string;
  devDatabaseUrl?: string;
  ignoreSameAsDev?: boolean;
}

export function maskPostgresUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
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

export function parsePostgresUrl(rawUrl: string): ParsedPostgresUrl {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('URL kết nối PostgreSQL không được để trống.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `Chặn chạy test: TEST_DATABASE_URL không đúng định dạng URL hợp lệ (${maskPostgresUrl(trimmed)}).`,
    );
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `Chặn chạy test: TEST_DATABASE_URL phải dùng giao thức postgresql:// hoặc postgres:// (${maskPostgresUrl(trimmed)}).`,
    );
  }

  const rawDbPath = parsed.pathname.replace(/^\/+/, '');
  if (!rawDbPath || rawDbPath.includes('/')) {
    throw new Error(
      `Chặn chạy test: không xác định được tên database hợp lệ trong TEST_DATABASE_URL (${maskPostgresUrl(trimmed)}).`,
    );
  }

  const databaseName = decodeURIComponent(rawDbPath);
  if (!SAFE_IDENTIFIER_REGEX.test(databaseName)) {
    throw new Error(
      `Chặn chạy test: tên database "${databaseName}" chứa ký tự không hợp lệ (chỉ chấp nhận chữ, số và dấu gạch dưới).`,
    );
  }

  const schema = parsed.searchParams.get('schema')?.trim() || 'public';
  if (!SAFE_IDENTIFIER_REGEX.test(schema)) {
    throw new Error(
      `Chặn chạy test: tên schema "${schema}" không hợp lệ trong TEST_DATABASE_URL.`,
    );
  }

  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Chặn chạy test: cổng kết nối không hợp lệ trong TEST_DATABASE_URL (${maskPostgresUrl(trimmed)}).`,
    );
  }

  return {
    rawUrl: trimmed,
    sanitizedUrl: maskPostgresUrl(trimmed),
    protocol: parsed.protocol as 'postgresql:' | 'postgres:',
    host: parsed.hostname.toLowerCase(),
    port,
    databaseName,
    schema,
  };
}

function normalizeHostForComparison(host: string): string {
  const lower = host.toLowerCase();
  return LOOPBACK_HOSTS.has(lower) ? 'localhost' : lower;
}

function isSamePostgresTarget(a: ParsedPostgresUrl, b: ParsedPostgresUrl): boolean {
  return (
    normalizeHostForComparison(a.host) === normalizeHostForComparison(b.host) &&
    a.port === b.port &&
    a.databaseName.toLowerCase() === b.databaseName.toLowerCase() &&
    a.schema.toLowerCase() === b.schema.toLowerCase()
  );
}

/**
 * Rào chắn an toàn tuyệt đối trước khi chạy test trên DB:
 * - Bắt buộc có TEST_DATABASE_URL (không fallback sang DATABASE_URL).
 * - Tên DB phải kết thúc bằng "_test".
 * - Không được trỏ trùng DB với DATABASE_URL của môi trường dev.
 */
export function assertSafeTestDatabaseUrl(options: SafeTestDbCheckOptions): ParsedPostgresUrl {
  const testRaw = options.testDatabaseUrl?.trim();
  if (!testRaw) {
    throw new Error(
      'Chặn chạy test: thiếu biến môi trường TEST_DATABASE_URL. Hãy khai báo TEST_DATABASE_URL trỏ tới DB riêng có tên kết thúc bằng "_test" (ví dụ kho_ai_test).',
    );
  }

  const testTarget = parsePostgresUrl(testRaw);

  if (!testTarget.databaseName.endsWith('_test')) {
    throw new Error(
      `Chặn chạy test: tên database "${testTarget.databaseName}" (${testTarget.sanitizedUrl}) phải kết thúc bằng "_test" để tránh ghi đè dữ liệu dev.`,
    );
  }

  const devRaw = options.devDatabaseUrl?.trim();
  if (!options.ignoreSameAsDev && devRaw) {
    let devTarget: ParsedPostgresUrl | null = null;
    try {
      devTarget = parsePostgresUrl(devRaw);
    } catch {
      devTarget = null;
    }

    if ((devTarget && isSamePostgresTarget(testTarget, devTarget)) || testRaw === devRaw) {
      throw new Error(
        `Chặn chạy test: TEST_DATABASE_URL (${testTarget.sanitizedUrl}) đang trỏ trùng DATABASE_URL của DB dev. Hãy dùng database test riêng (ví dụ kho_ai_test).`,
      );
    }
  }

  return testTarget;
}

export function buildMaintenanceDatabaseUrl(
  testDatabaseUrl: string,
  maintenanceDb = 'postgres',
): string {
  if (!SAFE_IDENTIFIER_REGEX.test(maintenanceDb)) {
    throw new Error(`Tên maintenance database không hợp lệ: ${maintenanceDb}`);
  }
  const parsed = new URL(testDatabaseUrl.trim());
  parsed.pathname = `/${maintenanceDb}`;
  parsed.searchParams.delete('schema');
  return parsed.toString();
}

function isDuplicateDatabaseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('42P04') ||
    message.includes('23505') ||
    message.toLowerCase().includes('already exists')
  );
}

/**
 * Tự tạo database test nếu chưa tồn tại (hỗ trợ máy đang dùng volume pgdata cũ).
 * Dùng PrismaClient tạm kết nối maintenance DB `postgres` để không phải thêm dependency `pg`.
 */
export async function ensureTestDatabaseExists(
  testDatabaseUrl: string,
): Promise<{ created: boolean; databaseName: string }> {
  const target = assertSafeTestDatabaseUrl({
    testDatabaseUrl,
    ignoreSameAsDev: true,
  });
  const maintenanceUrl = buildMaintenanceDatabaseUrl(target.rawUrl);
  const adminPrisma = new PrismaClient({
    datasources: { db: { url: maintenanceUrl } },
  });

  try {
    const existing = await adminPrisma.$queryRaw<Array<{ exists: number }>>`
      SELECT 1 AS exists FROM pg_database WHERE datname = ${target.databaseName}
    `;
    if (existing.length > 0) {
      return { created: false, databaseName: target.databaseName };
    }

    try {
      await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${target.databaseName}"`);
      return { created: true, databaseName: target.databaseName };
    } catch (error: unknown) {
      if (isDuplicateDatabaseError(error)) {
        return { created: false, databaseName: target.databaseName };
      }
      throw error;
    }
  } finally {
    await adminPrisma.$disconnect();
  }
}

export function runPrismaMigrateDeploy(testDatabaseUrl: string): void {
  const target = assertSafeTestDatabaseUrl({
    testDatabaseUrl,
    ignoreSameAsDev: true,
  });
  const apiRoot = path.resolve(__dirname, '..');
  const prismaBin = path.join(
    apiRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );

  try {
    execFileSync(prismaBin, ['migrate', 'deploy'], {
      cwd: apiRoot,
      env: {
        ...process.env,
        DATABASE_URL: target.rawUrl,
      },
      stdio: 'pipe',
      encoding: 'utf-8',
    });
  } catch (error: unknown) {
    const err = error as { stderr?: string; stdout?: string; message?: string };
    const detail = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n');
    throw new Error(`Chạy prisma migrate deploy lên ${target.sanitizedUrl} thất bại:\n${detail}`);
  }
}

/**
 * Dọn sạch dữ liệu trên DB test (trừ _prisma_migrations) rồi nạp seed cơ bản
 * (tài khoản, vai trò, quyền, danh mục, ngưỡng GLOBAL, demand_history SIMULATED).
 */
export async function resetAndSeedTestDatabase(testDatabaseUrl: string): Promise<void> {
  const target = assertSafeTestDatabaseUrl({
    testDatabaseUrl,
    ignoreSameAsDev: true,
  });

  const prisma = new PrismaClient({
    datasources: { db: { url: target.rawUrl } },
  });

  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = ${target.schema}
        AND tablename <> '_prisma_migrations'
    `;

    if (tables.length > 0) {
      const qualifiedNames = tables.map(({ tablename }) => {
        if (!SAFE_IDENTIFIER_REGEX.test(tablename)) {
          throw new Error(`Tên bảng không hợp lệ khi dọn DB test: ${tablename}`);
        }
        return `"${target.schema}"."${tablename}"`;
      });
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${qualifiedNames.join(', ')} RESTART IDENTITY CASCADE`,
      );
    }

    await runSeed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

export async function prepareTestDatabase(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ParsedPostgresUrl> {
  const target = assertSafeTestDatabaseUrl({
    testDatabaseUrl: env.TEST_DATABASE_URL,
    devDatabaseUrl: env.DATABASE_URL,
    ignoreSameAsDev: env[TEST_DB_BOOTSTRAPPED_ENV] === 'true',
  });

  await ensureTestDatabaseExists(target.rawUrl);
  runPrismaMigrateDeploy(target.rawUrl);
  await resetAndSeedTestDatabase(target.rawUrl);

  return target;
}

if (require.main === module) {
  prepareTestDatabase(process.env)
    .then((target) => {
      console.log(`[test-db] Đã sẵn sàng DB test: ${target.sanitizedUrl}`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[test-db] Lỗi: ${message}`);
      process.exit(1);
    });
}
