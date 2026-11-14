import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Carga el .env del repo (si existe) para que `pnpm db:migrate` funcione sin
// exportar DATABASE_URL a mano. No sobrescribe variables ya definidas.
dotenv.config({ path: join(__dirname, '..', '..', '..', '.env') });

/**
 * Migraciones Drizzle (SQL versionado en ./drizzle).
 * Aplica en orden los ficheros *.sql que aún no están en
 * `drizzle.__drizzle_migrations`, como hace drizzle-kit migrate pero sin
 * depender de su CLI (el `drizzle` runner oficial no se usa aquí para no
 * acoplar el arranque al CLI).
 *
 * Uso:  DATABASE_URL=postgres://... pnpm --filter @licitaclima/db migrate
 */
const MIGRATIONS_DIR = join(__dirname, '..', 'drizzle');

export async function migrate(connectionString: string): Promise<string[]> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
    await client.query(
      `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )`,
    );
    const applied = new Set(
      (await client.query<{ hash: string }>('SELECT hash FROM "drizzle"."__drizzle_migrations"'))
        .rows.map((r) => r.hash),
    );
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const appliedNow: string[] = [];
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const hash = file.replace(/\.sql$/, '');
      if (applied.has(hash)) continue;
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
          [hash, Date.now()],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      appliedNow.push(file);
    }
    return appliedNow;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DATABASE_URL. Ejemplo: postgres://licitaclima:licitaclima@localhost:5432/licitaclima');
    process.exit(1);
  }
  migrate(url)
    .then((applied) => {
      console.log(applied.length === 0 ? 'Sin migraciones pendientes.' : `Migraciones aplicadas:\n${applied.map((f) => `  - ${f}`).join('\n')}`);
    })
    .catch((err) => {
      console.error('Error al migrar:', (err as Error).message);
      process.exit(1);
    });
}
