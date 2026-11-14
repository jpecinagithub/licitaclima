import { Client, Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import { createDb, createPool, migrate, type Db } from './index.js';

/** BD de test: PostgreSQL REAL. Cada fichero crea su propia base y la borra. */
export interface TestDb {
  db: Db;
  pool: Pool;
  cleanup: () => Promise<void>;
}

function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

export async function createTestDb(): Promise<TestDb> {
  const baseUrl =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgres://licitaclima:licitaclima@localhost:5432/licitaclima';
  const databaseName = `licitaclima_test_${randomBytes(4).toString('hex')}`;
  const admin = new Client({ connectionString: withDatabase(baseUrl, 'postgres') });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }
  const url = withDatabase(baseUrl, databaseName);
  try {
    await migrate(url);
  } catch (err) {
    const c = new Client({ connectionString: withDatabase(baseUrl, 'postgres') });
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await c.end();
    throw err;
  }
  const pool = createPool(url);
  return {
    db: createDb(pool),
    pool,
    cleanup: async () => {
      await pool.end();
      const client = new Client({ connectionString: withDatabase(baseUrl, 'postgres') });
      await client.connect();
      try {
        await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      } finally {
        await client.end();
      }
    },
  };
}
