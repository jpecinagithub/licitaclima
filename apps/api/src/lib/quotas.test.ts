import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { organizations, personalizedAnalyses, sources, subscriptions, tenders, usageLedger } from '@licitaclima/db';
import { ensurePlan } from '@licitaclima/integrations';
import { createTestDb, type TestDb } from './test-db.js';
import {
  confirmQuota,
  getQuotaStatus,
  releaseQuota,
  reserveQuota,
  shouldConsumeForAnalysis,
} from './quotas.js';

let t: TestDb;
let orgId: string;
let periodStart: Date;
let periodEnd: Date;

beforeAll(async () => {
  t = await createTestDb();
  const [org] = await t.db.insert(organizations).values({ name: 'Clima Test SL', slug: 'clima-test' }).returning();
  orgId = org.id;
  const now = new Date();
  periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const plan = await ensurePlan(t.db);
  await t.db.insert(subscriptions).values({
    organizationId: orgId,
    planId: plan!.id,
    status: 'active',
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  });
});

afterAll(async () => {
  await t.cleanup();
});

async function used(): Promise<number> {
  const status = await getQuotaStatus(t.db, orgId);
  return status.analyses.used;
}

describe('cuotas atómicas', () => {
  it('reserva, confirma sin consumir extra y libera al fallar', async () => {
    expect(await used()).toBe(0);
    const r = await reserveQuota(t.db, { organizationId: orgId, kind: 'personalized_analysis', idempotencyKey: 'q-1' });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(9);
    expect(await used()).toBe(1);
    // Confirmar no consume de más.
    expect(await confirmQuota(t.db, 'q-1')).toBe(true);
    expect(await used()).toBe(1);
    // Segunda confirmación: idempotente, sin efecto.
    expect(await confirmQuota(t.db, 'q-1')).toBe(false);
    expect(await used()).toBe(1);
    // Liberar devuelve la unidad; la segunda liberación no resta dos veces.
    expect(await releaseQuota(t.db, 'q-1')).toBe(true);
    expect(await used()).toBe(0);
    expect(await releaseQuota(t.db, 'q-1')).toBe(false);
    expect(await used()).toBe(0);
  });

  it('reintento con la misma clave no consume dos veces', async () => {
    const first = await reserveQuota(t.db, { organizationId: orgId, kind: 'chat_question', idempotencyKey: 'q-retry' });
    expect(first.alreadyReserved).toBe(false);
    const second = await reserveQuota(t.db, { organizationId: orgId, kind: 'chat_question', idempotencyKey: 'q-retry' });
    expect(second.alreadyReserved).toBe(true);
    const status = await getQuotaStatus(t.db, orgId);
    expect(status.chat.used).toBe(1);
  });

  it('reserva concurrente con 1 unidad restante: solo una tiene éxito', async () => {
    // Deja 1 unidad libre de análisis: 9 reservas previas (1 ya liberada).
    for (let i = 0; i < 9; i++) {
      await reserveQuota(t.db, { organizationId: orgId, kind: 'personalized_analysis', idempotencyKey: `q-fill-${i}` });
    }
    expect(await used()).toBe(9);
    const results = await Promise.allSettled([
      reserveQuota(t.db, { organizationId: orgId, kind: 'personalized_analysis', idempotencyKey: 'q-race-a' }),
      reserveQuota(t.db, { organizationId: orgId, kind: 'personalized_analysis', idempotencyKey: 'q-race-b' }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'quota_exceeded' });
    expect(await used()).toBe(10);
    // Limpieza: libera las 10 para los tests siguientes.
    const rows = await t.db.select().from(usageLedger).where(eq(usageLedger.organizationId, orgId));
    for (const row of rows.filter((r) => r.action === 'reserve')) {
      await releaseQuota(t.db, row.idempotencyKey);
    }
    expect(await used()).toBe(0);
  });

  it('sin suscripción activa no se puede reservar', async () => {
    const [org] = await t.db.insert(organizations).values({ name: 'Sin Plan SL', slug: 'sin-plan' }).returning();
    await expect(
      reserveQuota(t.db, { organizationId: org.id, kind: 'personalized_analysis', idempotencyKey: 'q-free' }),
    ).rejects.toMatchObject({ status: 409, code: 'quota_exceeded' });
  });

  it('past_due dentro de la gracia (3 días) tiene acceso; fuera, no', async () => {
    const now = new Date();
    const [org] = await t.db.insert(organizations).values({ name: 'Gracia SL', slug: 'gracia' }).returning();
    const plan = await ensurePlan(t.db);
    const [sub] = await t.db
      .insert(subscriptions)
      .values({
        organizationId: org.id,
        planId: plan!.id,
        status: 'past_due',
        currentPeriodStart: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(now.getTime() - 24 * 60 * 60 * 1000), // venció ayer
      })
      .returning();
    expect((await getQuotaStatus(t.db, org.id)).hasAccess).toBe(true);
    await t.db
      .update(subscriptions)
      .set({ currentPeriodEnd: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000) })
      .where(eq(subscriptions.id, sub.id));
    expect((await getQuotaStatus(t.db, org.id)).hasAccess).toBe(false);
  });

  it('revisitar un análisis terminado no consume; uno nuevo sí', async () => {
    const [source] = await t.db.insert(sources).values({ key: 'feed643', name: 'Feed 643', url: 'https://example.es/643.atom' }).returning();
    const [tender] = await t.db
      .insert(tenders)
      .values({ sourceId: source.id, sourceKey: 'feed643', externalId: 'EXP-Q1', expediente: 'EXP-Q1', organo: 'Ayuntamiento', objeto: 'Climatización', estado: 'PUB', urlOficial: 'https://example.es/exp-q1' })
      .returning();
    const tenderId = tender.id;
    const fresh = await shouldConsumeForAnalysis(t.db, { organizationId: orgId, tenderId });
    expect(fresh.consume).toBe(true);
    await t.db.insert(personalizedAnalyses).values({
      organizationId: orgId,
      tenderId,
      status: 'done',
      consumedQuota: true,
    });
    const revisit = await shouldConsumeForAnalysis(t.db, { organizationId: orgId, tenderId });
    expect(revisit.consume).toBe(false);
    expect(revisit.reason).toBe('revisit_or_rectification');
    expect(revisit.existingAnalysisId).toBeTruthy();
  });
});
