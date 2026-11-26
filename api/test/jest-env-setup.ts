import { assertSafeTestDatabaseUrl, TEST_DB_BOOTSTRAPPED_ENV } from '../scripts/test-db';

const target = assertSafeTestDatabaseUrl({
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  devDatabaseUrl: process.env.DATABASE_URL,
  ignoreSameAsDev: process.env[TEST_DB_BOOTSTRAPPED_ENV] === 'true',
});

process.env.DATABASE_URL = target.rawUrl;
process.env.NODE_ENV = 'test';
