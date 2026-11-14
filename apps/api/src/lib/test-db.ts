import { Client, Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import { createDb, createPool, migrate, type Db } from '@licitaclima/db';

/**
 * BD de test: PostgreSQL REAL (nunca pg-mem).
 * Cada fichero de test crea su propia base `licitaclima_test_<hex>` con las
 * migraciones reales y la borra al terminar. Requiere que el rol de
 * DATABASE_URL tenga CREATEDB (rol local de desarrollo; ver packages/db/README.md).
 */
export interface TestDb {
  db: Db;
  pool: Pool;
  databaseName: string;
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
    const cleanupClient = new Client({ connectionString: withDatabase(baseUrl, 'postgres') });
    await cleanupClient.connect();
    await cleanupClient.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await cleanupClient.end();
    throw err;
  }
  const pool = createPool(url);
  const db = createDb(pool);
  return {
    db,
    pool,
    databaseName,
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
