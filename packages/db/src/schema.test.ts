import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  loginTokens,
  organizations,
  sources,
  stripeEvents,
  tenders,
  usageLedger,
  users,
} from './schema/index.js';
import { createTestDb, type TestDb } from './test-utils.js';


async function expectDuplicate(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (err) {
    // Drizzle envuelve el error de PG en DrizzleQueryError; el detalle está en `cause`.
    expect(String((err as { cause?: unknown }).cause ?? err)).toMatch(/duplicate key/i);
    return;
  }
  expect.unreachable('La inserción duplicada debía fallar por clave única.');
}

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

describe('esquema: idempotencia y claves', () => {
  it('tenders: mismo (source, external_id) no se duplica', async () => {
    const [source] = await t.db.insert(sources).values({ key: 'feed643', name: 'Feed 643', url: 'https://example.es/643.atom' }).returning();
    const base = {
      sourceId: source.id,
      sourceKey: 'feed643',
      externalId: 'EXP-1',
      expediente: 'EXP-1',
      organo: 'Ayuntamiento de Logroño',
      objeto: 'Mantenimiento de climatización',
      estado: 'PUB',
      urlOficial: 'https://example.es/exp-1',
    };
    await t.db.insert(tenders).values(base);
    await expectDuplicate(t.db.insert(tenders).values(base));
  });

  it('stripe_events: event_id duplicado no se reprocesa', async () => {
    await t.db.insert(stripeEvents).values({ eventId: 'evt_1', type: 'invoice.paid', payload: { id: 'evt_1' } });
    await expectDuplicate(
      t.db.insert(stripeEvents).values({ eventId: 'evt_1', type: 'invoice.paid', payload: { id: 'evt_1' } }),
    );
  });

  it('usage_ledger: idempotency_key duplicada no consume dos veces', async () => {
    const [org] = await t.db.insert(organizations).values({ name: 'Clima Rioja SL', slug: 'clima-rioja' }).returning();
    const row = {
      organizationId: org.id,
      kind: 'personalized_analysis',
      periodStart: new Date('2026-11-01T00:00:00Z'),
      periodEnd: new Date('2026-12-01T00:00:00Z'),
      action: 'reserve',
      idempotencyKey: 'idem-1',
    };
    await t.db.insert(usageLedger).values(row);
    await expectDuplicate(t.db.insert(usageLedger).values(row));
  });

  it('users: el correo es único sin distinguir mayúsculas', async () => {
    await t.db.insert(users).values({ email: 'Jon@Ejemplo.es' });
    await expectDuplicate(t.db.insert(users).values({ email: 'jon@ejemplo.es' }));
  });

  it('login_tokens: token_hash único (el token en claro nunca se guarda)', async () => {
    const hash = 'a'.repeat(64);
    await t.db.insert(loginTokens).values({ email: 'a@example.es', tokenHash: hash, expiresAt: new Date(Date.now() + 900_000) });
    await expectDuplicate(
      t.db.insert(loginTokens).values({ email: 'b@example.es', tokenHash: hash, expiresAt: new Date(Date.now() + 900_000) }),
    );
  });

  it('dinero: numeric conserva 4 decimales exactos (nunca float)', async () => {
    const [source] = await t.db.insert(sources).values({ key: 'feed1044', name: 'Feed 1044', url: 'https://example.es/1044.atom' }).returning();
    const [row] = await t.db
      .insert(tenders)
      .values({
        sourceId: source.id,
        sourceKey: 'feed1044',
        externalId: 'EXP-2',
        expediente: 'EXP-2',
        organo: 'Diputación',
        objeto: 'Climatización',
        estado: 'PUB',
        urlOficial: 'https://example.es/exp-2',
        valorEstimado: '123456.7891',
      })
      .returning();
    expect(row.valorEstimado).toBe('123456.7891');
    const [again] = await t.db.select().from(tenders).where(eq(tenders.id, row.id)).limit(1);
    expect(again.valorEstimado).toBe('123456.7891');
  });
});
