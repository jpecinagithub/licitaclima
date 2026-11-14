// Tests de la API de lectura: endpoints públicos sin registro.
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { ingestionRuns, sources } from '@licitaclima/db';
import { buildServer } from '../server.js';
import { createTestDb, type TestDb } from '../lib/test-db.js';
import { seedSource, seedTender } from './reading-seed.js';

process.env.SESSION_SECRET ??= 'test-session-secret-solo-test-000000000000';

let t: TestDb;
let app: ReturnType<typeof buildServer>;
let source643: string;

beforeAll(async () => {
  t = await createTestDb();
  app = buildServer({ db: t.db });
  await app.ready();
  source643 = await seedSource(t.db, 'feed643');
  await seedSource(t.db, 'feed1044');
  await seedTender(t.db, source643, { expediente: 'PUB-001', provincia: 'Madrid', estado: 'PUB', claseNicho: 'nucleo' });
  await seedTender(t.db, source643, { expediente: 'PUB-002', provincia: 'Toledo', estado: 'PUB', claseNicho: 'limitrofe' });
  await seedTender(t.db, source643, { expediente: 'PUB-003', provincia: 'Madrid', estado: 'PUB', claseNicho: 'marginal' });
  await seedTender(t.db, source643, { expediente: 'PUB-004', provincia: 'Madrid', estado: 'ADJ', claseNicho: 'nucleo' });
  const [sourceRow] = await t.db.select().from(sources).where(eq(sources.key, 'feed643')).limit(1);
  await t.db.insert(ingestionRuns).values({
    sourceId: sourceRow.id,
    status: 'ok',
    startedAt: new Date('2026-11-14T08:00:00Z'),
    finishedAt: new Date('2026-11-14T08:05:00Z'),
    entriesSeen: 100,
    entriesNew: 2,
    entriesUpdated: 1,
  });
});

afterAll(async () => {
  await app.close();
  await t.cleanup();
});

describe('GET /public/coverage', () => {
  it('sin sesión: fuentes, conteos reales y última sincronización real', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/coverage' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      sources: { key: string; lastRun: { status: string; finishedAt: string } | null }[];
      counts: { total: number; nucleo: number; limitrofe: number; marginal: number; abiertosNucleoLimitrofe: number };
      lastSyncAt: string;
      nota: string;
    };
    expect(body.sources.map((s) => s.key).sort()).toEqual(['feed1044', 'feed643']);
    expect(body.counts.total).toBe(4);
    expect(body.counts.nucleo).toBe(2);
    expect(body.counts.limitrofe).toBe(1);
    expect(body.counts.marginal).toBe(1);
    expect(body.counts.abiertosNucleoLimitrofe).toBe(2);
    expect(body.lastSyncAt).toBe('2026-11-14T08:05:00.000Z');
    expect(body.sources.find((s) => s.key === 'feed643')?.lastRun?.status).toBe('ok');
    expect(body.nota).toContain('parcial');
  });
});

describe('GET /public/sample', () => {
  it('sin sesión: solo PUB de núcleo/limítrofe reales, con límite', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/sample?limit=10' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: { expediente: string; estado: string; clase: string }[] };
    expect(body.items.length).toBe(2);
    expect(body.items.map((i) => i.expediente).sort()).toEqual(['PUB-001', 'PUB-002']);
    for (const item of body.items) {
      expect(item.estado).toBe('PUB');
      expect(['nucleo', 'limitrofe']).toContain(item.clase);
    }
    const one = await app.inject({ method: 'GET', url: '/api/v1/public/sample?limit=1' });
    expect((one.json() as { items: unknown[] }).items.length).toBe(1);
  });
});
