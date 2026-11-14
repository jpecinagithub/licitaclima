// Test de integración del adaptador PostgreSQL (Fase C) contra el
// PostgreSQL REAL de la VM (DATABASE_URL) y el esquema Drizzle de Fase B.
// Se salta si no hay DATABASE_URL. Los datos de prueba usan expediente
// TEST-* / slug org-pg-test* / email pg-test-* y se limpian al final.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresWorkerStore } from './pg-store.js';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

describe('PostgresWorkerStore', () => {
  let store: PostgresWorkerStore | null = null;
  let admin: Pool | null = null;

  beforeAll(async () => {
    if (!DATABASE_URL) return;
    store = new PostgresWorkerStore(DATABASE_URL);
    await store.ensureSchema();
    admin = new Pool({ connectionString: DATABASE_URL });
    await admin.query("DELETE FROM tenders WHERE expediente LIKE 'TEST-%'");
    await admin.query("DELETE FROM organizations WHERE slug LIKE 'org-pg-test%'");
    await admin.query("DELETE FROM users WHERE email LIKE 'pg-test-%'");
  });

  afterAll(async () => {
    if (!store || !admin) return;
    await admin.query("DELETE FROM tenders WHERE expediente LIKE 'TEST-%'");
    await admin.query("DELETE FROM organizations WHERE slug LIKE 'org-pg-test%'");
    await admin.query("DELETE FROM users WHERE email LIKE 'pg-test-%'");
    await admin.end();
    await store.close();
  });

  it('upsert + rectificación (DOC_MOD) sube versión e invalida matches', async () => {
    if (!store) return;
    const input = {
      source: 'feed643' as const,
      sourceId: 'atom-test-1',
      expediente: 'TEST-001',
      organo: 'Org Test PG',
      objeto: 'Obras de climatización TEST',
      estado: 'PUB',
      valorEstimado: '100000',
      presupuestoBaseSinIva: '90000',
      presupuestoBaseConIva: '108900',
      duracion: null,
      provincia: 'Madrid',
      provinciaPorVerificar: false,
      nuts: 'ES300',
      plazoFecha: '2026-12-03',
      plazoHora: '14:00:00',
      plazoSoloFecha: false,
      cpv: ['45331000'],
      claseNicho: 'nucleo' as const,
      urlOficial: 'https://contrataciondelestado.es/detalle-test',
      documentUris: [],
      notices: ['DOC_CN'],
      firstPubAt: null,
      feedUpdatedAt: '2026-11-13T14:00:00+01:00',
    };
    const first = await store.upsertTender(input);
    expect(first.created).toBe(true);
    expect(first.tender.version).toBe(1);
    expect(first.tender.plazoFecha).toBe('2026-12-03');
    expect(first.tender.plazoHora).toBe('14:00:00');

    await store.saveMatch(first.tender.id, null, { test: true }, 'revisar');
    const rectified = await store.upsertTender({
      ...input,
      estado: 'EV',
      feedUpdatedAt: '2026-11-13T15:00:00+01:00',
      presupuestoBaseSinIva: null, // la republicación no lo trae: se conserva
    });
    expect(rectified.created).toBe(false);
    expect(rectified.rectified).toBe(true);
    expect(rectified.tender.version).toBe(2);
    expect(rectified.tender.estado).toBe('EV');
    expect(rectified.tender.presupuestoBaseSinIva).toBe('90000');

    const again = await store.upsertTender({ ...input, estado: 'EV', feedUpdatedAt: '2026-11-13T15:00:00+01:00' });
    expect(again.rectified).toBe(false); // mismo updated: no es rectificación
    expect(again.tender.version).toBe(2);
  });

  it('jobs: encolar, reclamar (una sola vez) y completar; outbox idempotente', async () => {
    if (!store) return;
    const job = await store.enqueueJob('documents', { tenderId: 'x' });
    const claimed = await store.claimDueJobs(10);
    expect(claimed.some((j) => j.id === job.id)).toBe(true);
    const claimedAgain = await store.claimDueJobs(10);
    expect(claimedAgain.some((j) => j.id === job.id)).toBe(false); // ya reclamado
    await store.completeJob(job.id);

    const org = await store.upsertOrganization({ name: 'Org PG Test', email: 'pg-test-1@example.invalid', provincias: ['Madrid'] });
    const row1 = await store.insertOutbox({
      organizationId: org.id, kind: 'alerta', subject: 's', body: 'b', idempotencyKey: 'test-pg-1',
    });
    const row2 = await store.insertOutbox({
      organizationId: org.id, kind: 'alerta', subject: 's', body: 'b', idempotencyKey: 'test-pg-1',
    });
    expect(row1.id).toBe(row2.id);
    expect(await store.outboxExists('test-pg-1')).toBe(true);
    const listed = await store.listOrganizations();
    expect(listed.some((o) => o.id === org.id && o.provincias.includes('Madrid'))).toBe(true);
  });

  it('checkpoint: la última ingesta OK guarda el cursor en cursor_checkpoint', async () => {
    if (!store || !admin) return;
    const runId = await store.startIngestionRun('feed643');
    await store.finishIngestionRun(runId, {
      status: 'ok', pages: 1, entries: 10, newTenders: 2, updatedTenders: 0, errors: 0,
      cursorNextUrl: 'https://example.invalid/next.atom', etag: '"abc"', lastModified: null,
      errorMessage: null, finishedAt: new Date().toISOString(),
    });
    const latest = await store.getLatestIngestionRun('feed643');
    expect(latest?.cursorNextUrl).toBe('https://example.invalid/next.atom');
    expect(latest?.status).toBe('ok');
    expect(latest?.pages).toBe(1);
    // Limpieza: el cursor de prueba no debe contaminar la ingesta real.
    await admin.query('DELETE FROM ingestion_runs WHERE id = $1', [runId]);
  });
});
