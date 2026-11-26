import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  assertSafeE2eDatabaseUrl,
  buildDockerDatabaseUrl,
  maskPostgresUrl,
  resolveE2eConfig,
} = require('./e2e-env.cjs');

test('chặn khi thiếu E2E_DATABASE_URL', () => {
  assert.throws(
    () => assertSafeE2eDatabaseUrl({ e2eDatabaseUrl: '   ', devDatabaseName: 'kho_ai' }),
    /thiếu E2E_DATABASE_URL/i,
  );
});

test('chặn khi URL sai cú pháp hoặc sai giao thức', () => {
  assert.throws(
    () =>
      assertSafeE2eDatabaseUrl({
        e2eDatabaseUrl: 'mysql://user:secret@localhost:3306/kho_ai_e2e_test',
        devDatabaseName: 'kho_ai',
      }),
    /postgresql:\/\/ hoặc postgres:\/\//i,
  );
});

test('chặn khi tên DB không kết thúc bằng _test (bao gồm kho_ai) và ẩn mật khẩu', () => {
  assert.throws(
    () =>
      assertSafeE2eDatabaseUrl({
        e2eDatabaseUrl: 'postgresql://kho_ai:super_secret_pw@localhost:5432/kho_ai?schema=public',
        devDatabaseName: 'kho_ai',
      }),
    (err) => {
      assert.match(err.message, /phải kết thúc bằng "_test"/);
      assert.doesNotMatch(err.message, /super_secret_pw/);
      assert.match(err.message, /\*\*\*/);
      return true;
    },
  );
});

test('chặn khi E2E_DATABASE_URL trỏ trùng DB dev (kể cả localhost vs 127.0.0.1)', () => {
  assert.throws(
    () =>
      assertSafeE2eDatabaseUrl({
        e2eDatabaseUrl: 'postgresql://kho_ai:pw@127.0.0.1:5534/kho_ai_dev_test?schema=public',
        devDatabaseUrl: 'postgresql://kho_ai:pw@localhost:5534/kho_ai_dev_test',
        devDatabaseName: 'kho_ai',
      }),
    /trỏ trùng DATABASE_URL của DB dev/,
  );
});

test('chấp nhận kho_ai_e2e_test hợp lệ và khác DB dev', () => {
  const parsed = assertSafeE2eDatabaseUrl({
    e2eDatabaseUrl: 'postgresql://kho_ai:devpw@localhost:5534/kho_ai_e2e_test?schema=public',
    devDatabaseUrl: 'postgresql://kho_ai:devpw@localhost:5534/kho_ai?schema=public',
    devDatabaseName: 'kho_ai',
  });
  assert.equal(parsed.databaseName, 'kho_ai_e2e_test');
  assert.equal(parsed.port, 5534);
  assert.equal(maskPostgresUrl(parsed.rawUrl).includes('devpw'), false);
});

test('resolveE2eConfig tự đọc cổng worktree từ .env và dựng cổng riêng 3099/5199', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kho-ai-e2e-env-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, '.env'),
      [
        'POSTGRES_DB=kho_ai',
        'POSTGRES_USER=kho_ai',
        'POSTGRES_PASSWORD=kho_ai_dev',
        'DB_PORT=5534',
        'ML_PORT=8100',
        'LLM_PROVIDER=none',
      ].join('\n'),
    );

    const cfg = resolveE2eConfig({}, tmpDir);
    assert.equal(cfg.e2eDatabaseName, 'kho_ai_e2e_test');
    assert.match(cfg.e2eDatabaseUrl, /localhost:5534\/kho_ai_e2e_test/);
    assert.equal(cfg.mlServiceUrl, 'http://127.0.0.1:8100');
    assert.equal(cfg.apiPort, 3099);
    assert.equal(cfg.webPort, 5199);
    assert.equal(
      buildDockerDatabaseUrl(cfg.e2eDatabaseUrl),
      'postgresql://kho_ai:kho_ai_dev@db:5432/kho_ai_e2e_test?schema=public',
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
