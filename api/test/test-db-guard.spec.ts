import {
  assertSafeTestDatabaseUrl,
  buildMaintenanceDatabaseUrl,
  maskPostgresUrl,
} from '../scripts/test-db';

describe('Rào chắn an toàn DB test (T-026 AC3)', () => {
  const DEV_URL = 'postgresql://kho_ai:secret_dev_pass@db:5432/kho_ai?schema=public';
  const TEST_URL = 'postgresql://kho_ai:secret_test_pass@db:5432/kho_ai_test?schema=public';

  it('từ chối khi thiếu hoặc rỗng TEST_DATABASE_URL', () => {
    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: undefined,
        devDatabaseUrl: DEV_URL,
      }),
    ).toThrow(/TEST_DATABASE_URL/);

    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: '   ',
        devDatabaseUrl: DEV_URL,
      }),
    ).toThrow(/TEST_DATABASE_URL/);
  });

  it('từ chối khi URL không hợp lệ hoặc không dùng giao thức postgresql/postgres', () => {
    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: 'not-a-valid-url',
        devDatabaseUrl: DEV_URL,
      }),
    ).toThrow(/không đúng định dạng/);

    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: 'mysql://kho_ai:pass@db:3306/kho_ai_test',
        devDatabaseUrl: DEV_URL,
      }),
    ).toThrow(/postgresql/);
  });

  it('chặn khi tên DB không kết thúc bằng _test (ví dụ kho_ai, postgres, kho_ai_dev)', () => {
    for (const unsafeDb of ['kho_ai', 'postgres', 'kho_ai_dev', 'kho_ai_test_prod']) {
      expect(() =>
        assertSafeTestDatabaseUrl({
          testDatabaseUrl: `postgresql://kho_ai:secret_pass@db:5432/${unsafeDb}?schema=public`,
          devDatabaseUrl: DEV_URL,
        }),
      ).toThrow(/_test/);
    }
  });

  it('chặn khi TEST_DATABASE_URL trỏ trùng DATABASE_URL dev (kể cả khác schema query, hoa/thường hoặc localhost vs 127.0.0.1)', () => {
    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: 'postgresql://kho_ai:secret@db:5432/app_test',
        devDatabaseUrl: 'postgresql://kho_ai:secret@db:5432/app_test?schema=public',
      }),
    ).toThrow(/trùng DATABASE_URL/);

    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: 'postgresql://kho_ai:secret@127.0.0.1:5432/app_test?schema=public',
        devDatabaseUrl: 'postgresql://kho_ai:secret@LOCALHOST:5432/app_test?schema=public',
      }),
    ).toThrow(/trùng DATABASE_URL/);
  });

  it('cho phép khi tên DB kết thúc bằng _test và khác DB dev (cả khi không có DATABASE_URL như CI)', () => {
    const parsedWithDev = assertSafeTestDatabaseUrl({
      testDatabaseUrl: TEST_URL,
      devDatabaseUrl: DEV_URL,
    });
    expect(parsedWithDev.databaseName).toBe('kho_ai_test');
    expect(parsedWithDev.host).toBe('db');
    expect(parsedWithDev.port).toBe(5432);
    expect(parsedWithDev.schema).toBe('public');

    const parsedCi = assertSafeTestDatabaseUrl({
      testDatabaseUrl: 'postgresql://kho_ai:ci_pass@localhost:5432/kho_ai_test?schema=public',
      devDatabaseUrl: undefined,
    });
    expect(parsedCi.databaseName).toBe('kho_ai_test');
  });

  it('ẩn mật khẩu DB trong mọi thông báo lỗi', () => {
    const secret = 'SUPER_SECRET_PASSWORD_999';
    const unsafeUrl = `postgresql://kho_ai:${secret}@db:5432/kho_ai?schema=public`;

    expect(maskPostgresUrl(unsafeUrl)).not.toContain(secret);
    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: unsafeUrl,
        devDatabaseUrl: DEV_URL,
      }),
    ).toThrow();

    try {
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: unsafeUrl,
        devDatabaseUrl: DEV_URL,
      });
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : String(error)).not.toContain(secret);
    }
  });

  it('buildMaintenanceDatabaseUrl đổi đúng sang database postgres và loại bỏ query schema', () => {
    const adminUrl = buildMaintenanceDatabaseUrl(TEST_URL);
    expect(adminUrl).toBe('postgresql://kho_ai:secret_test_pass@db:5432/postgres');
  });
});
