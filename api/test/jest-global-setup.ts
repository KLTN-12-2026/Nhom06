import { prepareTestDatabase, TEST_DB_BOOTSTRAPPED_ENV } from '../scripts/test-db';

export default async function globalSetup(): Promise<void> {
  const target = await prepareTestDatabase(process.env);
  process.env.DATABASE_URL = target.rawUrl;
  process.env.NODE_ENV = 'test';
  process.env[TEST_DB_BOOTSTRAPPED_ENV] = 'true';
}
