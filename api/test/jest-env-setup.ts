import { assertSafeTestDatabaseUrl, TEST_DB_BOOTSTRAPPED_ENV } from '../scripts/test-db';

const target = assertSafeTestDatabaseUrl({
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  devDatabaseUrl: process.env.DATABASE_URL,
  ignoreSameAsDev: process.env[TEST_DB_BOOTSTRAPPED_ENV] === 'true',
});

process.env.DATABASE_URL = target.rawUrl;
process.env.NODE_ENV = 'test';
// Buộc dùng mock LLM và xóa key trong mọi lần chạy Jest (kể cả smoke) để tránh gọi mạng thật
process.env.LLM_PROVIDER = 'mock';
process.env.LLM_API_KEY = '';
process.env.LLM_FALLBACK_API_KEY = '';
